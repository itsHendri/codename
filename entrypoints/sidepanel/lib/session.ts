/**
 * What the panel knows about the tab it is scoped to, kept outside any one
 * tab's component tree.
 *
 * The Variables tab used to hold the edited system in its own state, so switching
 * to Layers unmounted it, dropped the edit and cleared the re-skin. An edit is
 * a fact about the page, not about which tab is showing, so it lives here and
 * is mirrored to `chrome.storage.session` under the tab id — session storage
 * because a scan is a reading of one document and should not outlive the
 * browser session.
 */

import { useSyncExternalStore } from 'react';
import type { AgentPresence, PinnedElement, ScanResult } from '@/shared/types';
import type {
  Comment,
  CommentStatus,
  DefinitionsPayload,
  ProjectInfo,
  RunSnapshot,
  SessionState,
} from '@/shared/protocol';
import type { CommentTarget } from '@/studio/annotations';
import type { FileToken } from '@/studio/tokenFile';
import type { BrandConfig, Mode } from '@/studio/engine/types';
import { isLocal } from '@/studio/commit';
import { emptyLog, type ChangeLog } from '@/studio/changes';
import { normaliseCondition } from '@/studio/conditions';
import { applyEdits, diffEdits, editsKey, type BrandEdits } from '@/studio/edits';
import { loadEdits, saveEdits } from '@/studio/storage';
import { seedBrandFromScan } from '@/studio/seedFromScan';

/**
 * How a write to source stands with the page. `pending` while the page is
 * being asked; `ok` once it paints the value; `silent` when it still paints
 * the old one after five seconds (no hot reload, most likely); `contradicted`
 * when it painted something else, so the write was put back; `unchecked`
 * when the page was showing the other side of its theme and could not say.
 */
export type VerifyState = 'pending' | 'ok' | 'silent' | 'contradicted' | 'unchecked';

export interface WrittenEntry {
  name: string;
  file: string;
  line: number;
  /** What was written. */
  value: string;
  /** What the definition said before, so it can be put back. */
  from?: string;
  scope?: 'root' | 'theme' | 'dark';
  /** Absent on an entry from before the page was asked; read as `ok`. */
  verified?: VerifyState;
  /** For `contradicted`: what the page read instead. */
  seen?: string;
}

export interface TabSession {
  scan: ScanResult | null;
  /** The edited system; null means "as scanned". */
  config: BrandConfig | null;
  mode: Mode;
  /** Light forced on a page that is dark because the system is. Off when `mode` is dark. */
  lightForced: boolean;
  /**
   * How a dark preview is being shown: the site's own dark mode where it has
   * one, else the system's mirrored ramps. Null in light.
   */
  darkVia: 'site' | 'mirror' | null;
  /** Whether edits repaint the page. */
  live: boolean;
  /** The panel tab showing, kept so a reopen lands where you were. */
  activeTab: string;
  /** Whether the layers rail is showing in the page. On until someone folds it. */
  rail: boolean;
  /** The page's own variables set by hand: name → value. */
  varOverrides: Record<string, string>;
  /** Observed colours set by hand: old hex (upper case) → new hex. */
  colorEdits: Record<string, string>;
  /** Page variables to keep as they are, whatever else moves. Per site, like the edits. */
  locks: string[];
  /** Type styles a scale change leaves alone, by `form:selector`. Per site, like the locks. */
  styleLocks: string[];
  /** A design token file to hold the page up against: its name and what was read out of it. */
  tokenFile: { name: string; tokens: FileToken[] } | null;
  pinned: PinnedElement | null;
  /** Shift-clicked beside `pinned`: an edit reaches these too. Not kept, as the selection is not. */
  also: PinnedElement[];
  /** A style copied with ⌘⌥C, to be pasted with ⌘⌥V: which element, and what it looked like. */
  copiedStyle: { selector: string; values: Record<string, string> } | null;
  /**
   * Moves on intent — a hand-off, a comment, a pin — never on a drag tick.
   * The bridge's `watch` tool resolves when it does.
   */
  revision: number;
  /** An explicit hand-off to an agent in a chat; Make changes runs the agent itself and leaves this alone. */
  handoff: SessionState['handoff'];
  /** Whether the agent may paint on this page. Asked for once per project. */
  agentMayWrite: boolean;
  /**
   * Whether the bridge may write a variable definition in the project it is
   * running in. Off until the person says so; the only write it ever makes.
   */
  bridgeMayWrite: boolean;
  /**
   * The agents Make changes may run in the project the bridge is in. Asked
   * once per project and per agent, because what each can do differs.
   */
  agentsMayRun: string[];
  /** The agent Make changes runs in this project, as the person last picked it. */
  agentChoice: string | null;
  /**
   * The Make changes run this panel started, as the bridge last reported it.
   * Kept across a reload, because a run that changed files reloads the page.
   */
  run: RunSnapshot | null;
  /** Where the bridge found the tokens in play, pushed whenever the set changes. */
  definitions: DefinitionsPayload | null;
  /**
   * Token values written to source from here, and how each stands with the
   * page. The value is kept with them: the brief only says "already written"
   * while the token still holds the value that was written, so changing it
   * again is a real change.
   */
  applied: WrittenEntry[];
  /**
   * The agent's preview stylesheet, while it is on the page: what it holds,
   * what it reaches, since when — and the sheet itself, so a reload can put
   * it back the way the re-skin is put back.
   */
  agentPreview: (AgentPresence & { at: string; css: string; declares: string[] }) | null;
  comments: Comment[];
  /** What the agent did through the bridge, latest last: previews, pointers, captures, comment moves. */
  agentLog: { at: string; what: string }[];
  /** Element edits, kept per page (url without hash). */
  log: ChangeLog;
  logUrl: string;
  /** Bumps when the page reloads, so managed sheets are pushed again. Not persisted. */
  generation: number;
}

/** The part of a session that is worth keeping across a panel reopen. */
type Persisted = Omit<TabSession, 'pinned' | 'generation' | 'also'>;

const EMPTY: TabSession = {
  scan: null,
  config: null,
  mode: 'light',
  lightForced: false,
  darkVia: null,
  live: true,
  activeTab: 'style',
  rail: true,
  varOverrides: {},
  colorEdits: {},
  locks: [],
  styleLocks: [],
  tokenFile: null,
  pinned: null,
  also: [],
  copiedStyle: null,
  revision: 0,
  handoff: null,
  agentMayWrite: false,
  bridgeMayWrite: false,
  agentsMayRun: [],
  agentChoice: null,
  run: null,
  definitions: null,
  applied: [],
  agentPreview: null,
  comments: [],
  agentLog: [],
  log: emptyLog(),
  logUrl: '',
  generation: 0,
};

/** Tabs the panel no longer has, mapped to where their work went. */
function migrateTab(tab: string | undefined): string {
  if (!tab || tab === 'layers' || tab === 'assets') return 'style';
  if (tab === 'variables' || tab === 'export') return 'system';
  return tab;
}

/**
 * A change log read back from storage, with anything it says about a state
 * checked rather than trusted.
 *
 * Session storage outlives an extension reload, so a log can be written by
 * one build and read by another. A condition this build does not recognise
 * would otherwise be written straight into a selector — `.b` and a state
 * called `wat` produce `.bundefined`, which invalidates the whole rule and
 * silently paints nothing.
 */
function soundLog(log: ChangeLog | undefined): ChangeLog {
  if (!log?.entries?.length) return log ?? emptyLog();
  return {
    ...log,
    entries: log.entries.map((e) => (e.condition ? { ...e, condition: normaliseCondition(e.condition) } : e)),
  };
}

const pageKey = (url: string) => url.split('#')[0] ?? url;
const key = (id: number) => `session:${id}`;

let state: TabSession = EMPTY;
let tabId: number | null = null;
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((l) => l());

function sameOrigin(a: string | undefined, b: string): boolean {
  try {
    return !!a && new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** The session as it is kept: everything but the live selection and the reload counter. */
function writeSession(id: number): Promise<void> {
  const { pinned: _pinned, generation: _generation, also: _also, ...rest } = state;
  // A quota overflow would otherwise be an unhandled rejection and the
  // session would silently stop being kept.
  return chrome.storage.session.set({ [key(id)]: rest satisfies Persisted }).catch((err) => {
    console.warn('[codename] the session could not be kept:', err);
  });
}

/** Writes are coalesced: a seed drag fires per frame and the scan is large. */
function schedulePersist() {
  if (tabId == null) return;
  if (persistTimer) clearTimeout(persistTimer);
  const id = tabId;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void writeSession(id);
  }, 300);
}

/**
 * Keep everything now rather than in a moment: before the panel reloads the
 * page it sits in, which takes the panel with it. A write still waiting in
 * the debounce would be lost, and what the panel read back would be the
 * state from before — edits it had just let go of, a run it had just handled.
 */
export async function flushSession(): Promise<void> {
  flushSaveEdits();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (tabId != null) await writeSession(tabId);
}

export function getSession(): TabSession {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): TabSession {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

export function updateSession(patch: Partial<TabSession> | ((s: TabSession) => Partial<TabSession>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
  schedulePersist();
}

/**
 * Point the store at a tab. A stored session is kept only while the tab is
 * still on the origin it was scanned at; anything else starts fresh.
 */
export async function loadSession(id: number, url: string): Promise<void> {
  // A decision made on the tab we are leaving lands before the store moves.
  flushSaveEdits();
  tabId = id;
  const raw = await chrome.storage.session.get(key(id));
  const stored = raw[key(id)] as Partial<Persisted> | undefined;
  const keep = stored?.scan && sameOrigin(stored.scan.url, url);
  const samePage = keep && stored.logUrl === pageKey(url);
  // A scan is a reading of one document. Another page on the same site
  // keeps the decisions — they are deltas over a fresh reading — but not
  // the reading, so the panel scans again rather than describing the page
  // you left; the rail's Pages tab is how you get there now.
  const sameDocument = keep && pageKey(stored.scan!.url) === pageKey(url);
  const allowed = await loadConsent(keyFor(url), writeKeyFor());
  state = keep
    ? {
        ...EMPTY,
        ...allowed,
        ...stored,
        scan: sameDocument ? stored.scan! : null,
        // A session stored before the preview was counted held a flag here.
        agentPreview: typeof stored.agentPreview === 'object' ? stored.agentPreview : null,
        agentLog: stored.agentLog ?? [],
        locks: stored.locks ?? [],
        styleLocks: stored.styleLocks ?? [],
        // The tree and the assets moved into the rail; a session left on
        // either of those tabs opens on the selection now.
        activeTab: migrateTab(stored.activeTab),
        rail: stored.rail ?? true,
        lightForced: stored.lightForced ?? false,
        // Edits always paint: the switch that could turn that off is gone.
        live: true,
        pinned: null,
        also: [],
        copiedStyle: stored.copiedStyle ?? null,
        log: samePage ? soundLog(stored.log) : emptyLog(),
        logUrl: pageKey(url),
        generation: state.generation + 1,
      }
    : { ...EMPTY, ...allowed, logUrl: pageKey(url), generation: state.generation + 1 };
  emit();
}

/* ---------------- consent, kept per project ---------------- */

/**
 * Each answer has its own key.
 *
 * On a local page the page's scope and the project's scope are the same
 * string, so one record holding both answers meant saving either one wiped
 * the other: allowing the bridge to write quietly took back the agent's
 * permission to paint, and the reverse.
 */
const CONSENT_KEYS: Record<keyof Consent, string> = {
  agentMayWrite: 'consent:paint:',
  bridgeMayWrite: 'consent:write:',
};
/** Which agent Make changes runs, per project. */
const AGENT_CHOICE_KEY = 'agent:';
/** The agents allowed to run, per project. */
const RUN_CONSENT_KEY = 'consent:run:';
/** Where both answers used to live, together; still read so nothing given is lost. */
const LEGACY_CONSENT_KEY = 'consent:';

interface Consent {
  agentMayWrite: boolean;
  bridgeMayWrite: boolean;
}

/**
 * What the person has allowed here before.
 *
 * Asked once rather than assumed: a page on localhost used to arrive with the
 * agent already allowed to paint on it, which is a consent nobody gave. The
 * two answers are about different things — painting is about this page,
 * writing is about the folder the bridge is in — so each is read from its own
 * scope.
 */
async function loadConsent(pageScope: string, writeScope: string | null): Promise<Consent & { agentChoice: string | null; agentsMayRun: string[] }> {
  const read = async (what: keyof Consent, scope: string): Promise<boolean> => {
    try {
      const own = `${CONSENT_KEYS[what]}${scope}`;
      const legacy = `${LEGACY_CONSENT_KEY}${scope}`;
      const got = await chrome.storage.local.get([own, legacy]);
      if (typeof got[own] === 'boolean') return got[own] as boolean;
      return (got[legacy] as Partial<Consent> | undefined)?.[what] === true;
    } catch {
      return false;
    }
  };
  const readRaw = async (k: string): Promise<unknown> => {
    try {
      return (await chrome.storage.local.get(k))[k];
    } catch {
      return undefined;
    }
  };
  const [agentMayWrite, bridgeMayWrite, choice, mayRun] = await Promise.all([
    read('agentMayWrite', pageScope),
    writeScope ? read('bridgeMayWrite', writeScope) : Promise.resolve(false),
    writeScope ? readRaw(`${AGENT_CHOICE_KEY}${writeScope}`) : Promise.resolve(undefined),
    writeScope ? readRaw(`${RUN_CONSENT_KEY}${writeScope}`) : Promise.resolve(undefined),
  ]);
  return {
    agentMayWrite,
    bridgeMayWrite,
    agentChoice: typeof choice === 'string' ? choice : null,
    agentsMayRun: Array.isArray(mayRun) ? mayRun.filter((a): a is string => typeof a === 'string') : [],
  };
}

/**
 * A definition the person applied to source from here, and the page has
 * been seen to paint.
 *
 * It leaves the brief — the agent must not write it again — and the variable
 * override goes with it, because source now holds the value and the page
 * paints it on its own.
 */
export function markApplied(applied: WrittenEntry): void {
  updateSession((s) => {
    const vars = { ...s.varOverrides };
    delete vars[applied.name];
    return {
      applied: [...s.applied.filter((a) => a.name !== applied.name), { ...applied, verified: 'ok' as const }],
      varOverrides: vars,
      revision: s.revision + 1,
    };
  });
  scheduleSaveEdits();
}

/**
 * Values the bridge just wrote, before the page has been asked about them.
 * The override stays on: the page paints the intent either way, and it comes
 * off only once the page is seen to paint the value on its own.
 */
export function markWritten(entries: WrittenEntry[]): void {
  const names = new Set(entries.map((e) => e.name));
  updateSession((s) => ({
    applied: [...s.applied.filter((a) => !names.has(a.name)), ...entries.map((e) => ({ ...e, verified: e.verified ?? ('pending' as const) }))],
    revision: s.revision + 1,
  }));
}

/** What the page said about a write. `ok` takes the override off; the rest leave it on and say why. */
export function markVerified(name: string, verified: VerifyState, seen?: string): void {
  const entry = state.applied.find((a) => a.name === name);
  if (!entry) return;
  if (verified === 'ok') {
    markApplied(entry);
    return;
  }
  updateSession((s) => ({
    applied: s.applied.map((a) => (a.name === name ? { ...a, verified, ...(seen ? { seen } : {}) } : a)),
    revision: s.revision + 1,
  }));
}

/** A write put back, or a value the person changed again: it is no longer something source holds for them. */
export function forgetWritten(name: string): void {
  updateSession((s) => ({ applied: s.applied.filter((a) => a.name !== name), revision: s.revision + 1 }));
}

/** Remember an answer, so the same project does not ask again. */
export function allow(what: keyof Consent, value: boolean): void {
  const url = state.scan?.url;
  // Painting is about the page; writing is about the folder, and there is
  // nothing to allow when no folder is known.
  const key = what === 'bridgeMayWrite' ? writeKeyFor() : url ? keyFor(url) : null;
  if (what === 'bridgeMayWrite' && !key) return;
  updateSession({ [what]: value } as Partial<TabSession>);
  if (!key) return;
  void chrome.storage.local.set({ [`${CONSENT_KEYS[what]}${key}`]: value }).catch(() => {});
}

/**
 * Let Make changes run this agent in the bridge's project, remembered for
 * the project. False when no project is known: there is nothing to allow.
 */
export function allowRun(agent: string): boolean {
  const key = writeKeyFor();
  if (!key) return false;
  const next = Array.from(new Set([...state.agentsMayRun, agent]));
  updateSession({ agentsMayRun: next });
  void chrome.storage.local.set({ [`${RUN_CONSENT_KEY}${key}`]: next }).catch(() => {});
  return true;
}

/** Remember which agent Make changes runs in this project. */
export function chooseAgent(id: string): void {
  updateSession({ agentChoice: id });
  const key = writeKeyFor();
  if (key) void chrome.storage.local.set({ [`${AGENT_CHOICE_KEY}${key}`]: id }).catch(() => {});
}

/** Something the agent should wake up for. */
export function bumpRevision(patch: Partial<TabSession> = {}) {
  updateSession((s) => ({ ...patch, revision: s.revision + 1 }));
}

export function setPinned(pinned: PinnedElement | null) {
  bumpRevision({ pinned });
}

const commentId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addComment(target: CommentTarget, url: string, text: string): Comment {
  const comment: Comment = {
    id: commentId(),
    url: pageKey(url),
    target,
    text,
    status: 'pending',
    createdAt: new Date().toISOString(),
    replies: [],
  };
  bumpRevision({ comments: [...state.comments, comment] });
  return comment;
}

export function editComment(id: string, text: string) {
  bumpRevision({ comments: state.comments.map((c) => (c.id === id ? { ...c, text } : c)) });
}

export function removeComment(id: string) {
  bumpRevision({ comments: state.comments.filter((c) => c.id !== id) });
}

export function setCommentStatus(id: string, status: CommentStatus) {
  bumpRevision({
    comments: state.comments.map((c) => (c.id === id ? { ...c, status } : c)),
  });
}

export function addReply(id: string, from: 'user' | 'agent', text: string) {
  bumpRevision({
    comments: state.comments.map((c) =>
      c.id === id ? { ...c, replies: [...c.replies, { from, text, at: new Date().toISOString() }] } : c,
    ),
  });
}

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/**
 * The project the paired bridge is running in, or null. Held here rather than
 * in the session because it belongs to the machine, not the tab: every panel
 * in the window is talking to the same bridge.
 */
let project: ProjectInfo | null = null;

/** Where this page's decisions are filed right now. */
const keyFor = (url: string) => editsKey(originOf(url), project, isLocal(url));

/**
 * Where the permission to write to a project is filed.
 *
 * By the project, always — the write goes to a folder, so consent has to
 * follow the folder and not the page. Filing it by origin let a page on a
 * deployed site carry its answer over to whatever repository the bridge
 * happened to move to next.
 */
const writeKeyFor = (): string | null => (project ? `project:${project.root ?? project.path}` : null);

/** Guards a slow read against the scan or the project changing under it. */
let scopeGeneration = 0;

/**
 * The bridge connected, disconnected, or moved to another folder.
 *
 * Only a *different* project moves where decisions are filed. Losing the
 * bridge does not: the agent restarting takes the bridge with it for a few
 * seconds, and filing whatever the person did in those seconds under the
 * origin — then reading the project's older record back when the bridge
 * returned — silently threw those edits away. The last project known stays
 * the scope until another one is named.
 */
export function setProjectScope(next: ProjectInfo | null): void {
  if (!next) return;
  const before = project;
  project = next;
  const scan = state.scan;
  if (!scan) return;
  if (keyFor(scan.url) === editsKey(originOf(scan.url), before, isLocal(scan.url))) return;
  void reloadScope(scan.url);
}

/** Reads the decisions and consents filed under the current keys, over the scan. */
async function reloadScope(url: string): Promise<void> {
  const scan = state.scan;
  const generation = ++scopeGeneration;
  if (!scan) return;
  // A decision made a moment ago is still sitting in the save debounce.
  flushSaveEdits();
  const [edits, allowed] = await Promise.all([
    loadEdits(keyFor(url), originOf(url)).catch(() => null),
    loadConsent(keyFor(url), writeKeyFor()),
  ]);
  // Another scan or another project arrived while this was reading.
  if (generation !== scopeGeneration || state.scan !== scan) return;
  updateSession({
    config: edits ? applyEdits(seedBrandFromScan(scan), edits) : null,
    varOverrides: edits?.vars ?? {},
    colorEdits: edits?.colors ?? {},
    locks: edits?.locks ?? [],
    styleLocks: edits?.styleLocks ?? [],
    ...allowed,
  });
}

/**
 * A new scan is a new reading of the page. The decisions made against this
 * site are laid back over it, so a seed you moved stays moved while
 * everything else is observed afresh.
 */
export async function setScan(scan: ScanResult) {
  const edits = await loadEdits(keyFor(scan.url), originOf(scan.url)).catch(() => null);
  const config = edits ? applyEdits(seedBrandFromScan(scan), edits) : null;
  updateSession({ scan, config, varOverrides: edits?.vars ?? {}, colorEdits: edits?.colors ?? {}, locks: edits?.locks ?? [], styleLocks: edits?.styleLocks ?? [] });
}

/** Everything decided against this site, as the store keeps it. */
function currentEdits(): { key: string; edits: BrandEdits } | null {
  const { scan, config, varOverrides, colorEdits, locks, styleLocks } = state;
  if (!scan) return null;
  const seeded = seedBrandFromScan(scan);
  return {
    key: keyFor(scan.url),
    edits: { ...diffEdits(seeded, config ?? seeded), vars: varOverrides, colors: colorEdits, locks, styleLocks },
  };
}

/**
 * Coalesced like the session itself: a colour picker fires per frame. The
 * decision is taken at schedule time, against the key it was made under,
 * so a tab switch inside the window cannot redirect it; and it is flushed
 * when the store moves to another tab or the panel goes away.
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: { key: string; edits: BrandEdits } | null = null;
function flushSaveEdits() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const due = pendingSave;
  pendingSave = null;
  if (due) void saveEdits(due.key, due.edits).catch(() => {});
}
function scheduleSaveEdits() {
  pendingSave = currentEdits();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaveEdits, 300);
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushSaveEdits);

/**
 * Change the edited system and remember the decision for this site. Passing
 * null is revert: the system, the variables and the colours set by hand all
 * go back to what the page reads.
 */
export function setConfig(config: BrandConfig | null) {
  updateSession(config === null ? { config, varOverrides: {}, colorEdits: {} } : { config });
  scheduleSaveEdits();
}

/** Set one of the page's own variables by hand, or take that back with null. */
const AGENT_LOG_MAX = 40;

/** Note something the agent did, for the activity list; not a change, never in the brief. */
export function logAgent(what: string) {
  updateSession((s) => ({ agentLog: [...(s.agentLog ?? []), { at: new Date().toISOString(), what }].slice(-AGENT_LOG_MAX) }));
}

export function clearAgentLog() {
  updateSession({ agentLog: [] });
}

/** Lock a page variable so nothing moves it, or let it go again. A locked variable's hand-set value is dropped. */
/** Keep a type style out of a scale change, or let it back in. */
export function setStyleLock(key: string, locked: boolean): void {
  updateSession((s) => ({ styleLocks: locked ? Array.from(new Set([...s.styleLocks, key])) : s.styleLocks.filter((k) => k !== key) }));
  scheduleSaveEdits();
}

export function setLock(name: string, locked: boolean) {
  updateSession((s) => {
    const locks = locked ? Array.from(new Set([...s.locks, name])) : s.locks.filter((n) => n !== name);
    if (!locked) return { locks };
    const { [name]: _dropped, ...varOverrides } = s.varOverrides;
    return { locks, varOverrides };
  });
  scheduleSaveEdits();
}

export function setVarOverride(name: string, to: string | null) {
  updateSession((s) => {
    const next = { ...s.varOverrides };
    if (to === null) delete next[name];
    else next[name] = to;
    return { varOverrides: next };
  });
  scheduleSaveEdits();
}

/** Set what an observed colour becomes, or take that back with null. */
export function setColorEdit(from: string, to: string | null) {
  const key = from.toUpperCase();
  updateSession((s) => {
    const next = { ...s.colorEdits };
    if (to === null || to.toUpperCase() === key) delete next[key];
    else next[key] = to.toUpperCase();
    return { colorEdits: next };
  });
  scheduleSaveEdits();
}

/** Which side of the system the page previews. */
export function setMode(mode: Mode) {
  updateSession(mode === 'light' ? { mode, darkVia: null } : { mode });
}
