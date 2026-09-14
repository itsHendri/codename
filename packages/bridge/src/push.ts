/**
 * Telling the panel where its tokens live.
 *
 * The panel writes the brief, so the positions have to reach it rather than
 * being stitched on at `get_changes` time — that way the person reads the
 * same fact the agent does, and the copied brief carries it too.
 *
 * Sent only when the set of names has actually changed, because a state frame
 * arrives on every edit and searching on each one would be both wasteful and
 * a loop: the panel's reply is another state frame.
 */

import { watch as watchFile, type FSWatcher } from 'node:fs';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import type { DefinitionsPayload, Envelope, SessionState } from '../../../shared/protocol';
import { findDefinitions } from './definitions';
import { resolveInside } from './repo';
import type { Link } from './sessions';

/** Every custom property a change set mentions, as a token or behind an element edit. */
export function namesIn(state: SessionState): string[] {
  const names = new Set<string>();
  const changes = state.changes;
  if (changes) {
    for (const token of changes.tokens ?? []) names.add(token.name);
    for (const edit of changes.elements ?? []) {
      if (edit.token) names.add(edit.token);
      if (edit.couldBe) names.add(edit.couldBe);
    }
  }
  for (const lock of state.locks ?? []) names.add(lock);
  return [...names].filter((n) => n.startsWith('--')).sort();
}

/** What was last sent to each session, so an unchanged set is not searched again. */
const lastSent = new Map<string, string>();

/**
 * The files each session's definitions were found in, watched.
 *
 * A position is a line number, and a line number is only true until someone
 * edits the file — which is exactly what the agent is about to do. Searching
 * again only when the names changed left the brief stating a line that had
 * moved, and Apply refusing with nothing to show the person why. So the files
 * that answered are watched, and a change to any of them searches again.
 */
const watching = new Map<string, { watchers: FSWatcher[]; timer: ReturnType<typeof setTimeout> | null }>();

function unwatch(sessionId: string): void {
  const w = watching.get(sessionId);
  if (!w) return;
  if (w.timer) clearTimeout(w.timer);
  for (const watcher of w.watchers) watcher.close();
  watching.delete(sessionId);
}

export function forget(sessionId: string): void {
  lastSent.delete(sessionId);
  unwatch(sessionId);
}

export interface PushOptions {
  find?: typeof findDefinitions;
  /** How files are watched; tests pass one they can fire by hand. */
  watch?: (path: string, onChange: () => void) => FSWatcher | null;
  /** How long a burst of saves is let settle before searching again. */
  settleMs?: number;
}

const defaultWatch = (path: string, onChange: () => void): FSWatcher | null => {
  try {
    const w = watchFile(path, { persistent: false }, onChange);
    w.on('error', () => w.close());
    return w;
  } catch {
    return null;
  }
};

/** Searches for the names in a snapshot and pushes the result, when the set is new. */
export function pushDefinitions(
  cwd: string,
  sessionId: string,
  state: SessionState,
  link: Link,
  opts: PushOptions = {},
): boolean {
  const names = namesIn(state);
  const key = names.join(',');
  if (lastSent.get(sessionId) === key) return false;
  lastSent.set(sessionId, key);
  if (!names.length) return false;

  return searchAndSend(cwd, sessionId, names, link, opts);
}

function searchAndSend(cwd: string, sessionId: string, names: string[], link: Link, opts: PushOptions): boolean {
  const payload: DefinitionsPayload = (opts.find ?? findDefinitions)(cwd, names);
  const envelope: Envelope<DefinitionsPayload> = {
    v: PROTOCOL_VERSION,
    id: `defs-${Date.now()}`,
    type: 'definitions',
    payload,
  };
  try {
    link.send(envelope);
  } catch {
    // A socket that closed between the state frame and here is not worth
    // reporting; the next hello starts over.
    forget(sessionId);
    return false;
  }

  // Watch what answered, so the positions just sent stay true.
  unwatch(sessionId);
  const files = new Set(Object.values(payload.found).flatMap((defs) => defs.map((d) => d.file)));
  const entry: { watchers: FSWatcher[]; timer: ReturnType<typeof setTimeout> | null } = { watchers: [], timer: null };
  const onChange = () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      // Still the set this session is showing, or a newer push owns it.
      if (watching.get(sessionId) !== entry || lastSent.get(sessionId) !== names.join(',')) return;
      searchAndSend(cwd, sessionId, names, link, opts);
    }, opts.settleMs ?? 250);
  };
  for (const file of files) {
    const absolute = resolveInside(cwd, file);
    if (!absolute) continue;
    const w = (opts.watch ?? defaultWatch)(absolute, onChange);
    if (w) entry.watchers.push(w);
  }
  if (entry.watchers.length) watching.set(sessionId, entry);
  return true;
}
