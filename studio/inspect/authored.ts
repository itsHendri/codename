/**
 * Which declaration paints each property of one element, as its author
 * wrote it.
 *
 * A computed value cannot say where it came from: `color: rgb(21, 23, 27)`
 * looks the same whether the author wrote the literal or `var(--ink)`. The
 * rules can. This walks the page's rules, keeps the ones the element
 * matches with their conditions in force, and orders them as the cascade
 * does — importance, layers, specificity, source order — so the panel can
 * say "is `--ink`" and mean it. Wherever the answer could be wrong, it is
 * marked uncertain, and the panel falls back to "matches".
 */

import type { AuthoredDecl } from '@/shared/types';
import { bareSelector, splitSelectorList } from '../conditionSheet';
import { eachStyleRule, MAX_RULES, mediaOf, resolveNested, type RuleLike } from '../scan/customProps';
import { compare, specificity, type Specificity } from '../scan/specificity';
import { plainVar } from '../scan/alias';

export const AUTHORED_PROPS = [
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'fill',
  'stroke',
  'font-family',
  'font-size',
  'line-height',
  'letter-spacing',
  'font-weight',
  'border-radius',
  'box-shadow',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'row-gap',
  'column-gap',
] as const;

/** Where a longhand's value comes from when the author wrote the shorthand with a `var()` in it. */
const SHORTHAND: Record<string, string[]> = {
  'padding-top': ['padding', 'padding-block'],
  'padding-bottom': ['padding', 'padding-block'],
  'padding-left': ['padding', 'padding-inline'],
  'padding-right': ['padding', 'padding-inline'],
  'margin-top': ['margin', 'margin-block'],
  'margin-bottom': ['margin', 'margin-block'],
  'margin-left': ['margin', 'margin-inline'],
  'margin-right': ['margin', 'margin-inline'],
  'border-top-color': ['border-color', 'border-top', 'border'],
  'border-color': ['border'],
  'row-gap': ['gap'],
  'column-gap': ['gap'],
  'border-radius': [],
};

/**
 * Properties an element takes from its ancestors when nothing sets them on
 * it. `font-size` is among them only when what the ancestor wrote is not
 * relative to its own parent: an inherited `1.2em` is a different number on
 * each level, and would be reported for the wrong one.
 */
const INHERITED = new Set(['color', 'font-family', 'font-weight', 'font-size', 'line-height', 'letter-spacing']);
const relative = (value: string) => /(em|%)\s*$/i.test(value) && !/^var\(/i.test(value);

/** The pseudo-classes that mean a state, which a rule is in force for only while the state holds. */
const STATE_PSEUDOS = [':hover', ':focus-visible', ':focus-within', ':focus', ':active'];

export interface AuthoredOptions {
  /** Whether a media condition is in force right now, as the frame answers it. */
  mediaMatches: (condition: string) => boolean;
  /** How many of the page's stylesheets could not be read; any means an answer could be wrong. */
  unreadable: number;
  /** A state the inspector is holding the element in: `:hover`, say. Its rules then count. */
  heldState?: string | null;
  /** The read stops here and marks the rest uncertain; a selection should not cost a frame. */
  budgetMs?: number;
  now?: () => number;
  limit?: number;
}

interface Candidate {
  value: string;
  important: boolean;
  layer: string | undefined;
  spec: Specificity;
  order: number;
  selector: string;
  source?: string;
  groups: string[];
  inline: boolean;
}

/** Whether `part` names a state pseudo other than the one being held. */
const inOtherState = (part: string, held: string | null | undefined): boolean =>
  STATE_PSEUDOS.some((p) => p !== held && new RegExp(`${p.replace(/[-]/g, '\\-')}(?![\\w-])`).test(part));

const hasPseudoElement = (part: string): boolean => /::[a-z-]+|:(before|after|first-line|first-letter)\b/i.test(part);

/** The `--x` at the top of a value, when there is one. */
const tokenOf = (value: string): string | undefined => plainVar(value)?.name;

/**
 * Cascade order between two declarations of the same property, as the
 * spec puts it: important beats normal; among normal declarations an
 * unlayered one beats a layered one; then specificity; then the later one.
 * Layer against layer is left to `certain`: the order of layers is a
 * statement this walk does not see.
 */
function beats(x: Candidate, y: Candidate): number {
  if (x.important !== y.important) return x.important ? 1 : -1;
  // A style attribute beats every rule of the same importance.
  if (x.inline !== y.inline) return x.inline ? 1 : -1;
  const xl = x.layer !== undefined;
  const yl = y.layer !== undefined;
  if (xl !== yl) {
    // For normal declarations the unlayered wins; for important ones, the layered.
    const unlayeredWins = !x.important;
    return (xl ? -1 : 1) * (unlayeredWins ? 1 : -1);
  }
  const s = compare(x.spec, y.spec);
  if (s) return s;
  return x.order - y.order;
}

export function authoredFor(el: Element, lists: ArrayLike<RuleLike>[], opts: AuthoredOptions): Record<string, AuthoredDecl> {
  const now = opts.now ?? (() => Date.now());
  const started = now();
  const budget = opts.budgetMs ?? 20;
  const own = readOwn(el, lists, opts, new Set(AUTHORED_PROPS), { started, budget, now });
  // What the element takes from its ancestors: the nearest one that sets
  // each inheriting property is where the author decided it, and that is
  // the declaration to name — `body { color: var(--ink) }` is what makes
  // the heading ink.
  const missing = new Set([...INHERITED].filter((p) => !own.out[p]));
  let overBudget = own.overBudget;
  for (let node = el.parentElement; node && missing.size && !overBudget; node = node.parentElement) {
    const up = readOwn(node, lists, opts, missing, { started, budget, now });
    overBudget = up.overBudget;
    for (const prop of [...missing]) {
      const decl = up.out[prop];
      if (!decl) continue;
      if (prop === 'font-size' && relative(decl.value)) {
        missing.delete(prop);
        continue;
      }
      own.out[prop] = { ...decl, inherited: true, certain: decl.certain && !overBudget };
      missing.delete(prop);
    }
  }
  if (overBudget) for (const decl of Object.values(own.out)) decl.certain = false;
  return own.out;
}

/** The declarations on one element itself, for the properties asked about. */
function readOwn(
  el: Element,
  lists: ArrayLike<RuleLike>[],
  opts: AuthoredOptions,
  wanted: Set<string>,
  clock: { started: number; budget: number; now: () => number },
): { out: Record<string, AuthoredDecl>; overBudget: boolean } {
  const { started, budget, now } = clock;
  const inShadow = el.getRootNode() !== el.ownerDocument;
  let overBudget = false;
  const candidates = new Map<string, Candidate[]>();
  const push = (prop: string, c: Candidate) => (candidates.get(prop) ?? candidates.set(prop, []).get(prop)!).push(c);
  let order = 0;

  // The style attribute: certain, and ahead of every normal rule.
  const inline = (el as HTMLElement).style;
  if (inline && inline.length) {
    for (const prop of wanted) {
      const value = inline.getPropertyValue(prop) || shorthandValue(inline, prop);
      if (!value) continue;
      push(prop, { value, important: inline.getPropertyPriority(prop) === 'important', layer: undefined, spec: [0, 0, 0], order: Number.MAX_SAFE_INTEGER, selector: 'inline', groups: [], inline: true });
    }
  }

  eachStyleRule(
    lists,
    (rule, groups, parents) => {
      if (overBudget) return;
      if (++order % 200 === 0 && now() - started > budget) {
        overBudget = true;
        return;
      }
      // Any property we care about, or nothing to do.
      let any = false;
      for (const prop of wanted) {
        if (rule.style.getPropertyValue(prop) || SHORTHAND[prop]?.some((s) => rule.style.getPropertyValue(s))) {
          any = true;
          break;
        }
      }
      if (!any) return;
      const media = groups.map(mediaOf).filter((m): m is string => m !== null);
      if (!media.every((m) => opts.mediaMatches(m))) return;
      const layer = [...groups].reverse().find((g) => /^@layer\b/i.test(g))?.replace(/^@layer\s*/i, '').trim();
      const selector = resolveNested(parents, rule.selectorText);
      const source = (rule as CSSStyleRule & { parentStyleSheet?: { href?: string | null } | null }).parentStyleSheet?.href ?? undefined;
      for (const part of splitSelectorList(selector)) {
        if (hasPseudoElement(part)) continue;
        if (inOtherState(part, opts.heldState)) continue;
        const bare = bareSelector(part, STATE_PSEUDOS);
        let matches = false;
        try {
          matches = el.matches(bare);
        } catch {
          matches = false;
        }
        if (!matches) continue;
        const spec = specificity(part);
        for (const prop of wanted) {
          const value = rule.style.getPropertyValue(prop) || shorthandValue(rule.style, prop);
          if (!value) continue;
          push(prop, { value: value.trim(), important: rule.style.getPropertyPriority(prop) === 'important', layer: layer || undefined, spec, order, selector: part, ...(source ? { source } : {}), groups, inline: false });
        }
      }
    },
    opts.limit ?? MAX_RULES,
  );

  const out: Record<string, AuthoredDecl> = {};
  for (const [prop, list] of candidates) {
    const sorted = [...list].sort(beats);
    const winner = sorted[sorted.length - 1]!;
    const runnerUp = sorted[sorted.length - 2];
    // Two layered rules competing: which layer comes first is a statement
    // this walk does not read, so the answer stands only when the winner
    // won on something other than layer order.
    const layerContest = !!runnerUp && winner.layer !== undefined && runnerUp.layer !== undefined && winner.layer !== runnerUp.layer && winner.important === runnerUp.important;
    const token = tokenOf(winner.value);
    out[prop] = {
      value: winner.value,
      ...(token ? { token } : {}),
      rule: { selector: winner.selector, ...(winner.source ? { source: winner.source } : {}), groups: winner.groups },
      important: winner.important,
      certain: !overBudget && !inShadow && opts.unreadable === 0 && !layerContest,
    };
  }
  return { out, overBudget };
}

/**
 * A longhand's value when the author wrote a shorthand with a `var()` in it:
 * the object model then answers nothing for the longhand, and the shorthand
 * text is what the author decided.
 */
function shorthandValue(style: CSSStyleDeclaration, prop: string): string {
  for (const s of SHORTHAND[prop] ?? []) {
    const v = style.getPropertyValue(s);
    if (v && /var\(/i.test(v)) return v;
  }
  return '';
}
