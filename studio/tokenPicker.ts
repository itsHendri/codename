/**
 * The page's variables, ranked for a picker: the ones that name a role
 * first, then the rest, then the primitives of a ramp — because when a
 * person swaps what an element is on, `--ink-muted` is the decision and
 * `--gray-600` is where a decision leaks. Figma hides primitives through
 * scoping; this puts them last and says which they are.
 */

import type { CustomPropInfo } from '@/shared/types';
import { hexOf } from './reskin';
import { toPx, type MatchKind } from './tokenMatch';

export interface RankedTokens {
  semantic: CustomPropInfo[];
  other: CustomPropInfo[];
  primitive: CustomPropInfo[];
}

/** A ramp step: `--blue-500`, `--gray-50`, `--neutral-950`. */
const PRIMITIVE = /-(?:0|50|[1-9]00|950|\d{1,2})$/;
/** Words a semantic name is made of. */
const ROLE = /(^|-)(bg|background|fg|foreground|ink|text|surface|border|line|accent|primary|secondary|tertiary|brand|muted|subtle|strong|paper|mark|link|success|warning|warn|danger|error|info|on|hover|active|disabled|focus|ring|card|panel|input|button|btn)(-|$)/i;

/** The value a variable paints in light, resolved through its alias when it has one. */
export const paintedValue = (p: CustomPropInfo): string => p.resolved ?? p.value;

export function isOfKind(p: CustomPropInfo, kind: MatchKind, rootFontSize = 16): boolean {
  const v = paintedValue(p);
  if (kind === 'color') return hexOf(v) !== null;
  if (kind === 'length') return toPx(v, rootFontSize) !== null;
  if (kind === 'shadow') return /\d.*\d/.test(v) && !hexOf(v);
  return true;
}

export function rankTokens(props: CustomPropInfo[], kind: MatchKind, rootFontSize = 16): RankedTokens {
  const out: RankedTokens = { semantic: [], other: [], primitive: [] };
  for (const p of props) {
    if (!isOfKind(p, kind, rootFontSize)) continue;
    const short = p.name.replace(/^--/, '');
    if (PRIMITIVE.test(short) && !(p.alias?.length)) out.primitive.push(p);
    else if (p.alias?.length || ROLE.test(short)) out.semantic.push(p);
    else out.other.push(p);
  }
  const byName = (a: CustomPropInfo, b: CustomPropInfo) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const byUses = (a: CustomPropInfo, b: CustomPropInfo) => (b.uses ?? 0) - (a.uses ?? 0) || byName(a, b);
  out.semantic.sort(byUses);
  out.other.sort(byUses);
  out.primitive.sort(byName);
  return out;
}

/** Filter every group by a search, keeping the order. */
export function filterTokens(ranked: RankedTokens, query: string): RankedTokens {
  const q = query.trim().toLowerCase();
  if (!q) return ranked;
  const keep = (p: CustomPropInfo) => p.name.toLowerCase().includes(q) || paintedValue(p).toLowerCase().includes(q);
  return { semantic: ranked.semantic.filter(keep), other: ranked.other.filter(keep), primitive: ranked.primitive.filter(keep) };
}
