/**
 * What kind of thing a page variable holds, read off its value.
 *
 * The name is a hint at best — `--text-primary` is a colour on one site and a
 * font size on another — so the value decides, and a value this cannot read
 * lands in `other` rather than being guessed at. That is where aliases go too:
 * `--button-bg: var(--mark)` is a reference, and rewriting it would flatten
 * the indirection its author chose.
 */

import type { CustomPropInfo } from '@/shared/types';
import { hexOf, lengthPx } from './reskin';

export type VarKind = 'colour' | 'length' | 'font' | 'shadow' | 'other';

export const VAR_KINDS: VarKind[] = ['colour', 'length', 'font', 'shadow', 'other'];

const GENERIC_FAMILY = /(^|,)\s*(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|cursive|fantasy)\s*$/i;
const COLOUR_WORD = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|color\(/i;
const LENGTH_LIKE = /^-?\d*\.?\d+(px|rem|em|%|vw|vh|ch)$/i;

export function classifyProp(value: string): VarKind {
  const v = value.trim();
  if (!v || v.startsWith('var(')) return 'other';
  if (hexOf(v)) return 'colour';
  if (lengthPx(v) !== null || LENGTH_LIKE.test(v)) return 'length';
  // A shadow is lengths and a colour in one value; check before fonts, since
  // a font stack never carries a colour.
  if (/\d(px|rem|em)\b/i.test(v) && COLOUR_WORD.test(v)) return 'shadow';
  if (GENERIC_FAMILY.test(v) || /^["'][^"']+["']\s*(,|$)/.test(v)) return 'font';
  return 'other';
}

/** The page's variables in kind order, so the ones you edit most sit first. */
export function groupCustomProps(props: CustomPropInfo[]): { kind: VarKind; props: CustomPropInfo[] }[] {
  const groups = new Map<VarKind, CustomPropInfo[]>(VAR_KINDS.map((k) => [k, []]));
  const seen = new Set<string>();
  for (const p of props) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    groups.get(classifyProp(p.value))!.push(p);
  }
  return VAR_KINDS.map((kind) => ({ kind, props: groups.get(kind)! })).filter((g) => g.props.length);
}
