import { describe, expect, it } from 'vitest';
import { LOCKOUT_MS, Limiter, MAX_ATTEMPTS, WINDOW_MS } from './limiter';

/** A clock a test can wind by hand. */
function clock(start = 1_000) {
  let t = start;
  return Object.assign(() => t, { tick: (ms: number) => (t += ms) });
}

describe('Limiter', () => {
  it('opens to begin with', () => {
    expect(new Limiter(clock()).allowed()).toBe(true);
  });

  it('closes after five wrong codes in a minute', () => {
    const limiter = new Limiter(clock());
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) expect(limiter.fail()).toBe(false);
    expect(limiter.fail()).toBe(true);
    expect(limiter.allowed()).toBe(false);
    expect(limiter.retryAfterMs()).toBe(LOCKOUT_MS);
  });

  it('opens again once the lockout passes', () => {
    const now = clock();
    const limiter = new Limiter(now);
    for (let i = 0; i < MAX_ATTEMPTS; i++) limiter.fail();
    now.tick(LOCKOUT_MS - 1);
    expect(limiter.allowed()).toBe(false);
    now.tick(1);
    expect(limiter.allowed()).toBe(true);
    expect(limiter.retryAfterMs()).toBe(0);
  });

  it('forgets attempts older than the window, so slow guessing is not a lockout', () => {
    const now = clock();
    const limiter = new Limiter(now);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      limiter.fail();
      now.tick(WINDOW_MS / 2);
    }
    // Every earlier attempt has aged out by now.
    expect(limiter.fail()).toBe(false);
    expect(limiter.allowed()).toBe(true);
  });

  it('forgives near misses once a code is right', () => {
    const limiter = new Limiter(clock());
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) limiter.fail();
    limiter.succeed();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) expect(limiter.fail()).toBe(false);
    expect(limiter.allowed()).toBe(true);
  });
});
