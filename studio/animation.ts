/**
 * `animation`, as fields, and the three triggers a design tool offers over it.
 *
 * Framer's Appear, Loop and Scroll are one `animation` declaration each: run
 * once and stay, run forever back and forth, or run along the scroll. What
 * they animate is a `@keyframes` block — the page's own, read off its
 * sheets, or one of a few named here, which the element sheet defines and
 * the brief spells out in words. Like the transition editor this fails
 * closed by round trip: a value the fields would not give back exactly
 * keeps its text field.
 */

import { EASING_KEYWORDS, msToTime, timeToMs } from './motion';

export interface AnimationEntry {
  /** The `@keyframes` name. */
  name: string;
  durationMs: number;
  delayMs: number;
  /** As written: a keyword, a `cubic-bezier(…)`, or a `var(--ease-out)`. */
  easing: string;
  /** `1`, `3`, `infinite`. */
  iterations: string;
  direction: string;
  fill: string;
}

export const DIRECTIONS = ['normal', 'reverse', 'alternate', 'alternate-reverse'] as const;
export const FILLS = ['none', 'forwards', 'backwards', 'both'] as const;
const PLAY_STATES = new Set(['running', 'paused']);
const NUMBER = /^(\d*\.)?\d+$/;
const isEasing = (s: string) => EASING_KEYWORDS.includes(s.toLowerCase()) || /^(cubic-bezier|steps|linear|var)\(/i.test(s);
const isIdent = (s: string) => /^-?[a-zA-Z_][\w-]*$/.test(s);

/** Top-level commas and spaces, keeping `cubic-bezier(…)` whole. */
function tokens(value: string): string[][] {
  const entries: string[][] = [[]];
  let depth = 0;
  let current = '';
  const flush = () => {
    if (current) entries[entries.length - 1]!.push(current);
    current = '';
  };
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && ch === ',') {
      flush();
      entries.push([]);
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      flush();
      continue;
    }
    current += ch;
  }
  flush();
  return entries.filter((e) => e.length);
}

/**
 * The entries a value holds, or null where a piece would be lost. The
 * computed form (`fade 600ms ease-out 0s 1 normal both running`) and the
 * written form (`fade 600ms ease-out`) both read; `none` is no entries.
 */
export function parseAnimation(value: string): AnimationEntry[] | null {
  const v = value.trim();
  if (!v) return [];
  const out: AnimationEntry[] = [];
  for (const parts of tokens(v)) {
    const entry: AnimationEntry = { name: '', durationMs: 0, delayMs: 0, easing: 'ease', iterations: '1', direction: 'normal', fill: 'none' };
    let times = 0;
    let named = false;
    // `none` is a fill keyword and the name of no animation; which it is
    // here is settled once the rest of the entry is read.
    const fills: string[] = [];
    for (const p of parts) {
      const lower = p.toLowerCase();
      const ms = timeToMs(p);
      if (ms !== null) {
        if (times === 0) entry.durationMs = ms;
        else if (times === 1) entry.delayMs = ms;
        else return null;
        times++;
      } else if (isEasing(p)) entry.easing = p;
      else if (lower === 'infinite' || NUMBER.test(p)) entry.iterations = lower;
      else if ((DIRECTIONS as readonly string[]).includes(lower)) entry.direction = lower;
      else if ((FILLS as readonly string[]).includes(lower)) fills.push(lower);
      else if (PLAY_STATES.has(lower)) continue;
      else if (isIdent(p) && !named) {
        entry.name = p;
        named = true;
      } else return null;
    }
    if (!named) {
      // With no other name in the entry, a leading `none` is the name.
      if (fills[0] !== 'none') return null;
      fills.shift();
      entry.name = 'none';
    }
    if (fills.length > 1) return null;
    if (fills[0]) entry.fill = fills[0];
    if (entry.name === 'none') continue;
    out.push(entry);
  }
  return out;
}

export function entryToCss(e: AnimationEntry): string {
  return `${e.name} ${msToTime(e.durationMs)} ${e.easing} ${msToTime(e.delayMs)} ${e.iterations} ${e.direction} ${e.fill}`;
}

export const animationToCss = (entries: AnimationEntry[]): string => (entries.length ? entries.map(entryToCss).join(', ') : 'none');

/** Whether the fields would give this value back as the same declaration. */
export function animationRoundTrips(value: string): boolean {
  const entries = parseAnimation(value);
  if (entries === null) return false;
  const again = parseAnimation(animationToCss(entries));
  return JSON.stringify(again) === JSON.stringify(entries);
}

/* ---------------- triggers ---------------- */

export type Trigger = 'appear' | 'loop' | 'scroll';
export const TRIGGERS: readonly Trigger[] = ['appear', 'loop', 'scroll'];

/** The one declaration a trigger is, over a named set of keyframes. */
export function triggerEntry(trigger: Trigger, name: string, easing = 'ease-out'): AnimationEntry {
  switch (trigger) {
    case 'appear':
      return { name, durationMs: 600, delayMs: 0, easing, iterations: '1', direction: 'normal', fill: 'both' };
    case 'loop':
      return { name, durationMs: 1200, delayMs: 0, easing: 'ease-in-out', iterations: 'infinite', direction: 'alternate', fill: 'none' };
    case 'scroll':
      return { name, durationMs: 1000, delayMs: 0, easing: 'linear', iterations: '1', direction: 'normal', fill: 'both' };
  }
}

/** What `animation-timeline` a trigger wants: the scroll one runs along `view()`. */
export const timelineFor = (trigger: Trigger): string => (trigger === 'scroll' ? 'view()' : 'auto');

/** Which trigger an entry reads as, given the element's timeline; null when it is none of the three. */
export function triggerOf(entry: AnimationEntry | undefined, timeline: string): Trigger | null {
  if (!entry) return null;
  if (timeline && timeline !== 'auto' && timeline !== 'none') return 'scroll';
  if (entry.iterations === 'infinite') return 'loop';
  return 'appear';
}

/* ---------------- named keyframes ---------------- */

export interface KeyframesPreset {
  name: string;
  label: string;
  /** The block's body, as a stylesheet writes it. */
  body: string;
  /** The same in words, for the brief, which carries no rule bodies. */
  words: string;
}

export const PRESETS: readonly KeyframesPreset[] = [
  { name: 'codename-fade-in', label: 'Fade in', body: 'from{opacity:0}to{opacity:1}', words: 'from opacity 0 to opacity 1' },
  {
    name: 'codename-rise',
    label: 'Rise',
    body: 'from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}',
    words: 'from opacity 0 and translateY(12px) to opacity 1 and no transform',
  },
  {
    name: 'codename-scale-in',
    label: 'Scale in',
    body: 'from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:none}',
    words: 'from opacity 0 and scale(0.96) to opacity 1 and no transform',
  },
  { name: 'codename-pulse', label: 'Pulse', body: 'from{transform:none}to{transform:scale(1.04)}', words: 'from no transform to scale(1.04)' },
];

export const presetOf = (name: string): KeyframesPreset | undefined => PRESETS.find((p) => p.name === name);

/** The names an `animation` value uses. */
export function namesIn(value: string): string[] {
  return (parseAnimation(value) ?? []).map((e) => e.name);
}

/** The `@keyframes` block a preset name needs, for a sheet; null for the page's own. */
export function keyframesCss(name: string): string | null {
  const p = presetOf(name);
  return p ? `@keyframes ${p.name}{${p.body}}` : null;
}

/** The same block in words, for a brief that carries no rule bodies. */
export function describeKeyframes(name: string): string | null {
  const p = presetOf(name);
  return p ? `@keyframes ${p.name}: ${p.words}` : null;
}
