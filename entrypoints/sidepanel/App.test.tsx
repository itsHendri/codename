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
import { handleBridgeFrame } from './lib/bridge';
import { allow, getSession, updateSession } from './lib/session';
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

describe('the project the bridge is running in', () => {
  const ack = (project: { name: string; path: string; branch?: string; dirty?: boolean } | null) =>
    handleBridgeFrame({ v: 1, id: 'a', type: 'response', replyTo: 'h', ok: true, payload: { bridgeVersion: '0.1.0', ...(project ? { project } : {}) } });

  const definitions = (found: Record<string, { file: string; line: number; kind: 'css'; context: 'root' | 'media'; value: string }[]>) =>
    handleBridgeFrame({ v: 1, id: 'd', type: 'definitions', payload: { found } });

  /** A token edit in the queue, so Changes has something to show. */
  const editAToken = async () => {
    await act(async () => stub.emit({ type: 'element-selected', data: element() }));
    await act(async () => stub.emit({ type: 'element-edit', property: 'color', to: '#ff0000' }));
    await tick();
  };

  it('names the project and its branch on Changes', async () => {
    await act(async () => void ack({ name: 'forfontsake', path: '/Users/x/ffs', branch: 'main', dirty: true }));
    await tick();
    await click(host.querySelector('#tab-changes'));
    expect(text()).toContain('forfontsake');
    expect(text()).toContain('main');
    expect(text()).toContain('Bridge may edit definitions in forfontsake');
  });

  it('says nothing about a project while no bridge is paired', async () => {
    await act(async () => void ack(null));
    await tick();
    await click(host.querySelector('#tab-changes'));
    expect(text()).not.toContain('Bridge may edit definitions');
  });

  it('shows where a token is defined, and offers Apply only once the project allows it', async () => {
    await act(async () => void ack({ name: 'ffs', path: '/Users/x/ffs' }));
    await editAToken();
    await act(async () =>
      updateSession({ varOverrides: { '--mark': '#1C7F5C' } }),
    );
    await act(async () => void definitions({ '--mark': [{ file: 'src/index.css', line: 12, kind: 'css', context: 'root', value: '#BE3A22' }] }));
    await tick(120);
    await click(host.querySelector('#tab-changes'));
    expect(text()).toContain('src/index.css:12');
    const applyBefore = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Apply');
    expect(applyBefore).toBeUndefined();

    await act(async () => allow('bridgeMayWrite', true));
    await tick();
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent === 'Apply')).toBe(true);
  });

  it('does not offer Apply when more than one definition could be the one', async () => {
    await act(async () => void ack({ name: 'ffs', path: '/Users/x/ffs' }));
    await editAToken();
    await act(async () => updateSession({ varOverrides: { '--mark': '#1C7F5C' } }));
    await act(async () => allow('bridgeMayWrite', true));
    await act(async () =>
      void definitions({
        '--mark': [
          { file: 'src/index.css', line: 12, kind: 'css', context: 'root', value: '#BE3A22' },
          { file: 'src/dark.css', line: 4, kind: 'css', context: 'media', value: '#BE3A22' },
        ],
      }),
    );
    await tick(120);
    await click(host.querySelector('#tab-changes'));
    expect(text()).toContain('2 definitions — the cascade decides');
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent === 'Apply')).toBe(false);
  });
});

describe('what happens when the bridge comes and goes', () => {
  const ack = (project: { name: string; path: string; branch?: string } | null) =>
    handleBridgeFrame({ v: 1, id: 'a', type: 'response', replyTo: 'h', ok: true, payload: { bridgeVersion: '0.1.0', ...(project ? { project } : {}) } });

  it('leaves the edits on the page when the agent quits', async () => {
    await act(async () => void ack({ name: 'ffs', path: '/Users/x/ffs' }));
    await act(async () => stub.emit({ type: 'element-selected', data: element() }));
    await act(async () => stub.emit({ type: 'element-edit', property: 'color', to: '#ff0000' }));
    await tick();
    expect(badge()).toBe('1');

    // The bridge going away is not a reason to take the work back.
    await act(async () => void ack(null));
    await tick(120);
    expect(badge()).toBe('1');
    await click(host.querySelector('#tab-changes'));
    expect(text()).not.toContain('Bridge may edit definitions');
  });

  it('does not offer to write to a project the page is not served from', async () => {
    await act(async () => updateSession({ scan: { ...getSession().scan!, url: 'https://forfontsake.com/' } }));
    await act(async () => void ack({ name: 'ffs', path: '/Users/x/ffs' }));
    await tick(120);
    await click(host.querySelector('#tab-changes'));
    expect(text()).toContain('not served from ffs');
    expect(text()).not.toContain('Bridge may edit definitions');
  });
});

describe('editing a state', () => {
  const chips = () => Array.from(host.querySelectorAll('[role=radio]')).map((b) => b.textContent);
  const chip = (label: string) =>
    Array.from(host.querySelectorAll('[role=radio]')).find((b) => b.textContent === label) ?? null;

  const selectHeading = async () => {
    await act(async () => stub.emit({ type: 'element-selected', data: element() }));
    await tick();
  };

  it('offers the states once something is selected, with the widths behind one control', async () => {
    await selectHeading();
    expect(chips()).toEqual(expect.arrayContaining(['default', 'hover', 'focus', 'active', 'dark']));
    const widths = host.querySelector<HTMLSelectElement>('[aria-label="Width to edit at"]');
    expect(widths).not.toBeNull();
    // This page declares one breakpoint of its own, so that is what is
    // offered — not a device preset it was never written against.
    expect(Array.from(widths!.options).map((o) => o.textContent?.trim())).toEqual(['width…', '≤700']);
  });

  it('holds the page in the state and shows what it already does there', async () => {
    await selectHeading();
    await click(chip('hover'));
    await tick(120);
    // The inspector was told to put the class on, and the page answered with
    // its own hover rules.
    expect(stub.sent.some((m) => m.type === 'inspector' && m.cmd === 'state' && m.state === 'hover')).toBe(true);
    expect(text()).toContain('Editing');
    expect(text()).toContain('what this element paints on hover');
    expect(text()).toContain('color: rgb(190, 58, 34)');
  });

  it('writes an edit made in a state under both the pseudo and the class', async () => {
    await selectHeading();
    await click(chip('hover'));
    await tick(120);
    await act(async () => stub.emit({ type: 'element-edit', property: 'color', to: '#ff0000' }));
    await tick(120);
    const rules = stub.sent.filter((m) => m.type === 'elements-set').at(-1)?.rules as { selector: string; condition?: unknown }[];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition).toMatchObject({ kind: 'state', state: 'hover' });
    expect(badge()).toBe('1');
  });

  it('keeps a default edit and a hover edit as two changes', async () => {
    await selectHeading();
    await act(async () => stub.emit({ type: 'element-edit', property: 'color', to: '#00ff00' }));
    await tick();
    await click(chip('hover'));
    await tick(120);
    await act(async () => stub.emit({ type: 'element-edit', property: 'color', to: '#ff0000' }));
    await tick(120);
    expect(badge()).toBe('2');
    await click(host.querySelector('#tab-changes'));
    expect(text()).toContain('hover');
  });

  it('turns the page dark when dark is the state being edited, and back again', async () => {
    await selectHeading();
    await click(chip('dark'));
    await tick(150);
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ mode: 'dark' });
    await click(chip('default'));
    await tick(150);
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ mode: 'light' });
  });

  it('asks for the viewport when a width is the state being edited', async () => {
    await selectHeading();
    const widths = host.querySelector<HTMLSelectElement>('[aria-label="Width to edit at"]')!;
    await act(async () => {
      widths.value = '700';
      widths.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await tick(120);
    // The width travels, not just a preset name: 700px is not a device.
    expect(stub.sent.some((m) => m.type === 'inspector' && m.cmd === 'set-viewport' && m.width === 700)).toBe(true);
  });

  it('reads the element again when the selection changes while a state is held', async () => {
    await selectHeading();
    await click(chip('hover'));
    await tick(120);
    const before = stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'read').length;

    // A different element, still in hover: its values — and the `from` of the
    // next edit — have to be that state's, not its resting ones.
    await act(async () => stub.emit({ type: 'element-selected', data: element({ selector: 'h2.card-title' }) }));
    await tick(150);
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'read').length).toBeGreaterThan(before);
    expect(stub.sent.filter((m) => m.type === 'state-set').at(-1)).toMatchObject({ selector: 'h2.card-title', state: 'hover' });
  });

  it('puts the state back on the page after a reload', async () => {
    await selectHeading();
    await click(chip('hover'));
    await tick(120);
    const before = stub.sent.filter((m) => m.type === 'state-set').length;

    // What a reload looks like to the panel: the managed sheets are gone and
    // have to be pushed again.
    await act(async () => updateSession((prev) => ({ generation: prev.generation + 1 })));
    await tick(150);
    expect(stub.sent.filter((m) => m.type === 'state-set').length).toBeGreaterThan(before);
  });

  it('asks the page to do the work once per pick, not twice', async () => {
    await selectHeading();
    const before = stub.sent.filter((m) => m.type === 'state-set').length;
    await click(chip('hover'));
    await tick(150);
    expect(stub.sent.filter((m) => m.type === 'state-set').length).toBe(before + 1);
  });

  it('says nothing to a page that has never been put into a state', async () => {
    await selectHeading();
    expect(stub.sent.some((m) => m.type === 'state-set')).toBe(false);
    expect(stub.sent.some((m) => m.type === 'inspector' && m.cmd === 'state')).toBe(false);
  });

  it('puts the page back when the selection goes, not just the panel', async () => {
    await selectHeading();
    await click(chip('dark'));
    await tick(150);
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ mode: 'dark' });

    // Deselecting drops the condition, so the page has to come back out of
    // dark — otherwise the next edit is read off a page nothing says is dark.
    await click(host.querySelector('[aria-label="Deselect element"]'));
    await tick(150);
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ mode: 'light' });
  });

  it('puts the viewport back when the selection goes', async () => {
    await selectHeading();
    const widths = host.querySelector<HTMLSelectElement>('[aria-label="Width to edit at"]')!;
    await act(async () => {
      widths.value = '700';
      widths.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await tick(150);
    await click(host.querySelector('[aria-label="Deselect element"]'));
    await tick(150);
    expect(stub.sent.some((m) => m.type === 'inspector' && m.cmd === 'reset-viewport')).toBe(true);
  });

  it('reads the page again when a variable moves under a held state', async () => {
    await selectHeading();
    await click(chip('hover'));
    await tick(150);
    const before = stub.sent.filter((m) => m.type === 'state-set').length;
    // The hoist copies the page's own rules, and this changes what they say.
    await act(async () => updateSession({ varOverrides: { '--mark': '#1C7F5C' } }));
    await tick(200);
    expect(stub.sent.filter((m) => m.type === 'state-set').length).toBeGreaterThan(before);
  });

  it('lets go of the state when the selection goes', async () => {
    await selectHeading();
    await click(chip('hover'));
    await tick(120);
    await click(host.querySelector('[aria-label="Deselect element"]'));
    await tick(120);
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'state').at(-1)).toMatchObject({ state: null });
    // And the hoisted sheet goes with it, rather than sitting in the page.
    expect(stub.sent.filter((m) => m.type === 'state-set').at(-1)).toMatchObject({ state: null, selector: null });
  });
});
