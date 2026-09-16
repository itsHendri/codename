/**
 * The socket the extension talks to.
 *
 * Bound to loopback, gated by Origin and by the pairing token in the first
 * frame. Only the envelope is validated here; payload shapes belong to the
 * extension (see shared/protocol.ts).
 *
 * The first extension to pair is remembered, and after that it is the only
 * one the door opens for. That narrows who may try; it is not itself
 * authentication, because an Origin header is only trustworthy from a real
 * browser. The pairing code stays the gate, and is never given out.
 */

import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import type { Envelope, HelloAck, PanelRequest, ProjectInfo, SessionState } from '../../../shared/protocol';
import { Limiter, TOO_MANY } from './limiter';
import type { Link, Sessions } from './sessions';

export const envelopeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  id: z.string().min(1),
  type: z.string().min(1),
  replyTo: z.string().optional(),
  ok: z.boolean().optional(),
  error: z.string().optional(),
  payload: z.unknown().optional(),
});

const helloSchema = z.object({
  token: z.string(),
  extensionVersion: z.string().optional(),
  sessionId: z.string().min(1),
  extensionId: z.string().optional(),
});

/** Just enough of SessionState to key and watch it; the rest passes through. */
const stateSchema = z.looseObject({ sessionId: z.string(), revision: z.number() });

export interface ServerOptions {
  port: number;
  token: string;
  sessions: Sessions;
  /** Accept sockets with no Origin header (plain `ws` clients, the smoke script). */
  allowNoOrigin?: boolean;
  /** Extra page origins to accept, for the panel harness during development. */
  devOrigins?: string[];
  /** The extension this bridge has paired with before, if any. */
  pinnedExtensionId?: string;
  /**
   * Reads the pin afresh for each hello, so `codename-bridge unpin` reaches a
   * bridge that is already running. Falls back to `pinnedExtensionId`.
   */
  readPin?: () => string | undefined;
  /** Called the first time an extension pairs, so the id can be remembered. */
  onPin?: (extensionId: string) => void;
  /** The folder the bridge is running in, read fresh for each hello. */
  project?: () => ProjectInfo | undefined;
  /** Answers what the panel asks; absent means "nothing to ask". */
  onAsk?: (sessionId: string, request: PanelRequest) => Promise<unknown>;
  /** Called with each state snapshot, after it is stored. */
  onState?: (sessionId: string, state: SessionState, link: Link) => void;
  /** Called when a session's socket closes, so per-session caches can be dropped. */
  onGone?: (sessionId: string) => void;
  bridgeVersion?: string;
  pingIntervalMs?: number;
  now?: () => number;
  log?: (line: string) => void;
}

export interface BridgeServer {
  port: number;
  close(): Promise<void>;
}

export const UNAUTHORIZED = 4401;
/**
 * The socket came from a different copy of the extension than the one this
 * bridge paired with. Its own code, rather than a refused upgrade, because a
 * refused upgrade reaches the panel as a bare 1006 and it would retry forever
 * with nothing on screen — which is what happened to anyone who paired a dev
 * build and then installed the store one.
 */
export const OTHER_EXTENSION = 4403;
export { TOO_MANY };

/** The extension id in a `chrome-extension://abc…` origin, or null. */
export function extensionIdOf(origin: string | undefined): string | null {
  if (!origin?.startsWith('chrome-extension://')) return null;
  const id = origin.slice('chrome-extension://'.length).replace(/\/$/, '');
  return /^[a-p]{32}$/.test(id) ? id : (id || null);
}

/**
 * Whether a socket may open at all: an extension, a named dev origin, or no
 * origin when that was asked for. Which extension is decided after the hello,
 * where it can be answered in words.
 */
export function originAllowed(origin: string | undefined, allowNoOrigin: boolean, devOrigins: string[] = []): boolean {
  if (origin === undefined) return allowNoOrigin;
  if (devOrigins.includes(origin)) return true;
  return extensionIdOf(origin) !== null;
}

export function startServer(opts: ServerOptions): Promise<BridgeServer> {
  const {
    token,
    sessions,
    allowNoOrigin = false,
    devOrigins = [],
    pingIntervalMs = 20_000,
    bridgeVersion = '0',
    now = Date.now,
    log = () => {},
  } = opts;
  let pinned = opts.pinnedExtensionId;
  const currentPin = () => (opts.readPin ? opts.readPin() : pinned);
  const limiter = new Limiter(now);

  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port: opts.port,
      verifyClient: ({ req }: { req: IncomingMessage }) => originAllowed(req.headers.origin, allowNoOrigin, devOrigins),
    });

    wss.once('error', reject);
    wss.once('listening', () => {
      wss.off('error', reject);
      wss.on('error', (err) => log(`socket error: ${err.message}`));
      const address = wss.address();
      const port = typeof address === 'object' && address ? address.port : opts.port;

      const ping = setInterval(() => {
        for (const ws of wss.clients) {
          if (!alive.get(ws)) {
            ws.terminate();
            continue;
          }
          alive.set(ws, false);
          ws.ping();
        }
      }, pingIntervalMs);

      wss.on('connection', (ws, req) => attach(ws, req));

      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(ping);
            for (const ws of wss.clients) ws.close(1001, 'bridge shutting down');
            wss.close(() => done());
          }),
      });
    });

    const alive = new WeakMap<WebSocket, boolean>();

    const attach = (ws: WebSocket, req: IncomingMessage) => {
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));

      const originId = extensionIdOf(req.headers.origin);
      let sessionId: string | null = null;
      const link: Link = { send: (envelope: Envelope) => ws.send(JSON.stringify(envelope)) };

      ws.on('message', (data) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          parsed = undefined;
        }
        const envelope = envelopeSchema.safeParse(parsed);

        if (!sessionId) {
          // Another copy of the extension is told so before its code is even
          // looked at: it is not a guess, and answering "wrong code" would be
          // both untrue and a way to test codes.
          const pin = currentPin();
          if (pin !== undefined && originId !== null && originId !== pin) {
            ws.close(OTHER_EXTENSION, 'paired with another copy of the extension');
            return;
          }
          if (!limiter.allowed()) {
            // Said with how long, so a panel that holds the right code can come
            // back on its own instead of sitting locked out after the door opens.
            ws.close(TOO_MANY, `retry-after:${limiter.retryAfterMs()}`);
            return;
          }
          const hello = envelope.success && envelope.data.type === 'hello' ? helloSchema.safeParse(envelope.data.payload) : null;
          if (!hello?.success) {
            ws.close(UNAUTHORIZED, 'unauthorized');
            return;
          }
          // An extension that claims an id must be the one the socket came
          // from; a page origin (the harness) claims none.
          const claimed = hello.data.extensionId;
          const idMismatch = claimed !== undefined && originId !== null && claimed !== originId;

          if (idMismatch || hello.data.token !== token) {
            if (limiter.fail()) log('too many wrong pairing codes; refusing hellos for five minutes');
            if (limiter.allowed()) ws.close(UNAUTHORIZED, 'unauthorized');
            else ws.close(TOO_MANY, `retry-after:${limiter.retryAfterMs()}`);
            return;
          }

          limiter.succeed();
          sessionId = hello.data.sessionId;
          if (currentPin() === undefined && originId !== null) {
            pinned = originId;
            opts.onPin?.(originId);
            log(`paired with extension ${originId}; later panels from it pair themselves`);
          }
          sessions.connect(sessionId, link);
          const ack: HelloAck = {
            bridgeVersion,
            ...(opts.project ? { project: opts.project() } : {}),
          };
          link.send({
            v: PROTOCOL_VERSION,
            id: `ack-${envelope.data!.id}`,
            type: 'response',
            replyTo: envelope.data!.id,
            ok: true,
            payload: ack,
          });
          log(`session ${sessionId} paired (extension ${hello.data.extensionVersion ?? '?'})`);
          return;
        }

        if (!envelope.success) {
          log(`session ${sessionId}: dropped a malformed frame`);
          return;
        }
        const msg = envelope.data;
        if (msg.type === 'state') {
          const state = stateSchema.safeParse(msg.payload);
          if (state.success) {
            const full = state.data as unknown as SessionState;
            sessions.update(sessionId, full);
            opts.onState?.(sessionId, full, link);
          } else log(`session ${sessionId}: dropped a state frame without sessionId/revision`);
        } else if (msg.type === 'response') {
          if (!sessions.handleResponse(sessionId, msg)) log(`session ${sessionId}: response to unknown request ${msg.replyTo}`);
        } else if (msg.type === 'ask') {
          const id = sessionId;
          const answer = (ok: boolean, payload?: unknown, error?: string) =>
            link.send({ v: PROTOCOL_VERSION, id: `ans-${msg.id}`, type: 'response', replyTo: msg.id, ok, payload, error });
          if (!opts.onAsk) {
            answer(false, undefined, 'this bridge cannot answer panel requests');
            return;
          }
          void opts
            .onAsk(id, msg.payload as PanelRequest)
            .then((payload) => answer(true, payload))
            .catch((err: unknown) => answer(false, undefined, err instanceof Error ? err.message : String(err)));
        } else {
          log(`session ${sessionId}: ignored frame of type "${msg.type}"`);
        }
      });

      ws.on('close', () => {
        if (sessionId) {
          sessions.disconnect(sessionId, link);
          opts.onGone?.(sessionId);
          log(`session ${sessionId} disconnected`);
        }
      });
      ws.on('error', (err) => log(`session ${sessionId ?? '?'}: ${err.message}`));
    };
  });
}
