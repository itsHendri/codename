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
  SessionState,
} from '@/shared/protocol';
import type { CommentTarget } from '@/studio/annotations';
import type { FileToken } from '@/studio/tokenFile';
import type { BrandConfig, Mode } from '@/studio/engine/types';
import { isLocal } from '@/studio/commit';
import { emptyLog, type ChangeLog } from '@/studio/changes';
import { applyEdits, diffEdits, editsKey, type BrandEdits } from '@/studio/edits';
import { loadEdits, saveEdits } from '@/studio/storage';
import { seedBrandFromScan } from '@/studio/seedFromScan';

export interface TabSession {
  scan: ScanResult | null;
  /** The edited system; null means "as scanned". */
  config: BrandConfig | null;
  mode: Mode;
  /**
   * How a dark preview is being shown: the site's own dark mode where it has
   * one, else the system's mirrored ramps. Null in light.
   */
  darkVia: 'site' | 'mirror' | null;
  /** Whether edits repaint the page. */
  live: boolean;
  /** The panel tab showing, kept so a reopen lands where you were. */
  activeTab: string;
  /** The page's own variables set by hand: name → value. */
  varOverrides: Record<string, string>;
  /** Observed colours set by hand: old hex (upper case) → new hex. */
  colorEdits: Record<string, string>;
  /** Page variables to keep as they are, whatever else moves. Per site, like the edits. */
  locks: string[];
  /** A design token file to hold the page up against: its name and what was read out of it. */
  tokenFile: { name: string; tokens: FileToken[] } | null;
  pinned: PinnedElement | null;
  /**
   * Moves on intent — a hand-off, a comment, a pin — never on a drag tick.
   * The bridge's `watch` tool resolves when it does.
   */
  revision: number;
  /** What was pressed "Send to agent" on, until the agent or the user clears it. */
  handoff: SessionState['handoff'];
  /** Whether the agent may paint on this page. Asked for once per project. */
  agentMayWrite: boolean;
  /**
   * Whether the bridge may write a variable definition in the project it is
   * running in. Off until the person says so; the only write it ever makes.
   */
  bridgeMayWrite: boolean;
  /** Where the bridge found the tokens in play, pushed whenever the set changes. */
  definitions: DefinitionsPayload | null;
  /** Definitions the person applied to source from here, so the brief can say so. */
  applied: { name: string; file: string; line: number }[];
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
type Persisted = Omit<TabSession, 'pinned' | 'generation'>;

const EMPTY: TabSession = {
  scan: null,
  config: null,
  mode: 'light',
  darkVia: null,
  live: true,
  activeTab: 'layers',
  varOverrides: {},
  colorEdits: {},
  locks: [],
  tokenFile: null,
  pinned: null,
  revision: 0,
  handoff: null,
  agentMayWrite: false,
  bridgeMayWrite: false,
  definitions: null,
  applied: [],
  agentPreview: null,
  comments: [],
  agentLog: [],
  log: emptyLog(),
  logUrl: '',
  generation: 0,
};

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

/** Writes are coalesced: a seed drag fires per frame and the scan is large. */
function schedulePersist() {
  if (tabId == null) return;
  if (persistTimer) clearTimeout(persistTimer);
  const id = tabId;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const { pinned: _pinned, generation: _generation, ...rest } = state;
    // A quota overflow would otherwise be an unhandled rejection and the
    // session would silently stop being kept.
    void chrome.storage.session.set({ [key(id)]: rest satisfies Persisted }).catch((err) => {
      console.warn('[codename] the session could not be kept:', err);
    });
  }, 300);
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
  const allowed = await loadConsent(keyFor(url));
  state = keep
    ? {
        ...EMPTY,
        ...allowed,
        ...stored,
        // A session stored before the preview was counted held a flag here.
        agentPreview: typeof stored.agentPreview === 'object' ? stored.agentPreview : null,
        agentLog: stored.agentLog ?? [],
        locks: stored.locks ?? [],
        pinned: null,
        log: samePage ? (stored.log ?? emptyLog()) : emptyLog(),
        logUrl: pageKey(url),
        generation: state.generation + 1,
      }
    : { ...EMPTY, ...allowed, logUrl: pageKey(url), generation: state.generation + 1 };
  emit();
}

/* ---------------- consent, kept per project ---------------- */

const CONSENT_KEY = 'consent:';

interface Consent {
  agentMayWrite: boolean;
  bridgeMayWrite: boolean;
}

/**
 * What the person has allowed here before.
 *
 * Asked once per project rather than assumed: a page on localhost used to
 * arrive with the agent already allowed to paint on it, which is a consent
 * nobody gave.
 */
async function loadConsent(key: string): Promise<Consent> {
  try {
    const k = `${CONSENT_KEY}${key}`;
    const got = await chrome.storage.local.get(k);
    const raw = got[k] as Partial<Consent> | undefined;
    return { agentMayWrite: raw?.agentMayWrite === true, bridgeMayWrite: raw?.bridgeMayWrite === true };
  } catch {
    return { agentMayWrite: false, bridgeMayWrite: false };
  }
}

/**
 * A definition the person applied to source from here.
 *
 * It leaves the brief — the agent must not write it again — and the variable
 * override goes with it, because source now holds the value and the page will
 * repaint from it on the next reload.
 */
export function markApplied(applied: { name: string; file: string; line: number }): void {
  updateSession((s) => {
    const vars = { ...s.varOverrides };
    delete vars[applied.name];
    return {
      applied: [...s.applied.filter((a) => a.name !== applied.name), { name: applied.name, file: applied.file, line: applied.line }],
      varOverrides: vars,
      revision: s.revision + 1,
    };
  });
  scheduleSaveEdits();
}

/** Remember an answer, so the same project does not ask again. */
export function allow(what: keyof Consent, value: boolean): void {
  updateSession({ [what]: value } as Partial<TabSession>);
  const url = state.scan?.url;
  if (!url) return;
  const k = `${CONSENT_KEY}${keyFor(url)}`;
  const next: Consent = {
    agentMayWrite: what === 'agentMayWrite' ? value : state.agentMayWrite,
    bridgeMayWrite: what === 'bridgeMayWrite' ? value : state.bridgeMayWrite,
  };
  void chrome.storage.local.set({ [k]: next }).catch(() => {});
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
 * The bridge connected, disconnected, or moved to another folder. The edits
 * in play may now belong under a different key, so they are read again.
 */
export function setProjectScope(next: ProjectInfo | null): void {
  const before = project;
  project = next;
  const scan = state.scan;
  if (!scan) return;
  if (keyFor(scan.url) === editsKey(originOf(scan.url), before, isLocal(scan.url))) return;
  void reloadEdits(scan.url);
  // What was allowed for an origin was not allowed for this project.
  void loadConsent(keyFor(scan.url)).then((allowed) => updateSession(allowed));
}

/** Reads the decisions filed under the current key and lays them over the scan. */
async function reloadEdits(url: string): Promise<void> {
  const scan = state.scan;
  if (!scan) return;
  const edits = await loadEdits(keyFor(url), originOf(url)).catch(() => null);
  if (state.scan !== scan) return;
  updateSession({
    config: edits ? applyEdits(seedBrandFromScan(scan), edits) : null,
    varOverrides: edits?.vars ?? {},
    colorEdits: edits?.colors ?? {},
    locks: edits?.locks ?? [],
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
  updateSession({ scan, config, varOverrides: edits?.vars ?? {}, colorEdits: edits?.colors ?? {}, locks: edits?.locks ?? [] });
}

/** Everything decided against this site, as the store keeps it. */
function currentEdits(): { key: string; edits: BrandEdits } | null {
  const { scan, config, varOverrides, colorEdits, locks } = state;
  if (!scan) return null;
  const seeded = seedBrandFromScan(scan);
  return {
    key: keyFor(scan.url),
    edits: { ...diffEdits(seeded, config ?? seeded), vars: varOverrides, colors: colorEdits, locks },
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
