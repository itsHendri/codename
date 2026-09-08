import { useCallback, useEffect, useRef, useState } from 'react';
import type { PinnedElement, ScanResult } from '@/shared/types';
import {
  ensureHostAccess,
  getActiveTab,
  isRestricted,
  runScan,
  startInspector,
  stopInspector,
} from './lib/messaging';
import { loadSession, setScan, updateSession, useSession } from './lib/session';
import { useDesignModel, useLiveReskin } from './lib/designModel';
import { DesignIcon, ExportIcon, InspectIcon, SvgsIcon } from './components/icons';
import { AppMenu } from './components/AppMenu';
import { InspectTab } from './components/InspectTab';
import { DesignTab } from './components/DesignTab';
import { SvgsTab } from './components/SvgsTab';
import { ExportTab } from './components/ExportTab';
import { ViewportControl } from './components/ViewportControl';
import { EmptyState, RestrictedState, ScanningState } from './components/States';

type TabKey = 'inspect' | 'design' | 'assets' | 'export';

/**
 * Four, not six. Fonts and Colors were one job split in half — the page's design
 * language — and Resize was never a view at all; it is a viewport setting and
 * now lives in the header. At 360px six tabs left 60px each.
 */
const TABS: { key: TabKey; label: string; Icon: typeof InspectIcon }[] = [
  { key: 'inspect', label: 'Inspect', Icon: InspectIcon },
  { key: 'design', label: 'Design', Icon: DesignIcon },
  { key: 'assets', label: 'Assets', Icon: SvgsIcon },
  { key: 'export', label: 'Export', Icon: ExportIcon },
];

export default function App() {
  const [active, setActive] = useState<TabKey>('inspect');
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const tabIdRef = useRef<number | null>(null);

  // The session outlives whichever tab is showing: an edit made in Design is
  // still there, and still painted on the page, after a detour through Inspect.
  const { scan, config, mode, live, pinned } = useSession();
  const model = useDesignModel(scan, config, mode);
  const reskin = useLiveReskin(tabId, live, model);
  const setPinned = (p: PinnedElement | null) => updateSession({ pinned: p });

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
        setScan(msg.data as ScanResult);
        setScanning(false);
      } else if (msg?.type === 'scan-error') {
        setScanning(false);
        setScanError(msg.error ?? 'Scan failed');
      } else if (msg?.type === 'pinned-element') {
        setPinned(msg.data as PinnedElement);
        setActive('inspect');
      } else if (msg?.type === 'hover-toggled') {
        setInspecting(Boolean(msg.active));
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
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
      setScanError('Site access is needed to scan — click Scan again and allow it.');
      return;
    }
    setScanning(true);
    try {
      await runScan(tabId);
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

  const needsScan = active !== 'inspect';
  let content: React.ReactNode;
  if (restricted && active !== 'inspect') {
    content = <RestrictedState url={tabUrl} onOpenInspect={() => setActive('inspect')} />;
  } else if (scanning && needsScan) {
    content = <ScanningState />;
  } else if (!scan && needsScan) {
    content = <EmptyState onScan={handleScan} error={scanError} />;
  } else {
    switch (active) {
      case 'inspect':
        content = (
          <InspectTab
            inspecting={inspecting}
            onToggle={toggleInspector}
            pinned={pinned}
            onClear={() => setPinned(null)}
            error={scanError}
          />
        );
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
            onConfigChange={(c) => updateSession({ config: c })}
          />
        );
        break;
      case 'assets':
        content = <SvgsTab scan={scan!} />;
        break;
      case 'export':
        content = <ExportTab scan={scan!} hostname={hostname} />;
        break;
    }
  }

  return (
    <div className="flex h-screen flex-col text-base">
      <header className="flex items-center gap-2 border-b border-line-subtle px-3.5 py-2.5">
        <AppMenu />
        <span className="ml-auto max-w-[38%] truncate rounded-full border border-line px-2.5 py-0.5 text-sm text-ink-secondary">
          {hostname}
        </span>
        <ViewportControl tabId={tabId} restricted={restricted} />
      </header>

      <nav role="tablist" aria-label="Panel" className="grid grid-cols-4 border-b border-line-subtle" onKeyDown={onTabKey}>
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            role="tab"
            id={`tab-${key}`}
            aria-selected={active === key}
            aria-controls="panel"
            tabIndex={active === key ? 0 : -1}
            onClick={() => setActive(key)}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs ${
              active === key
                ? 'border-b-2 border-accent font-medium text-accent'
                : 'border-b-2 border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      <main id="panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="flex-1 overflow-y-auto">
        {content}
      </main>

      <footer className="flex items-center gap-2 border-t border-line-subtle px-3.5 py-2 text-sm text-ink-muted">
        {scan ? (
          <>
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="truncate">
              Scanned · {scan.colors.length} colors · {scan.fontUsage.length} fonts · {scan.svgs.length} SVGs
            </span>
          </>
        ) : (
          <span className="truncate">{restricted ? "Can't scan this page" : 'Not scanned yet'}</span>
        )}
        <button
          onClick={handleScan}
          disabled={restricted || scanning || !tabId}
          className="ml-auto rounded-control border border-line px-2.5 py-0.5 text-ink-secondary hover:bg-surface-recessed disabled:opacity-40"
        >
          {scanning ? 'Scanning…' : scan ? 'Rescan' : 'Scan'}
        </button>
      </footer>
    </div>
  );
}
