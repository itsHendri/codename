/**
 * The socket the extension talks to.
 *
 * Bound to loopback, gated by Origin and by the pairing token in the first
 * frame. Only the envelope is validated here; payload shapes belong to the
 * extension (see shared/protocol.ts).
 *
 * The first extension to pair is remembered, and after that it is the only
 * one the door opens for — which is also what lets a later panel ask for the
 * code instead of the person typing it.
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
  probe: z.boolean().optional(),
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
  /** Called the first time an extension pairs, so the id can be remembered. */
  onPin?: (extensionId: string) => void;
  /** The folder the bridge is running in, read fresh for each hello. */
  project?: () => ProjectInfo | undefined;
  /** Answers what the panel asks; absent means "nothing to ask". */
  onAsk?: (sessionId: string, request: PanelRequest) => Promise<unknown>;
  /** Called with each state snapshot, after it is stored. */
  onState?: (sessionId: string, state: SessionState, link: Link) => void;
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
export { TOO_MANY };

/** The extension id in a `chrome-extension://abc…` origin, or null. */
export function extensionIdOf(origin: string | undefined): string | null {
  if (!origin?.startsWith('chrome-extension://')) return null;
  const id = origin.slice('chrome-extension://'.length).replace(/\/$/, '');
  return /^[a-p]{32}$/.test(id) ? id : (id || null);
}

export function originAllowed(
  origin: string | undefined,
  allowNoOrigin: boolean,
  devOrigins: string[] = [],
  pinned?: string,
): boolean {
  if (origin === undefined) return allowNoOrigin;
  if (devOrigins.includes(origin)) return true;
  const id = extensionIdOf(origin);
  if (id === null) return false;
  // Before a pin, any extension may try; the token is still the gate. After
  // one, this bridge belongs to that extension.
  return pinned === undefined || id === pinned;
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
  const limiter = new Limiter(now);

  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port: opts.port,
      verifyClient: ({ req }: { req: IncomingMessage }) =>
        originAllowed(req.headers.origin, allowNoOrigin, devOrigins, pinned),
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
          if (!limiter.allowed()) {
            ws.close(TOO_MANY, 'too many attempts');
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

          // A probe is "is a bridge here for me?" rather than an offer of a
          // code. Only the extension already pinned gets an answer.
          const probing = hello.data.probe === true;
          const known = originId !== null && pinned !== undefined && originId === pinned;
          const accepted = idMismatch ? false : probing ? known : hello.data.token === token;

          if (!accepted) {
            // A probe from an unknown extension is not a guess at the code, so
            // it does not count against the limiter.
            if (!probing && limiter.fail()) log('too many wrong pairing codes; refusing hellos for five minutes');
            ws.close(probing ? UNAUTHORIZED : limiter.allowed() ? UNAUTHORIZED : TOO_MANY, 'unauthorized');
            return;
          }

          limiter.succeed();
          sessionId = hello.data.sessionId;
          if (pinned === undefined && originId !== null) {
            pinned = originId;
            opts.onPin?.(originId);
            log(`paired with extension ${originId}; later panels from it pair themselves`);
          }
          sessions.connect(sessionId, link);
          const ack: HelloAck = {
            bridgeVersion,
            ...(opts.project ? { project: opts.project() } : {}),
            // The probe asked for the code, and it is the pinned extension asking.
            ...(probing ? { token } : {}),
          };
          link.send({
            v: PROTOCOL_VERSION,
            id: `ack-${envelope.data!.id}`,
            type: 'response',
            replyTo: envelope.data!.id,
            ok: true,
            payload: ack,
          });
          log(
            `session ${sessionId} ${probing ? 'paired itself' : 'paired'} (extension ${hello.data.extensionVersion ?? '?'})`,
          );
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
          log(`session ${sessionId} disconnected`);
        }
      });
      ws.on('error', (err) => log(`session ${sessionId ?? '?'}: ${err.message}`));
    };
  });
}
