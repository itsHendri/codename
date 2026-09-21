/**
 * `transform`, as fields.
 *
 * A computed transform is a matrix, whatever the author wrote. A 2D matrix
 * comes apart into translate, rotate, skew and scale exactly one way, and
 * goes back together into the same matrix — so the fields show what the
 * page does and write what it did, and nothing is invented. A matrix this
 * cannot rebuild exactly (a 3D one, a degenerate one) keeps its text field:
 * fail closed by round trip, as the shadow and transition editors do.
 */

export interface Transform2D {
  /** Translate, in px. */
  x: number;
  y: number;
  /** Degrees. */
  rotate: number;
  scaleX: number;
  scaleY: number;
  /** Degrees. */
  skewX: number;
}

export const IDENTITY: Transform2D = { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, skewX: 0 };

/** `matrix(a, b, c, d, e, f)`: the six numbers of a 2D transform. */
export type Matrix = [number, number, number, number, number, number];

const NUM = '[-+]?(?:\\d*\\.)?\\d+(?:e[-+]?\\d+)?';
const LIST = (n: number) => new RegExp(`^(${NUM})` + `\\s*,\\s*(${NUM})`.repeat(n - 1) + '$');
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const deg = (rad: number) => r3((rad * 180) / Math.PI);
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * The 2D matrix a computed value holds, or null. `none` is the identity; a
 * `matrix3d()` counts only when its third dimension is untouched.
 */
export function parseMatrix(value: string): Matrix | null {
  const v = value.trim();
  if (v === '' || v === 'none') return [1, 0, 0, 1, 0, 0];
  const inner = /^(matrix|matrix3d)\((.*)\)$/i.exec(v);
  if (!inner) return null;
  const count = inner[1]!.toLowerCase() === 'matrix' ? 6 : 16;
  const m = LIST(count).exec(inner[2]!.trim());
  if (!m) return null;
  const n = m.slice(1).map(Number);
  if (count === 6) return n as Matrix;
  const flat = (i: number, want: number) => Math.abs(n[i]! - want) < 1e-9;
  // Column-major 4×4: anything that reaches the z axis makes it a 3D transform.
  const is2d = flat(2, 0) && flat(3, 0) && flat(6, 0) && flat(7, 0) && flat(8, 0) && flat(9, 0) && flat(10, 1) && flat(11, 0) && flat(14, 0) && flat(15, 1);
  return is2d ? [n[0]!, n[1]!, n[4]!, n[5]!, n[12]!, n[13]!] : null;
}

/** Translate, then rotate, then skew, then scale — the order CSS composes them in. */
export function decompose([a, b, c, d, e, f]: Matrix): Transform2D {
  const det = a * d - b * c;
  const scaleX = Math.hypot(a, b);
  if (scaleX === 0) return { x: r3(e), y: r3(f), rotate: 0, scaleX: 0, scaleY: r3(d), skewX: 0 };
  return {
    x: r3(e),
    y: r3(f),
    rotate: deg(Math.atan2(b, a)),
    scaleX: r3(scaleX),
    scaleY: r3(det / scaleX),
    // atan, not atan2: the ratio is tan(skew) exactly, and a negative det (a
    // flipped scale) must not turn a small skew into one past a right angle.
    skewX: deg(Math.atan((a * c + b * d) / det)),
  };
}

const multiply = (p: Matrix, q: Matrix): Matrix => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];

export function compose(t: Transform2D): Matrix {
  const cos = Math.cos(rad(t.rotate));
  const sin = Math.sin(rad(t.rotate));
  const translate: Matrix = [1, 0, 0, 1, t.x, t.y];
  const rotate: Matrix = [cos, sin, -sin, cos, 0, 0];
  const skew: Matrix = [1, 0, Math.tan(rad(t.skewX)), 1, 0, 0];
  const scale: Matrix = [t.scaleX, 0, 0, t.scaleY, 0, 0];
  return multiply(multiply(multiply(translate, rotate), skew), scale);
}

/** Whether the fields would give this value back as the same matrix. */
export function transformRoundTrips(value: string): boolean {
  const m = parseMatrix(value);
  if (!m) return false;
  const back = compose(decompose(m));
  return m.every((n, i) => Math.abs(n - back[i]!) < (i < 4 ? 0.002 : 0.02));
}

const fmt = (n: number) => String(r3(n));

/** The functions, as a stylesheet would write them; `none` when nothing moves. */
export function transformToCss(t: Transform2D): string {
  const parts: string[] = [];
  if (t.x !== 0 || t.y !== 0) parts.push(`translate(${fmt(t.x)}px, ${fmt(t.y)}px)`);
  if (t.rotate !== 0) parts.push(`rotate(${fmt(t.rotate)}deg)`);
  if (t.skewX !== 0) parts.push(`skewX(${fmt(t.skewX)}deg)`);
  if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(t.scaleX === t.scaleY ? `scale(${fmt(t.scaleX)})` : `scale(${fmt(t.scaleX)}, ${fmt(t.scaleY)})`);
  return parts.length ? parts.join(' ') : 'none';
}

/**
 * The fields a value holds: a computed matrix, `none`, or the function list
 * this wrote (px translates, degree angles, plain scales). Anything else —
 * a `rotate3d`, a `translate(10%)`, a `var()` — is null.
 */
export function parseTransform(value: string): Transform2D | null {
  const m = parseMatrix(value);
  if (m) return decompose(m);
  const v = value.trim();
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const fn = /([a-zA-Z]+)\(([^)]*)\)/g;
  let consumed = 0;
  for (const hit of v.matchAll(fn)) {
    if (v.slice(consumed, hit.index).trim() !== '') return null;
    consumed = hit.index + hit[0].length;
    const args = hit[2]!.split(',').map((s) => s.trim());
    const num = (s: string, unit: RegExp) => {
      const n = unit.exec(s);
      return n ? parseFloat(n[1]!) : null;
    };
    const px = (s: string) => num(s, new RegExp(`^(${NUM})(?:px)?$`));
    const degrees = (s: string) => num(s, new RegExp(`^(${NUM})deg$`));
    const plain = (s: string) => num(s, new RegExp(`^(${NUM})$`));
    let t: Transform2D;
    switch (hit[1]!.toLowerCase()) {
      case 'translate': {
        const x = px(args[0] ?? '');
        const y = args.length > 1 ? px(args[1]!) : 0;
        if (x === null || y === null) return null;
        t = { ...IDENTITY, x, y };
        break;
      }
      case 'translatex': {
        const x = px(args[0] ?? '');
        if (x === null) return null;
        t = { ...IDENTITY, x };
        break;
      }
      case 'translatey': {
        const y = px(args[0] ?? '');
        if (y === null) return null;
        t = { ...IDENTITY, y };
        break;
      }
      case 'rotate': {
        const r = degrees(args[0] ?? '');
        if (r === null) return null;
        t = { ...IDENTITY, rotate: r };
        break;
      }
      case 'skewx': {
        const k = degrees(args[0] ?? '');
        if (k === null) return null;
        t = { ...IDENTITY, skewX: k };
        break;
      }
      case 'scale': {
        const sx = plain(args[0] ?? '');
        const sy = args.length > 1 ? plain(args[1]!) : sx;
        if (sx === null || sy === null) return null;
        t = { ...IDENTITY, scaleX: sx, scaleY: sy };
        break;
      }
      default:
        return null;
    }
    matrix = multiply(matrix, compose(t));
  }
  if (v.slice(consumed).trim() !== '' || consumed === 0) return null;
  return decompose(matrix);
}
