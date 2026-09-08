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

/** The CSS a chosen suggestion writes: a reference, not the value. */
export const asReference = (s: TokenSuggestion): string => (s.source === 'page' ? `var(${s.name})` : s.value);
