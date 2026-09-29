/**
 * The panel, drawn in the page on the right.
 *
 * Chrome's side panel sits beside the tab, outside the page, so nothing the
 * page draws — the bar across the top — can reach over it. Hendri wanted the
 * bar to frame both columns, as Framer's does, so the panel moved into the
 * page as the rail did: a column docked right, under the bar, pushing the
 * page left by its own width.
 *
 * It is the same app, not a copy: an iframe of the extension's own
 * `sidepanel.html`, told which tab it belongs to (`?tab=42`). An extension
 * page in a frame keeps the extension's APIs — storage, tabs, scripting, the
 * bridge's socket — so the panel runs unchanged; `shared/embed.ts` is the
 * little it has to know about where it is.
 *
 * Plain DOM rather than React: a host, the frame, and an edge to drag.
 */

import { BAR_HEIGHT } from '@/shared/theme';
import { clampPanel, PANEL_DEFAULT } from '@/shared/embed';
import { createRootPush } from '@/studio/pushRoot';
import { refitFrame } from '@/studio/pageFrame';

export const PANEL_TAG = 'codename-panel';
const WIDTH_KEY = 'panelWidth';

declare global {
  interface Window {
    __codenamePanel?: true;
  }
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    if (window.__codenamePanel) return;
    window.__codenamePanel = true;
    activate();
  },
});

function activate() {
  let width = PANEL_DEFAULT;
  let on = false;
  // Over the canvas: from the rail's edge to the window's, for the Design
  // System Manager's editor. The page under it is not being looked at.
  let expanded = false;
  let frame: HTMLIFrameElement | null = null;

  const host = document.createElement(PANEL_TAG);
  // Under the bar and above the page's own fixed elements, as the rail is.
  // The shadow is the edge where the panel meets a page of the same colour.
  host.style.cssText = `all:initial;position:fixed;right:0;top:${BAR_HEIGHT}px;bottom:0;width:${width}px;z-index:2147483646;display:none;box-shadow:-2px 0 12px rgba(0,0,0,0.18);background:#141414`;

  // The edge to drag. Outside the frame, because a frame swallows the
  // pointer the moment it crosses into it; the frame stops listening while
  // a drag is on for the same reason.
  const edge = document.createElement('div');
  edge.setAttribute('role', 'separator');
  edge.setAttribute('aria-orientation', 'vertical');
  edge.setAttribute('aria-label', 'Resize the panel');
  edge.tabIndex = 0;
  edge.style.cssText = 'position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize;z-index:1;touch-action:none';
  host.appendChild(edge);
  document.documentElement.appendChild(host);

  const push = createRootPush('right');

  const apply = () => {
    if (expanded) {
      host.style.left = 'var(--codename-rail, 0px)';
      host.style.width = 'auto';
      edge.style.display = 'none';
    } else {
      host.style.left = '';
      host.style.width = `${width}px`;
      edge.style.display = '';
    }
    host.style.display = on ? 'block' : 'none';
    if (on) push.set(width);
    else push.clear();
    refitFrame();
  };

  /** Which tab this is, from the background: a content script is not told. */
  const ownTab = async (): Promise<number | null> => {
    try {
      const id = (await chrome.runtime.sendMessage({ type: 'whoami' })) as number | null;
      return typeof id === 'number' ? id : null;
    } catch {
      return null;
    }
  };

  const show = async () => {
    if (on) return;
    on = true;
    if (!frame) {
      const tab = await ownTab();
      if (tab === null || !on) {
        on = false;
        return;
      }
      frame = document.createElement('iframe');
      frame.src = `${chrome.runtime.getURL('/sidepanel.html')}?tab=${tab}`;
      frame.title = 'Codename';
      frame.allow = 'clipboard-write';
      frame.style.cssText = 'all:initial;display:block;width:100%;height:100%;border:0;background:transparent';
      host.appendChild(frame);
    }
    apply();
  };

  // Hiding takes the frame away rather than keeping it behind the page: the
  // panel's port to the bar closes with it, and the bar and the rail go too,
  // which is how closing Chrome's side panel always behaved.
  const hide = () => {
    on = false;
    frame?.remove();
    frame = null;
    apply();
  };

  /* ----- the edge ----- */

  let saveTimer = 0;
  const setWidth = (w: number) => {
    const next = clampPanel(w);
    if (next === width) return;
    width = next;
    apply();
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      chrome.storage.local.set({ [WIDTH_KEY]: width }).catch(() => {});
    }, 300);
  };
  chrome.storage.local
    .get(WIDTH_KEY)
    .then((got) => {
      const w = Number(got[WIDTH_KEY]);
      if (Number.isFinite(w) && w > 0) {
        width = clampPanel(w);
        apply();
      }
    })
    .catch(() => {});

  let drag: { x: number; width: number } | null = null;
  edge.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, width };
    edge.setPointerCapture(e.pointerId);
    if (frame) frame.style.pointerEvents = 'none';
    e.preventDefault();
  });
  edge.addEventListener('pointermove', (e) => {
    // Dragging left widens it: the panel grows away from the right edge.
    if (drag) setWidth(drag.width + (drag.x - e.clientX));
  });
  const endDrag = () => {
    drag = null;
    if (frame) frame.style.pointerEvents = '';
  };
  edge.addEventListener('pointerup', endDrag);
  edge.addEventListener('pointercancel', endDrag);
  edge.addEventListener('keydown', (e) => {
    const delta = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : 0;
    if (!delta) return;
    e.preventDefault();
    setWidth(width + delta);
  });

  /* ----- commands, from the background ----- */

  chrome.runtime.onMessage.addListener((msg: { type?: string; cmd?: string; on?: boolean }, _sender, sendResponse) => {
    if (msg?.type !== 'panel') return false;
    if (msg.cmd === 'panel') {
      if (msg.on) void show();
      else hide();
    }
    if (msg.cmd === 'expand') {
      expanded = !!msg.on;
      apply();
    }
    sendResponse({ ok: true, on, width });
    return true;
  });
}
