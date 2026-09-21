/**
 * The text of the two stylesheets a condition needs, as pure functions.
 *
 * Both of these used to be the sort of thing that only ever ran inside a
 * content script, where the only way to check them was to look at a page and
 * squint. They are string-in, string-out, so they are checked here instead;
 * the content script keeps the part that genuinely needs a browser — reading
 * the page's own rules out of the CSSOM, and putting a class on an element.
 */

import { cascadeOrder, conditionKey, mediaFor, selectorFor, stateClass, type MaybeCondition, type StateName } from './conditions';
import { keyframesCss, namesIn } from './animation';
import { eachStyleRule, MAX_RULES, resolveNested, type RuleLike } from './scan/customProps';

export interface ConditionRule {
  selector: string;
  property: string;
  value: string;
  condition?: MaybeCondition;
}

/**
 * The managed sheet for element edits.
 *
 * Grouped by condition and emitted least specific first, so a hover colour
 * beats the default one without either needing more weight than the other.
 * `!important` stays on every declaration, as it was before conditions: the
 * page's own rules are not ours to outrank politely.
 */
export function elementsSheet(rules: ConditionRule[], opts: { darkPreview?: boolean } = {}): string {
  if (!rules.length) return '';
  // A preset's keyframes are defined once, ahead of the rules that name them.
  const keyframes = new Set<string>();
  for (const rule of rules) {
    if (rule.property !== 'animation') continue;
    for (const name of namesIn(rule.value)) {
      const css = keyframesCss(name);
      if (css) keyframes.add(css);
    }
  }
  const groups = new Map<string, { condition: MaybeCondition; bySelector: Map<string, string[]> }>();

  for (const rule of rules) {
    const key = conditionKey(rule.condition);
    const group = groups.get(key) ?? { condition: rule.condition, bySelector: new Map<string, string[]>() };
    const selector = selectorFor(rule.selector, rule.condition);
    const list = group.bySelector.get(selector) ?? [];
    list.push(`${rule.property}:${rule.value} !important`);
    group.bySelector.set(selector, list);
    groups.set(key, group);
  }

  const sheet = [...groups.values()]
    .sort((a, b) => cascadeOrder(a.condition) - cascadeOrder(b.condition))
    .map(({ condition, bySelector }) => {
      const body = [...bySelector].map(([sel, decls]) => `${sel}{${decls.join(';')}}`).join('\n');
      const media = mediaFor(condition, opts.darkPreview);
      return media ? `${media}{\n${body}\n}` : body;
    })
    .join('\n');
  return [...keyframes, sheet].join('\n');
}

/* ---------------- holding an element in a state ---------------- */

/** One of the page's own rules, as the content script reads it out of the CSSOM. */
export interface PageRule {
  selector: string;
  /** The declarations, as the browser serialises them. */
  cssText: string;
  /** The `@media`/`@supports`/`@layer` heads it sits inside, outermost first. */
  groups?: string[];
  /** Where it came from, for the read-only list the panel shows. */
  source?: string;
}

/**
 * The page's own rules that mention one of `pseudos`, as the hoist needs them.
 *
 * The same walk every other reading of the page uses, so it sees what they
 * see — and in particular a rule written with native nesting. The walk this
 * replaced never went inside a style rule, so on a page that writes
 * `.btn { &:hover { … } }` it found nothing, held the element in no state,
 * and told the person "this page adds nothing on hover" when it plainly did.
 * A nested selector is resolved against its parents before anything else
 * reads it, since `&:hover` on its own means `:root:hover`.
 */
export function collectStateRules(lists: ArrayLike<RuleLike>[], pseudos: string[], limit = MAX_RULES): PageRule[] {
  const collected: PageRule[] = [];
  eachStyleRule(
    lists,
    (rule, groups, parents) => {
      const selector = resolveNested(parents, rule.selectorText);
      if (!pseudos.some((p) => selector.includes(p))) return;
      collected.push({ selector, cssText: rule.style.cssText, groups });
    },
    limit,
  );
  return collected;
}

/** A rule rewritten so it applies to an element wearing the state class. */
export interface HoistedRule {
  /** The rewritten selector. */
  selector: string;
  /**
   * The same selector with the pseudo simply removed. Whether this matches
   * the element decides whether the rule reaches it — a question for the
   * page, which is why it travels rather than being answered here.
   */
  bare: string;
  cssText: string;
  groups: string[];
  source?: string;
  /**
   * True when the pseudo-class sits on an ancestor (`.card:hover .title`), so
   * the class on the selection cannot trigger it. Reported rather than
   * painted: the panel says the rule exists and what it does.
   */
  onAncestor: boolean;
}

/**
 * Rewrites the page's own `:hover` rules so they apply to an element that is
 * merely wearing our class.
 *
 * This is how a state previews with no debugger permission and no infobar:
 * the page keeps its own rules, and a copy of them lands in a sheet that
 * triggers on a class the inspector controls.
 *
 * A rule is taken only when the pseudo sits on the last compound of the
 * selector, which is the element the class goes on. `.card:hover .title`
 * styles a descendant when an ancestor is hovered, and no class on `.title`
 * can stand in for that — it is reported with `onAncestor` so the panel can
 * say so instead of silently doing nothing.
 */
export function hoistState(rules: PageRule[], state: StateName, pseudos: string[]): HoistedRule[] {
  const cls = `.${stateClass(state)}`;
  const out: HoistedRule[] = [];

  for (const rule of rules) {
    // A selector list is taken apart: one part may mention the pseudo and the
    // rest not, and re-emitting all of them would style far too much.
    const parts = splitSelectorList(rule.selector);
    const taken: string[] = [];
    const takenBare: string[] = [];
    const ancestorParts: string[] = [];
    const ancestorBare: string[] = [];

    for (const part of parts) {
      const where = lastPseudoPosition(part, pseudos);
      if (where === null) continue;
      const bare = bareSelector(part, pseudos);
      if (!where.onLastCompound) {
        ancestorParts.push(part);
        ancestorBare.push(bare);
        continue;
      }
      taken.push(part.slice(0, where.index) + cls + part.slice(where.index + where.length));
      takenBare.push(bare);
    }

    if (taken.length) {
      out.push({
        selector: taken.join(', '),
        bare: takenBare.filter(Boolean).join(', '),
        cssText: rule.cssText,
        groups: rule.groups ?? [],
        ...(rule.source ? { source: rule.source } : {}),
        onAncestor: false,
      });
    } else if (ancestorParts.length) {
      out.push({
        selector: ancestorParts.join(', '),
        bare: ancestorBare.filter(Boolean).join(', '),
        cssText: rule.cssText,
        groups: rule.groups ?? [],
        ...(rule.source ? { source: rule.source } : {}),
        onAncestor: true,
      });
    }
  }
  return out;
}

/** The sheet text for a set of hoisted rules, wrappers and all. */
export function stateSheet(hoisted: HoistedRule[]): string {
  return hoisted
    .filter((h) => !h.onAncestor && h.cssText.trim())
    .map((h) => {
      const body = `${h.selector}{${h.cssText}}`;
      return h.groups.reduceRight((inner, head) => `${head}{${inner}}`, body);
    })
    .join('\n');
}

/**
 * A selector reduced to "which elements could this ever be about".
 *
 * Every state pseudo goes, not only the one that was matched: `.a:hover
 * .b:hover` reaches `.b` whenever both are hovered, and asking the page
 * whether `.b` matches `.a:hover .b` would answer no unless a pointer really
 * were there. Pseudo-elements go too, since `matches('.x::before')` is not a
 * question the DOM will answer at all. A part that is nothing but a pseudo
 * (`:hover` alone) becomes `*`, which is what it meant.
 */
export function bareSelector(part: string, pseudos: string[]): string {
  let out = part;
  // Longest first, so `:focus-visible` is not half-eaten by `:focus`.
  const targets = [...pseudos].sort((a, b) => b.length - a.length);
  for (const pseudo of targets) {
    for (;;) {
      const at = topLevelOccurrences(out, pseudo).filter((i) => {
        const after = out[i + pseudo.length];
        return !(after && /[a-z-]/i.test(after));
      });
      if (!at.length) break;
      const index = at[0]!;
      out = out.slice(0, index) + out.slice(index + pseudo.length);
    }
  }
  // `::before`, `::selection`, and the four legacy single-colon spellings.
  out = out.replace(/::[a-z-]+(\([^)]*\))?/gi, '').replace(/:(before|after|first-line|first-letter)\b/gi, '');
  const trimmed = out.trim().replace(/\s+/g, ' ');
  return trimmed && trimmed !== '>' ? trimmed : '*';
}

/* ---------------- the small amount of selector parsing this needs ---------------- */

/** Splits `a, b:hover` on its top-level commas, leaving `:is(a, b)` alone. */
export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * Where the last of `pseudos` appears in one selector, and whether it sits on
 * the compound the element itself matches — the part after the final
 * combinator.
 */
export function lastPseudoPosition(
  part: string,
  pseudos: string[],
): { index: number; length: number; onLastCompound: boolean } | null {
  let best: { index: number; length: number } | null = null;
  for (const pseudo of pseudos) {
    // A bare index would match `:hover` inside `:not(:hover)`, which is a
    // different rule entirely; only a top-level occurrence counts.
    for (const index of topLevelOccurrences(part, pseudo)) {
      const after = part[index + pseudo.length];
      // `:focus` must not match the `:focus` inside `:focus-visible`.
      if (after && /[a-z-]/i.test(after)) continue;
      if (!best || index > best.index) best = { index, length: pseudo.length };
    }
  }
  if (!best) return null;
  const lastCombinator = lastTopLevelCombinator(part);
  return { ...best, onLastCompound: best.index > lastCombinator };
}

/** Every index of `needle` in `haystack` outside brackets and quotes. */
function topLevelOccurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  let depth = 0;
  let quote = '';
  for (let i = 0; i < haystack.length; i++) {
    const ch = haystack[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && haystack.startsWith(needle, i)) found.push(i);
  }
  return found;
}

/** The index of the last top-level combinator, or -1 when the selector is one compound. */
function lastTopLevelCombinator(part: string): number {
  let depth = 0;
  let quote = '';
  let last = -1;
  for (let i = 0; i < part.length; i++) {
    const ch = part[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) last = i;
  }
  return last;
}
