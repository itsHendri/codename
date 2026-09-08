export default defineBackground(() => {
  // Toolbar click opens the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('setPanelBehavior failed', err));

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // The in-page bar picks a viewport preset; the page already knows its own
    // chrome delta, so the numbers arrive as an outer window size.
    if (msg?.type === 'resize-window' && sender.tab?.windowId != null) {
      void chrome.windows
        .update(sender.tab.windowId, {
          width: Math.max(Number(msg.width) || 0, 500),
          height: Math.max(Number(msg.height) || 0, 200),
          state: 'normal',
        })
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
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
