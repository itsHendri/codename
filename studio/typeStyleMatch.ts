/**
 * Which of the page's type styles an element is on.
 *
 * "Is" only when the declaration that paints its size is the style's own:
 * the style's size token, or a rule on the style's selector or utility.
 * "Matches" when only the numbers agree — the same size, and the same
 * line-height where both are known. Nothing when neither holds, which on a
 * page with no type styles is every element.
 */

import type { CustomPropInfo, ElementProps, TypeField, TypeStyle } from '@/shared/types';

export interface StyleMatch {
  style: TypeStyle;
  how: 'is' | 'matches';
}

/** A field's value as a length in px, resolving a token through the page's variables. */
export function fieldPx(field: TypeField | undefined, props: CustomPropInfo[], rootFontSize = 16, basePx = rootFontSize): number | null {
  if (!field) return null;
  let literal = field.literal;
  if (field.token) {
    const p = props.find((x) => x.name === field.token);
    literal = p?.resolved ?? p?.value;
  }
  if (!literal) return null;
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(literal.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (m[2] === 'px') return n;
  if (m[2] === 'em') return n * basePx;
  if (m[2] === 'rem') return n * rootFontSize;
  // A unitless line-height is a ratio of the size.
  return n * basePx;
}

/** What a style's fields say, for a label: `28/34`, or `28` when the line-height is unknown. */
export function sizeLabel(style: TypeStyle, props: CustomPropInfo[], rootFontSize = 16): string {
  const size = fieldPx(style.fields.size, props, rootFontSize);
  if (size === null) return '';
  const lh = fieldPx(style.fields.lineHeight, props, rootFontSize, size);
  const r = (n: number) => String(Math.round(n * 100) / 100);
  return lh === null ? r(size) : `${r(size)}/${r(lh)}`;
}

const px = (v: string) => parseFloat(v) || 0;
const close = (a: number, b: number) => Math.abs(a - b) < 0.5;

export function styleOf(el: ElementProps, styles: TypeStyle[], props: CustomPropInfo[], rootFontSize = 16): StyleMatch | null {
  if (!styles.length) return null;
  const size = el.authored?.['font-size'];
  if (size?.certain) {
    const own = styles.find((s) => {
      if (s.fields.size.token && size.token === s.fields.size.token) return true;
      const sel = size.rule.selector;
      return sel === s.selectorOrUtility || (s.form === 'tailwind-theme' && sel === `.${s.selectorOrUtility}`);
    });
    if (own) return { style: own, how: 'is' };
  }
  const elSize = px(el.type.fontSize);
  const elLh = px(el.type.lineHeight);
  const candidates = styles.filter((s) => {
    const sSize = fieldPx(s.fields.size, props, rootFontSize);
    if (sSize === null || !close(sSize, elSize)) return false;
    const sLh = fieldPx(s.fields.lineHeight, props, rootFontSize, sSize);
    return sLh === null || !elLh || close(sLh, elLh);
  });
  if (!candidates.length) return null;
  // The element's own tag is the likeliest home when several agree.
  const byTag = candidates.find((s) => s.tag === el.tag);
  return { style: byTag ?? candidates[0]!, how: 'matches' };
}

/** How a style is written in the project, for the brief and the row. */
export function describeForm(style: TypeStyle): string {
  switch (style.form) {
    case 'tailwind-theme':
      return `the Tailwind utility \`${style.selectorOrUtility}\` (\`${style.fields.size.token}\`)`;
    case 'class':
      return `the class \`${style.selectorOrUtility}\``;
    case 'vars':
      return `the variables \`${Object.values(style.fields)
        .map((f) => f?.token)
        .filter(Boolean)
        .join('`, `')}\``;
    case 'tag':
      return `the \`${style.tag} {}\` rule`;
  }
}
