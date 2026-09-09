/**
 * Enough of `chrome.*` to mount the real panel in a test: a scanned tab,
 * storage that remembers, a page that answers the layers request and the
 * re-skin with counts, and `emit(msg)` to play a content-script message.
 * The local harness (.harness/stub.js) does the same for a browser; this is
 * the version the suite owns.
 */

import type { ScanResult } from '@/shared/types';

export const forfontsake: ScanResult = {
  url: 'http://localhost:5173/',
  title: 'forfontsake',
  scannedAt: 1788800000000,
  viewport: { width: 1280, height: 800, dpr: 2 },
  fontFaces: [],
  fontUsage: [
    {
      family: 'Inter',
      elementCount: 300,
      roles: ['body'],
      variants: [
        { size: '15px', weight: '400', lineHeight: '24px', count: 200 },
        { size: '28px', weight: '600', lineHeight: '34px', count: 8 },
      ],
    },
  ],
  colors: [
    { hex: '#15171B', usage: ['text'], count: 513, varNames: ['--ink'] },
    { hex: '#EFECE4', usage: ['background'], count: 78, varNames: ['--plate'] },
    { hex: '#6C6A61', usage: ['text'], count: 69, varNames: ['--muted'] },
    { hex: '#CBC7BC', usage: ['border'], count: 63, varNames: ['--rule'] },
    { hex: '#E7E4DB', usage: ['background'], count: 49, varNames: ['--paper'] },
    { hex: '#BE3A22', usage: ['text'], count: 24, varNames: ['--mark'] },
  ],
  gradients: [],
  contrastPairs: [],
  svgs: [],
  customProps: [
    { name: '--ink', value: '#15171b', source: 'http://localhost:5173/src/index.css', uses: 41 },
    { name: '--paper', value: '#e7e4db', source: 'http://localhost:5173/src/index.css', uses: 22 },
    { name: '--plate', value: '#efece4', source: 'http://localhost:5173/src/index.css', uses: 14 },
    { name: '--rule', value: '#cbc7bc', source: 'http://localhost:5173/src/index.css', uses: 19 },
    { name: '--muted', value: '#6c6a61', source: 'http://localhost:5173/src/index.css', uses: 12 },
    { name: '--mark', value: '#be3a22', source: 'http://localhost:5173/src/index.css', uses: 34 },
    { name: '--track', value: '#d5d1c6', source: 'http://localhost:5173/src/index.css', uses: 6 },
  ],
  shape: {
    radii: [{ value: '4px', count: 40 }],
    shadows: [],
    spacing: [
      { value: '8px', count: 90 },
      { value: '16px', count: 70 },
      { value: '24px', count: 30 },
    ],
  },
  cssText: '.btn{color:#be3a22}.x{border:1px solid #be3a22}.y{background:rgb(190,58,34)}',
  unreadableSheets: [],
  stats: { elementsSampled: 900, styleSheets: 2 },
};

type Listener = (msg: unknown, sender: unknown, reply?: (r: unknown) => void) => void;

const node = (id: number, depth: number, label: string, descendants: number, text?: string, hidden = false, matches = 1) => ({
  id,
  depth,
  label,
  descendants,
  tag: label.split(/[.#]/)[0],
  selector: label,
  stable: !label.includes('nth'),
  matches,
  ...(matches > 1 ? { intent: label.replace(/:nth-of-type\(\d+\)/, '') } : {}),
  hidden,
  display: hidden ? 'none' : 'block',
  ...(text ? { text } : {}),
});

export const layers = [
  node(0, 0, 'body', 10),
  node(1, 1, 'div#root', 9),
  node(2, 2, 'header.topbar', 2),
  node(3, 3, 'h1#title', 0, 'Grit'),
  node(4, 3, 'p.tagline', 0, 'Type, treated.'),
  node(5, 2, 'main.plate', 5),
  node(6, 3, 'article.card', 1, undefined, false, 2),
  node(7, 4, 'h2.card-title', 0, 'Grit'),
  node(8, 3, 'article.card', 1, undefined, false, 2),
  node(9, 4, 'h2.card-title', 0, 'Plate'),
  node(10, 3, 'aside.legacy', 0, 'Old panel', true),
];

export interface StubChrome {
  /** Every message the panel sent to the tab, oldest first. */
  sent: { type?: string; cmd?: string; [k: string]: unknown }[];
  /** What the page answers a `read` with: the element a test says is selected. */
  current: unknown;
  /** Deliver a message as if a content script in tab 1 sent it. */
  emit(msg: unknown): void;
}

export function installChrome(): StubChrome {
  const listeners = new Set<Listener>();
  const session: Record<string, unknown> = { 'session:1': { scan: forfontsake, config: null, mode: 'light', live: true } };
  const local: Record<string, unknown> = {};
  const sync: Record<string, unknown> = {};
  const sent: StubChrome['sent'] = [];
  const stub: StubChrome = { sent, current: null, emit: () => {} };

  const area = (store: Record<string, unknown>) => ({
    get: async (k: string | string[] | undefined) => {
      if (k === undefined) return { ...store };
      const keys = Array.isArray(k) ? k : [k];
      return Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]]));
    },
    set: async (o: Record<string, unknown>) => {
      Object.assign(store, o);
    },
    remove: async (k: string) => {
      delete store[k];
    },
  });

  const chrome = {
    storage: {
      session: area(session),
      local: area(local),
      sync: area(sync),
      onChanged: { addListener() {}, removeListener() {} },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'http://localhost:5173/' }],
      onActivated: { addListener() {}, removeListener() {} },
      onUpdated: { addListener() {}, removeListener() {} },
      sendMessage: async (_id: number, msg: StubChrome['sent'][number]) => {
        sent.push(msg);
        if (msg?.type === 'inspector' && msg.cmd === 'layers') return layers;
        if (msg?.type === 'inspector' && msg.cmd === 'read') return stub.current;
        if (msg?.type === 'inspector' && msg.cmd === 'deselect') stub.current = null;
        if (msg?.type === 'inspector') return { ok: true, hover: false, selected: stub.current !== null };
        if (msg?.type === 'reskin-apply') {
          const overrides = (msg.overrides as unknown[]) ?? [];
          return { ok: true, vars: overrides.length, rules: Object.keys((msg.colorMap as object) ?? {}).length };
        }
        if (msg?.type === 'site-mode') return { ok: true, vars: 0, rules: 0, hooks: [] };
        return { ok: true, vars: 0, rules: 0 };
      },
      connect: () => ({ onDisconnect: { addListener() {} }, disconnect() {} }),
      captureVisibleTab: async () => 'data:image/png;base64,',
      getZoom: async () => 1,
      setZoom: async () => {},
      setZoomSettings: async () => {},
    },
    runtime: {
      onMessage: {
        addListener: (fn: Listener) => listeners.add(fn),
        removeListener: (fn: Listener) => listeners.delete(fn),
      },
      sendMessage: async () => ({ ok: true }),
      getURL: (p: string) => p,
      getManifest: () => ({ version: '0.1.0' }),
    },
    windows: { getCurrent: async () => ({ id: 1, width: 1456, height: 1004 }), update: async () => ({}) },
    scripting: { executeScript: async () => [{ result: null }] },
    permissions: { request: async () => true, contains: async () => false },
    sidePanel: { setPanelBehavior: async () => {} },
    commands: { onCommand: { addListener() {} } },
  };

  (globalThis as unknown as { chrome: unknown }).chrome = chrome;
  stub.emit = (msg) => {
    const m = msg as { type?: string; data?: unknown };
    if (m.type === 'element-selected') stub.current = m.data ?? null;
    for (const fn of listeners) fn(msg, { tab: { id: 1 } });
  };
  return stub;
}

/** A selected element, the shape the inspector sends, with a few fields to taste. */
export const element = (over: Record<string, unknown> = {}) => ({
  selector: 'h1#title',
  matches: 1,
  stable: true,
  intent: { selector: 'h1', matches: 1 },
  tag: 'h1',
  breadcrumb: [
    { tag: 'body', selector: 'body' },
    { tag: 'h1', selector: 'h1#title' },
  ],
  rect: { x: 0, y: 0, width: 100, height: 20 },
  box: {
    marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px',
    paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px', paddingLeft: '16px',
    width: '100px', height: '20px', boxSizing: 'border-box', display: 'block', gap: 'normal',
  },
  layout: { flexDirection: 'row', justifyContent: 'normal', alignItems: 'normal', flexWrap: 'nowrap' },
  opacity: '1',
  type: { fontFamily: 'Inter', fontSize: '28px', fontWeight: '600', lineHeight: '34px', letterSpacing: 'normal', textAlign: 'start' },
  color: { text: '#15171B', background: '#E7E4DB', border: '#CBC7BC' },
  radius: '0px',
  corners: { topLeft: '0px', topRight: '0px', bottomRight: '0px', bottomLeft: '0px' },
  border: { width: '0px', style: 'none', color: '#CBC7BC' },
  shadow: 'none',
  text: 'Grit',
  contrastRatio: 12.1,
  ...over,
});
