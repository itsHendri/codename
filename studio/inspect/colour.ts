/**
 * The colour maths the inspector reads an element with: a computed `rgb()`
 * as hex, the WCAG ratio between two, and the colour actually behind an
 * element once its translucent ancestors are composited over white.
 *
 * sRGB and quick, for a readout — the engine's own contrast lives in
 * `studio/engine/contrast.ts` and is what the critique is judged by.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseRgba(cssColor: string): Rgba | null {
  const m = cssColor.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\)/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: parseFloat(m[1]!), g: parseFloat(m[2]!), b: parseFloat(m[3]!), a };
}

export function rgbToHexStr(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** `rgb(21, 23, 27)` → `#15171B`; null for anything transparent or unparseable. */
export function toHex(cssColor: string): string | null {
  const p = parseRgba(cssColor);
  if (!p || p.a === 0) return null;
  return rgbToHexStr(p.r, p.g, p.b);
}

export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** The WCAG ratio, to one decimal; null when either side is unknown. */
export function contrast(fg: string | null, bg: string | null): number | null {
  if (!fg || !bg) return null;
  const sorted = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return Math.round(((sorted[0]! + 0.05) / (sorted[1]! + 0.05)) * 10) / 10;
}

/**
 * Layers composited nearest-first over white: the first is the element's
 * own background, the last the farthest ancestor that still showed through.
 */
export function compositeOverWhite(layers: Rgba[]): string {
  let r = 255;
  let g = 255;
  let b = 255;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    r = l.r * l.a + r * (1 - l.a);
    g = l.g * l.a + g * (1 - l.a);
    b = l.b * l.a + b * (1 - l.a);
  }
  return rgbToHexStr(r, g, b);
}

/** The colour actually behind an element: translucent layers composited over white. */
export function opaqueBackground(el: Element, style: (el: Element) => CSSStyleDeclaration = (n) => getComputedStyle(n)): string {
  const layers: Rgba[] = [];
  let node: Element | null = el;
  while (node) {
    const p = parseRgba(style(node).backgroundColor);
    if (p && p.a > 0) {
      layers.push(p);
      if (p.a >= 1) break;
    }
    node = node.parentElement;
  }
  return compositeOverWhite(layers);
}
