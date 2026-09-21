import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import {
  applyAgentPreview,
  attachBar,
  ensureHostAccess,
  getActiveTab,
  isRestricted,
  runScan,
  sendInspector,
  sendRail,
  setSiteMode,
  type BarLook,
} from './lib/messaging';
import {
  getSession,
  loadSession,
  setColorEdit,
  setConfig,
  setLock,
  setMode,
  setPinned,
  setScan,
  setVarOverride,
  updateSession,
  useSession,
} from './lib/session';
import { dropAgentPreview, useBridge, useBridgeSync } from './lib/bridge';
import { useInspect } from './lib/inspect';
import { active as activeChanges } from '@/studio/changes';
import { hexOf, lengthKind, lengthPx } from '@/studio/reskin';
import type { TokenLengths } from '@/shared/types';
import { buildChangeSet } from '@/studio/commit';
import type { Mode } from '@/studio/engine/types';
import type { CommentTarget } from '@/studio/annotations';
import { pendingNotes } from './lib/comments';
import { BridgeDot } from './components/BridgeMenu';
import { useDesignModel, useLiveReskin } from './lib/designModel';
import { ChangesIcon, DesignIcon, ExportIcon, InspectIcon } from './components/icons';
import { useTheme } from './lib/theme';
import { AppMenu } from './components/AppMenu';
import { StyleTab } from './components/StyleTab';
import { TabStrip } from './components/TabStrip';
import { ChangesTab } from './components/ChangesTab';
import { VariablesTab } from './components/VariablesTab';
import { ExportTab } from './components/ExportTab';
import type { LayerNode } from '@/studio/layers';
import { EmptyState, RestrictedState, ScanningState } from './components/States';

type TabKey = 'style' | 'variables' | 'export' | 'changes';

/**
 * Four tabs, in the order you use them: the styles of what you picked, the
 * variables the page runs on, the exports — and last, what you have changed,
 * which is where the hand-off lives. The layers and the assets are not here:
 * they stand in the page, in the rail on its left, where a design tool keeps
 * its tree. Resize is not a view either; it sits on the bar across the page.
 */
const TABS: { key: TabKey; label: string; Icon: typeof InspectIcon }[] = [
  { key: 'style', label: 'Style', Icon: InspectIcon },
  { key: 'variables', label: 'Variables', Icon: DesignIcon },
  { key: 'export', label: 'Export', Icon: ExportIcon },
  { key: 'changes', label: 'Changes', Icon: ChangesIcon },
];

export default function App() {
  // The session remembers the tab, so closing and reopening the panel does
  // not send you back to Layers every time.
  const session = useSession();
  const active: TabKey = (TABS.some((t) => t.key === session.activeTab) ? session.activeTab : 'style') as TabKey;
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
  const { scan, config, mode, live, varOverrides, colorEdits, darkVia, locks } = session;
  // The engine mirrors its ramps only when the page has no dark mode of its
  // own; where it has one, that is what Dark shows, and the system stays light.
  const previewMode = mode === 'dark' && darkVia === 'mirror' ? 'dark' : 'light';
  // What the bar across the page wears and which way its switch sits. A ref,
  // because the tab-sync callback must not be recreated for a theme change.
  const lookRef = useRef<BarLook>({ theme, mode, resettable: 0, rail: session.rail, scheme: 'system' });
  const model = useDesignModel(scan, config, previewMode, varOverrides, colorEdits, locks);
  const reskin = useLiveReskin(tabId, live, model, session.generation);
  const bridge = useBridge();
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
        locks,
        {
          ...(bridge.project
            ? {
                project: {
                  name: bridge.project.name,
                  path: bridge.project.path,
                  ...(bridge.project.branch ? { branch: bridge.project.branch } : {}),
                },
              }
            : {}),
          ...(session.definitions?.found ? { definitions: session.definitions.found } : {}),
          ...(session.definitions?.truncated ? { definitionsTruncated: true } : {}),
          ...(session.applied.length ? { applied: session.applied } : {}),
        },
      ),
    [scanLike, model, session.log, session.comments, locks, bridge.project, session.definitions, session.applied],
  );
  // Built once and pushed, so the badge, the Changes tab and the agent can
  // never disagree about what is pending.
  useBridgeSync(tabId, tabUrl, session, model, changeSet);
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
    model?.dirty || activeChanges(session.log).length > 0 || mode === 'dark' || session.lightForced || session.agentPreview
      ? Math.max(1, overrideCount)
      : 0;
  const look: BarLook = {
    theme,
    mode,
    resettable,
    darkVia,
    agent: session.agentPreview ? { rules: session.agentPreview.rules, matched: session.agentPreview.matched } : null,
    rail: session.rail,
    scheme: mode === 'dark' ? 'dark' : session.lightForced ? 'light' : 'system',
  };
  lookRef.current = look;

  /** Every override goes, and the preview with it; the page reads as itself. Notes are not overrides. */
  const resetAll = useCallback(() => {
    setConfig(null);
    setMode('light');
    updateSession({ lightForced: false });
    ctlRef.current.revertAll();
    ctlRef.current.clear();
    if (tabIdRef.current != null) {
      // The agent's preview sheet is an override too, whoever painted it.
      if (getSession().agentPreview) void dropAgentPreview();
      // The viewport is the bar's to put back; the panel only asks.
      void sendInspector(tabIdRef.current, { cmd: 'reset-viewport' });
    }
  }, []);

  /**
   * Turn the page to match the state being edited.
   *
   * A state is held by the inspector's class, but dark and the widths are
   * what the bar already does — so choosing one asks for the same thing, and
   * leaving it puts the page back.
   *
   * Driven by the condition itself rather than by the click that set it:
   * deselecting also drops the condition, and hanging this off the chip meant
   * the page stayed dark, or stayed narrow, with nothing left on screen
   * saying so — and the next edit was then read off a page in a state the
   * panel no longer believed it was in.
   */
  const condition = ctl.condition;
  /**
   * What this effect itself changed, and what the page was before it did.
   * Only that is ever undone: a hover chip is not a reason to switch off a
   * dark preview or a viewport the person chose on the bar, and leaving the
   * dark condition puts the mode back to what it was, not to light.
   */
  const turned = useRef<{ scheme: Mode | null; width: boolean }>({ scheme: null, width: false });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    const was = turned.current;
    const tab = tabIdRef.current;

    if (condition?.kind === 'scheme') {
      if (was.scheme === null) was.scheme = modeRef.current;
      setMode('dark');
    } else if (was.scheme !== null) {
      setMode(was.scheme);
      was.scheme = null;
    }

    if (condition?.kind === 'width') {
      was.width = true;
      if (tab != null) void sendInspector(tab, { cmd: 'set-viewport', preset: condition.preset, width: condition.px });
    } else if (was.width) {
      was.width = false;
      if (tab != null) void sendInspector(tab, { cmd: 'reset-viewport' });
    }
  }, [condition]);

  const restricted = isRestricted(tabUrl);

  const syncActiveTab = useCallback(async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    tabIdRef.current = tab.id;
    // The session lands before React learns the tab, so no effect keyed on
    // the tab id runs against the previous tab's session (it used to re-push
    // one tab's agent preview onto the next).
    // A stored session is kept only while the tab is still on that origin.
    await loadSession(tab.id, tab.url ?? '');
    setTabId(tab.id);
    setTabUrl(tab.url ?? '');
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
        if (msg.data) setActive('style');
      } else if (msg?.type === 'element-edit') {
        // The edit card on the page: same log, same rules, same undo and brief.
        const edit = msg as unknown as { property: string; to: string };
        if (edit.property === 'text') ctlRef.current.setText(edit.to);
        else ctlRef.current.change(edit.property, edit.to);
      } else if (msg?.type === 'panel-focus') {
        setActive('style');
      } else if (msg?.type === 'rail-toggled') {
        // Layers on the bar, or Alt+L: the session is the truth, the bar echoes it.
        updateSession({ rail: Boolean((msg as { on?: boolean }).on) });
      } else if (msg?.type === 'rail-move') {
        // A drag in the rail is an element edit, filed here with the rest.
        const m = msg as unknown as { node: LayerNode; parent: LayerNode; before: LayerNode | null; wasIn: LayerNode; wasBefore: LayerNode | null };
        ctlRef.current.move(m.node, m.parent, m.before, m.wasIn, m.wasBefore);
      } else if (msg?.type === 'rail-hide') {
        ctlRef.current.toggleHidden((msg as unknown as { node: LayerNode }).node);
      } else if (msg?.type === 'rail-scope') {
        ctlRef.current.setScope((msg as { scope?: string }).scope === 'all' ? 'all' : 'element');
      } else if (msg?.type === 'agent-clear') {
        void dropAgentPreview();
      } else if (msg?.type === 'reset-all') {
        resetAll();
      } else if (msg?.type === 'mode-changed') {
        // The bar's Light/Dark switch; the session is the truth it echoes.
        // Light is forced, not "as the system": a page that is dark because
        // the system is shows its light side.
        const m = (msg as { mode?: string }).mode;
        if (m === 'dark') {
          setMode('dark');
          updateSession({ lightForced: false });
        } else if (m === 'light' || m === 'system') {
          setMode('light');
          updateSession({ lightForced: m === 'light' });
        }
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
  // The agent's sheet is an override too: after a reload it goes back on the
  // page like the re-skin does, while the consent that let it on still holds.
  const agentCss = session.agentPreview?.css ?? null;
  useEffect(() => {
    if (tabId == null || !agentCss) return;
    if (!session.agentMayWrite) {
      void dropAgentPreview();
      return;
    }
    void applyAgentPreview(tabId, agentCss);
    // Only a reload or a new tab re-pushes; the css itself was pushed by the bridge when it arrived.
  }, [tabId, session.generation]);
  const agentRules = session.agentPreview?.rules ?? null;
  const agentMatched = session.agentPreview?.matched ?? null;
  const railOn = session.rail;
  const lightForced = session.lightForced;
  useEffect(() => {
    if (tabId != null && scan && !restricted) void attachBar(tabId, lookRef.current);
  }, [tabId, scan, restricted, theme, mode, resettable, darkVia, agentRules, agentMatched, railOn, lightForced]);

  // The rail, beside the page: shown wherever the bar is, folded when the
  // person folds it, told again after a reload like every other managed
  // thing on the page. Its Assets tab is fed from the scan.
  useEffect(() => {
    if (tabId == null || !scan || restricted) return;
    void sendRail(tabId, { cmd: 'rail', on: railOn, theme });
  }, [tabId, scan, restricted, theme, railOn, session.generation]);
  const svgs = scan?.svgs ?? null;
  useEffect(() => {
    if (tabId == null || !svgs || restricted) return;
    void sendRail(tabId, { cmd: 'assets', svgs });
  }, [tabId, svgs, restricted, session.generation]);

  // Dark on the bar asks the page for its own dark mode first — its dark
  // media rules hoisted, its theme hook set — and only when it has none does
  // the engine mirror its ramps. Light puts the page back. Asked again after
  // a reload, like every other managed sheet.
  useEffect(() => {
    if (tabId == null || !scan || restricted) return;
    if (mode === 'light') {
      void setSiteMode(tabId, lightForced ? 'light' : 'system');
      return;
    }
    void setSiteMode(tabId, 'dark').then((r) => {
      const own = !!r && (r.rules > 0 || r.hooks.length > 0);
      updateSession({ darkVia: own ? 'site' : 'mirror' });
    });
  }, [tabId, scan, restricted, mode, lightForced, session.generation]);

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

  const hostname = (() => {
    try {
      return new URL(tabUrl).hostname || 'this page';
    } catch {
      return 'this page';
    }
  })();

  // Selecting, editing and noting all work before a scan; the rest reads it.
  const needsScan = active === 'variables' || active === 'export';
  let content: React.ReactNode;
  if (restricted && needsScan) {
    content = <RestrictedState url={tabUrl} onOpenLayers={() => setActive('style')} />;
  } else if (scanning && needsScan) {
    content = <ScanningState />;
  } else if (!scan && needsScan) {
    content = <EmptyState onScan={handleScan} error={scanError} needsAccess={needsAccess} />;
  } else {
    switch (active) {
      case 'style':
        content = (
          <StyleTab
            error={scanError}
            ctl={ctl}
            scan={scan}
            resolved={model?.resolved ?? null}
            mode={mode}
            rail={railOn}
            onShowRail={() => updateSession({ rail: true })}
            onOpenVariables={() => setActive('variables')}
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
            darkVia={darkVia}
            varOverrides={varOverrides}
            colorEdits={colorEdits}
            onConfigChange={setConfig}
            onResetAll={resetAll}
            onVar={setVarOverride}
            onColor={setColorEdit}
            locks={locks}
            onLock={setLock}
          />
        );
        break;
      case 'export':
        content = <ExportTab scan={scan!} hostname={hostname} resolved={model?.resolved ?? null} />;
        break;
    }
  }

  return (
    <div className="flex h-screen flex-col text-base">
      {/* h-10 is BAR_HEIGHT: the same strip as the bar across the page. */}
      <TabStrip
        tabs={TABS.map((t) => (t.key === 'changes' ? { ...t, badge: pendingCount } : t))}
        active={active}
        onSelect={setActive}
        ariaLabel="Panel"
      />

      <main id="panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="relative flex-1 overflow-y-auto">
        {content}
      </main>

      <footer className="flex items-center gap-2 border-t border-line-subtle px-2.5 py-1.5 text-sm text-ink-muted">
        <AppMenu compact />
        <BridgeDot status={bridge.status} />
        {bridge.status === 'off' && (
          <button
            onClick={() => setActive('changes')}
            className="btn btn-sm btn-accent shrink-0"
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
          className="btn btn-sm btn-secondary ml-auto"
        >
          {scanning ? 'Reading…' : scan ? 'Rescan' : needsAccess ? 'Allow' : 'Scan'}
        </button>
      </footer>
    </div>
  );
}
