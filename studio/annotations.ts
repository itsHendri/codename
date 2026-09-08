/**
 * What a note is about.
 *
 * A note pinned to one element covers most of what a designer wants to say,
 * but not all of it: "these three should line up" is about a set, "this gap
 * is wrong" is about empty space no element owns, and "this word" is about a
 * run of text inside an element. Each of those needs a different handle for
 * the agent, so the target is a shape rather than a selector.
 */

import type { Rect } from './measure';

export type CommentTarget =
  | { kind: 'element'; selector: string; matches: number }
  | { kind: 'elements'; selectors: string[] }
  /** Page coordinates, so the box stays put when the page scrolls. */
  | { kind: 'region'; rect: Rect; within?: string }
  /**
   * A run of text inside an element. Held as the quote rather than as offsets:
   * an offset goes stale the moment a word changes, and the quote is the thing
   * the agent can actually search for.
   */
  | { kind: 'text'; selector: string; quote: string };

const round = (n: number) => Math.round(n);

/** How the note reads in the panel and in the brief. */
export function describeTarget(target: CommentTarget): string {
  switch (target.kind) {
    case 'element':
      return target.matches > 1 ? `${target.selector} (${target.matches} elements)` : target.selector;
    case 'elements':
      return `${target.selectors.length} elements: ${target.selectors.join(', ')}`;
    case 'region': {
      const { rect, within } = target;
      const where = `a ${round(rect.width)} × ${round(rect.height)} region at ${round(rect.x)}, ${round(rect.y)}`;
      return within ? `${where}, inside ${within}` : where;
    }
    case 'text':
      return `"${target.quote}" in ${target.selector}`;
  }
}

/** The selectors a target names, for drawing pins and for re-selecting it. */
export function selectorsOf(target: CommentTarget): string[] {
  switch (target.kind) {
    case 'element':
    case 'text':
      return [target.selector];
    case 'elements':
      return target.selectors;
    case 'region':
      return target.within ? [target.within] : [];
  }
}

/** One numbered marker on the page. A set of elements gets one per element. */
export interface Pin {
  id: string;
  label: string;
  done: boolean;
  /** Anchored to an element… */
  selector?: string;
  /** …or parked at a spot on the page, for a region. */
  rect?: Rect;
}

/** A short label for a chip: the kind, in a word. */
export function targetKindLabel(target: CommentTarget): string {
  switch (target.kind) {
    case 'element':
      return 'element';
    case 'elements':
      return `${target.selectors.length} elements`;
    case 'region':
      return 'region';
    case 'text':
      return 'text';
  }
}
