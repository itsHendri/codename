import { frameFor, planEmulation, type Frame, type Size } from '@/shared/viewport';

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
   * One frame operation per tab at a time.
   *
   * A pick, a reset and a re-fit each await several calls, and interleaved
   * they undo each other: a re-fit that had already read the stored frame
   * re-attached after a reset had detached, bringing back a frame the person
   * had just taken off. Chained, each sees the state the last one left.
   */
  const chains = new Map<number, Promise<unknown>>();
  const serial = <T,>(tabId: number, run: () => Promise<T>): Promise<T> => {
    const next = (chains.get(tabId) ?? Promise.resolve()).then(run, run);
    chains.set(tabId, next.catch(() => {}));
    return next;
  };

  const apply = async (tabId: number, frame: Frame) => {
    const tab = await chrome.tabs.get(tabId);
    const plan = planEmulation(frame, { width: tab.width ?? 0, height: tab.height ?? 0 });
    await attach(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', { ...plan });
    await setEmulated(tabId, { frame, scale: plan.scale });
    return { ok: true, frame, scale: plan.scale };
  };

  /**
   * Show a tab as a frame of a given size.
   *
   * The same override DevTools' device toolbar uses: the page's media queries
   * answer to the frame, the window does not move, and a frame bigger than
   * the tab is scaled down to fit. Chrome shows its "started debugging this
   * browser" bar while it is on; that is the price, and the README says so.
   */
  const emulate = (tabId: number, size: Size) => serial(tabId, () => apply(tabId, frameFor(size)));

  const stopEmulating = (tabId: number) =>
    serial(tabId, async () => {
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
    });

  /**
   * Work out the fit again, for a tab whose size may have changed.
   *
   * Debounced, since dragging a window or the side panel's edge fires many
   * times, and serialised with everything else, so a reset in the middle is
   * not undone. It re-reads the stored frame inside the queue: a frame taken
   * off while this waited stays off.
   */
  const refitTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const refit = (tabId: number) => {
    const pending = refitTimers.get(tabId);
    if (pending) clearTimeout(pending);
    refitTimers.set(
      tabId,
      setTimeout(() => {
        refitTimers.delete(tabId);
        void serial(tabId, async () => {
          const was = await getEmulated(tabId);
          if (!was) return null;
          const r = await apply(tabId, was.frame).catch(() => null);
          if (r && r.scale !== was.scale) void tellTab(tabId, { frame: r.frame, scale: r.scale });
          return r;
        });
      }, 150),
    );
  };

  // Chrome's "Cancel" on its debugging bar, DevTools taking over, the tab
  // closing: the frame is gone either way, and the bar must not go on
  // describing it.
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId == null) return;
    const tabId = source.tabId;
    void clearEmulated(tabId).then(() => tellTab(tabId, { frame: null, scale: 1, detached: true }));
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    chains.delete(tabId);
    void clearEmulated(tabId);
  });

  // Every emulated tab in a window that changed size, not only the one in
  // front: the others are drawn at the old scale when they come back.
  chrome.windows.onBoundsChanged?.addListener((win) => {
    void chrome.tabs.query({ windowId: win.id }).then((tabs) => {
      for (const tab of tabs) if (tab.id != null) refit(tab.id);
    });
  });
  // A tab can have been resized while it was behind another one — the side
  // panel moved, DevTools docked — so it is fitted again when it comes back.
  chrome.tabs.onActivated.addListener(({ tabId }) => refit(tabId));

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
      emulate(tabId, { width: Number(msg.width), height: Number(msg.height) })
        .then(sendResponse)
        .catch(fail);
      return true;
    }
    // The side panel changed width, which changes the tab without moving the
    // window, so nothing else would notice.
    if (msg?.type === 'refit-viewport' && tabId != null) {
      refit(tabId);
      sendResponse({ ok: true });
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
