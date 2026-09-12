/**
 * What the bridge knows about each connected panel.
 *
 * A session is one panel tab that said hello. It pushes full `SessionState`
 * snapshots; we keep the latest, answer tools from it, and wake `watch` callers
 * when the revision moves. Requests to the extension are correlated by
 * envelope id. The socket is hidden behind `Link` so this file needs no `ws`.
 */

import { randomUUID } from 'node:crypto';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import type { BridgeRequest, Envelope, SessionState } from '../../../shared/protocol';

export interface Link {
  send(envelope: Envelope): void;
}

export interface SessionSummary {
  sessionId: string;
  url: string | null;
  title: string | null;
  local: boolean | null;
  revision: number | null;
  connected: boolean;
  /** Tokens the person locked on this page; the rules resource says the same in words. */
  locks: string[];
}

export interface WatchResult {
  revision: number;
  timedOut: boolean;
}

interface Waiter {
  since: number;
  timer: NodeJS.Timeout;
  resolve(result: WatchResult): void;
  reject(err: Error): void;
}

interface Pending {
  timer: NodeJS.Timeout;
  resolve(payload: unknown): void;
  reject(err: Error): void;
}

export interface Session {
  id: string;
  link: Link | null;
  state: SessionState | null;
  waiters: Set<Waiter>;
  pending: Map<string, Pending>;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class Sessions {
  private readonly byId = new Map<string, Session>();
  /** The session that most recently pushed state. */
  private currentId: string | null = null;

  connect(id: string, link: Link): Session {
    let session = this.byId.get(id);
    if (!session) {
      session = { id, link, state: null, waiters: new Set(), pending: new Map() };
      this.byId.set(id, session);
    } else {
      session.link = link;
    }
    if (!this.currentId) this.currentId = id;
    return session;
  }

  /** Marks the session gone. `link` guards against a stale socket closing a fresh one. */
  disconnect(id: string, link?: Link): void {
    const session = this.byId.get(id);
    if (!session || (link && session.link !== link)) return;
    session.link = null;
    const gone = new Error(`session ${id} disconnected`);
    for (const p of session.pending.values()) {
      clearTimeout(p.timer);
      p.reject(gone);
    }
    session.pending.clear();
    for (const w of session.waiters) {
      clearTimeout(w.timer);
      w.reject(gone);
    }
    session.waiters.clear();
  }

  update(id: string, state: SessionState): void {
    const session = this.byId.get(id);
    if (!session) return;
    session.state = state;
    this.currentId = id;
    for (const w of session.waiters) {
      if (state.revision > w.since) {
        clearTimeout(w.timer);
        session.waiters.delete(w);
        w.resolve({ revision: state.revision, timedOut: false });
      }
    }
  }

  /** The named session, or the current one. Throws a message meant for the agent. */
  get(id?: string): Session {
    const key = id ?? this.currentId;
    if (!key) throw new Error('no panel is connected; open the codename panel on a tab and pair it with this bridge');
    const session = this.byId.get(key);
    if (!session) throw new Error(`unknown session "${key}"; call list_sessions`);
    return session;
  }

  /** Like `get`, but insists the panel has pushed at least one snapshot. */
  getState(id?: string): SessionState {
    const session = this.get(id);
    if (!session.state) throw new Error(`session "${session.id}" has not sent any state yet`);
    return session.state;
  }

  current(): Session | null {
    return this.currentId ? (this.byId.get(this.currentId) ?? null) : null;
  }

  list(): SessionSummary[] {
    return [...this.byId.values()].map((s) => ({
      sessionId: s.id,
      url: s.state?.tab.url ?? null,
      title: s.state?.tab.title ?? null,
      local: s.state?.tab.local ?? null,
      revision: s.state?.revision ?? null,
      connected: s.link !== null,
      locks: s.state?.locks ?? [],
    }));
  }

  /** Resolves once the session's revision exceeds `since`, or with `timedOut` after `timeoutMs`. */
  waitFor(id: string | undefined, since: number, timeoutMs: number): Promise<WatchResult> {
    const session = this.get(id);
    const revision = session.state?.revision ?? -1;
    if (revision > since) return Promise.resolve({ revision, timedOut: false });
    if (!session.link) return Promise.reject(new Error(`session ${session.id} disconnected`));
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        since,
        resolve,
        reject,
        timer: setTimeout(() => {
          session.waiters.delete(waiter);
          resolve({ revision: session.state?.revision ?? -1, timedOut: true });
        }, timeoutMs),
      };
      session.waiters.add(waiter);
    });
  }

  sendRequest(id: string | undefined, request: BridgeRequest, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<unknown> {
    const session = this.get(id);
    const link = session.link;
    if (!link) return Promise.reject(new Error(`session ${session.id} is not connected`));
    const envelope: Envelope<BridgeRequest> = { v: PROTOCOL_VERSION, id: randomUUID(), type: 'request', payload: request };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(envelope.id);
        reject(new Error(`the panel did not answer "${request.method}" within ${timeoutMs}ms`));
      }, timeoutMs);
      session.pending.set(envelope.id, { timer, resolve, reject });
      try {
        link.send(envelope);
      } catch (err) {
        clearTimeout(timer);
        session.pending.delete(envelope.id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Routes a `response` envelope to whoever is waiting on `replyTo`. */
  handleResponse(id: string, envelope: Envelope): boolean {
    const session = this.byId.get(id);
    const pending = envelope.replyTo ? session?.pending.get(envelope.replyTo) : undefined;
    if (!session || !pending || !envelope.replyTo) return false;
    clearTimeout(pending.timer);
    session.pending.delete(envelope.replyTo);
    if (envelope.ok === false) pending.reject(new Error(envelope.error ?? 'the panel refused the request'));
    else pending.resolve(envelope.payload);
    return true;
  }
}
