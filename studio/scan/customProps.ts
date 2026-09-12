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
  /** An `@import` rule's sheet, and the conditions it pulls it in under. */
  styleSheet?: { cssRules?: ArrayLike<RuleLike> | null } | null;
  media?: { mediaText?: string } | null;
  layerName?: string | null;
}

/**
 * A style rule, rather than something that merely looks like one.
 *
 * `@page` has both a `selectorText` and a `style`, so shape alone is not
 * enough: an at-rule is never a style rule, whatever it carries. Getting this
 * wrong emitted `{margin:24px}` — a qualified rule with no selector — into a
 * sheet meant for the page.
 */
const isStyleRule = (r: RuleLike): boolean =>
  typeof r.selectorText === 'string' && r.style != null && !(r.cssText ?? '').trimStart().startsWith('@');

const head = (r: RuleLike): string => (r.cssText ?? '').trimStart().slice(0, 8).toLowerCase();

/**
 * A nested selector, resolved against the rule it is written inside.
 *
 * This is what the CSS nesting spec says a nested rule means, and it has to
 * be done before a selector is re-emitted anywhere else: `&:hover` written
 * inside `.card` is `.card:hover`, but on its own `&` is `:scope`, which at
 * the top level of a stylesheet is `:root`. Re-emitting it verbatim turns a
 * rule about one card into a rule about the whole document.
 */
export function resolveNested(parents: string[], selector: string): string {
  if (!parents.length) return selector;
  // Fold the chain from the outside in, so each level is resolved against the
  // one above it before the child is resolved against that.
  let resolved = parents[0]!;
  for (const child of parents.slice(1)) resolved = combine(resolved, child);
  return combine(resolved, selector);
}

/**
 * One level of nesting. `:is()` is how the spec defines the parent reference,
 * and it takes the specificity of its most specific argument, which is what
 * nesting does — so a selector list for a parent cannot quietly change what
 * the child outranks.
 */
function combine(parent: string, child: string): string {
  const ref = `:is(${parent})`;
  return child.includes('&') ? child.replace(/&/g, ref) : `${ref} ${child}`;
}

/**
 * The head a grouping rule was written under, so a re-emitted rule can land
 * back in the same place: `@media (max-width: 700px)`, `@layer base`.
 */
export function groupHead(rule: RuleLike): string {
  const text = (rule.cssText ?? '').trimStart();
  const at = /^@[a-z-]+/i.exec(text)?.[0] ?? '';
  if (!at) return '';
  // `@layer base {` has its name in the text rather than in a condition.
  const name = rule.conditionText ?? text.slice(at.length, text.indexOf('{') === -1 ? undefined : text.indexOf('{')).trim();
  return name ? `${at} ${name}` : at;
}

/** The media condition a group head carries, or null when it is not a media rule. */
export const mediaOf = (head: string): string | null =>
  /^@media\s+/i.test(head) ? head.replace(/^@media\s+/i, '') : null;

/**
 * Every style rule in a set of lists, with the grouping rules open around it,
 * outermost first.
 *
 * One walk for every pass that reads a page, because the two that existed
 * before disagreed about what to recurse into and a definition went missing
 * in the gap. Callers take what they need from the stack: the width passes
 * want the media conditions, the override builder wants the heads so it can
 * put a rewritten rule back where the original was.
 */
export function eachStyleRule(
  lists: ArrayLike<RuleLike>[],
  visit: (rule: CSSStyleRule, groups: string[], parents: string[]) => void,
  limit = MAX_RULES,
): void {
  let visited = 0;
  const walk = (rules: ArrayLike<RuleLike>, media: string[], parents: string[]) => {
    for (const rule of Array.from(rules)) {
      if (++visited > limit) return;
      if (!rule) continue;

      if (isStyleRule(rule)) {
        visit(rule as unknown as CSSStyleRule, media, parents);
        // Nested CSS: a rule written inside this one, whose selector is
        // relative to it.
        if (rule.cssRules?.length) walk(rule.cssRules, media, [...parents, rule.selectorText!]);
        continue;
      }
      // A sheet reached by `@import` is not in `document.styleSheets`, so
      // this is the only place its rules can be seen at all. Its own
      // conditions come with it: `@import … print` means those rules are for
      // print, and dropping that would apply them everywhere.
      if (head(rule).startsWith('@import')) {
        try {
          const inner = rule.styleSheet?.cssRules;
          if (!inner?.length) continue;
          const conditions = [...media];
          if (typeof rule.layerName === 'string') conditions.push(rule.layerName ? `@layer ${rule.layerName}` : '@layer');
          const mediaText = rule.media?.mediaText?.trim();
          if (mediaText && mediaText !== 'all') conditions.push(`@media ${mediaText}`);
          walk(inner, conditions, parents);
        } catch {
          /* cross-origin: the fetched text covers it */
        }
        continue;
      }
      if (rule.cssRules?.length) {
        const g = groupHead(rule);
        walk(rule.cssRules, g ? [...media, g] : media, parents);
      }
    }
  };
  for (const list of lists) {
    if (visited > limit) break;
    walk(list, [], []);
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
  eachStyleRule(lists, (rule, groups) => {
    const media = groups.map(mediaOf).filter((m): m is string => m !== null);
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

  eachStyleRule(lists, (rule, groups) => {
    const media = groups.map(mediaOf).filter((m): m is string => m !== null);
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
