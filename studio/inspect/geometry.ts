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

/**
 * The edit card: under the selection when there is room, else above it,
 * always inside the viewport and below the bar. A pinned card — one that
 * was dragged — stays where it was put, clamped the same way.
 */
export function placeCard(
  anchor: Rect,
  card: Size,
  viewport: Size,
  clear: number,
  pinned: { left: number; top: number } | null = null,
): { left: number; top: number } {
  const clampLeft = (x: number) => Math.min(Math.max(EDGE, x), viewport.width - card.width - EDGE);
  const clampTop = (y: number) => Math.min(Math.max(clear, y), viewport.height - card.height - EDGE);
  if (pinned) return { left: clampLeft(pinned.left), top: clampTop(pinned.top) };
  const below = anchor.y + anchor.height + EDGE;
  const top = below + card.height <= viewport.height - EDGE ? below : Math.max(clear, anchor.y - card.height - EDGE);
  return { left: clampLeft(anchor.x), top: clampTop(top) };
}

/** How tall the size label is, with the gap under the box. */
const LABEL = 22;

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
