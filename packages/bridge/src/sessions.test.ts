import { describe, expect, it, vi } from 'vitest';
import type { Envelope } from '../../../shared/protocol';
import { Sessions, type Link } from './sessions';
import { makeState } from './test-helpers';

const fakeLink = (): Link & { sent: Envelope[] } => {
  const sent: Envelope[] = [];
  return { sent, send: (e) => sent.push(e) };
};

describe('Sessions', () => {
  it('has no current session until one connects', () => {
    const s = new Sessions();
    expect(() => s.get()).toThrow(/no panel is connected/);
    expect(s.list()).toEqual([]);
  });

  it('treats the session that most recently pushed state as current', () => {
    const s = new Sessions();
    s.connect('a', fakeLink());
    s.connect('b', fakeLink());
    s.update('a', makeState('a', 1));
    expect(s.get().id).toBe('a');
    s.update('b', makeState('b', 1));
    expect(s.get().id).toBe('b');
    s.update('a', makeState('a', 2));
    expect(s.get().id).toBe('a');
    expect(s.get('b').id).toBe('b');
    expect(() => s.get('nope')).toThrow(/unknown session/);
  });

  it('lists sessions with their latest state and connection', () => {
    const s = new Sessions();
    const link = fakeLink();
    s.connect('a', link);
    s.update('a', makeState('a', 3));
    s.disconnect('a', link);
    expect(s.list()).toEqual([
      { sessionId: 'a', url: 'http://localhost:3000/a', title: 'a', local: true, revision: 3, connected: false, locks: [] },
    ]);
  });

  it('resolves a waiter when the revision passes `since`', async () => {
    const s = new Sessions();
    s.connect('a', fakeLink());
    s.update('a', makeState('a', 1));
    const wait = s.waitFor('a', 1, 1000);
    s.update('a', makeState('a', 1)); // same revision: keep waiting
    s.update('a', makeState('a', 2));
    await expect(wait).resolves.toEqual({ revision: 2, timedOut: false });
  });

  it('resolves immediately when the revision already passed `since`', async () => {
    const s = new Sessions();
    s.connect('a', fakeLink());
    s.update('a', makeState('a', 5));
    await expect(s.waitFor('a', 3, 1000)).resolves.toEqual({ revision: 5, timedOut: false });
  });

  it('times out with timedOut: true', async () => {
    vi.useFakeTimers();
    try {
      const s = new Sessions();
      s.connect('a', fakeLink());
      s.update('a', makeState('a', 1));
      const wait = s.waitFor('a', 1, 500);
      vi.advanceTimersByTime(500);
      await expect(wait).resolves.toEqual({ revision: 1, timedOut: true });
      expect(s.get('a').waiters.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects and clears waiters and pending requests on disconnect', async () => {
    const s = new Sessions();
    const link = fakeLink();
    s.connect('a', link);
    s.update('a', makeState('a', 1));
    const wait = s.waitFor('a', 1, 10_000);
    const req = s.sendRequest('a', { method: 'screenshot' }, 10_000);
    s.disconnect('a', link);
    await expect(wait).rejects.toThrow(/disconnected/);
    await expect(req).rejects.toThrow(/disconnected/);
    const session = s.get('a');
    expect(session.waiters.size).toBe(0);
    expect(session.pending.size).toBe(0);
    await expect(s.sendRequest('a', { method: 'screenshot' })).rejects.toThrow(/not connected/);
  });

  it('ignores a close from a stale link after a reconnect', () => {
    const s = new Sessions();
    const old = fakeLink();
    const fresh = fakeLink();
    s.connect('a', old);
    s.connect('a', fresh);
    s.disconnect('a', old);
    expect(s.list()[0]?.connected).toBe(true);
  });

  it('round-trips a request through the link', async () => {
    const s = new Sessions();
    const link = fakeLink();
    s.connect('a', link);
    const req = s.sendRequest('a', { method: 'clear', what: 'preview' });
    expect(link.sent).toHaveLength(1);
    const sent = link.sent[0]!;
    expect(sent).toMatchObject({ v: 1, type: 'request', payload: { method: 'clear', what: 'preview' } });
    expect(s.handleResponse('a', { v: 1, id: 'r1', type: 'response', replyTo: sent.id, ok: true, payload: { done: true } })).toBe(true);
    await expect(req).resolves.toEqual({ done: true });
    expect(s.handleResponse('a', { v: 1, id: 'r2', type: 'response', replyTo: 'unknown' })).toBe(false);
  });

  it('rejects a request the panel refuses, or never answers', async () => {
    const s = new Sessions();
    const link = fakeLink();
    s.connect('a', link);
    const refused = s.sendRequest('a', { method: 'screenshot' });
    s.handleResponse('a', { v: 1, id: 'r', type: 'response', replyTo: link.sent[0]!.id, ok: false, error: 'tab is gone' });
    await expect(refused).rejects.toThrow('tab is gone');

    vi.useFakeTimers();
    try {
      const slow = s.sendRequest('a', { method: 'screenshot' }, 100);
      vi.advanceTimersByTime(100);
      await expect(slow).rejects.toThrow(/did not answer/);
      expect(s.get('a').pending.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
