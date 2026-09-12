/**
 * When a value on the page is really a token in disguise.
 *
 * A computed style never says where a value came from: `padding: 16px` looks
 * the same whether the author wrote `16px` or `var(--space-4)`. So this does
 * not claim to know. It says which of the page's own variables *match* the
 * value, and the panel words it that way — "matches `--space-4`", never "is".
 * Choosing a match writes `var(--space-4)`, which is the edit a token system
 * wants.
 */

import { differenceEuclidean } from 'culori';
import type { CustomPropInfo, ScanResult } from '@/shared/types';
import type { Mode, ResolvedTokens } from './engine/types';
import { STEPS } from './engine/types';
import { EXACT_DISTANCE, hexOf } from './reskin';

export type MatchKind = 'color' | 'length' | 'shadow' | 'font';

export interface TokenSuggestion {
  /** A page variable (`--space-4`) or, for `ramp`, a step name ("Mark 700"). */
  name: string;
  value: string;
  /** 0 is identical. Colours: oklab distance; lengths: px apart. */
  distance: number;
  exact: boolean;
  /** Only `page` suggestions can be written as `var(--x)`. */
  source: 'page' | 'ramp';
}

/** Colours further than this are not worth suggesting. */
export const SUGGEST_DISTANCE = 0.04;

const oklabDistance = differenceEuclidean('oklab');

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** A length in px, or null when it is not a length we can compare honestly. */
export function toPx(value: string, rootFontSize = 16): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(value.trim());
  if (!m) return value.trim() === '0' ? 0 : null;
  const n = parseFloat(m[1]!);
  return m[2] === 'rem' ? n * rootFontSize : n;
}

function colourMatches(value: string, props: CustomPropInfo[], resolved?: ResolvedTokens, mode: Mode = 'light') {
  const hex = hexOf(value);
  if (!hex) return [];
  const out: TokenSuggestion[] = [];
  for (const p of props) {
    const ph = hexOf(p.value);
    if (!ph) continue;
    const d = oklabDistance(hex, ph);
    if (d <= SUGGEST_DISTANCE) out.push({ name: p.name, value: p.value, distance: d, exact: d < EXACT_DISTANCE, source: 'page' });
  }
  if (resolved) {
    for (const scale of Object.values(resolved.scales)) {
      for (const step of STEPS) {
        const sw = scale.steps[mode][step];
        const d = oklabDistance(hex, sw.hex);
        if (d < EXACT_DISTANCE) out.push({ name: `${scale.name} ${step}`, value: sw.hex, distance: d, exact: true, source: 'ramp' });
      }
    }
  }
  return out;
}

function lengthMatches(value: string, props: CustomPropInfo[], rootFontSize: number) {
  const px = toPx(value, rootFontSize);
  if (px === null) return [];
  const out: TokenSuggestion[] = [];
  for (const p of props) {
    const ppx = toPx(p.value, rootFontSize);
    if (ppx === null) continue;
    const d = Math.abs(ppx - px);
    if (d < 0.01) out.push({ name: p.name, value: p.value, distance: 0, exact: true, source: 'page' });
  }
  return out;
}

function stringMatches(value: string, props: CustomPropInfo[]) {
  const v = normalise(value);
  return props
    .filter((p) => normalise(p.value) === v)
    .map<TokenSuggestion>((p) => ({ name: p.name, value: p.value, distance: 0, exact: true, source: 'page' }));
}

/**
 * The page's tokens that this value could be, nearest first. Exact matches
 * come before near ones, page variables before ramp steps.
 */
export function suggestTokens(
  kind: MatchKind,
  value: string,
  scan: Pick<ScanResult, 'customProps' | 'rootFontSize'>,
  resolved?: ResolvedTokens,
  mode: Mode = 'light',
): TokenSuggestion[] {
  const props = scan.customProps;
  const list =
    kind === 'color'
      ? colourMatches(value, props, resolved, mode)
      : kind === 'length'
        ? lengthMatches(value, props, scan.rootFontSize ?? 16)
        : stringMatches(value, props);
  return list.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      (a.source === 'page' ? -1 : 1) - (b.source === 'page' ? -1 : 1) ||
      a.distance - b.distance ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Which kind of token a CSS property takes, or null where the page holds
 * nothing comparable. One map, so the panel, the edit funnel and the brief
 * all agree about what `padding-top` is.
 */
export function kindForProperty(property: string): MatchKind | null {
  const p = property.trim().toLowerCase();
  if (p === 'font-family') return 'font';
  if (p === 'box-shadow') return 'shadow';
  if (p === 'color' || p === 'background' || p === 'fill' || p === 'stroke' || p.endsWith('-color')) return 'color';
  if (
    /^(padding|margin|gap|row-gap|column-gap|width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|font-size|line-height|letter-spacing|border-radius|border-width)/.test(p)
  ) {
    return 'length';
  }
  return null;
}

/**
 * The page's variables indexed by the value they hold, so asking "does this
 * page already have a name for this?" is a lookup rather than a scan. Built
 * once per reading of the page; the suggestion chips still use
 * `suggestTokens`, which answers a different question — what is *near* — and
 * is worth the search because a person is reading the answer.
 */
export type ValueIndex = Map<string, string[]>;

/** The key a value is filed under: colours by hex, lengths by px, the rest by their text. */
function valueKey(kind: MatchKind, value: string, rootFontSize: number): string | null {
  if (kind === 'color') {
    const hex = hexOf(value);
    return hex ? `c:${hex.toUpperCase()}` : null;
  }
  if (kind === 'length') {
    const px = toPx(value, rootFontSize);
    return px === null ? null : `l:${px}`;
  }
  return `s:${normalise(value)}`;
}

export function buildValueIndex(scan: Pick<ScanResult, 'customProps' | 'rootFontSize'>): ValueIndex {
  const rootFontSize = scan.rootFontSize ?? 16;
  const index: ValueIndex = new Map();
  for (const prop of scan.customProps) {
    for (const kind of ['color', 'length', 'other'] as const) {
      const key = valueKey(kind as MatchKind, prop.value, rootFontSize);
      if (!key) continue;
      const names = index.get(key);
      if (names) names.push(prop.name);
      else index.set(key, [prop.name]);
    }
  }
  return index;
}

/**
 * The one variable this page already uses for this exact value, or null.
 *
 * Exact means exact here — the same hex, the same length — not the
 * perceptual tolerance the chips use, because this answer is reported as a
 * fact rather than offered as a choice. And it answers only when a single
 * variable holds the value: where three do, the page has not said which one
 * means this, and naming one of them would be a guess.
 */
export function tokenHolding(
  index: ValueIndex,
  property: string,
  value: string,
  rootFontSize = 16,
): string | null {
  if (!value || value.includes('var(')) return null;
  const kind = kindForProperty(property);
  if (!kind) return null;
  const key = valueKey(kind, value, rootFontSize);
  if (!key) return null;
  const names = index.get(key);
  return names?.length === 1 ? names[0]! : null;
}

/** The CSS a chosen suggestion writes: a reference, not the value. */
export const asReference = (s: TokenSuggestion): string => (s.source === 'page' ? `var(${s.name})` : s.value);
