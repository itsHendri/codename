/**
 * The state an element edit is about.
 *
 * Until now every edit meant "this element, as it sits there" — which is the
 * default state and nothing else. Most of what a designer actually adjusts
 * lives in the other ones: what a button does under the pointer, what a link
 * does when tabbed to, what a card does at 700px.
 *
 * A condition is one of those, and only one: hover, focus, active, dark, or a
 * width. Compound conditions (hover at 700px) are deliberately absent — the
 * combinations multiply, the cascade between them stops being obvious, and
 * every real page this was tried against wanted one at a time.
 *
 * Order is fixed rather than reorderable, which is where this parts company
 * with the tool that suggested it. A reorderable list is the honest UI when
 * the list *is* the stylesheet; here the page's own rules are underneath and
 * ours sit on top of them, so an order the person chose would be a promise
 * this cannot keep. Instead the order is stated: default, then width, then
 * dark, then state — least specific first, so each can override the last.
 */

import { DEVICE_PRESETS } from '@/shared/types';

export type StateName = 'hover' | 'focus' | 'active';

export type Condition =
  | { kind: 'state'; state: StateName }
  | { kind: 'scheme'; scheme: 'dark' }
  /**
   * A width the page is written against. `dir` is which side of it: `max` is
   * "this width and narrower", `min` is "this width and wider" — a page
   * written mobile-first says everything in `min`, and offering it `max`
   * would be offering it a vocabulary it does not use.
   */
  | { kind: 'width'; preset: string; dir: 'max' | 'min'; px: number };

/** The default state, written as the absence of a condition. */
export type MaybeCondition = Condition | undefined;

/** The pseudo-class each state really means. */
const PSEUDO: Record<StateName, string> = {
  hover: ':hover',
  // Not `:focus`: a mouse click should not light up a focus ring, and every
  // page written this decade agrees. The preview hoists `:focus` too, and the
  // brief says which it means.
  focus: ':focus-visible',
  active: ':active',
};

export const STATES: StateName[] = ['hover', 'focus', 'active'];

/** A stable key for grouping and storage. Never shown to anyone. */
export function conditionKey(condition: MaybeCondition): string {
  if (!condition) return 'default';
  if (condition.kind === 'state') return `state:${condition.state}`;
  if (condition.kind === 'scheme') return 'scheme:dark';
  return `width:${condition.dir}:${condition.px}`;
}

/** The class the inspector puts on an element to hold it in a state. */
export const stateClass = (state: StateName): string => `codename-state-${state}`;

/** Every state class, for a script that needs to take them all off. */
export const STATE_CLASSES: string[] = STATES.map(stateClass);

/**
 * The selector a managed rule should carry.
 *
 * A state writes both the real pseudo-class and the stand-in class, so the
 * edit is visible while the panel is holding the element in that state *and*
 * when the person actually hovers it with their own pointer. Getting only the
 * second would make the preview a lie.
 */
export function selectorFor(selector: string, condition: MaybeCondition): string {
  if (condition?.kind !== 'state') return selector;
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
  return parts
    .flatMap((part) => [`${part}${PSEUDO[condition.state]}`, `${part}.${stateClass(condition.state)}`])
    .join(', ');
}

/** The at-rule a condition's rules sit inside, or null for none. */
export function mediaFor(condition: MaybeCondition, darkPreview = false): string | null {
  if (condition?.kind === 'width') return `@media (${condition.dir}-width: ${condition.px}px)`;
  // While the panel is previewing dark, the page is being painted as dark
  // whatever the browser thinks, so the query would never match.
  if (condition?.kind === 'scheme') return darkPreview ? null : '@media (prefers-color-scheme: dark)';
  return null;
}

/**
 * Where a condition's rules go in the managed sheet: later wins, so this is
 * least specific first. Stated rather than chosen, see the note at the top.
 *
 * Two widths both match at a narrow viewport, and they are the same
 * specificity, so the narrower one has to come last or a rule written for
 * phones would lose to one written for tablets. Widths therefore sort
 * descending inside their own band rather than tying, which is what a
 * hand-written stylesheet does too.
 */
export function cascadeOrder(condition: MaybeCondition): number {
  if (!condition) return 0;
  if (condition.kind === 'width') {
    // Max-widths take the lower half of the band and min-widths the upper,
    // so a page mixing the two still has one order. Inside each half the one
    // that applies to fewer widths comes last: narrower for `max`, wider for
    // `min`, which is what a hand-written stylesheet does.
    return condition.dir === 'max'
      ? 1 + 0.5 / (1 + condition.px)
      : 1.5 + (0.5 * condition.px) / (1 + condition.px);
  }
  if (condition.kind === 'scheme') return 2;
  return 3;
}

/** What to call a condition in the panel and in the brief. */
export function describe(condition: MaybeCondition): string {
  if (!condition) return 'default';
  if (condition.kind === 'state') return condition.state;
  if (condition.kind === 'scheme') return 'dark';
  return `${condition.dir === 'max' ? '≤' : '≥'}${condition.px}`;
}

/** The longer form, for a brief that has to stand on its own. */
export function describeLong(condition: MaybeCondition): string {
  if (!condition) return 'the default state';
  if (condition.kind === 'state') return `\`${PSEUDO[condition.state]}\``;
  if (condition.kind === 'scheme') return "the page's own dark mode";
  return `\`@media (${condition.dir}-width: ${condition.px}px)\``;
}

/** The pseudo-classes a state's preview has to hoist off the page's own rules. */
export function pseudosOf(state: StateName): string[] {
  // `:focus-visible` is what we write, but a page that only styles `:focus`
  // still has to show something, so both are read.
  return state === 'focus' ? [':focus-visible', ':focus'] : [PSEUDO[state]];
}

/**
 * The widest and narrowest a window can usefully be asked for.
 *
 * `@media (max-width: 5000px)` is an "always" wrapper rather than a
 * breakpoint, and no display can deliver it: the page would be zoomed past
 * the floor the browser allows and the viewport would not be what was asked
 * for. Offering it would be offering something that cannot be shown.
 */
export const WIDTH_RANGE = { min: 200, max: 2560 };

/** The direction and pixel width of a width query, or null for anything else. */
export function widthOf(query: string): { dir: 'max' | 'min'; px: number } | null {
  const m = /^\(\s*(max|min)-width:\s*([\d.]+)px\s*\)$/i.exec(query.trim());
  if (!m) return null;
  const px = Number(m[2]);
  if (!Number.isFinite(px) || px < WIDTH_RANGE.min || px > WIDTH_RANGE.max) return null;
  return { dir: m[1]!.toLowerCase() as 'max' | 'min', px };
}

/**
 * The widths on offer.
 *
 * The page's own breakpoints when it has any, because those are the widths it
 * was actually designed at — offering a device preset instead invited a brief
 * to name `768px` for an element beside the `700px` the page really uses, and
 * an agent to add a breakpoint the project does not have. Where the page has
 * none to read, the bar's device presets are the only sensible guess and are
 * labelled as the devices they are.
 */
export function widthConditions(breakpoints?: string[]): Condition[] {
  const seen = new Set<string>();
  const own: Condition[] = [];
  for (const query of breakpoints ?? []) {
    const w = widthOf(query);
    if (!w) continue;
    const key = `${w.dir}:${w.px}`;
    if (seen.has(key)) continue;
    seen.add(key);
    own.push({ kind: 'width', preset: `${w.px}px`, dir: w.dir, px: w.px });
  }
  if (own.length) {
    // A page with dozens of breakpoints is offering a menu, not a choice.
    own.sort((a, b) => (a.kind === 'width' && b.kind === 'width' ? a.px - b.px : 0));
    return own.slice(0, 8);
  }
  return DEVICE_PRESETS.filter((p) => p.kind !== 'desktop').map((p) => ({
    kind: 'width',
    preset: p.name,
    dir: 'max',
    px: p.width,
  }));
}

/** A condition read back from storage, or undefined if it is not one. */
export function normaliseCondition(raw: unknown): MaybeCondition {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<Condition> & { state?: string; scheme?: string; maxWidth?: number; preset?: string };
  if (c.kind === 'state' && STATES.includes(c.state as StateName)) return { kind: 'state', state: c.state as StateName };
  if (c.kind === 'scheme' && c.scheme === 'dark') return { kind: 'scheme', scheme: 'dark' };
  if (c.kind === 'width' && typeof c.px === 'number' && c.px > 0) {
    const dir = c.dir === 'min' ? 'min' : 'max';
    return { kind: 'width', preset: typeof c.preset === 'string' ? c.preset : `${c.px}px`, dir, px: c.px };
  }
  return undefined;
}
