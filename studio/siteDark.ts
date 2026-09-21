/**
 * The three walks the re-skin script makes over the page's rules, as pure
 * functions over rule-shaped objects: the site's own dark rules hoisted out
 * of their media query, the light-only blocks that must be switched off
 * while that preview is up, and what a proposed stylesheet reaches.
 *
 * Structural rather than `instanceof`, like every other walk here
 * (`studio/scan/customProps.ts` says why): a rule is what it has, so a
 * plain object in a test and a `CSSMediaRule` in a browser read the same.
 */

import { groupHead, MAX_RULES, type RuleLike } from './scan/customProps';
import { sourceMedia } from './pageFrame';
import { hookFromSelector, hookKey, isDarkMedia, isLightOnly, withoutDarkQuery, type DarkHook } from './siteMode';

type Kind = 'media' | 'supports' | 'layer' | 'style' | 'other';

/** What a rule is, from what it has. `@page` has a selector and a style and is still not a style rule. */
export function kindOf(rule: RuleLike): Kind {
  const text = (rule.cssText ?? '').trimStart();
  if (text.startsWith('@')) {
    const at = /^@[a-z-]+/i.exec(text)?.[0]?.toLowerCase();
    if (at === '@media') return 'media';
    if (at === '@supports') return 'supports';
    if (at === '@layer' && rule.cssRules) return 'layer';
    return 'other';
  }
  return typeof rule.selectorText === 'string' && rule.style != null ? 'style' : 'other';
}

/** A media rule's condition as the page wrote it, whatever a device frame answered. */
const conditionOf = (rule: RuleLike): string => (rule.media ? sourceMedia(rule.media) : (rule.conditionText ?? ''));

export interface DarkHoist {
  /** The dark rules, re-emitted without their scheme query, in page order. */
  css: string[];
  /** The hooks the stylesheet hangs dark rules off, to be set on the root. */
  hooks: Map<string, DarkHook>;
}

/**
 * Rules under a dark media query, re-emitted without it. A dark query joined
 * to a breakpoint keeps the breakpoint; one joined with commas is left alone.
 * Hooks are collected from every style rule on the way, in or out of a dark
 * block, since a page that hangs its theme off `html.dark` writes those
 * rules in daylight.
 */
export function hoistDark(lists: ArrayLike<RuleLike>[], limit = MAX_RULES): DarkHoist {
  const hooks = new Map<string, DarkHook>();
  let count = 0;
  const walk = (rules: ArrayLike<RuleLike>, out: string[], inDark: boolean) => {
    for (const rule of Array.from(rules)) {
      if (count++ > limit) return;
      const kind = kindOf(rule);
      if (kind === 'media') {
        const condition = conditionOf(rule);
        const rest = withoutDarkQuery(condition);
        if (rest === undefined) {
          if (isDarkMedia(condition)) continue; // an arm we cannot separate
          const inner: string[] = [];
          walk(rule.cssRules ?? [], inner, inDark);
          if (inner.length) out.push(`@media ${condition}{${inner.join('')}}`);
          continue;
        }
        const inner: string[] = [];
        walk(rule.cssRules ?? [], inner, true);
        if (inner.length) out.push(rest ? `@media ${rest}{${inner.join('')}}` : inner.join(''));
        continue;
      }
      if (kind === 'supports' || kind === 'layer') {
        const inner: string[] = [];
        walk(rule.cssRules ?? [], inner, inDark);
        if (inner.length) out.push(`${groupHead(rule)}{${inner.join('')}}`);
        continue;
      }
      if (kind !== 'style') continue;
      if (inDark) out.push(rule.cssText ?? '');
      for (const sel of (rule.selectorText ?? '').split(',')) {
        const hook = hookFromSelector(sel.trim());
        if (hook) hooks.set(hookKey(hook), hook);
      }
    }
  };
  const css: string[] = [];
  for (const rules of lists) walk(rules, css, false);
  return { css, hooks };
}

/**
 * The media rules that apply in light only, wherever they are nested. While
 * the dark preview is up these are switched off in place — `not all` never
 * matches — because hoisting the dark rules alone would leave them live
 * wherever they outrank a hoisted rule. Finding them is the pure half; the
 * switching is the script's, since it has to be put back.
 */
export function lightOnlyMedia(lists: ArrayLike<RuleLike>[], limit = MAX_RULES): RuleLike[] {
  const found: RuleLike[] = [];
  let count = 0;
  const walk = (rules: ArrayLike<RuleLike>) => {
    for (const rule of Array.from(rules)) {
      if (count++ > limit) return;
      const kind = kindOf(rule);
      if (kind === 'media' && isLightOnly(conditionOf(rule))) {
        found.push(rule);
        continue;
      }
      if (kind === 'media' || kind === 'supports' || kind === 'layer') walk(rule.cssRules ?? []);
    }
  };
  for (const rules of lists) walk(rules);
  return found;
}

export interface Reach {
  /** Style rules in the sheet, applying or not. */
  rules: number;
  /** Selectors the page could not query. */
  unreadable: number;
  /** Custom properties the sheet sets, so the panel can say when one is locked. */
  declares: string[];
  /** Selectors to outline: what applies now, less any rule that sets its own outline. */
  selectors: string[];
  /** Every element an applying rule reaches, counted once. */
  matched: Set<Element>;
}

/**
 * What a proposed stylesheet reaches on the page as it stands: a rule under
 * a media or supports condition the page does not meet right now is counted
 * but reaches nothing, and a rule that sets its own outline is not marked,
 * or the mark would paint over the very thing it proposes.
 */
export function previewReach(
  rules: ArrayLike<RuleLike>,
  page: {
    mediaMatches: (condition: string) => boolean;
    supports: (condition: string) => boolean;
    query: (selector: string) => ArrayLike<Element>;
  },
): Reach {
  const reach: Reach = { rules: 0, unreadable: 0, declares: [], selectors: [], matched: new Set() };
  const walk = (list: ArrayLike<RuleLike>, applies: boolean) => {
    for (const rule of Array.from(list)) {
      const kind = kindOf(rule);
      if (kind === 'media') {
        walk(rule.cssRules ?? [], applies && page.mediaMatches(rule.conditionText ?? conditionOf(rule)));
        continue;
      }
      if (kind === 'supports') {
        walk(rule.cssRules ?? [], applies && page.supports(rule.conditionText ?? ''));
        continue;
      }
      if (kind === 'layer') {
        walk(rule.cssRules ?? [], applies);
        continue;
      }
      if (kind !== 'style') continue;
      reach.rules++;
      let ownOutline = false;
      for (const prop of Array.from(rule.style as ArrayLike<string>)) {
        if (prop.startsWith('--') && !reach.declares.includes(prop)) reach.declares.push(prop);
        if (prop === 'outline' || prop.startsWith('outline-')) ownOutline = true;
      }
      if (!applies) continue;
      const selector = rule.selectorText ?? '';
      try {
        for (const el of Array.from(page.query(selector))) reach.matched.add(el);
        if (!ownOutline && !reach.selectors.includes(selector)) reach.selectors.push(selector);
      } catch {
        reach.unreadable++;
      }
    }
  };
  walk(rules, true);
  return reach;
}
