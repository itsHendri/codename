/**
 * The rail: the page's layers and assets, drawn in the page on the left.
 *
 * Framer, Figma and Webflow put the tree on the left of the canvas and the
 * styles on the right, and here the live page is the canvas. A Chrome side
 * panel is one column with no width to spare, so the tree could not be a
 * second column of it; it stands in the page instead, the way the bar does,
 * pushing the page right by its own width. The panel keeps the styles.
 *
 * React in a closed shadow root, with the panel's stylesheet injected as a
 * string; the tree and the assets grid are the panel's own components.
 */

import { createRoot } from 'react-dom/client';
import css from './rail/rail.css?inline';
import { BAR_HEIGHT } from '@/shared/theme';
import type { RailCommand } from '@/shared/types';
import { RAIL_TAG } from '@/shared/inpage';
import { createRootPush } from '@/studio/pushRoot';
import { refitFrame } from '@/studio/pageFrame';
import { Rail } from './rail/Rail';
import { createStore } from './rail/store';

export const DEFAULT_WIDTH = 240;
export const MIN_WIDTH = 180;
export const MAX_WIDTH = 420;
const WIDTH_KEY = 'railWidth';

export default defineContentScript({
  registration: 'runtime',
  main() {
    if (window.__codenameRail) return;
    activate();
  },
});

export const clampWidth = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));

function activate() {
  const store = createStore({ on: false, theme: 'dark', svgs: [], width: DEFAULT_WIDTH });
  const host = document.createElement(RAIL_TAG);
  // The shadow is the edge: a light rail on a light page would otherwise run into it.
  host.style.cssText = `all:initial;position:fixed;left:0;top:${BAR_HEIGHT}px;bottom:0;width:${DEFAULT_WIDTH}px;z-index:2147483646;display:none;box-shadow:2px 0 12px rgba(0,0,0,0.18)`;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);
  const mount = document.createElement('div');
  mount.style.height = '100%';
  shadow.appendChild(mount);
  document.documentElement.appendChild(host);

  // The page moves over by the rail's width, and back when it goes; a
  // device frame on the page fits the room that is left.
  const push = createRootPush('left');
  const apply = () => {
    const { on, width, theme } = store.get();
    host.dataset.theme = theme;
    host.style.width = `${width}px`;
    host.style.display = on ? 'block' : 'none';
    if (on) push.set(width);
    else push.clear();
    refitFrame();
  };
  store.subscribe(apply);

  // The width is this browser's own convenience, kept across pages.
  let saveTimer = 0;
  const setWidth = (w: number) => {
    const width = clampWidth(w);
    if (width === store.get().width) return;
    store.set({ width });
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      chrome.storage.local.set({ [WIDTH_KEY]: width }).catch(() => {});
    }, 300);
  };
  chrome.storage.local
    .get(WIDTH_KEY)
    .then((got) => {
      const w = Number(got[WIDTH_KEY]);
      if (Number.isFinite(w) && w > 0) store.set({ width: clampWidth(w) });
    })
    .catch(() => {});

  const root = createRoot(mount);
  root.render(<Rail store={store} onResize={setWidth} />);

  const onMessage = (
    msg: { type?: string } & Partial<RailCommand>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r: unknown) => void,
  ) => {
    if (msg?.type !== 'rail') return false;
    switch (msg.cmd) {
      case 'rail':
        store.set({ on: !!msg.on, ...(msg.theme ? { theme: msg.theme } : {}) });
        break;
      case 'assets':
        store.set({ svgs: msg.svgs ?? [] });
        break;
      case 'off':
        deactivate();
        break;
    }
    sendResponse({ ok: true, on: store.get().on, width: store.get().width });
    return true;
  };

  // The panel holds a port open while it is showing this tab; when it goes,
  // the rail goes with the bar. The width is remembered for its return.
  const onConnect = (port: chrome.runtime.Port) => {
    if (port.name !== 'codename-panel') return;
    port.onDisconnect.addListener(() => store.set({ on: false }));
  };

  function deactivate() {
    root.unmount();
    push.clear();
    chrome.runtime.onMessage.removeListener(onMessage);
    chrome.runtime.onConnect.removeListener(onConnect);
    host.remove();
    refitFrame();
    delete window.__codenameRail;
  }

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.runtime.onConnect.addListener(onConnect);
  window.__codenameRail = { deactivate };
}
