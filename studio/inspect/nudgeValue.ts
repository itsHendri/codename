/**
 * How a number in the Style column moves under an arrow key or a drag.
 *
 * Ported from Nudge UI's `styleEditors/nudgeValue.ts` (MIT, © 2026 Charles
 * Smart; see THIRD_PARTY_NOTICES.md). The rules are Nudge's: one press is
 * 1 (px, %, unitless) or 0.125 (rem, em); Shift is the large step, 8 or 1,
 * snapping to it first when the value sits off the grid; a weight moves by
 * 100; line-height in % by 10; opacity by 1% (10 with Shift); padding, gap
 * and radius never go below 0. A drag takes one step per 16px of movement,
 * one large step per 8px.
 *
 * Unlike Nudge, a property this file does not name still moves, by the
 * field's own `step` (a duration in ms, a scale factor), so every number
 * field in the panel answers the same keys.
 */

export type Direction = -1 | 1;

const NUMERIC = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|%|ms|s|deg)?$/i;
const DRAG_PX_PER_STEP = 16;
const DRAG_PX_PER_LARGE_STEP = 8;

interface Parsed {
  number: number;
  unit: string;
}

function parse(value: string): Parsed | null {
  const m = NUMERIC.exec(value.trim());
  if (!m) return null;
  const number = Number(m[1]);
  return Number.isFinite(number) ? { number, unit: (m[2] ?? '').toLowerCase() } : null;
}

const isWeight = (p: string) => p === 'font-weight';
const isLineHeight = (p: string) => p === 'line-height';
const isOpacity = (p: string) => p === 'opacity';
const nonNegative = (p: string) =>
  /^(?:padding|(?:row|column)-gap|gap$|border-(?:top-left|top-right|bottom-right|bottom-left)-radius|border-radius|border-width|width$|height$|min-|max-|filter-blur)/.test(p);

/** The size of one press for this property and unit, or the field's own step. */
function stepOf(property: string, unit: string, large: boolean, fallback: number): number {
  if (isWeight(property)) return large ? 400 : 100;
  if (isLineHeight(property) && unit === '%') return large ? 80 : 10;
  if (unit === 'rem' || unit === 'em') return large ? 1 : 0.125;
  if (property && (unit === 'px' || unit === '%' || unit === '')) return large ? 8 : 1;
  return fallback * (large ? 8 : 1);
}

function clamp(property: string, n: number): number {
  if (isWeight(property)) return Math.min(1000, Math.max(1, n));
  if (isLineHeight(property) || nonNegative(property)) return Math.max(0, n);
  return n;
}

function format(n: number): string {
  const r = Number(n.toFixed(4));
  return Object.is(r, -0) ? '0' : String(r);
}

/** Opacity as a 0–1 number or a percentage, moved by 1% or 10%, kept in its own form. */
function nudgeOpacity(value: string, direction: Direction, large: boolean): string | null {
  const p = parse(value);
  if (!p) return null;
  const percent = p.unit === '%' ? p.number : p.unit === '' && p.number >= 0 && p.number <= 1 ? p.number * 100 : null;
  if (percent === null) return null;
  const step = large ? 10 : 1;
  const next = Math.min(100, Math.max(0, percent + direction * step));
  return p.unit === '%' ? `${format(next)}%` : format(next / 100);
}

/**
 * One press. `property` is the CSS property the field writes ('' when it
 * writes something else); `fallback` is the field's own step for a property
 * these rules do not know. Returns null for a value that is not a number
 * ('auto', 'normal', a var()).
 */
export function nudge(property: string, value: string, direction: Direction, large = false, fallback = 1): string | null {
  if (isOpacity(property)) return nudgeOpacity(value, direction, large);
  const p = parse(value);
  if (!p) return null;
  const step = stepOf(property, p.unit, large, fallback);
  return `${format(clamp(property, p.number + direction * step))}${p.unit}`;
}

/** Shift's first step lands on the large grid (13 → 16, not 21), as Nudge does. */
function snapToLarge(property: string, value: string, direction: Direction, fallback: number): string | null {
  if (isOpacity(property)) {
    const p = parse(value);
    if (!p) return null;
    const percent = p.unit === '%' ? p.number : p.number * 100;
    let next = direction > 0 ? Math.ceil(percent / 10) * 10 : Math.floor(percent / 10) * 10;
    if (next === percent) next += direction * 10;
    next = Math.min(100, Math.max(0, next));
    return p.unit === '%' ? `${format(next)}%` : format(next / 100);
  }
  const p = parse(value);
  if (!p) return null;
  const step = stepOf(property, p.unit, true, fallback);
  let next = direction > 0 ? Math.ceil(p.number / step) * step : Math.floor(p.number / step) * step;
  if ((direction > 0 && next <= p.number) || (direction < 0 && next >= p.number)) next += direction * step;
  return `${format(clamp(property, next))}${p.unit}`;
}

/** A key press: Shift snaps to the large grid, then steps along it. */
export function nudgeByKey(property: string, value: string, direction: Direction, large = false, fallback = 1): string | null {
  return large ? snapToLarge(property, value, direction, fallback) : nudge(property, value, direction, large, fallback);
}

/**
 * A drag of `dx` px from where it started: one step per 16px, one large step
 * per 8px with Shift (the first snapping to the grid). Null until the drag
 * has gone far enough to move the value at all.
 */
export function nudgeByDrag(property: string, start: string, dx: number, large = false, fallback = 1): string | null {
  const steps = Math.trunc(Math.abs(dx) / (large ? DRAG_PX_PER_LARGE_STEP : DRAG_PX_PER_STEP));
  if (steps === 0) return null;
  const direction: Direction = dx < 0 ? -1 : 1;
  let next: string | null = start;
  for (let i = 0; i < steps && next !== null; i++) {
    next = i === 0 && large ? snapToLarge(property, next, direction, fallback) : nudge(property, next, direction, large, fallback);
  }
  return next;
}

/** Whether a value can be dragged at all: a plain number with a unit we know. */
export const canNudge = (value: string) => parse(value) !== null;
