/**
 * Lengths in a stylesheet rule, rewritten under an edited scale.
 *
 * A page variable holding `16px` cannot say whether it is a gap or a font
 * size, which is why the variable path leaves ambiguous lengths alone. A rule
 * has no such problem: `font-size: 16px` is a type size and `padding: 16px` is
 * spacing, by name. So the type ladder, the grid and the radius base can reach
 * pages that hold none of them in variables — forfontsake holds none at all.
 *
 * Still fail closed. Only px and rem move. A shorthand moves only when every
 * one of its lengths does. A weight or a line-height moves only inside a rule
 * whose own font-size names the role, because `600` on its own belongs to no
 * role in particular. `calc()`, `var()`, percentages and `em` are left where
 * they are: rewriting them would be a guess about what they resolve to.
 */

import { inOriginalUnit, lengthPx } from './reskin';

export interface LengthMap {
  /** Keyed by a role's size in px (as a string), which is what a rule's font-size says. */
  type: Record<
    string,
    {
      size?: { from: number; to: number };
      weight?: { from: number; to: number };
      lineHeight?: { from: number; to: number };
    }
  >;
  /** Spacing step in px → px. */
  space: Record<string, number>;
  /** Radius step in px → px. */
  radius: Record<string, number>;
}

export const isLengthMapEmpty = (map: LengthMap | null | undefined): boolean =>
  !map ||
  (Object.keys(map.type).length === 0 &&
    Object.keys(map.space).length === 0 &&
    Object.keys(map.radius).length === 0);

export const SPACE_PROPS = new Set([
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-inline',
  'padding-block',
  'padding-inline-start',
  'padding-inline-end',
  'padding-block-start',
  'padding-block-end',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-inline',
  'margin-block',
  'margin-inline-start',
  'margin-inline-end',
  'margin-block-start',
  'margin-block-end',
  'gap',
  'row-gap',
  'column-gap',
]);

const key = (px: number) => String(Math.round(px * 100) / 100);
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const WEIGHT_WORDS: Record<string, number> = { normal: 400, bold: 700 };

/** A value that holds anything this cannot reason about is left whole. */
const opaque = (value: string) => /calc\(|var\(|clamp\(|min\(|max\(|%|(^|\s)-?\d*\.?\d+em\b/i.test(value);

/**
 * The declaration's new value, or null to leave it as it is.
 *
 * `ruleFontPx` is the rule's own `font-size` in px when it declares one; it is
 * what ties a weight or line-height in the same rule to a role.
 */
export function rewriteLength(
  prop: string,
  value: string,
  map: LengthMap,
  ruleFontPx: number | null,
  rootFontSize = 16,
): string | null {
  if (prop.startsWith('--')) return null;
  const v = value.trim();
  if (!v || opaque(v)) return null;

  if (prop === 'font-size') {
    const px = lengthPx(v, rootFontSize);
    if (px === null) return null;
    const size = map.type[key(px)]?.size;
    return size ? inOriginalUnit(v, size.to, rootFontSize) : null;
  }

  if (prop === 'font-weight') {
    if (ruleFontPx === null) return null;
    const weight = map.type[key(ruleFontPx)]?.weight;
    if (!weight) return null;
    const n = WEIGHT_WORDS[v.toLowerCase()] ?? parseFloat(v);
    if (!Number.isFinite(n) || n !== weight.from) return null;
    return String(weight.to);
  }

  if (prop === 'line-height') {
    if (ruleFontPx === null) return null;
    const role = map.type[key(ruleFontPx)];
    const lh = role?.lineHeight;
    if (!lh) return null;
    // Unitless: the ratio itself. A length: the ratio times the size — the
    // size after the edit, since the rule's font-size moves in the same pass.
    if (/^-?\d*\.?\d+$/.test(v)) {
      return near(parseFloat(v), lh.from) ? String(lh.to) : null;
    }
    const px = lengthPx(v, rootFontSize);
    if (px === null) return null;
    if (!near(px, Math.round(lh.from * ruleFontPx * 100) / 100)) return null;
    const size = role?.size?.to ?? ruleFontPx;
    return inOriginalUnit(v, Math.round(lh.to * size * 100) / 100, rootFontSize);
  }

  if (SPACE_PROPS.has(prop)) return rewriteEach(v, map.space, rootFontSize);

  if (prop === 'border-radius') {
    // One radius only: an elliptical or per-corner shorthand is a shape, not a step.
    if (/[\/\s]/.test(v)) return null;
    const px = lengthPx(v, rootFontSize);
    if (px === null) return null;
    const to = map.radius[key(px)];
    return to === undefined ? null : inOriginalUnit(v, to, rootFontSize);
  }

  return null;
}

/** Every length in a space-separated list, or nothing: half a shorthand moved is a broken box. */
function rewriteEach(value: string, steps: Record<string, number>, rootFontSize: number): string | null {
  const parts = value.split(/\s+/);
  let moved = false;
  const out: string[] = [];
  for (const part of parts) {
    if (part === '0' || part === 'auto') {
      out.push(part);
      continue;
    }
    const px = lengthPx(part, rootFontSize);
    if (px === null) return null;
    const to = px === 0 ? 0 : steps[key(px)];
    if (to === undefined) return null;
    if (to !== px) moved = true;
    out.push(px === 0 ? part : inOriginalUnit(part, to, rootFontSize));
  }
  return moved ? out.join(' ') : null;
}
