/**
 * Reading a page's custom properties out of its stylesheets.
 *
 * This used to live inside the scanner content script, where the only way to
 * check it was to open a page and squint — and it is where most of this
 * project's reading bugs have been: a variable redefined under a width query
 * dropped, a negated media query read as the breakpoint it names, a media
 * query nested inside a style rule invisible because one of the two walks
 * recursed into them and the other did not.
 *
 * So the walking happens once, here, over rule lists the caller hands in. The
 * content script keeps the part that genuinely needs a browser: deciding
 * which stylesheets are the page's and fetching the ones it cannot read.
 */

import type { CustomPropInfo } from '@/shared/types';
import { hookFromSelector, isDarkMedia, widthOfMedia } from '../siteMode';

/** A pathological page should not hang the panel; stop well before that. */
export const MAX_RULES = 20_000;

/**
 * A rule, as this walk needs to see it.
 *
 * Structural rather than `instanceof`: the browser's rule classes are not all
 * present in every engine — `CSSLayerBlockRule` is missing from several, and
 * a test environment may parse `@layer` into nothing at all — and a walk that
 * silently skips what it cannot name is exactly how a definition goes
 * missing. Asking what a rule *has* works everywhere, and can be asked of a
 * plain object.
 */
export interface RuleLike {
  cssText?: string;
  cssRules?: ArrayLike<RuleLike> | null;
  /** A style rule has both of these; nothing else does. */
  selectorText?: string;
  style?: CSSStyleDeclaration;
  /** A conditional group rule's condition, e.g. `(max-width: 700px)`. */
  conditionText?: string;
  /** An `@import` rule's sheet. */
  styleSheet?: { cssRules?: ArrayLike<RuleLike> | null } | null;
}

const isStyleRule = (r: RuleLike): boolean => typeof r.selectorText === 'string' && r.style != null;
const head = (r: RuleLike): string => (r.cssText ?? '').trimStart().slice(0, 8).toLowerCase();

/**
 * Every style rule in a set of lists, with the media conditions open around
 * it.
 *
 * `@supports`, `@layer` and `@container` wrap without being a width or a
 * scheme, so they pass their conditions through untouched; only `@media`
 * adds one.
 */
export function eachStyleRule(
  lists: ArrayLike<RuleLike>[],
  visit: (rule: CSSStyleRule, media: string[]) => void,
  limit = MAX_RULES,
): void {
  let visited = 0;
  const walk = (rules: ArrayLike<RuleLike>, media: string[]) => {
    for (const rule of Array.from(rules)) {
      if (++visited > limit) return;
      if (!rule) continue;

      if (isStyleRule(rule)) {
        visit(rule as unknown as CSSStyleRule, media);
        // Nested CSS: a media query written inside a style rule.
        if (rule.cssRules?.length) walk(rule.cssRules, media);
        continue;
      }
      // A sheet reached by `@import` is not in `document.styleSheets`, so
      // this is the only place its rules can be seen at all.
      if (head(rule).startsWith('@import')) {
        try {
          const inner = rule.styleSheet?.cssRules;
          if (inner?.length) walk(inner, media);
        } catch {
          /* cross-origin: the fetched text covers it */
        }
        continue;
      }
      if (rule.cssRules?.length) {
        const condition = head(rule).startsWith('@media') ? (rule.conditionText ?? '') : '';
        walk(rule.cssRules, condition ? [...media, condition] : media);
      }
    }
  };
  for (const list of lists) {
    if (visited > limit) break;
    walk(list, []);
  }
}

/** The custom properties this rule declares, as name/value pairs. */
function declarationsOf(rule: CSSStyleRule): [string, string][] {
  const out: [string, string][] = [];
  for (const prop of Array.from(rule.style)) {
    if (!prop.startsWith('--')) continue;
    const value = rule.style.getPropertyValue(prop).trim();
    if (value) out.push([prop, value]);
  }
  return out;
}

/** Whether any selector in the list is one of the page's dark theme hooks. */
const hasDarkHook = (rule: CSSStyleRule): boolean =>
  rule.selectorText.split(',').some((s) => hookFromSelector(s.trim()) !== null);

/**
 * Every custom property a page declares, by text.
 *
 * First definition wins, as the cascade did when the page loaded. The two
 * passes below read the object model afterwards for the values this cannot
 * see: the ones under a dark block, and the ones under a width.
 */
export function extractCustomProps(
  sheets: { href: string | null; text: string }[],
  allCss: string,
): CustomPropInfo[] {
  const map = new Map<string, { value: string; source?: string }>();
  for (const sheet of sheets) {
    for (const m of sheet.text.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
      const name = m[1]!;
      if (map.has(name)) continue;
      map.set(name, { value: m[2]!.trim(), source: sheet.href ?? undefined });
    }
  }
  return Array.from(map, ([name, { value, source }]) => ({
    name,
    value,
    source,
    // Blast radius: how many declarations lean on this token.
    uses: allCss.split(`var(${name}`).length - 1,
  }));
}

/**
 * The value each variable takes under the page's own dark mode.
 *
 * The text pass keeps the first definition, as the cascade does in light;
 * this takes the last one found under a dark media query or a dark theme
 * hook, which is what the cascade does there.
 */
export function attachDarkValues(props: CustomPropInfo[], lists: ArrayLike<RuleLike>[]): void {
  const byName = new Map(props.map((p) => [p.name, p]));
  eachStyleRule(lists, (rule, media) => {
    if (!media.some(isDarkMedia) && !hasDarkHook(rule)) return;
    for (const [name, value] of declarationsOf(rule)) {
      const known = byName.get(name);
      if (known && value !== known.value) known.dark = value;
    }
  });
}

/**
 * The value each variable takes inside a width query, where it differs from
 * its base value, and every width the page is written against.
 *
 * Dark blocks are left to the pass above so a value is filed once — but a
 * breakpoint inside one is still a width this page designs at, so the
 * collection does not skip it.
 */
export function attachWidthValues(
  props: CustomPropInfo[],
  lists: ArrayLike<RuleLike>[],
  breakpoints?: Set<string>,
): void {
  const byName = new Map(props.map((p) => [p.name, p]));
  /** Names defined somewhere outside any width query: they have a base value. */
  const outside = new Set<string>();
  /** The first width query each name's base value was seen under, in case it has no other home. */
  const firstAt = new Map<string, string>();

  eachStyleRule(lists, (rule, media) => {
    const widths = media.map(widthOfMedia).filter((w): w is string => w !== null);
    if (breakpoints) for (const w of widths) for (const part of w.split(' and ')) breakpoints.add(part);

    // A value under a dark block belongs to the dark pass, not here.
    if (media.some(isDarkMedia) || hasDarkHook(rule)) return;
    const width = widths.length ? widths.join(' and ') : null;

    for (const [name, value] of declarationsOf(rule)) {
      const known = byName.get(name);
      if (!known) continue;
      if (!width) {
        outside.add(name);
        continue;
      }
      if (value === known.value) {
        if (!firstAt.has(name)) firstAt.set(name, width);
        continue;
      }
      known.atWidth = { ...known.atWidth, [width]: value };
    }
  });

  for (const [name, at] of firstAt) {
    const known = byName.get(name);
    if (known && !outside.has(name)) known.onlyAt = at;
  }
}
