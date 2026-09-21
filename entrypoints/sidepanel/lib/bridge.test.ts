// @vitest-environment happy-dom
/**
 * The panel's end of the socket, against a socket that does what it is told.
 *
 * What these pin is the lifecycle a real bridge puts the panel through and a
 * unit test of the bridge cannot see: coming back after a lockout nobody here
 * caused, saying so when the bridge belongs to another copy of the extension,
 * and not leaving a question hanging when the bridge goes away mid-answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChrome } from '../test/chromeStub';

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: { type: string; id: string; payload?: unknown }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  /** The bridge accepts the connection. */
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  /** The bridge, or the network, closes it. */
  drop(code: number, reason = '') {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  close() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.drop(1000);
  }
}

type BridgeModule = typeof import('./bridge');

/** A fresh copy of the module, since it keeps its socket at module scope. */
async function freshBridge(): Promise<BridgeModule> {
  vi.resetModules();
  return import('./bridge');
}

const latest = () => FakeSocket.all[FakeSocket.all.length - 1]!;

beforeEach(() => {
  installChrome();
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  (globalThis as unknown as { chrome: { runtime: { id: string } } }).chrome.runtime.id = 'aaaabbbbccccddddeeeeffffgggghhhh';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the socket', () => {
  it('comes back by itself when a lockout it did not cause ends', async () => {
    const bridge = await freshBridge();
    await bridge.pair('ABC234');
    latest().open();

    // Someone else's wrong guesses closed the door; this panel holds the right code.
    latest().drop(4429, 'retry-after:300000');
    expect(bridge.bridgeStatus()).toBe('locked');
    expect(FakeSocket.all).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(300_000 + 1_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('says the bridge belongs to another copy of the extension, rather than retrying in silence', async () => {
    const bridge = await freshBridge();
    await bridge.pair('ABC234');
    latest().open();
    latest().drop(4403, 'paired with another copy of the extension');
    // The status store is what the menu and the Connect card read.
    expect(bridge.bridgeStatus()).toBe('other-extension');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('settles a question at once when the bridge goes away mid-answer', async () => {
    const bridge = await freshBridge();
    await bridge.pair('ABC234');
    latest().open();

    const asked = bridge.refreshDefinitions(['--mark']);
    const outcome = asked.then(
      () => 'answered',
      (err: Error) => err.message,
    );
    // The agent quits and takes the bridge with it.
    latest().drop(1006);
    await vi.advanceTimersByTimeAsync(0);
    await expect(outcome).resolves.toBe('the agent bridge disconnected');
  });

  it('does not let a replaced socket tear down the one that took its place', async () => {
    const bridge = await freshBridge();
    await bridge.pair('ABC234');
    const first = latest();
    first.open();

    // Pairing again replaces the socket; the old one's close arrives late.
    await bridge.pair('XYZ789');
    const second = latest();
    second.open();
    first.onclose?.({ code: 1000, reason: '' });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(FakeSocket.all).toHaveLength(2);
    expect(second.readyState).toBe(FakeSocket.OPEN);
  });
});
