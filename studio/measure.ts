/**
 * Edge-to-edge distances between two rectangles, the way DevTools and Figma
 * draw them when you hold Alt over a second element. Pure geometry.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Segment {
  axis: 'x' | 'y';
  from: number;
  to: number;
  /** The fixed coordinate on the other axis, chosen at the midpoint of the overlap or of the source rect. */
  at: number;
  length: number;
  kind: 'gap' | 'inset';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Extent of a rect along one axis as [start, end]. */
function span(r: Rect, axis: 'x' | 'y'): [number, number] {
  return axis === 'x' ? [r.x, r.x + r.width] : [r.y, r.y + r.height];
}

/**
 * Per axis: disjoint rects get one `gap` between their nearer edges;
 * overlapping rects (containment or straddle) get an `inset` from each of
 * a's edges to the corresponding edge of b. Zero-length segments are dropped,
 * so touching edges and shared edges produce nothing.
 */
export function measure(a: Rect, b: Rect): Segment[] {
  const out: Segment[] = [];
  for (const axis of ['x', 'y'] as const) {
    const other = axis === 'x' ? 'y' : 'x';
    const [a0, a1] = span(a, axis);
    const [b0, b1] = span(b, axis);

    // Where to draw the segment on the other axis: through the middle of the
    // overlap when the rects share any extent there, else through the middle of a.
    const [oa0, oa1] = span(a, other);
    const [ob0, ob1] = span(b, other);
    const lo = Math.max(oa0, ob0);
    const hi = Math.min(oa1, ob1);
    const at = lo < hi ? (lo + hi) / 2 : (oa0 + oa1) / 2;

    const push = (from: number, to: number, kind: Segment['kind']) => {
      const length = round1(Math.abs(to - from));
      if (length === 0) return;
      out.push({ axis, from: Math.min(from, to), to: Math.max(from, to), at, length, kind });
    };

    if (a1 <= b0) push(a1, b0, 'gap');
    else if (b1 <= a0) push(b1, a0, 'gap');
    else {
      push(a0, b0, 'inset');
      push(a1, b1, 'inset');
    }
  }
  return out;
}
