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
import type { PinnedElement, ScanResult } from '@/shared/types';
import type { Comment, CommentStatus, SessionState } from '@/shared/protocol';
import type { CommentTarget } from '@/studio/annotations';
import type { BrandConfig, Mode } from '@/studio/engine/types';
import { isLocal } from '@/studio/commit';
import { emptyLog, type ChangeLog } from '@/studio/changes';
import { applyEdits, diffEdits, type BrandEdits } from '@/studio/edits';
import { loadEdits, saveEdits } from '@/studio/storage';
import { seedBrandFromScan } from '@/studio/seedFromScan';

export interface TabSession {
  scan: ScanResult | null;
  /** The edited system; null means "as scanned". */
  config: BrandConfig | null;
  mode: Mode;
  /** Whether edits repaint the page. */
  live: boolean;
  /** The panel tab showing, kept so a reopen lands where you were. */
  activeTab: string;
  /** The page's own variables set by hand: name → value. */
  varOverrides: Record<string, string>;
  /** Observed colours set by hand: old hex (upper case) → new hex. */
  colorEdits: Record<string, string>;
  pinned: PinnedElement | null;
  /**
   * Moves on intent — a hand-off, a comment, a pin — never on a drag tick.
   * The bridge's `watch` tool resolves when it does.
   */
  revision: number;
  /** What was pressed "Send to agent" on, until the agent or the user clears it. */
  handoff: SessionState['handoff'];
  /** Whether the agent may paint on this page. Defaults on for localhost. */
  agentMayWrite: boolean;
  comments: Comment[];
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
  live: true,
  activeTab: 'layers',
  varOverrides: {},
  colorEdits: {},
  pinned: null,
  revision: 0,
  handoff: null,
  agentMayWrite: false,
  comments: [],
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
    void chrome.storage.session.set({ [key(id)]: rest satisfies Persisted });
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
  tabId = id;
  const raw = await chrome.storage.session.get(key(id));
  const stored = raw[key(id)] as Partial<Persisted> | undefined;
  const keep = stored?.scan && sameOrigin(stored.scan.url, url);
  const samePage = keep && stored.logUrl === pageKey(url);
  state = keep
    ? {
        ...EMPTY,
        agentMayWrite: isLocal(url),
        ...stored,
        pinned: null,
        log: samePage ? (stored.log ?? emptyLog()) : emptyLog(),
        logUrl: pageKey(url),
        generation: state.generation + 1,
      }
    : { ...EMPTY, agentMayWrite: isLocal(url), logUrl: pageKey(url), generation: state.generation + 1 };
  emit();
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
 * A new scan is a new reading of the page. The decisions made against this
 * site are laid back over it, so a seed you moved stays moved while
 * everything else is observed afresh.
 */
export async function setScan(scan: ScanResult) {
  const edits = await loadEdits(originOf(scan.url)).catch(() => null);
  const config = edits ? applyEdits(seedBrandFromScan(scan), edits) : null;
  updateSession({ scan, config, varOverrides: edits?.vars ?? {}, colorEdits: edits?.colors ?? {} });
}

/** Everything decided against this site, as the store keeps it. */
function currentEdits(): { origin: string; edits: BrandEdits } | null {
  const { scan, config, varOverrides, colorEdits } = state;
  if (!scan) return null;
  const seeded = seedBrandFromScan(scan);
  return {
    origin: originOf(scan.url),
    edits: { ...diffEdits(seeded, config ?? seeded), vars: varOverrides, colors: colorEdits },
  };
}

/** Coalesced like the session itself: a colour picker fires per frame. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSaveEdits() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const current = currentEdits();
    if (current) void saveEdits(current.origin, current.edits).catch(() => {});
  }, 300);
}

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
  updateSession({ mode });
}
