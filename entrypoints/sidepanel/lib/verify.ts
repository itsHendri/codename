/**
 * Checking a write to source against the page.
 *
 * The bridge writes a value into a file and says so; whether the page now
 * paints it is a separate question, and the page is the only one that can
 * answer. So after a write the panel asks the page for the variable's own
 * value — override lifted — a few times over five seconds, which is longer
 * than any dev server takes to reload a stylesheet.
 *
 * Three answers. The new value: the write landed, and the override can come
 * off. The old value, still, after the last ask: the page has not picked it
 * up, which a dev server without hot reload does every time, so the person
 * is asked to reload rather than the write being undone. Some other value:
 * another definition won the cascade once the file changed, and the write
 * has changed something it did not mean to; that one is put back at once,
 * with the reason. An empty read is none of these — a sheet mid-reload has
 * no value for a moment — and is asked again.
 */

import { hexOf } from '@/studio/reskin';

export type VerifyOutcome = 'ok' | 'silent' | 'contradicted';

export interface VerifyReport {
  name: string;
  outcome: VerifyOutcome;
  /** What the page read last, or null when it never answered with a value. */
  seen: string | null;
}

export interface VerifyWrite {
  name: string;
  from: string;
  to: string;
}

/** When to ask, in milliseconds after the write. */
export const VERIFY_SCHEDULE_MS = [0, 150, 300, 600, 1000, 2000, 3500, 5000] as const;

const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase();

/** Two values the page would paint the same: colours by their hex, anything else by its text. */
export function sameOnPage(a: string, b: string): boolean {
  const ha = hexOf(a);
  const hb = hexOf(b);
  if (ha && hb) return ha === hb;
  return norm(a) === norm(b);
}

export async function verifyWrites(
  writes: VerifyWrite[],
  read: (names: string[]) => Promise<Record<string, string> | null>,
  opts: { schedule?: readonly number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<VerifyReport[]> {
  const schedule = opts.schedule ?? VERIFY_SCHEDULE_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const pending = new Map(writes.map((w) => [w.name, w]));
  const seen = new Map<string, string>();
  const done: VerifyReport[] = [];
  let at = 0;
  for (const t of schedule) {
    if (!pending.size) break;
    if (t > at) await sleep(t - at);
    at = t;
    const values = await read([...pending.keys()]);
    if (!values) continue;
    for (const [name, w] of [...pending]) {
      const value = values[name];
      if (!value) continue;
      seen.set(name, value);
      if (sameOnPage(value, w.to)) {
        done.push({ name, outcome: 'ok', seen: value });
        pending.delete(name);
      } else if (!sameOnPage(value, w.from)) {
        done.push({ name, outcome: 'contradicted', seen: value });
        pending.delete(name);
      }
    }
  }
  for (const name of pending.keys()) done.push({ name, outcome: 'silent', seen: seen.get(name) ?? null });
  return done;
}
