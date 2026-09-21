import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { Envelope } from '../../../shared/protocol';
import { Sessions } from './sessions';
import { makeState } from './test-helpers';
import { envelopeSchema, extensionIdOf, originAllowed, OTHER_EXTENSION, startServer, TOO_MANY, UNAUTHORIZED, type BridgeServer } from './ws';

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

  it('opens the socket to any extension, and to a dev origin named explicitly', () => {
    // Which extension is decided after the hello, where it can be answered in
    // words rather than as a refused upgrade the panel cannot read.
    expect(originAllowed('chrome-extension://other', false)).toBe(true);
    expect(originAllowed('http://localhost:5320', false, ['http://localhost:5320'])).toBe(true);
  });

  it('reads the id out of an origin', () => {
    expect(extensionIdOf('chrome-extension://abc/')).toBe('abc');
    expect(extensionIdOf('http://localhost:3000')).toBe(null);
    expect(extensionIdOf(undefined)).toBe(null);
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

describe('pairing: the pin, the limiter and the probe', () => {
  const TOKEN = 'K7M4XQ';
  const EXT = 'chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh';
  const ID = 'aaaabbbbccccddddeeeeffffgggghhhh';
  let server: BridgeServer;
  let sessions: Sessions;
  let pinned: string | undefined;
  let clock: number;

  const start = (opts: Partial<Parameters<typeof startServer>[0]> = {}) =>
    startServer({
      port: 0,
      token: TOKEN,
      sessions,
      now: () => clock,
      onPin: (id) => (pinned = id),
      project: () => ({ path: '/repo', name: 'codename', branch: 'main', dirty: false }),
      bridgeVersion: '9.9.9',
      ...opts,
    });

  beforeEach(() => {
    sessions = new Sessions();
    pinned = undefined;
    clock = 1_000;
  });
  afterEach(() => server?.close());

  const connect = (origin = EXT) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers: { origin } });
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  const closed = (ws: WebSocket) => new Promise<number>((r) => ws.once('close', (code) => r(code)));
  const next = (ws: WebSocket) => new Promise<Envelope>((r) => ws.once('message', (d) => r(JSON.parse(d.toString()))));
  const hello = (ws: WebSocket, payload: Record<string, unknown>, id = 'h1') =>
    ws.send(JSON.stringify({ v: 1, id, type: 'hello', payload: { extensionVersion: '0.1.0', sessionId: 's1', ...payload } }));

  it('answers a good hello with the bridge version and the project', async () => {
    server = await start();
    const ws = await connect();
    const ack = next(ws);
    hello(ws, { token: TOKEN, extensionId: ID });
    await expect(ack).resolves.toMatchObject({
      ok: true,
      payload: { bridgeVersion: '9.9.9', project: { name: 'codename', branch: 'main' } },
    });
    expect(pinned).toBe(ID);
    ws.close();
  });

  it('tells a second copy of the extension so, in a code the panel can show', async () => {
    server = await start({ pinnedExtensionId: ID });
    const ws = await connect('chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
    // Even with the right code: it is not a guess, and it must not be a way to test codes.
    hello(ws, { token: TOKEN });
    await expect(closed(ws)).resolves.toBe(OTHER_EXTENSION);
    expect(sessions.list()).toEqual([]);
  });

  it('does not count another copy of the extension against the limiter', async () => {
    server = await start({ pinnedExtensionId: ID });
    for (let i = 0; i < 6; i++) {
      const ws = await connect('chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
      hello(ws, { token: 'WRONG1' });
      await closed(ws);
    }
    const ours = await connect();
    const ack = next(ours);
    hello(ours, { token: TOKEN, extensionId: ID });
    await expect(ack).resolves.toMatchObject({ ok: true });
    ours.close();
  });

  it('lets a new copy pair once the pin is removed, without restarting', async () => {
    let stored: string | undefined = ID;
    server = await start({ readPin: () => stored, onPin: (id) => (stored = id) });
    const other = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    const refused = await connect(`chrome-extension://${other}`);
    hello(refused, { token: TOKEN });
    await expect(closed(refused)).resolves.toBe(OTHER_EXTENSION);

    stored = undefined; // what `codename-bridge unpin` does to the file
    const ws = await connect(`chrome-extension://${other}`);
    const ack = next(ws);
    hello(ws, { token: TOKEN, extensionId: other });
    await expect(ack).resolves.toMatchObject({ ok: true });
    expect(stored).toBe(other);
    ws.close();
  });

  it('refuses a hello whose claimed id is not the origin it came from', async () => {
    server = await start();
    const ws = await connect();
    hello(ws, { token: TOKEN, extensionId: 'someone-else' });
    await expect(closed(ws)).resolves.toBe(UNAUTHORIZED);
  });

  it('locks the door after five wrong codes and opens it again after five minutes', async () => {
    server = await start();
    for (let i = 0; i < 5; i++) {
      const ws = await connect();
      hello(ws, { token: 'WRONG1' });
      await closed(ws);
    }
    const locked = await connect();
    const reason = new Promise<string>((r) => locked.once('close', (_code, why) => r(why.toString())));
    hello(locked, { token: TOKEN });
    await expect(closed(locked)).resolves.toBe(TOO_MANY);
    // Says how long, so a panel holding the right code can come back by itself.
    await expect(reason).resolves.toBe(`retry-after:${5 * 60_000}`);

    clock += 5 * 60_000;
    const later = await connect();
    const ack = next(later);
    hello(later, { token: TOKEN });
    await expect(ack).resolves.toMatchObject({ ok: true });
    later.close();
  });

  it('never hands the pairing code out, whoever asks and whatever they claim', async () => {
    // An Origin header is only trustworthy from a real browser, so a socket
    // claiming to be the pinned extension still has to know the code.
    server = await start({ pinnedExtensionId: ID });
    const ws = await connect();
    hello(ws, { token: '', extensionId: ID });
    await expect(closed(ws)).resolves.toBe(UNAUTHORIZED);

    const guessing = await connect();
    const seen: unknown[] = [];
    guessing.on('message', (d) => seen.push(JSON.parse(d.toString())));
    hello(guessing, { token: 'WRONG1', extensionId: ID });
    await closed(guessing);
    expect(JSON.stringify(seen)).not.toContain(TOKEN);
  });

  it('tells a session it is gone when its socket closes', async () => {
    const gone: string[] = [];
    server = await start({ onGone: (id) => gone.push(id) });
    const ws = await connect();
    const ack = next(ws);
    hello(ws, { token: TOKEN, extensionId: ID });
    await ack;
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(gone).toEqual(['s1']);
  });

  it('answers an ask, and says so when it cannot', async () => {
    server = await start({ onAsk: async (_id, req) => ({ echoed: req.method }) });
    const ws = await connect();
    const ack = next(ws);
    hello(ws, { token: TOKEN, extensionId: ID });
    await ack;
    const answer = next(ws);
    ws.send(JSON.stringify({ v: 1, id: 'a1', type: 'ask', payload: { method: 'find_definitions', names: ['--mark'] } }));
    await expect(answer).resolves.toMatchObject({ replyTo: 'a1', ok: true, payload: { echoed: 'find_definitions' } });
    ws.close();
  });

  it('hands each state snapshot to onState', async () => {
    const seen: number[] = [];
    server = await start({ onState: (_id, state) => seen.push(state.revision) });
    const ws = await connect();
    const ack = next(ws);
    hello(ws, { token: TOKEN, extensionId: ID });
    await ack;
    ws.send(JSON.stringify({ v: 1, id: 'st1', type: 'state', payload: makeState('s1', 3) }));
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toEqual([3]);
    ws.close();
  });
});
