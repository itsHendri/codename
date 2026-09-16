/**
 * Transitions: what moves, how long it takes, and on what curve.
 *
 * This is the half of "effects and motion" that the states made possible.
 * Editing hover says what an element becomes; a transition says how it gets
 * there, and there is nowhere else in the panel to say it.
 *
 * Two rules shape what follows. A curve is named wherever the project has a
 * name for it — `--ease-out` rather than `cubic-bezier(0.2, 0, 0, 1)` — so
 * the edit lands in source as the token a stylesheet already uses. And a
 * value this cannot rebuild exactly is left to the text field, the same
 * bargain the shadow fields make.
 */

import { splitList } from './effects';

export interface TransitionEntry {
  /** `all`, `opacity`, `background-color` — whatever the page named. */
  property: string;
  /** Milliseconds. A `0.2s` in source is 200 here and goes back as it came. */
  durationMs: number;
  delayMs: number;
  /** As written: a keyword, a `cubic-bezier(…)`, or a `var(--ease-out)`. */
  easing: string;
}

/** The keywords a browser will take, beside a `cubic-bezier()` or a `steps()`. */
export const EASING_KEYWORDS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'];

const TIME = /^[+-]?(\d*\.)?\d+(ms|s)$/i;

/** `200ms` and `0.2s` are the same number of milliseconds. */
export function timeToMs(value: string): number | null {
  const v = value.trim();
  if (!TIME.test(v)) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return /ms$/i.test(v) ? n : n * 1000;
}

/** Milliseconds as a stylesheet would write them: `200ms`, and `0s` for nothing. */
export const msToTime = (ms: number): string => (ms === 0 ? '0s' : `${Math.round(ms)}ms`);

const isTime = (s: string): boolean => TIME.test(s.trim());
const isEasing = (s: string): boolean =>
  EASING_KEYWORDS.includes(s.toLowerCase()) || /^(cubic-bezier|steps|linear)\(/i.test(s) || /^var\(/i.test(s);

/** The whitespace-separated pieces of one entry, keeping `cubic-bezier(…)` whole. */
function pieces(part: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of part) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

/**
 * A `transition` shorthand as entries, or null when it is not one this can
 * rebuild.
 *
 * The order inside one entry is loose in CSS — the first time is the
 * duration and the second the delay, and the rest may come in any order — so
 * it is read by what each piece *is* rather than by where it sits.
 */
export function parseTransition(value: string): TransitionEntry[] | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none' || trimmed === 'all 0s ease 0s') return [];
  if (/^var\(/i.test(trimmed)) return null;

  const entries: TransitionEntry[] = [];
  for (const part of splitList(trimmed)) {
    const words = pieces(part);
    if (!words.length) return null;
    const times = words.filter(isTime);
    const easings = words.filter((w) => !isTime(w) && isEasing(w));
    const names = words.filter((w) => !isTime(w) && !isEasing(w));
    if (times.length > 2 || easings.length > 1 || names.length > 1) return null;
    const durationMs = times[0] ? timeToMs(times[0]) : 0;
    const delayMs = times[1] ? timeToMs(times[1]) : 0;
    if (durationMs === null || delayMs === null) return null;
    entries.push({
      property: names[0] ?? 'all',
      durationMs,
      delayMs,
      easing: easings[0] ?? '',
    });
  }
  return entries;
}

/** One entry, written the way a stylesheet would. */
export function entryToCss(entry: TransitionEntry): string {
  const parts = [entry.property || 'all', msToTime(entry.durationMs)];
  if (entry.easing.trim()) parts.push(entry.easing.trim());
  if (entry.delayMs) parts.push(msToTime(entry.delayMs));
  return parts.join(' ');
}

export const transitionToCss = (entries: TransitionEntry[]): string =>
  entries.length ? entries.map(entryToCss).join(', ') : 'none';

/** Whether the fields can hold this value without losing any of it. */
export function transitionRoundTrips(value: string): boolean {
  const entries = parseTransition(value);
  if (entries === null) return false;
  const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
  const rebuilt = transitionToCss(entries);
  if (same(rebuilt, value)) return true;
  // A browser writes every part back — `opacity 0.2s ease 0s` — and writing
  // `0s` delays and seconds differently is the only licence taken here.
  return same(rebuilt, transitionToCss(parseTransition(rebuilt) ?? []));
}

/* ---------------- the curves a project already has names for ---------------- */

export interface NamedEasing {
  /** What to show, and what the edit writes: `--ease-out`, or `ease-out`. */
  name: string;
  /** The curve itself, for the preview. */
  value: string;
  /** True when the name is one of the page's own custom properties. */
  fromPage: boolean;
}

const EASING_NAME = /^--(.*\b)?(ease|easing|curve|timing|transition)/i;

/**
 * The easings on offer, the page's own first.
 *
 * A project that has `--ease-out` should be handed `--ease-out`, not the
 * curve behind it: writing the literal is how a design system comes apart one
 * declaration at a time. The engine's own names come after, and the plain CSS
 * keywords last, so there is always something to pick.
 */
export function namedEasings(
  pageVars: { name: string; value: string }[] = [],
  systemEasings: Record<string, string> = {},
): NamedEasing[] {
  const out: NamedEasing[] = [];
  const seen = new Set<string>();

  for (const v of pageVars) {
    if (!EASING_NAME.test(v.name)) continue;
    const value = v.value.trim();
    // A name is only useful here if what it holds is a curve.
    if (!isEasing(value)) continue;
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    out.push({ name: v.name, value, fromPage: true });
  }

  for (const [name, value] of Object.entries(systemEasings)) {
    const label = `ease-${name}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ name: label, value, fromPage: false });
  }

  for (const keyword of EASING_KEYWORDS) {
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    out.push({ name: keyword, value: keyword, fromPage: false });
  }
  return out;
}

/** What an easing should be written as: a page variable goes in as `var(--x)`. */
export const easingToCss = (easing: NamedEasing): string => (easing.fromPage ? `var(${easing.name})` : easing.value);

/** The entry in `easings` that a written value came from, for showing a choice back. */
export function matchEasing(written: string, easings: NamedEasing[]): NamedEasing | null {
  const v = written.trim().toLowerCase();
  if (!v) return null;
  const reference = /^var\(\s*(--[^,)\s]+)/i.exec(v)?.[1];
  return (
    easings.find((e) => (reference ? e.name.toLowerCase() === reference : false)) ??
    easings.find((e) => e.value.trim().toLowerCase() === v || e.name.toLowerCase() === v) ??
    null
  );
}
