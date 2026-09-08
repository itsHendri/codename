/**
 * The socket the extension talks to.
 *
 * Bound to loopback, gated by Origin and by the pairing token in the first
 * frame. Only the envelope is validated here; payload shapes belong to the
 * extension (see shared/protocol.ts).
 */

import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import type { Envelope, SessionState } from '../../../shared/protocol';
import type { Sessions } from './sessions';

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
  pingIntervalMs?: number;
  log?: (line: string) => void;
}

export interface BridgeServer {
  port: number;
  close(): Promise<void>;
}

export const UNAUTHORIZED = 4401;

export function originAllowed(origin: string | undefined, allowNoOrigin: boolean, devOrigins: string[] = []): boolean {
  if (origin === undefined) return allowNoOrigin;
  return origin.startsWith('chrome-extension://') || devOrigins.includes(origin);
}

export function startServer(opts: ServerOptions): Promise<BridgeServer> {
  const { token, sessions, allowNoOrigin = false, devOrigins = [], pingIntervalMs = 20_000, log = () => {} } = opts;

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

      wss.on('connection', (ws) => attach(ws));

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

    const attach = (ws: WebSocket) => {
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));

      let sessionId: string | null = null;
      const link = { send: (envelope: Envelope) => ws.send(JSON.stringify(envelope)) };

      ws.on('message', (data) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          parsed = undefined;
        }
        const envelope = envelopeSchema.safeParse(parsed);

        if (!sessionId) {
          const hello = envelope.success && envelope.data.type === 'hello' ? helloSchema.safeParse(envelope.data.payload) : null;
          if (!hello?.success || hello.data.token !== token) {
            ws.close(UNAUTHORIZED, 'unauthorized');
            return;
          }
          sessionId = hello.data.sessionId;
          sessions.connect(sessionId, link);
          link.send({ v: PROTOCOL_VERSION, id: `ack-${envelope.data!.id}`, type: 'response', replyTo: envelope.data!.id, ok: true });
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
          if (state.success) sessions.update(sessionId, state.data as unknown as SessionState);
          else log(`session ${sessionId}: dropped a state frame without sessionId/revision`);
        } else if (msg.type === 'response') {
          if (!sessions.handleResponse(sessionId, msg)) log(`session ${sessionId}: response to unknown request ${msg.replyTo}`);
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
