/**
 * Handles on the selection, as Framer and Webflow draw them: drag a bar
 * inside an edge to change the padding on that side, outside it for the
 * margin, between two children for the gap, and the right edge, the bottom
 * edge or the corner for the size. A value lands on the page's own spacing
 * scale when it passes close to a step, and says the variable's name when a
 * variable holds that step — so a drag gives `--space-4`, not 13px.
 *
 * Only geometry and arithmetic here; the inspector draws and listens.
 */

import type { Rect } from '../measure';

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type HandleKind = `padding-${Side}` | `margin-${Side}` | 'gap' | 'width' | 'height' | 'size';

export interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Handle {
  kind: HandleKind;
  /** Where to draw it, in viewport pixels. */
  box: Rect;
  /** Which way it is dragged: along x, along y, or both (the corner). */
  axis: 'x' | 'y' | 'xy';
}

/** Handles are left off a selection smaller than this; there is no room to aim. */
export const MIN_BOX = 28;
const BAR = 16;
const THICK = 4;

const bar = (cx: number, cy: number, horizontal: boolean): Rect => ({
  x: horizontal ? cx - BAR / 2 : cx - THICK / 2,
  y: horizontal ? cy - THICK / 2 : cy - BAR / 2,
  width: horizontal ? BAR : THICK,
  height: horizontal ? THICK : BAR,
});

/**
 * Every handle for a selection: padding bars just inside each edge, in the
 * middle of the padding band; margin bars just outside; the gap bar between
 * the first two children, when there is a gap to hold; a size bar on the
 * right and bottom edges and a square on the corner.
 */
export function handlesFor(r: Rect, padding: Edges, margin: Edges, gap: { between: Rect; axis: 'x' | 'y' } | null): Handle[] {
  if (r.width < MIN_BOX || r.height < MIN_BOX) return [];
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const right = r.x + r.width;
  const bottom = r.y + r.height;
  // A band too thin to show sits a few pixels in, so it can still be caught.
  const inside = (p: number) => Math.max(6, p / 2);
  const outside = (m: number) => Math.max(6, m / 2);
  const out: Handle[] = [
    { kind: 'padding-top', axis: 'y', box: bar(cx, r.y + inside(padding.top), true) },
    { kind: 'padding-bottom', axis: 'y', box: bar(cx, bottom - inside(padding.bottom), true) },
    { kind: 'padding-left', axis: 'x', box: bar(r.x + inside(padding.left), cy, false) },
    { kind: 'padding-right', axis: 'x', box: bar(right - inside(padding.right), cy, false) },
    { kind: 'margin-top', axis: 'y', box: bar(cx, r.y - outside(margin.top), true) },
    { kind: 'margin-bottom', axis: 'y', box: bar(cx, bottom + outside(margin.bottom), true) },
    { kind: 'margin-left', axis: 'x', box: bar(r.x - outside(margin.left), cy, false) },
    { kind: 'margin-right', axis: 'x', box: bar(right + outside(margin.right), cy, false) },
    { kind: 'width', axis: 'x', box: { x: right - 2, y: cy - 10, width: 4, height: 20 } },
    { kind: 'height', axis: 'y', box: { x: cx + BAR, y: bottom - 2, width: 20, height: 4 } },
    { kind: 'size', axis: 'xy', box: { x: right - 4, y: bottom - 4, width: 8, height: 8 } },
  ];
  if (gap) {
    const g = gap.between;
    out.push({ kind: 'gap', axis: gap.axis, box: bar(g.x + g.width / 2, g.y + g.height / 2, gap.axis === 'y') });
  }
  return out;
}

/**
 * The value a handle reads after a drag of (dx, dy) from `start`: padding
 * grows as the bar is pulled inward, margin as it is pulled outward, the
 * gap and the size as the pointer moves right or down. Never below zero.
 */
export function dragged(kind: HandleKind, start: number, dx: number, dy: number, gapAxis: 'x' | 'y' = 'x'): number {
  const d: Record<HandleKind, number> = {
    'padding-top': dy,
    'padding-bottom': -dy,
    'padding-left': dx,
    'padding-right': -dx,
    'margin-top': -dy,
    'margin-bottom': dy,
    'margin-left': -dx,
    'margin-right': dx,
    gap: gapAxis === 'x' ? dx : dy,
    width: dx,
    height: dy,
    size: dx,
  };
  return Math.max(0, start + d[kind]);
}

/** A step on the page's scale, with the variable that holds it when there is one. */
export interface Step {
  px: number;
  token?: string;
}

/** How close a value must pass to a step to land on it. */
export const SNAP_PX = 4;

/**
 * Where a dragged value lands: on the nearest step of the scale when it is
 * within `SNAP_PX` of one (a variable's step preferred over a bare one at
 * the same distance), otherwise the whole pixel under the pointer.
 */
export function snap(px: number, steps: Step[], threshold = SNAP_PX): Step {
  let best: Step | null = null;
  let bestD = Infinity;
  for (const s of steps) {
    const d = Math.abs(s.px - px);
    if (d > threshold) continue;
    if (d < bestD || (d === bestD && s.token && !best?.token)) {
      best = s;
      bestD = d;
    }
  }
  return best ?? { px: Math.round(px) };
}

/** The steps a page offers: its spacing variables first, then the lengths it uses often, each px once. */
export function stepsOf(space: Record<string, string>, used: number[]): Step[] {
  const byPx = new Map<number, Step>();
  for (const [px, token] of Object.entries(space)) {
    const n = Number(px);
    if (Number.isFinite(n) && n >= 0) byPx.set(n, { px: n, token });
  }
  for (const n of used) if (!byPx.has(n)) byPx.set(n, { px: n });
  return [...byPx.values()].sort((a, b) => a.px - b.px);
}

/** How a value is written into an edit: the variable when it landed on one, px otherwise. */
export const written = (s: Step): { to: string; token?: string } => (s.token ? { to: `var(${s.token})`, token: s.token } : { to: `${s.px}px` });
