import { useCallback, useEffect, useRef, useState } from 'react';
import type { PinnedElement, ScanResult } from '@/shared/types';
import {
  getActiveTab,
  isRestricted,
  loadScan,
  runScan,
  saveScan,
  startInspector,
  stopInspector,
} from './lib/messaging';
import {
  ColorsIcon,
  ExportIcon,
  FontsIcon,
  InspectIcon,
  LogoIcon,
  ResizeIcon,
  SvgsIcon,
} from './components/icons';
import { InspectTab } from './components/InspectTab';
import { FontsTab } from './components/FontsTab';
import { ColorsTab } from './components/ColorsTab';
import { SvgsTab } from './components/SvgsTab';
import { ResizeTab } from './components/ResizeTab';
import { ExportTab } from './components/ExportTab';
import { EmptyState, RestrictedState, ScanningState } from './components/States';

type TabKey = 'inspect' | 'fonts' | 'colors' | 'svgs' | 'resize' | 'export';

const TABS: { key: TabKey; label: string; Icon: typeof InspectIcon }[] = [
  { key: 'inspect', label: 'Inspect', Icon: InspectIcon },
  { key: 'fonts', label: 'Fonts', Icon: FontsIcon },
  { key: 'colors', label: 'Colors', Icon: ColorsIcon },
  { key: 'svgs', label: 'SVGs', Icon: SvgsIcon },
  { key: 'resize', label: 'Resize', Icon: ResizeIcon },
  { key: 'export', label: 'Export', Icon: ExportIcon },
];

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export default function App() {
  const [active, setActive] = useState<TabKey>('inspect');
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState<string>('');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedElement | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const tabIdRef = useRef<number | null>(null);

  const restricted = isRestricted(tabUrl);

  const syncActiveTab = useCallback(async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    tabIdRef.current = tab.id;
    setTabId(tab.id);
    setTabUrl(tab.url ?? '');
    // Drop a cached scan if the tab has since navigated to a different origin.
    const stored = await loadScan<ScanResult>(tab.id);
    setScan(stored && tab.url && sameOrigin(stored.url, tab.url) ? stored : null);
    setInspecting(false);
    setScanning(false);
    setScanError(null);
    setPinned(null);
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
        const data = msg.data as ScanResult;
        setScan(data);
        setScanning(false);
        if (sender.tab?.id != null) void saveScan(sender.tab.id, data);
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

  const handleScan = useCallback(async () => {
    if (!tabId) return;
    setScanning(true);
    setScanError(null);
    try {
      await runScan(tabId);
    } catch (err) {
      setScanning(false);
      setScanError(String(err));
    }
  }, [tabId]);

  const toggleInspector = useCallback(async () => {
    if (!tabId) return;
    if (inspecting) await stopInspector(tabId);
    else {
      try {
        await startInspector(tabId);
      } catch (err) {
        setScanError(String(err));
      }
    }
  }, [tabId, inspecting]);

  const hostname = (() => {
    try {
      return new URL(tabUrl).hostname || 'this page';
    } catch {
      return 'this page';
    }
  })();

  const needsScan = active !== 'resize';
  let content: React.ReactNode;
  if (restricted && active !== 'resize' && active !== 'colors') {
    content = <RestrictedState url={tabUrl} onOpenResize={() => setActive('resize')} />;
  } else if (scanning && needsScan) {
    content = <ScanningState />;
  } else if (!scan && needsScan && active !== 'inspect' && active !== 'colors') {
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
      case 'fonts':
        content = <FontsTab scan={scan!} />;
        break;
      case 'colors':
        content = <ColorsTab scan={scan} onScan={handleScan} />;
        break;
      case 'svgs':
        content = <SvgsTab scan={scan!} />;
        break;
      case 'resize':
        content = <ResizeTab tabId={tabId} restricted={restricted} />;
        break;
      case 'export':
        content = <ExportTab scan={scan!} hostname={hostname} />;
        break;
    }
  }

  return (
    <div className="flex h-screen flex-col text-sm">
      <header className="flex items-center gap-2 border-b border-gray-200 px-3.5 py-2.5">
        <LogoIcon className="h-5 w-5 text-gray-900" />
        <span className="text-base font-semibold tracking-tight">Codename</span>
        <span className="ml-auto max-w-[45%] truncate rounded-full border border-gray-300 px-2.5 py-0.5 text-xs text-gray-600">
          {hostname}
        </span>
      </header>

      <nav className="grid grid-cols-6 border-b border-gray-200">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
              active === key
                ? 'border-b-2 border-blue-600 font-medium text-blue-600'
                : 'border-b-2 border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto">{content}</main>

      <footer className="flex items-center gap-2 border-t border-gray-200 px-3.5 py-2 text-xs text-gray-500">
        {scan ? (
          <>
            <span className="h-2 w-2 rounded-full bg-blue-600" />
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
          className="ml-auto rounded-md border border-gray-300 px-2.5 py-0.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {scanning ? 'Scanning…' : scan ? 'Rescan' : 'Scan'}
        </button>
      </footer>
    </div>
  );
}
