import { planResize, requestedBounds, type Size } from '@/shared/viewport';

interface Previous {
  width: number;
  height: number;
  state: string | undefined;
  zoom: number;
}

export default defineBackground(() => {
  // Toolbar click opens the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('setPanelBehavior failed', err));

  /** What a window looked like before the bar's first preset, so Reset can put it back. */
  const previous = new Map<number, Previous>();

  /**
   * A preset is a CSS viewport. The window is asked for the outer size that
   * would give it; when the display is too small for that — a laptop with the
   * side panel open, for most presets — the page is zoomed out until its CSS
   * viewport is the preset width anyway, and the reply says so.
   */
  const resize = async (
    msg: { preset: Size & { name: string }; inner: Size; outer: Size },
    tabId: number,
    windowId: number,
  ) => {
    const zoom = await chrome.tabs.getZoom(tabId);
    if (!previous.has(windowId)) {
      const win = await chrome.windows.get(windowId);
      previous.set(windowId, { width: win.width ?? 0, height: win.height ?? 0, state: win.state, zoom });
    }
    // Per tab, so the zoom does not leak to every other tab on the origin.
    await chrome.tabs.setZoomSettings(tabId, { mode: 'automatic', scope: 'per-tab' });
    const bounds = requestedBounds(msg.preset, msg.inner, msg.outer, zoom);
    const win = await chrome.windows.update(windowId, { ...bounds, state: 'normal' });
    const plan = planResize({
      preset: msg.preset,
      inner: msg.inner,
      outer: msg.outer,
      zoom,
      achieved: { width: win.width ?? bounds.width, height: win.height ?? bounds.height },
    });
    if (plan.zoom !== zoom) await chrome.tabs.setZoom(tabId, plan.zoom);
    return { ok: true, zoom: plan.zoom, viewport: plan.viewport, canReset: true };
  };

  const reset = async (tabId: number, windowId: number) => {
    const was = previous.get(windowId);
    previous.delete(windowId);
    await chrome.tabs.setZoom(tabId, 1);
    if (!was) return { ok: true, zoom: 1, canReset: false };
    // A maximised window cannot take a size in the same call.
    if (was.state === 'maximized' || was.state === 'fullscreen') {
      await chrome.windows.update(windowId, { state: was.state as 'maximized' | 'fullscreen' });
    } else if (was.width && was.height) {
      await chrome.windows.update(windowId, { width: was.width, height: was.height, state: 'normal' });
    }
    return { ok: true, zoom: 1, canReset: false };
  };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    const fail = (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });

    if (msg?.type === 'resize-window' && tabId != null && windowId != null) {
      resize(msg, tabId, windowId).then(sendResponse).catch(fail);
      return true;
    }
    if (msg?.type === 'reset-viewport' && tabId != null && windowId != null) {
      reset(tabId, windowId).then(sendResponse).catch(fail);
      return true;
    }
    if (msg?.type === 'viewport-state' && tabId != null && windowId != null) {
      chrome.tabs
        .getZoom(tabId)
        .then((zoom) => sendResponse({ ok: true, zoom, canReset: previous.has(windowId) }))
        .catch(fail);
      return true;
    }
    // Cross-origin fetches (stylesheets, external SVGs) run here: the
    // extension context bypasses page CORS once host permission is granted.
    if (msg?.type === 'fetch-text') {
      fetch(msg.url)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((text) => sendResponse({ ok: true, text }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true; // async response
    }
  });
});
