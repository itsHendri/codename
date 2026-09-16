import { frameFor, planEmulation, type DeviceKind, type Frame, type Size } from '@/shared/viewport';

/** What a tab is being shown as, kept so a worker restart does not forget. */
interface Emulated {
  frame: Frame;
  scale: number;
}

export default defineBackground(() => {
  // Toolbar click opens the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('setPanelBehavior failed', err));

  /* ---------------- device emulation ---------------- */

  /**
   * The frame each tab is shown in. In session storage rather than a variable:
   * the service worker is evicted after a short idle, and the debugger stays
   * attached through that, so the record of what it is doing has to as well.
   */
  const emuKey = (tabId: number) => `emulation:${tabId}`;
  const getEmulated = async (tabId: number): Promise<Emulated | null> =>
    ((await chrome.storage.session.get(emuKey(tabId)))[emuKey(tabId)] as Emulated | undefined) ?? null;
  const setEmulated = (tabId: number, e: Emulated) => chrome.storage.session.set({ [emuKey(tabId)]: e });
  const clearEmulated = (tabId: number) => chrome.storage.session.remove(emuKey(tabId));

  /** Tell the tab's bar, so it stops describing a frame that is gone. */
  const tellTab = (tabId: number, payload: Record<string, unknown>) =>
    chrome.tabs.sendMessage(tabId, { type: 'inspector', cmd: 'viewport-changed', ...payload }).catch(() => {});

  const attach = async (tabId: number) => {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (err) {
      // Still attached from before a worker restart is fine; anyone else's
      // debugger is not, and the command below will say so in its own words.
      if (!/already attached/i.test(String(err))) throw err;
    }
  };

  /**
   * Show a tab as a frame of a given size.
   *
   * The same override DevTools' device toolbar uses: the page's media queries
   * answer to the frame, the window does not move, and a frame bigger than
   * the tab is scaled down to fit. Chrome shows its "started debugging this
   * browser" bar while it is on; that is the price, and the README says so.
   */
  const emulate = async (tabId: number, size: Size & { kind?: DeviceKind }) => {
    const frame = frameFor(size);
    if (size.kind) frame.kind = size.kind;
    const tab = await chrome.tabs.get(tabId);
    const plan = planEmulation(frame, { width: tab.width ?? 0, height: tab.height ?? 0 });
    await attach(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', { ...plan });
    await setEmulated(tabId, { frame, scale: plan.scale });
    return { ok: true, frame, scale: plan.scale };
  };

  const stopEmulating = async (tabId: number) => {
    const was = await getEmulated(tabId);
    await clearEmulated(tabId);
    if (!was) return { ok: true, frame: null, scale: 1 };
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
    } catch {
      /* already gone: detached from Chrome's own bar, or the tab closed */
    }
    await chrome.debugger.detach({ tabId }).catch(() => {});
    return { ok: true, frame: null, scale: 1 };
  };

  // Chrome's "Cancel" on its debugging bar, DevTools taking over, the tab
  // closing: the frame is gone either way, and the bar must not go on
  // describing it.
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId == null) return;
    const tabId = source.tabId;
    void clearEmulated(tabId).then(() => tellTab(tabId, { frame: null, scale: 1, detached: true }));
  });
  chrome.tabs.onRemoved.addListener((tabId) => void clearEmulated(tabId));

  // A window that changes size changes how far a frame has to be scaled to fit.
  chrome.windows.onBoundsChanged?.addListener((win) => {
    void chrome.tabs.query({ windowId: win.id, active: true }).then(async ([tab]) => {
      if (tab?.id == null) return;
      const was = await getEmulated(tab.id);
      if (!was) return;
      const r = await emulate(tab.id, was.frame).catch(() => null);
      if (r) void tellTab(tab.id, { frame: r.frame, scale: r.scale });
    });
  });

  // Keyboard shortcuts reach the inspector on the active tab; a tab with no
  // inspector (the panel is not open there) simply does not answer.
  chrome.commands?.onCommand.addListener((command) => {
    const what = command === 'toggle-select' ? 'select' : command === 'toggle-comment' ? 'comment' : null;
    if (!what) return;
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id == null) return;
      chrome.tabs.sendMessage(tab.id, { type: 'inspector', cmd: 'toggle', what }).catch(() => {});
    });
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // A content script speaks for its own tab; the panel is not in one, so it
    // names the tab it means.
    const tabId = sender.tab?.id ?? (typeof msg?.tabId === 'number' ? msg.tabId : undefined);
    const windowId = sender.tab?.windowId;
    const fail = (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });

    if (msg?.type === 'emulate-viewport' && tabId != null) {
      emulate(tabId, { width: Number(msg.width), height: Number(msg.height), kind: msg.kind })
        .then(sendResponse)
        .catch(fail);
      return true;
    }
    if (msg?.type === 'reset-viewport' && tabId != null) {
      stopEmulating(tabId).then(sendResponse).catch(fail);
      return true;
    }
    if (msg?.type === 'viewport-state' && tabId != null) {
      getEmulated(tabId)
        .then((e) => sendResponse({ ok: true, frame: e?.frame ?? null, scale: e?.scale ?? 1 }))
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
