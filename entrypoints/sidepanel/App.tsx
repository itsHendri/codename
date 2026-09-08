import { useCallback, useEffect, useRef, useState } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import {
  attachBar,
  ensureHostAccess,
  getActiveTab,
  isRestricted,
  runScan,
  startInspector,
  stopInspector,
} from './lib/messaging';
import { getSession, loadSession, setConfig, setPinned, setScan, updateSession, useSession } from './lib/session';
import { useBridge, useBridgeSync } from './lib/bridge';
import { useInspect } from './lib/inspect';
import { active as activeChanges } from '@/studio/changes';
import { pendingNotes } from './lib/comments';
import { BridgeDot } from './components/BridgeMenu';
import { useDesignModel, useLiveReskin } from './lib/designModel';
import { ChangesIcon, DesignIcon, ExportIcon, InspectIcon, SvgsIcon } from './components/icons';
import { AppMenu } from './components/AppMenu';
import { ElementTab } from './components/ElementTab';
import { ChangesTab } from './components/ChangesTab';
import { DesignTab } from './components/DesignTab';
import { SvgsTab } from './components/SvgsTab';
import { ExportTab } from './components/ExportTab';
import { EmptyState, RestrictedState, ScanningState } from './components/States';

type TabKey = 'element' | 'design' | 'changes' | 'assets' | 'export';

/**
 * Four, not six. Fonts and Colors were one job split in half — the page's design
 * language — and Resize was never a view at all; it is a viewport setting and
 * now lives in the header. At 360px six tabs left 60px each.
 */
const TABS: { key: TabKey; label: string; Icon: typeof InspectIcon }[] = [
  { key: 'element', label: 'Element', Icon: InspectIcon },
  { key: 'design', label: 'Design', Icon: DesignIcon },
  { key: 'changes', label: 'Changes', Icon: ChangesIcon },
  { key: 'assets', label: 'Assets', Icon: SvgsIcon },
  { key: 'export', label: 'Export', Icon: ExportIcon },
];

export default function App() {
  const [active, setActive] = useState<TabKey>('element');
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // Chrome would not let us into the tab: the one thing that needs a click.
  const [needsAccess, setNeedsAccess] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const tabIdRef = useRef<number | null>(null);

  // The session outlives whichever tab is showing: an edit made in Design is
  // still there, and still painted on the page, after a detour through Inspect.
  const session = useSession();
  const { scan, config, mode, live } = session;
  const model = useDesignModel(scan, config, mode);
  const reskin = useLiveReskin(tabId, live, model);
  const bridge = useBridge();
  useBridgeSync(tabId, tabUrl, session, model);
  const [focusedComment, setFocusedComment] = useState<string | null>(null);
  // What is queued for the agent, from any tab: a seed edit, element edits, notes.
  const pendingCount =
    (model?.edited ? 1 : 0) + activeChanges(session.log).length + pendingNotes(session.comments).length;
  const scanLike = scan ?? { url: tabUrl, cssText: '', customProps: [], unreadableSheets: [] };
  const ctl = useInspect(tabId, tabUrl, session, focusedComment);
  const ctlRef = useRef(ctl);
  ctlRef.current = ctl;

  const restricted = isRestricted(tabUrl);

  const syncActiveTab = useCallback(async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    tabIdRef.current = tab.id;
    setTabId(tab.id);
    setTabUrl(tab.url ?? '');
    // A stored session is kept only while the tab is still on that origin.
    await loadSession(tab.id, tab.url ?? '');
    setInspecting(false);
    setScanning(false);
    setScanError(null);
    setNeedsAccess(false);
    if (isRestricted(tab.url)) return;
    // Reading the page is automatic wherever Chrome already lets us in: the
    // tab the icon was clicked on (activeTab), or a site allowed before. Only
    // a site we cannot reach asks for a click.
    if (getSession().scan) {
      void attachBar(tab.id);
      return;
    }
    setScanning(true);
    try {
      await runScan(tab.id);
      void attachBar(tab.id);
    } catch {
      setScanning(false);
      setNeedsAccess(true);
    }
  }, []);

  useEffect(() => {
    void syncActiveTab();
    const onActivated = () => void syncActiveTab();
    const onUpdated = (updatedTabId: number, info: { status?: string; url?: string }) => {
      if (updatedTabId !== tabIdRef.current) return;
      if (info.status === 'complete' || info.url) void syncActiveTab();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [syncActiveTab]);

  useEffect(() => {
    const onMessage = (
      msg: { type?: string; data?: unknown; error?: string; active?: boolean },
      sender: chrome.runtime.MessageSender,
    ) => {
      // Only accept messages from content scripts in the tab this panel is scoped to.
      if (sender.tab?.id !== tabIdRef.current) return;
      if (msg?.type === 'scan-result') {
        void setScan(msg.data as ScanResult).then(() => setScanning(false));
      } else if (msg?.type === 'scan-error') {
        setScanning(false);
        setScanError(msg.error ?? 'Scan failed');
      } else if (msg?.type === 'element-selected') {
        setPinned((msg.data as ElementProps | null) ?? null);
        if (msg.data) setActive('element');
      } else if (msg?.type === 'hover-toggled') {
        setInspecting(Boolean(msg.active));
      } else if (msg?.type === 'pin-clicked') {
        setFocusedComment((msg as { id?: string }).id ?? null);
        setActive('changes');
      } else if (msg?.type === 'inspector-shortcut') {
        // Cmd+Z pressed on the page while an element is selected.
        if ((msg as { action?: string }).action === 'redo') ctlRef.current.redo();
        else ctlRef.current.undo();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // The in-page bar appears as soon as the site is reachable: a scan means
  // access was granted. It goes when the panel does, through its port.
  useEffect(() => {
    if (tabId != null && scan && !restricted) void attachBar(tabId);
  }, [tabId, scan, restricted]);

  // Undo and redo from the panel itself, unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      if (e.shiftKey) ctlRef.current.redo();
      else ctlRef.current.undo();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const friendlyError = (err: unknown): string => {
    const s = String(err);
    if (s.includes('Cannot access contents') || s.includes('cannot be scripted'))
      return 'Codename needs access to this site — try again and choose "Allow".';
    return s;
  };

  const handleScan = useCallback(async () => {
    if (!tabId) return;
    setScanError(null);
    if (!(await ensureHostAccess(tabUrl))) {
      setScanError('Site access is needed — try again and choose "Allow".');
      return;
    }
    setNeedsAccess(false);
    setScanning(true);
    try {
      await runScan(tabId);
      void attachBar(tabId);
    } catch (err) {
      setScanning(false);
      setScanError(friendlyError(err));
    }
  }, [tabId, tabUrl]);

  const toggleInspector = useCallback(async () => {
    if (!tabId) return;
    if (inspecting) {
      await stopInspector(tabId);
      return;
    }
    setScanError(null);
    if (!(await ensureHostAccess(tabUrl))) {
      setScanError('Site access is needed for the hover tool — try again and allow it.');
      return;
    }
    try {
      await startInspector(tabId);
    } catch (err) {
      setScanError(friendlyError(err));
    }
  }, [tabId, tabUrl, inspecting]);

  // Roving tabindex: arrows move both focus and selection, as a tablist should.
  const onTabKey = (e: React.KeyboardEvent) => {
    const idx = TABS.findIndex((t) => t.key === active);
    const next =
      e.key === 'ArrowRight' ? (idx + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (idx - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(TABS[next]!.key);
    document.getElementById(`tab-${TABS[next]!.key}`)?.focus();
  };

  const hostname = (() => {
    try {
      return new URL(tabUrl).hostname || 'this page';
    } catch {
      return 'this page';
    }
  })();

  // Selecting, editing and noting all work before a scan; the rest reads it.
  const needsScan = active === 'design' || active === 'assets' || active === 'export';
  let content: React.ReactNode;
  if (restricted && needsScan) {
    content = <RestrictedState url={tabUrl} onOpenInspect={() => setActive('element')} />;
  } else if (scanning && needsScan) {
    content = <ScanningState />;
  } else if (!scan && needsScan) {
    content = <EmptyState onScan={handleScan} error={scanError} needsAccess={needsAccess} />;
  } else {
    switch (active) {
      case 'element':
        content = (
          <ElementTab
            inspecting={inspecting}
            onToggle={toggleInspector}
            error={scanError}
            ctl={ctl}
            scan={scan}
            resolved={model?.resolved ?? null}
            mode={mode}
          />
        );
        break;
      case 'changes':
        content = <ChangesTab scan={scanLike} overrides={model?.overrides ?? []} colorMap={model?.colorMap ?? {}} ctl={ctl} />;
        break;
      case 'design':
        content = (
          <DesignTab
            scan={scan!}
            model={model!}
            mode={mode}
            live={live}
            reskin={reskin}
            onModeChange={(m) => updateSession({ mode: m })}
            onLiveChange={(v) => updateSession({ live: v })}
            onConfigChange={setConfig}
          />
        );
        break;
      case 'assets':
        content = <SvgsTab scan={scan!} />;
        break;
      case 'export':
        content = <ExportTab scan={scan!} hostname={hostname} resolved={model?.resolved ?? null} />;
        break;
    }
  }

  return (
    <div className="flex h-screen flex-col text-base">
      <nav role="tablist" aria-label="Panel" className="grid grid-cols-5 border-b border-line-subtle" onKeyDown={onTabKey}>
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            role="tab"
            id={`tab-${key}`}
            aria-selected={active === key}
            aria-controls="panel"
            tabIndex={active === key ? 0 : -1}
            onClick={() => setActive(key)}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-2xs ${
              active === key
                ? 'border-b-2 border-accent font-medium text-accent'
                : 'border-b-2 border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Icon />
            {label}
            {key === 'changes' && pendingCount > 0 && (
              <span className="absolute top-1 right-1/2 translate-x-4 rounded-full bg-accent px-1 font-mono text-2xs leading-4 text-accent-ink">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main id="panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="relative flex-1 overflow-y-auto">
        {content}
      </main>

      <footer className="flex items-center gap-2 border-t border-line-subtle px-2.5 py-1.5 text-sm text-ink-muted">
        <AppMenu compact />
        <BridgeDot status={bridge.status} />
        {scan ? (
          <span className="truncate text-xs">
            {scan.colors.length} colors · {scan.fontUsage.length} fonts · {scan.svgs.length} SVGs
          </span>
        ) : (
          <span className="truncate text-xs">
            {restricted ? "Can't read this page" : needsAccess ? 'Needs site access' : scanning ? 'Reading…' : 'Not read yet'}
          </span>
        )}
        <button
          onClick={handleScan}
          disabled={restricted || scanning || !tabId}
          className="ml-auto rounded-control border border-line px-2.5 py-0.5 text-xs text-ink-secondary hover:bg-surface-recessed disabled:opacity-40"
        >
          {scanning ? 'Reading…' : scan ? 'Rescan' : needsAccess ? 'Allow' : 'Scan'}
        </button>
      </footer>
    </div>
  );
}
