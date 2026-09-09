import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import { attachBar, ensureHostAccess, getActiveTab, isRestricted, runScan, sendInspector, type BarLook } from './lib/messaging';
import {
  getSession,
  loadSession,
  setColorEdit,
  setConfig,
  setMode,
  setPinned,
  setScan,
  setVarOverride,
  updateSession,
  useSession,
} from './lib/session';
import { useBridge, useBridgeSync } from './lib/bridge';
import { useInspect } from './lib/inspect';
import { active as activeChanges } from '@/studio/changes';
import { hexOf, lengthKind, lengthPx } from '@/studio/reskin';
import type { TokenLengths } from '@/shared/types';
import { buildChangeSet } from '@/studio/commit';
import type { CommentTarget } from '@/studio/annotations';
import { pendingNotes } from './lib/comments';
import { BridgeDot } from './components/BridgeMenu';
import { useDesignModel, useLiveReskin } from './lib/designModel';
import { ChangesIcon, DesignIcon, ExportIcon, InspectIcon, SvgsIcon } from './components/icons';
import { useTheme } from './lib/theme';
import { AppMenu } from './components/AppMenu';
import { LAYERS_SPLIT_KEY, LayersTab } from './components/LayersTab';
import { resetSplit } from './components/SplitPane';
import { ChangesTab } from './components/ChangesTab';
import { VariablesTab } from './components/VariablesTab';
import { SvgsTab } from './components/SvgsTab';
import { ExportTab } from './components/ExportTab';
import { EmptyState, RestrictedState, ScanningState } from './components/States';

type TabKey = 'layers' | 'variables' | 'assets' | 'export' | 'changes';

/**
 * Five tabs, in the order you use them: the page as layers you pick from, the
 * variables it runs on, its assets, the exports — and last, what you have
 * changed, which is where the hand-off lives. Resize is not a view; it is a
 * viewport setting, and it sits on the bar across the page.
 */
const TABS: { key: TabKey; label: string; Icon: typeof InspectIcon }[] = [
  { key: 'layers', label: 'Layers', Icon: InspectIcon },
  { key: 'variables', label: 'Variables', Icon: DesignIcon },
  { key: 'assets', label: 'Assets', Icon: SvgsIcon },
  { key: 'export', label: 'Export', Icon: ExportIcon },
  { key: 'changes', label: 'Changes', Icon: ChangesIcon },
];

export default function App() {
  // The session remembers the tab, so closing and reopening the panel does
  // not send you back to Layers every time.
  const session = useSession();
  const active: TabKey = (TABS.some((t) => t.key === session.activeTab) ? session.activeTab : 'layers') as TabKey;
  const setActive = useCallback((key: TabKey) => updateSession({ activeTab: key }), []);
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // Chrome would not let us into the tab: the one thing that needs a click.
  const [needsAccess, setNeedsAccess] = useState(false);
  const tabIdRef = useRef<number | null>(null);
  const { resolved: theme } = useTheme();

  // The session outlives whichever tab is showing: an edit made in Variables is
  // still there, and still painted on the page, after a detour through Layers.
  const { scan, config, mode, live, varOverrides, colorEdits } = session;
  // What the bar across the page wears and which way its switch sits. A ref,
  // because the tab-sync callback must not be recreated for a theme change.
  const lookRef = useRef<BarLook>({ theme, mode, resettable: 0 });
  const model = useDesignModel(scan, config, mode, varOverrides, colorEdits);
  const reskin = useLiveReskin(tabId, live, model, session.generation);
  const bridge = useBridge();
  useBridgeSync(tabId, tabUrl, session, model);
  const [focusedComment, setFocusedComment] = useState<string | null>(null);
  const scanLike = useMemo(
    () => scan ?? { url: tabUrl, cssText: '', customProps: [], unreadableSheets: [] },
    [scan, tabUrl],
  );

  // Built once, here: the badge and the Changes tab must never disagree about
  // whether anything is pending. An edit that reaches nothing on the page —
  // a grid change on a site with no length variables — counts as nothing,
  // and so does a dark preview: the hand-off carries decisions, not previews.
  const changeSet = useMemo(
    () =>
      buildChangeSet(
        scanLike,
        model?.handoff.overrides ?? [],
        model?.handoff.colorMap ?? {},
        activeChanges(session.log),
        pendingNotes(session.comments),
        model?.system ?? [],
      ),
    [scanLike, model, session.log, session.comments],
  );
  const pendingCount =
    changeSet.tokens.length +
    changeSet.colors.length +
    changeSet.system.length +
    changeSet.elements.length +
    changeSet.comments.length;
  const ctl = useInspect(tabId, tabUrl, session, focusedComment);
  const ctlRef = useRef(ctl);
  ctlRef.current = ctl;

  // What Reset on the bar would take back: everything but the notes, and
  // the dark preview with them. The count is what the brief would carry; a
  // seed moved with nothing on the page to follow it, or a preview alone,
  // still counts as one, so the button still appears.
  const overrideCount =
    changeSet.tokens.length + changeSet.colors.length + changeSet.system.length + changeSet.elements.length;
  const resettable =
    model?.dirty || activeChanges(session.log).length > 0 || mode === 'dark' ? Math.max(1, overrideCount) : 0;
  const look: BarLook = { theme, mode, resettable };
  lookRef.current = look;

  /** Every override goes, and the preview with it; the page reads as itself. Notes are not overrides. */
  const resetAll = useCallback(() => {
    setConfig(null);
    setMode('light');
    ctlRef.current.revertAll();
    ctlRef.current.clear();
    resetSplit(LAYERS_SPLIT_KEY);
    // The viewport is the bar's to put back; the panel only asks.
    if (tabIdRef.current != null) void sendInspector(tabIdRef.current, { cmd: 'reset-viewport' });
  }, []);

  const restricted = isRestricted(tabUrl);

  const syncActiveTab = useCallback(async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    tabIdRef.current = tab.id;
    setTabId(tab.id);
    setTabUrl(tab.url ?? '');
    // A stored session is kept only while the tab is still on that origin.
    await loadSession(tab.id, tab.url ?? '');
    setScanning(false);
    setScanError(null);
    setNeedsAccess(false);
    if (isRestricted(tab.url)) return;
    // Reading the page is automatic wherever Chrome already lets us in: the
    // tab the icon was clicked on (activeTab), or a site allowed before. Only
    // a site we cannot reach asks for a click.
    if (getSession().scan) {
      void attachBar(tab.id, lookRef.current);
      return;
    }
    setScanning(true);
    try {
      await runScan(tab.id);
      void attachBar(tab.id, lookRef.current);
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
        if (msg.data) setActive('layers');
      } else if (msg?.type === 'element-edit') {
        // The edit card on the page: same log, same rules, same undo and brief.
        const edit = msg as unknown as { property: string; to: string };
        ctlRef.current.change(edit.property, edit.to);
      } else if (msg?.type === 'panel-focus') {
        setActive('layers');
      } else if (msg?.type === 'reset-all') {
        resetAll();
      } else if (msg?.type === 'mode-changed') {
        // The bar's Light/Dark switch; the session is the truth it echoes.
        const m = (msg as { mode?: string }).mode;
        if (m === 'light' || m === 'dark') setMode(m);
      } else if (msg?.type === 'note-created') {
        // Written on the page, in the composer that opened where you pointed.
        const note = msg as unknown as { target: CommentTarget; text: string };
        ctlRef.current.addComment(note.text, note.target);
      } else if (msg?.type === 'note-toggled') {
        ctlRef.current.setNotingFromPage(Boolean(msg.active));
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
  }, [resetAll]);

  // The in-page bar appears as soon as the site is reachable: a scan means
  // access was granted. It goes when the panel does, through its port. It is
  // told again whenever the panel's palette or the mode switch changes.
  useEffect(() => {
    if (tabId != null && scan && !restricted) void attachBar(tabId, { theme, mode, resettable });
  }, [tabId, scan, restricted, theme, mode, resettable]);

  // The page's own names for its colours, so the hover readout can say
  // "#15171B --ink" rather than a hex alone. The scan already matched them.
  useEffect(() => {
    if (tabId == null || !scan || restricted) return;
    const colors: Record<string, string> = {};
    for (const c of scan.colors) if (c.varNames[0]) colors[c.hex.toUpperCase()] = c.varNames[0];
    const lengths: TokenLengths = { space: {}, radius: {}, type: {} };
    for (const p of scan.customProps) {
      const hex = hexOf(p.value);
      if (hex && !colors[hex]) colors[hex] = p.name;
      const kind = lengthKind(p.name);
      const px = lengthPx(p.value, scan.rootFontSize);
      if (kind && px !== null && !lengths[kind][String(px)]) lengths[kind][String(px)] = p.name;
    }
    void sendInspector(tabId, { cmd: 'tokens', colors, lengths });
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
      void attachBar(tabId, lookRef.current);
    } catch (err) {
      setScanning(false);
      setScanError(friendlyError(err));
    }
  }, [tabId, tabUrl]);

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
  const needsScan = active === 'variables' || active === 'assets' || active === 'export';
  let content: React.ReactNode;
  if (restricted && needsScan) {
    content = <RestrictedState url={tabUrl} onOpenLayers={() => setActive('layers')} />;
  } else if (scanning && needsScan) {
    content = <ScanningState />;
  } else if (!scan && needsScan) {
    content = <EmptyState onScan={handleScan} error={scanError} needsAccess={needsAccess} />;
  } else {
    switch (active) {
      case 'layers':
        content = (
          <LayersTab
            error={scanError}
            ctl={ctl}
            scan={scan}
            resolved={model?.resolved ?? null}
            mode={mode}
          />
        );
        break;
      case 'changes':
        content = (
          <ChangesTab set={changeSet} ctl={ctl} />
        );
        break;
      case 'variables':
        content = (
          <VariablesTab
            scan={scan!}
            model={model!}
            mode={mode}
            live={live}
            reskin={reskin}
            varOverrides={varOverrides}
            colorEdits={colorEdits}
            onLiveChange={(v) => updateSession({ live: v })}
            onConfigChange={setConfig}
            onResetAll={resetAll}
            onVar={setVarOverride}
            onColor={setColorEdit}
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
      {/* h-10 is BAR_HEIGHT: the same strip as the bar across the page. */}
      <nav role="tablist" aria-label="Panel" className="grid h-10 grid-cols-5 items-stretch border-b border-line-subtle" onKeyDown={onTabKey}>
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            role="tab"
            id={`tab-${key}`}
            aria-selected={active === key}
            aria-controls="panel"
            tabIndex={active === key ? 0 : -1}
            onClick={() => setActive(key)}
            className={`relative flex flex-col items-center justify-center gap-0.5 text-2xs ${
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
        {bridge.status === 'off' && (
          <button
            onClick={() => setActive('changes')}
            className="shrink-0 rounded-control border border-accent/60 px-1.5 py-0.5 text-2xs text-accent hover:bg-accent-soft"
            title="Pair the panel with your agent"
          >
            Connect agent
          </button>
        )}
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
