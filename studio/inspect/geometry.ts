/**
 * Where the inspector's chrome goes, as arithmetic: the edit card beside a
 * selection, the size label under it, and the region a drag drew. Each
 * takes the boxes and the viewport and answers with coordinates, so the
 * placement is tested in node and the inspector only applies it.
 */

import type { Rect } from '@/studio/measure';

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

/** The margin nothing is placed closer to the viewport's edge than. */
export const EDGE = 8;

/** How tall the size label is, with the gap under the box. */
const LABEL = 22;

/**
 * The right-click menu: its top-left corner at the pointer, as a context
 * menu opens; flipped to the pointer's other side when it would run off the
 * right or the bottom, and never under the bar.
 */
export function placeMenu(pointer: { x: number; y: number }, menu: Size, viewport: Size, clear: number): { left: number; top: number } {
  const left = pointer.x + menu.width + EDGE <= viewport.width ? pointer.x : pointer.x - menu.width;
  const top = pointer.y + menu.height + EDGE <= viewport.height ? pointer.y : pointer.y - menu.height;
  return {
    // Clamped to the far edge first and the near edge last, so a viewport
    // smaller than the menu shows its top under the bar, not its middle.
    left: Math.max(EDGE, Math.min(left, viewport.width - menu.width - EDGE)),
    top: Math.max(clear, Math.min(top, viewport.height - menu.height - EDGE)),
  };
}

/**
 * The size label, centred under the box as a design tool labels a
 * selection; above it when the box runs off the bottom of the viewport.
 */
export function placeSizeLabel(box: Rect, viewport: Size, clear: number): { left: number; top: number } {
  const below = box.y + box.height + LABEL <= viewport.height;
  return {
    left: Math.min(Math.max(40, box.x + box.width / 2), viewport.width - 40),
    top: below ? box.y + box.height + 3 : Math.max(clear, box.y - (LABEL - 1)),
  };
}

/** The least a drag has to travel to be a region rather than a click. */
export const DRAG_MIN = 6;

/**
 * The box a drag drew, or null when it was too short to be one and the
 * mouse-up is a click instead.
 */
export function regionFrom(start: Point, end: Point): Rect | null {
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < DRAG_MIN && height < DRAG_MIN) return null;
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height };
}

/** A box as `getBoundingClientRect` gives it, the parts a drop reads. */
export interface Box {
  top: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Where a dragged element would land among its siblings (the dragged one
 * already left out): the index of the sibling it goes before, or null for
 * last. Across (a flex row, a grid) reads the row under the pointer left to
 * right, and past the end of a row goes before the next row's first; down
 * reads top to bottom. Midpoints decide, as a design tool's reorder does.
 */
export function dropIndex(boxes: Box[], x: number, y: number, across: boolean): number | null {
  if (!boxes.length) return null;
  if (!across) {
    const i = boxes.findIndex((b) => y < b.top + b.height / 2);
    return i === -1 ? null : i;
  }
  const row = boxes.map((b, i) => ({ b, i })).filter(({ b }) => y >= b.top && y <= b.bottom);
  const pool = row.length ? row : boxes.map((b, i) => ({ b, i }));
  const past = pool.find(({ b }) => x < b.left + b.width / 2);
  if (past) return past.i;
  const next = pool[pool.length - 1]!.i + 1;
  return next < boxes.length ? next : null;
}
