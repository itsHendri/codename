/**
 * How many wrong pairing codes a client may try.
 *
 * The code is six characters from a 32-glyph alphabet, which is a billion
 * combinations — but a local process could walk them in minutes over an
 * unlimited socket. Five wrong tries in a minute locks the door for five,
 * and a code nobody ever paired with is rotated after half an hour so a
 * bridge left running all day is not still offering its first guess.
 */

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 60_000;
export const LOCKOUT_MS = 5 * 60_000;
/** How long an unpaired code stays valid. A paired one never rotates. */
export const ROTATE_AFTER_MS = 30 * 60_000;

export const TOO_MANY = 4429;

export interface Clock {
  (): number;
}

export class Limiter {
  private attempts: number[] = [];
  private lockedUntil = 0;

  constructor(private readonly now: Clock = Date.now) {}

  /** Whether a hello may be attempted at all. */
  allowed(): boolean {
    return this.now() >= this.lockedUntil;
  }

  /** Milliseconds left on a lockout, 0 when open. */
  retryAfterMs(): number {
    return Math.max(0, this.lockedUntil - this.now());
  }

  /** Records a wrong token. Returns true when that one closed the door. */
  fail(): boolean {
    const at = this.now();
    this.attempts = this.attempts.filter((t) => at - t < WINDOW_MS);
    this.attempts.push(at);
    if (this.attempts.length < MAX_ATTEMPTS) return false;
    this.lockedUntil = at + LOCKOUT_MS;
    this.attempts = [];
    return true;
  }

  /** A correct token forgives the near misses that came before it. */
  succeed(): void {
    this.attempts = [];
    this.lockedUntil = 0;
  }
}
