// @vitest-environment happy-dom
/**
 * The panel, mounted for real against a stubbed page. What the harness
 * checks by hand, pinned: the tab strip, a selection landing on Style, an
 * edit reaching the badge, the rail beside the page, Dark previewing without
 * entering the brief, and Reset taking everything back.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { handleBridgeFrame } from './lib/bridge';
import { allow, getSession, loadSession, setVarOverride, updateSession } from './lib/session';
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
  it('opens on Style with the four tabs in order and the page read', () => {
    expect(tabs()).toEqual(['style', 'variables', 'export', 'changes']);
    expect(activeTab()).toBe('style');
    expect(host.querySelector('footer')?.textContent).toContain('6 colors');
    // Nothing picked yet: the tree is in the rail, not here.
    expect(text()).toContain('Nothing selected');
    expect(text()).not.toContain('Show layers');
  });

  it('shows the rail beside the page, feeds it the assets, and folds it when the bar says so', async () => {
    const rails = () => stub.sent.filter((m) => m.type === 'rail');
    expect(rails().find((m) => m.cmd === 'rail')).toMatchObject({ on: true, theme: 'dark' });
    expect(rails().find((m) => m.cmd === 'assets')).toMatchObject({ svgs: [] });
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ rail: true });

    // Layers on the bar, or Alt+L: the session holds the answer and the page is told.
    await act(async () => stub.emit({ type: 'rail-toggled', on: false }));
    await tick(120);
    expect(getSession().rail).toBe(false);
    expect(rails().filter((m) => m.cmd === 'rail').at(-1)).toMatchObject({ on: false });
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ rail: false });

    // With it folded, the empty Style tab offers it back.
    const show = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Show layers') ?? null;
    expect(show).not.toBeNull();
    await click(show);
    await tick(120);
    expect(getSession().rail).toBe(true);
    expect(rails().filter((m) => m.cmd === 'rail').at(-1)).toMatchObject({ on: true });
  });

  it('files a drag in the rail as a move, and the eye as a display edit', async () => {
    const row = (id: number, selector: string, depth: number) => ({
      id, depth, label: selector, selector, tag: selector.split(/[.#]/)[0], stable: true, matches: 1, descendants: 0, hidden: false, display: 'block',
    });
    const main = row(5, 'main.plate', 2);
    const card = row(6, 'article.card', 3);
    const title = row(3, 'h1#title', 3);
    const header = row(2, 'header.topbar', 2);
    await act(async () => stub.emit({ type: 'rail-move', node: title, parent: main, before: card, wasIn: header, wasBefore: null }));
    await tick(120);
    expect(badge()).toBe('1');
    const moves = stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'moves').at(-1)?.moves;
    expect(moves).toEqual([{ selector: 'h1#title', parent: 'main.plate', before: 'article.card' }]);

    await act(async () => stub.emit({ type: 'rail-hide', node: card }));
    await tick(120);
    expect(badge()).toBe('2');
    const rules = stub.sent.filter((m) => m.type === 'elements-set').at(-1)?.rules as { selector: string; property: string; value: string }[];
    expect(rules).toEqual([{ selector: 'article.card', property: 'display', value: 'none' }]);
    // The eye again is that edit taken back, not a second one.
    await act(async () => stub.emit({ type: 'rail-hide', node: card }));
    await tick(120);
    expect(badge()).toBe('1');
  });

  it('opens on Style when a stored session was left on a tab that moved into the rail', async () => {
    await act(async () => chrome.storage.session.set({ 'session:1': { ...getSession(), activeTab: 'layers' } }));
    await act(async () => loadSession(1, 'http://localhost:5173/'));
    await tick();
    expect(getSession().activeTab).toBe('style');
    expect(activeTab()).toBe('style');
  });

  it('shows a selection on Style, and an edit from the page reaches the badge', async () => {
    await click(host.querySelector('#tab-export'));
    expect(activeTab()).toBe('export');
    await act(async () => stub.emit({ type: 'element-selected', data: element() }));
    await tick();
    expect(activeTab()).toBe('style');
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

  it('keeps both consents when both are given, rather than one erasing the other', async () => {
    // On a local page the page's scope and the project's are the same string,
    // which is how saving one answer used to wipe the other.
    await act(async () => void ack({ name: 'ffs', path: '/Users/x/ffs' }));
    await tick(120);
    await act(async () => allow('agentMayWrite', true));
    await act(async () => allow('bridgeMayWrite', true));
    await tick();
    const stored = await chrome.storage.local.get([
      'consent:paint:project:/Users/x/ffs',
      'consent:write:project:/Users/x/ffs',
    ]);
    expect(stored).toEqual({
      'consent:paint:project:/Users/x/ffs': true,
      'consent:write:project:/Users/x/ffs': true,
    });
    await act(async () => loadSession(1, 'http://localhost:5173/'));
    expect(getSession()).toMatchObject({ agentMayWrite: true, bridgeMayWrite: true });
  });

  it('keeps an edit made while the bridge was away when it comes back', async () => {
    await act(async () => void ack({ name: 'ffs', path: '/Users/x/ffs' }));
    await tick(150);
    // Something already decided while paired, so the project has a record.
    await act(async () => setVarOverride('--ink', '#222222'));
    await tick(400);

    // The agent restarts and takes the bridge with it: the panel forgets the
    // project it was told about, which is what a closing socket does.
    await act(async () => void ack(null));
    await act(async () => setVarOverride('--mark', '#1C7F5C'));
    // Past the save debounce, so the edit is on disk under whatever key applied.
    await tick(400);

    // Back again, naming the same project.
    await act(async () => void ack({ name: 'ffs', path: '/Users/x/ffs' }));
    await tick(200);
    expect(getSession().varOverrides).toEqual({ '--ink': '#222222', '--mark': '#1C7F5C' });
  });

  it('offers no Apply on a page that is not served locally, whatever was allowed', async () => {
    await act(async () => void ack({ name: 'ffs', path: '/Users/x/ffs' }));
    await editAToken();
    await act(async () => allow('bridgeMayWrite', true));
    await act(async () =>
      updateSession((prev) => ({ scan: { ...prev.scan!, url: 'https://forfontsake.com/' }, varOverrides: { '--mark': '#1C7F5C' } })),
    );
    await act(async () => void definitions({ '--mark': [{ file: 'src/index.css', line: 2, kind: 'css', context: 'root', value: '#BE3A22' }] }));
    await tick(150);
    await click(host.querySelector('#tab-changes'));
    // The row is there, with its position — only the write is withheld.
    expect(text()).toContain('src/index.css:2');
    expect(getSession().bridgeMayWrite).toBe(true);
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent === 'Apply')).toBe(false);
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
      widths.value = 'width:max:700';
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
      widths.value = 'width:max:700';
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

  it('drops a width the page turns out not to have', async () => {
    await selectHeading();
    const widths = host.querySelector<HTMLSelectElement>('[aria-label="Width to edit at"]')!;
    await act(async () => {
      widths.value = 'width:max:700';
      widths.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await tick(150);
    expect(text()).toContain('at 700px and under');

    // A rescan, or a navigation, and this page is written against something
    // else entirely. The choice cannot survive that.
    await act(async () =>
      updateSession((prev) => ({ scan: { ...prev.scan!, breakpoints: ['(min-width: 1024px)'] } })),
    );
    await tick(150);
    expect(text()).not.toContain('at 700px and under');
    const after = host.querySelector<HTMLSelectElement>('[aria-label="Width to edit at"]')!;
    expect(after.value).toBe('');
    expect(Array.from(after.options).map((o) => o.textContent?.trim())).toEqual(['width…', '≥1024']);
  });

  it('leaves the dark preview and the viewport alone when a state is picked', async () => {
    // The person turned on Dark themselves, on the bar.
    await act(async () => stub.emit({ type: 'mode-changed', mode: 'dark' }));
    await selectHeading();
    const bars = () => stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar');
    const before = bars().length;

    await click(chip('hover'));
    await tick(150);
    await click(chip('default'));
    await tick(150);

    // Neither pick said anything about the mode, and nothing reset the window.
    expect(bars().slice(before).every((m) => m.mode === 'dark')).toBe(true);
    expect(stub.sent.some((m) => m.type === 'inspector' && m.cmd === 'reset-viewport')).toBe(false);
  });

  it('puts the mode back to what it was, not to light, after editing in dark', async () => {
    await act(async () => stub.emit({ type: 'mode-changed', mode: 'dark' }));
    await selectHeading();
    await click(chip('dark'));
    await tick(150);
    await click(chip('default'));
    await tick(150);
    expect(stub.sent.filter((m) => m.type === 'inspector' && m.cmd === 'bar').at(-1)).toMatchObject({ mode: 'dark' });
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

describe('the Style column', () => {
  const radio = (group: string, label: string) =>
    Array.from(host.querySelector(`[role=radiogroup][aria-label="${group}"]`)?.querySelectorAll('[role=radio]') ?? []).find(
      (b) => b.textContent === label || b.getAttribute('aria-label') === label,
    ) ?? null;
  const lastRules = () =>
    stub.sent.filter((m) => m.type === 'elements-set').at(-1)?.rules as { selector: string; property: string; value: string }[];
  const selectHeading = async (over: Record<string, unknown> = {}) => {
    await act(async () => stub.emit({ type: 'element-selected', data: element(over) }));
    await tick();
  };

  it('lays the groups out in a design tool\'s order, all open', async () => {
    await selectHeading();
    const heads = Array.from(host.querySelectorAll('section > button[aria-expanded]')).map((b) => b.textContent?.replace('▶', ''));
    expect(heads).toEqual(['Position', 'Size', 'Layout', 'Spacing', 'Colour', 'Type', 'Border', 'Effects', 'Motion', 'Text']);
    expect(host.querySelectorAll('section > button[aria-expanded="false"]')).toHaveLength(0);
  });

  it('positions the box and opens the insets once it is positioned', async () => {
    await selectHeading();
    expect(host.querySelector('[aria-label="Top"]')).toBeNull();
    await click(radio('Position', 'absolute'));
    await tick(120);
    expect(lastRules()).toEqual([{ selector: 'h1#title', property: 'position', value: 'absolute' }]);
    await selectHeading({ position: { type: 'absolute', top: '0px', right: 'auto', bottom: 'auto', left: '0px', zIndex: '2' } });
    expect(host.querySelector('[aria-label="Top"]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[aria-label="Z-index"]')?.value).toBe('2');
  });

  it('claims no size mode from a pixel count, and writes one exactly', async () => {
    await selectHeading();
    const modes = host.querySelector('[role=radiogroup][aria-label="Width mode"]')!;
    expect(Array.from(modes.querySelectorAll('[role=radio][aria-checked="true"]'))).toHaveLength(0);
    // Relative: the box's share of the parent's content box, from the page's own numbers.
    await click(radio('Width mode', 'rel'));
    await tick(120);
    expect(lastRules()).toEqual([{ selector: 'h1#title', property: 'width', value: '10%' }]);
    // Now the log has said it, the mode reads back.
    expect(radio('Width mode', 'rel')?.getAttribute('aria-checked')).toBe('true');
    await click(radio('Height mode', 'fit'));
    await tick(120);
    expect(lastRules()).toContainEqual({ selector: 'h1#title', property: 'height', value: 'fit-content' });
  });

  it('fills a flex child by growing along the parent\'s main axis', async () => {
    await selectHeading({
      child: { inFlex: true, parentDirection: 'row', flexGrow: '0', flexShrink: '1', flexBasis: 'auto', alignSelf: 'auto', order: '0', parentWidth: 1000, parentHeight: 600 },
    });
    await click(radio('Width mode', 'fill'));
    await tick(120);
    expect(lastRules()).toEqual([
      { selector: 'h1#title', property: 'flex', value: '1 1 0%' },
      { selector: 'h1#title', property: 'width', value: 'auto' },
    ]);
    expect(radio('Width mode', 'fill')?.getAttribute('aria-checked')).toBe('true');
    // And the flex-child fields are there for it.
    expect(host.querySelector('[aria-label="Flex grow"]')).not.toBeNull();
  });

  it('aligns a stack from the grid, as two properties', async () => {
    await selectHeading({ box: { ...element().box, display: 'flex' } });
    await click(radio('Align children', 'bottom right'));
    await tick(120);
    expect(lastRules()).toEqual([
      { selector: 'h1#title', property: 'justify-content', value: 'flex-end' },
      { selector: 'h1#title', property: 'align-items', value: 'flex-end' },
    ]);
    expect(badge()).toBe('2');
  });

  it('edits spacing in the diagram, reaching the sides the link says', async () => {
    await selectHeading();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const type = async (label: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      await tick(120);
    };
    await type('Padding top', '12');
    expect(lastRules()).toEqual([{ selector: 'h1#title', property: 'padding-top', value: '12' }]);
    await click(radio('Sides an edit reaches', 'all'));
    await type('Padding left', '20');
    expect(lastRules().filter((r) => r.property.startsWith('padding')).map((r) => `${r.property}:${r.value}`).sort()).toEqual(
      ['padding-bottom:20', 'padding-left:20', 'padding-right:20', 'padding-top:20'],
    );
  });
});
