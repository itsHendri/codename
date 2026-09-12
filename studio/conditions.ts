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
  | { kind: 'width'; preset: string; maxWidth: number };

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
  return `width:${condition.maxWidth}`;
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
  if (condition?.kind === 'width') return `@media (max-width: ${condition.maxWidth}px)`;
  // While the panel is previewing dark, the page is being painted as dark
  // whatever the browser thinks, so the query would never match.
  if (condition?.kind === 'scheme') return darkPreview ? null : '@media (prefers-color-scheme: dark)';
  return null;
}

/**
 * Where a condition's rules go in the managed sheet: later wins, so this is
 * least specific first. Stated rather than chosen, see the note at the top.
 */
export function cascadeOrder(condition: MaybeCondition): number {
  if (!condition) return 0;
  if (condition.kind === 'width') return 1;
  if (condition.kind === 'scheme') return 2;
  return 3;
}

/** What to call a condition in the panel and in the brief. */
export function describe(condition: MaybeCondition): string {
  if (!condition) return 'default';
  if (condition.kind === 'state') return condition.state;
  if (condition.kind === 'scheme') return 'dark';
  return `≤${condition.maxWidth}`;
}

/** The longer form, for a brief that has to stand on its own. */
export function describeLong(condition: MaybeCondition): string {
  if (!condition) return 'the default state';
  if (condition.kind === 'state') return `\`${PSEUDO[condition.state]}\``;
  if (condition.kind === 'scheme') return "the page's own dark mode";
  return `\`@media (max-width: ${condition.maxWidth}px)\``;
}

/** The pseudo-classes a state's preview has to hoist off the page's own rules. */
export function pseudosOf(state: StateName): string[] {
  // `:focus-visible` is what we write, but a page that only styles `:focus`
  // still has to show something, so both are read.
  return state === 'focus' ? [':focus-visible', ':focus'] : [PSEUDO[state]];
}

/** The width conditions on offer, from the same presets the bar uses. */
export const widthConditions = (): Condition[] =>
  DEVICE_PRESETS.filter((p) => p.kind !== 'desktop').map((p) => ({
    kind: 'width',
    preset: p.name,
    maxWidth: p.width,
  }));

/** A condition read back from storage, or undefined if it is not one. */
export function normaliseCondition(raw: unknown): MaybeCondition {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<Condition> & { state?: string; scheme?: string; maxWidth?: number; preset?: string };
  if (c.kind === 'state' && STATES.includes(c.state as StateName)) return { kind: 'state', state: c.state as StateName };
  if (c.kind === 'scheme' && c.scheme === 'dark') return { kind: 'scheme', scheme: 'dark' };
  if (c.kind === 'width' && typeof c.maxWidth === 'number' && c.maxWidth > 0) {
    return { kind: 'width', preset: typeof c.preset === 'string' ? c.preset : `${c.maxWidth}px`, maxWidth: c.maxWidth };
  }
  return undefined;
}
