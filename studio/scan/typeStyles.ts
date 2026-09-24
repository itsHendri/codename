/**
 * The type styles a page's stylesheets define, in whatever form they take.
 *
 * There is no CSS primitive for a text style, so projects write them four
 * ways, and a tool that wants to say "this is an H1 on the Display style"
 * has to read the form the project chose rather than invent one:
 *
 *  - a Tailwind v4 theme token, `--text-xl` with `--text-xl--line-height`
 *    beside it, used as the `text-xl` utility;
 *  - a class, `.h1` or `.text-display`, that sets `font-size` and its friends;
 *  - one variable per field, `--font-size-h1`, `--leading-h1`;
 *  - a bare tag rule, `h1 { … }`.
 *
 * Nothing else is a type style. A page with none gets an empty list, which
 * is a true answer and what leads to Generate.
 */

import type { CustomPropInfo, TypeField, TypeStyle } from '@/shared/types';
import { widthOfMedia, isDarkMedia } from '../siteMode';
import { splitSelectorList } from '../conditionSheet';
import { plainVar } from './alias';
import { eachStyleRule, MAX_RULES, mediaOf, resolveNested, type RuleLike } from './customProps';

const TAILWIND = /^--text-((?!size-)[\w-]+?)(?:--(line-height|letter-spacing|font-weight|font-family))?$/;
const FIELD_VARS: { field: keyof TypeStyle['fields']; re: RegExp }[] = [
  { field: 'size', re: /^--(?:font-size|fs|text-size|type-size|size)-([\w-]+)$/ },
  { field: 'lineHeight', re: /^--(?:line-height|leading|lh)-([\w-]+)$/ },
  { field: 'tracking', re: /^--(?:letter-spacing|tracking)-([\w-]+)$/ },
  { field: 'weight', re: /^--(?:font-weight|fw|weight)-([\w-]+)$/ },
  { field: 'family', re: /^--(?:font-family|ff|family)-([\w-]+)$/ },
];
const LENGTH = /^-?\d*\.?\d+(px|rem|em|%|vw|vh|cqi|cqw)$|^clamp\(|^calc\(|^var\(/i;
const SINGLE_CLASS = /^\.([\w-]|\\.)+$/;
const BARE_TAG = /^[a-z][a-z0-9]*$/i;
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'small', 'blockquote', 'code', 'pre', 'kbd', 'body', 'li', 'figcaption', 'caption', 'label', 'legend', 'dt', 'dd', 'a', 'button', 'input', 'th', 'td']);

const field = (value: string): TypeField => {
  const ref = plainVar(value);
  return ref ? { token: ref.name } : { literal: value.trim() };
};

const sizeOf = (style: TypeStyle, byName: Map<string, CustomPropInfo>): number => {
  const f = style.fields.size;
  const literal = f.literal ?? (f.token ? byName.get(f.token)?.resolved ?? byName.get(f.token)?.value : undefined);
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(literal?.trim() ?? '');
  if (!m) return 0;
  const n = parseFloat(m[1]!);
  return m[2] === 'px' ? n : n * 16;
};

export function detectTypeStyles(props: CustomPropInfo[], lists: ArrayLike<RuleLike>[], limit = MAX_RULES): TypeStyle[] {
  const byName = new Map(props.map((p) => [p.name, p]));
  const styles: TypeStyle[] = [];
  const seen = new Set<string>();
  const add = (s: TypeStyle) => {
    const key = `${s.form}:${s.selectorOrUtility}`;
    if (seen.has(key)) return;
    seen.add(key);
    styles.push(s);
  };

  // Form 1: Tailwind v4 theme tokens.
  const tailwind = new Map<string, TypeStyle>();
  for (const p of props) {
    const m = TAILWIND.exec(p.name);
    if (!m) continue;
    const [, name, sub] = m;
    const style =
      tailwind.get(name!) ??
      ({ name: name!, form: 'tailwind-theme', selectorOrUtility: `text-${name}`, fields: { size: {} }, ...(p.source ? { source: p.source } : {}) } as TypeStyle);
    if (!sub) {
      if (!LENGTH.test(p.value)) continue;
      style.fields.size = { token: p.name };
    } else if (sub === 'line-height') style.fields.lineHeight = { token: p.name };
    else if (sub === 'letter-spacing') style.fields.tracking = { token: p.name };
    else if (sub === 'font-weight') style.fields.weight = { token: p.name };
    else if (sub === 'font-family') style.fields.family = { token: p.name };
    tailwind.set(name!, style);
  }
  for (const s of tailwind.values()) if (s.fields.size.token) add(s);
  const tailwindTokens = new Set([...tailwind.values()].flatMap((s) => Object.values(s.fields).map((f) => f?.token).filter(Boolean)));

  // Form 2: one variable per field.
  const groups = new Map<string, TypeStyle>();
  for (const p of props) {
    if (TAILWIND.test(p.name)) continue;
    for (const { field: f, re } of FIELD_VARS) {
      const m = re.exec(p.name);
      if (!m) continue;
      const name = m[1]!;
      const style = groups.get(name) ?? ({ name, form: 'vars', selectorOrUtility: name, fields: { size: {} }, ...(p.source ? { source: p.source } : {}) } as TypeStyle);
      if (f === 'size') {
        if (!LENGTH.test(p.value)) break;
        style.fields.size = { token: p.name };
      } else style.fields[f] = { token: p.name };
      groups.set(name, style);
      break;
    }
  }
  const varStyles = [...groups.values()].filter((s) => s.fields.size.token);

  // Forms 3 and 4: rules that set a font size, outside any width or dark
  // condition, on one class or one tag.
  eachStyleRule(
    lists,
    (rule, groups, parents) => {
      const size = rule.style.getPropertyValue('font-size');
      if (!size) return;
      const media = groups.map(mediaOf).filter((m): m is string => m !== null);
      if (media.some((m) => widthOfMedia(m) !== null || isDarkMedia(m))) return;
      const selector = resolveNested(parents, rule.selectorText);
      const fields: TypeStyle['fields'] = { size: field(size) };
      const lh = rule.style.getPropertyValue('line-height');
      const ls = rule.style.getPropertyValue('letter-spacing');
      const fw = rule.style.getPropertyValue('font-weight');
      const ff = rule.style.getPropertyValue('font-family');
      if (lh) fields.lineHeight = field(lh);
      if (ls) fields.tracking = field(ls);
      if (fw) fields.weight = field(fw);
      if (ff) fields.family = field(ff);
      // A utility Tailwind generated for its own token is that token, not a second style.
      const tokens = Object.values(fields).map((f) => f?.token).filter(Boolean);
      if (tokens.length && tokens.every((t) => tailwindTokens.has(t))) return;
      const source = (rule as CSSStyleRule & { parentStyleSheet?: { href?: string | null } | null }).parentStyleSheet?.href ?? undefined;
      for (const part of splitSelectorList(selector)) {
        const p = part.trim();
        if (SINGLE_CLASS.test(p)) {
          add({ name: p.slice(1).replace(/\\/g, ''), form: 'class', selectorOrUtility: p, fields, ...(source ? { source } : {}) });
        } else if (BARE_TAG.test(p) && TEXT_TAGS.has(p.toLowerCase())) {
          const tag = p.toLowerCase();
          add({ name: tag, form: 'tag', selectorOrUtility: tag, tag, fields, ...(source ? { source } : {}) });
        }
      }
    },
    limit,
  );

  // A per-field variable that a class or tag rule reads as its size is that
  // rule's style, not a second one; the rest stand on their own.
  const consumed = new Set(styles.map((s) => s.fields.size.token).filter(Boolean));
  for (const s of varStyles) if (!consumed.has(s.fields.size.token)) add(s);

  // Largest first, then by name, so a ladder reads down.
  return styles.sort((a, b) => sizeOf(b, byName) - sizeOf(a, byName) || a.name.localeCompare(b.name));
}
