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

import { PROTOCOL_VERSION } from '../../../shared/protocol';
import type { DefinitionsPayload, Envelope, SessionState } from '../../../shared/protocol';
import { findDefinitions } from './definitions';
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

export function forget(sessionId: string): void {
  lastSent.delete(sessionId);
}

export interface PushOptions {
  find?: typeof findDefinitions;
}

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
    lastSent.delete(sessionId);
    return false;
  }
  return true;
}
