export default defineBackground(() => {
  // Toolbar click opens the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('setPanelBehavior failed', err));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
