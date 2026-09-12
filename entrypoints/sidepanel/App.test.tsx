// @vitest-environment happy-dom
/**
 * The panel, mounted for real against a stubbed page. What the harness
 * checks by hand, pinned: the tab strip, a selection landing on Layers, an
 * edit reaching the badge, Dark previewing without entering the brief, and
 * Reset taking everything back.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { updateSession } from './lib/session';
import { element, installChrome, type StubChrome } from './test/chromeStub';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom leaves a few browser corners out that the panel touches.
if (!('CSS' in globalThis)) (globalThis as unknown as { CSS: unknown }).CSS = { supports: () => true };
if (!globalThis.matchMedia) {
  globalThis.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof matchMedia;
}

const tick = (ms = 30) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

let stub: StubChrome;
let root: Root;
let host: HTMLDivElement;

const text = () => host.querySelector('#panel')?.textContent ?? '';
const tabs = () => Array.from(host.querySelectorAll('[role=tab]')).map((t) => t.id.replace('tab-', ''));
const activeTab = () => host.querySelector('[role=tab][aria-selected="true"]')?.id.replace('tab-', '');
const badge = () => host.querySelector('#tab-changes span')?.textContent ?? '0';
const click = (el: Element | null) => act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

beforeEach(async () => {
  stub = installChrome();
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await tick(60);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('the panel', () => {
  it('opens on Layers with the five tabs in order and the page read', () => {
    expect(tabs()).toEqual(['layers', 'variables', 'assets', 'export', 'changes']);
    expect(activeTab()).toBe('layers');
    expect(host.querySelector('footer')?.textContent).toContain('6 colors');
    // The tree came from the page and the repeating card shows as a component.
    expect(text()).toContain('h1#title');
    expect(text()).toContain('×2article.card');
  });

  it('shows a selection in a split above the tree, and an edit from the page reaches the badge', async () => {
    await click(host.querySelector('#tab-export'));
    expect(activeTab()).toBe('export');
    await act(async () => stub.emit({ type: 'element-selected', data: element() }));
    await tick();
    expect(activeTab()).toBe('layers');
    expect(host.querySelector('[role=separator]')).not.toBeNull();
    expect(text()).toContain('h1#title');

    await act(async () => stub.emit({ type: 'element-edit', property: 'color', to: '#ff0000' }));
    await act(async () => stub.emit({ type: 'element-edit', property: 'text', to: 'Grit & Plate' }));
    await tick();
    expect(badge()).toBe('2');
    // The rules went to the page as one managed sheet.
    const rules = stub.sent.filter((m) => m.type === 'elements-set').at(-1)?.rules as { property: string; value: string }[];
    expect(rules).toEqual([{ selector: 'h1#title', property: 'color', value: '#ff0000' }]);
  });

  it('previews dark without putting it in the brief, and Reset takes it back', async () => {
    await click(host.querySelector('#tab-variables'));
    expect(text()).toContain('read from this page');
    await act(async () => stub.emit({ type: 'mode-changed', mode: 'dark' }));
    await tick(120);
    // The stub page has no dark mode of its own, so the engine mirrors.
    expect(text()).toContain('previewing dark — mirrored from the ramps');
    expect(badge()).toBe('0');
    const painted = stub.sent.filter((m) => m.type === 'reskin-apply').at(-1)?.overrides as unknown[];
    expect(painted.length).toBeGreaterThan(0);
    const bar = stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1);
    expect(bar).toMatchObject({ mode: 'dark', darkVia: 'mirror' });

    await act(async () => stub.emit({ type: 'reset-all' }));
    await tick(120);
    expect(text()).toContain('read from this page');
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ mode: 'light', resettable: 0 });
  });

  it('shows the agent\'s preview on the bar and in Changes, and never in the brief', async () => {
    await act(async () => updateSession({ agentPreview: { rules: 4, matched: 27, at: new Date().toISOString(), css: '.card{}', declares: [] } }));
    await tick(120);
    const bar = stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1);
    expect(bar).toMatchObject({ agent: { rules: 4, matched: 27 }, resettable: 1 });
    // A preview is not a decision: the badge stays at zero.
    expect(badge()).toBe('0');

    await click(host.querySelector('#tab-changes'));
    expect(text()).toContain('Agent preview');
    expect(text()).toContain('4 rules · 27 elements');

    const clear = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Clear') ?? null;
    await click(clear);
    await tick(120);
    expect(stub.sent.some((m) => m.type === 'reskin-preview-clear')).toBe(true);
    expect(text()).not.toContain('Agent preview');
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ agent: null, resettable: 0 });
  });

  it('lists what the agent did, as history rather than changes', async () => {
    await act(async () =>
      updateSession({
        agentLog: [
          { at: new Date().toISOString(), what: 'pointed at .card — “these”' },
          { at: new Date().toISOString(), what: 'painted a preview: 2 rule(s) reaching 4 element(s)' },
        ],
      }),
    );
    await tick(60);
    expect(badge()).toBe('0');
    await click(host.querySelector('#tab-changes'));
    expect(text()).toContain('Agent activity');
    expect(text()).toContain('painted a preview: 2 rule(s) reaching 4 element(s)');
    await click(Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'clear') ?? null);
    await tick(60);
    expect(text()).not.toContain('Agent activity');
  });

  it('locks a page variable so nothing moves it', async () => {
    await click(host.querySelector('#tab-variables'));
    expect(host.querySelector('input[aria-label="--mark value"]')).not.toBeNull();
    await click(host.querySelector('button[aria-label="Lock --mark"]'));
    await tick(60);
    expect(host.querySelector('input[aria-label="--mark value"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Unlock --mark"]')?.textContent).toBe('locked');
    // A lock is a decision about the page, kept with the other edits.
    await tick(400);
    const saved = (await (globalThis as unknown as { chrome: { storage: { local: { get: () => Promise<Record<string, unknown>> } } } }).chrome.storage.local.get()) ?? {};
    const edits = Object.entries(saved).find(([k]) => k.startsWith('edits:'))?.[1] as { locks?: string[] } | undefined;
    expect(edits?.locks).toEqual(['--mark']);
    // A colour edit of the locked variable's own hex does not reach the page or the badge.
    await act(async () => updateSession({ colorEdits: { '#BE3A22': '#1C7F5C' } }));
    await tick(200);
    const lastPaint = stub.sent.filter((m) => m.type === 'reskin-apply').at(-1) as { colorMap?: Record<string, string> } | undefined;
    expect(lastPaint?.colorMap?.['#BE3A22']).toBeUndefined();
    expect(badge()).toBe('0');
    await act(async () => updateSession({ colorEdits: {} }));
    await click(host.querySelector('button[aria-label="Unlock --mark"]'));
    await tick(60);
    expect(host.querySelector('input[aria-label="--mark value"]')).not.toBeNull();
  });

  it('lets a page variable be set by hand and lists it as a change', async () => {
    await click(host.querySelector('#tab-variables'));
    const input = Array.from(host.querySelectorAll<HTMLInputElement>('input[aria-label="--mark value"]')).find((i) => i.type !== 'color')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, '#1C7F5C');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await tick(120);
    expect(badge()).toBe('1');
    expect(text()).toContain('by hand');
    const painted = stub.sent.filter((m) => m.type === 'reskin-apply').at(-1)?.overrides as { name: string; to: string }[];
    expect(painted).toEqual([{ name: '--mark', from: '#be3a22', to: '#1C7F5C', reason: 'manual' }]);
  });

  it('remembers the tab it was on', async () => {
    await click(host.querySelector('#tab-changes'));
    await tick(400);
    const stored = (await chrome.storage.session.get('session:1'))['session:1'] as { activeTab?: string };
    expect(stored.activeTab).toBe('changes');
  });
});
