import { frameFor, type Frame } from '@/shared/viewport';
import { componentsSource, refineComponents, ROOTS_KEPT, SCAN_LIMIT } from '@/studio/components';
import { isRestricted } from '@/shared/embed';

export default defineBackground(() => {
  /* ---------------- the toolbar button ---------------- */

  /**
   * The button turns Codename on and off in the tab: the bar across the top,
   * the rail on the left and the panel on the right, all drawn in the page
   * (W33). Chrome's side panel is only for pages Chrome will not let an
   * extension draw in, where it says so.
   */
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((err) => console.error('setPanelBehavior failed', err));

  const onKey = (tabId: number) => `on:${tabId}`;
  const isOn = async (tabId: number) => Boolean((await chrome.storage.session.get(onKey(tabId)))[onKey(tabId)]);

  /** Draw the panel in the tab, or take it away. False when the page would not have it. */
  const showPanel = async (tabId: number, on: boolean): Promise<boolean> => {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/panel.js'] });
      await chrome.tabs.sendMessage(tabId, { type: 'panel', cmd: 'panel', on });
      return true;
    } catch {
      return false;
    }
  };

  chrome.action.onClicked.addListener((tab) => {
    if (tab.id == null) return;
    const tabId = tab.id;
    // Opening the side panel has to happen inside the click, before any await.
    if (isRestricted(tab.url)) {
      void chrome.sidePanel.open({ tabId });
      return;
    }
    void (async () => {
      const next = !(await isOn(tabId));
      if (await showPanel(tabId, next)) {
        await chrome.storage.session.set({ [onKey(tabId)]: next });
      }
    })();
  });

  // A navigation wipes whatever was drawn in the page; a tab that had
  // Codename on gets it back once the new page has loaded. Where the site
  // was never allowed, the injection fails quietly and the button turns it on.
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== 'complete' || isRestricted(tab.url)) return;
    void isOn(tabId).then((on) => on && showPanel(tabId, true));
  });
  chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(onKey(tabId)));

  /* ---------------- the frame each tab is shown in ---------------- */

  /**
   * The page draws the frame itself (`studio/frame.ts`); this only remembers
   * which one, per tab and site, so a reload or a navigation within the site
   * comes back in the frame it left in and another site does not. Session
   * storage, because the service worker is evicted after a short idle and
   * the record has to outlive it.
   */
  const frameKey = (tabId: number) => `frame:${tabId}`;
  const originOf = (url: string | undefined) => {
    try {
      return url ? new URL(url).origin : null;
    } catch {
      return null;
    }
  };
  const getFrame = async (tabId: number, origin: string | null): Promise<Frame | null> => {
    const kept = (await chrome.storage.session.get(frameKey(tabId)))[frameKey(tabId)] as
      | { frame: Frame; origin: string | null }
      | undefined;
    return kept && kept.origin === origin ? kept.frame : null;
  };
  chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(frameKey(tabId)));

  // Keyboard shortcuts reach the inspector on the active tab; a tab with no
  // inspector (the panel is not open there) simply does not answer.
  chrome.commands?.onCommand.addListener((command) => {
    const what =
      command === 'toggle-preview' ? 'preview'
      : command === 'toggle-comment' ? 'comment'
      : command === 'toggle-layers' ? 'layers'
      : null;
    if (!what) return;
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id == null) return;
      chrome.tabs.sendMessage(tab.id, { type: 'inspector', cmd: 'toggle', what }).catch(() => {});
    });
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // The panel's content script is not told which tab it is in; this is.
    if (msg?.type === 'whoami') {
      sendResponse(sender.tab?.id ?? null);
      return false;
    }
    // A content script speaks for its own tab; the panel is not in one, so it
    // names the tab it means.
    const tabId = sender.tab?.id ?? (typeof msg?.tabId === 'number' ? msg.tabId : undefined);
    const windowId = sender.tab?.windowId;
    const fail = (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });

    if (msg?.type === 'frame-set' && tabId != null) {
      const frame = frameFor({ width: Number(msg.width), height: Number(msg.height) });
      chrome.storage.session
        .set({ [frameKey(tabId)]: { frame, origin: originOf(sender.tab?.url) } })
        .then(() => sendResponse({ ok: true, frame }))
        .catch(fail);
      return true;
    }
    if (msg?.type === 'frame-clear' && tabId != null) {
      chrome.storage.session
        .remove(frameKey(tabId))
        .then(() => sendResponse({ ok: true, frame: null }))
        .catch(fail);
      return true;
    }
    if (msg?.type === 'frame-state' && tabId != null) {
      getFrame(tabId, originOf(sender.tab?.url))
        .then((frame) => sendResponse({ ok: true, frame }))
        .catch(fail);
      return true;
    }
    // The rail's Components tab: the page's framework asked in its own world,
    // which only an extension page or this worker can inject into.
    if (msg?.type === 'components-scan' && tabId != null) {
      chrome.scripting
        .executeScript({ target: { tabId }, world: 'MAIN', func: componentsSource, args: [SCAN_LIMIT, ROOTS_KEPT] })
        .then(([r]) => sendResponse({ ok: true, components: refineComponents(r?.result) }))
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
