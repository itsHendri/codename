import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { Envelope } from '../../../shared/protocol';
import { Sessions } from './sessions';
import { makeState } from './test-helpers';
import { envelopeSchema, originAllowed, startServer, UNAUTHORIZED, type BridgeServer } from './ws';

describe('envelopeSchema', () => {
  it('accepts a valid envelope', () => {
    const env = { v: 1, id: 'x', type: 'state', payload: { anything: true } };
    expect(envelopeSchema.safeParse(env).success).toBe(true);
    expect(envelopeSchema.safeParse({ v: 1, id: 'x', type: 'response', replyTo: 'y', ok: false, error: 'no' }).success).toBe(true);
  });

  it.each([
    ['missing v', { id: 'x', type: 'hello' }],
    ['wrong v', { v: 2, id: 'x', type: 'hello' }],
    ['missing id', { v: 1, type: 'hello' }],
    ['missing type', { v: 1, id: 'x' }],
    ['not an object', 'hello'],
  ])('rejects %s', (_, env) => {
    expect(envelopeSchema.safeParse(env).success).toBe(false);
  });
});

describe('originAllowed', () => {
  it('admits extensions, refuses web pages, and gates the absent origin', () => {
    expect(originAllowed('chrome-extension://abc', false)).toBe(true);
    expect(originAllowed('http://localhost:3000', true)).toBe(false);
    expect(originAllowed('https://evil.example', true)).toBe(false);
    expect(originAllowed(undefined, false)).toBe(false);
    expect(originAllowed(undefined, true)).toBe(true);
  });
});

describe('bridge socket', () => {
  const TOKEN = 'K7M4XQ';
  let server: BridgeServer;
  let sessions: Sessions;

  beforeEach(async () => {
    sessions = new Sessions();
    server = await startServer({ port: 0, token: TOKEN, sessions, allowNoOrigin: true });
  });
  afterEach(() => server.close());

  const connect = (headers?: Record<string, string>) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers });
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  const closed = (ws: WebSocket) => new Promise<{ code: number; reason: string }>((r) => ws.once('close', (code, reason) => r({ code, reason: reason.toString() })));
  const next = (ws: WebSocket) => new Promise<Envelope>((r) => ws.once('message', (d) => r(JSON.parse(d.toString()))));
  const hello = (ws: WebSocket, token: string, sessionId = 's1') =>
    ws.send(JSON.stringify({ v: 1, id: 'h1', type: 'hello', payload: { token, extensionVersion: '0.1.0', sessionId } }));

  it('rejects a browser-page origin at the handshake', async () => {
    await expect(connect({ origin: 'http://localhost:3000' })).rejects.toThrow();
  });

  it('closes with 4401 when the first frame lacks the token', async () => {
    const ws = await connect();
    hello(ws, 'WRONG1');
    await expect(closed(ws)).resolves.toEqual({ code: UNAUTHORIZED, reason: 'unauthorized' });
    expect(sessions.list()).toEqual([]);
  });

  it('closes with 4401 when the first frame is not a hello', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ v: 1, id: 'x', type: 'state', payload: makeState('s1', 1) }));
    await expect(closed(ws)).resolves.toMatchObject({ code: UNAUTHORIZED });
  });

  it('pairs, takes state, and round-trips a request', async () => {
    const ws = await connect();
    const ack = next(ws);
    hello(ws, TOKEN);
    await expect(ack).resolves.toMatchObject({ type: 'response', replyTo: 'h1', ok: true });
    expect(sessions.list()).toMatchObject([{ sessionId: 's1', connected: true, revision: null }]);

    const changed = sessions.waitFor('s1', -1, 2000);
    ws.send(JSON.stringify({ v: 1, id: 'st1', type: 'state', payload: makeState('s1', 7) }));
    await expect(changed).resolves.toEqual({ revision: 7, timedOut: false });
    expect(sessions.getState().tab.url).toBe('http://localhost:3000/s1');

    const incoming = next(ws);
    const reply = sessions.sendRequest('s1', { method: 'screenshot' }, 2000);
    const request = await incoming;
    expect(request).toMatchObject({ v: 1, type: 'request', payload: { method: 'screenshot' } });
    ws.send(JSON.stringify({ v: 1, id: 'r1', type: 'response', replyTo: request.id, ok: true, payload: { png: 'AAAA', width: 2, height: 1 } }));
    await expect(reply).resolves.toEqual({ png: 'AAAA', width: 2, height: 1 });

    const gone = closed(ws);
    ws.close();
    await gone;
    await new Promise((r) => setTimeout(r, 20));
    expect(sessions.list()[0]?.connected).toBe(false);
  });
});
