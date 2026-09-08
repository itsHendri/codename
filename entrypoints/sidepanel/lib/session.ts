/**
 * What the panel knows about the tab it is scoped to, kept outside any one
 * tab's component tree.
 *
 * The Design tab used to hold the edited system in its own state, so switching
 * to Inspect unmounted it, dropped the edit and cleared the re-skin. An edit is
 * a fact about the page, not about which tab is showing, so it lives here and
 * is mirrored to `chrome.storage.session` under the tab id — session storage
 * because a scan is a reading of one document and should not outlive the
 * browser session.
 */

import { useSyncExternalStore } from 'react';
import type { PinnedElement, ScanResult } from '@/shared/types';
import type { BrandConfig, Mode } from '@/studio/engine/types';

export interface TabSession {
  scan: ScanResult | null;
  /** The edited system; null means "as scanned". */
  config: BrandConfig | null;
  mode: Mode;
  /** Whether edits repaint the page. */
  live: boolean;
  pinned: PinnedElement | null;
}

/** The part of a session that is worth keeping across a panel reopen. */
type Persisted = Omit<TabSession, 'pinned'>;

const EMPTY: TabSession = { scan: null, config: null, mode: 'light', live: true, pinned: null };
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
    const { pinned: _pinned, ...rest } = state;
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
  state =
    stored?.scan && sameOrigin(stored.scan.url, url)
      ? { ...EMPTY, ...stored, pinned: null }
      : EMPTY;
  emit();
}

/** A new scan is a new reading of the page: edits against the old one go. */
export function setScan(scan: ScanResult) {
  updateSession({ scan, config: null });
}
