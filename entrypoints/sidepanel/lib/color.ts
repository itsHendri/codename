import { colorsNamed, converter, differenceEuclidean, formatHsl, formatRgb, parse } from 'culori';

const toOklch = converter('oklch');
const oklabDistance = differenceEuclidean('oklab');

let namedList: { name: string; hex: string }[] | null = null;

/** Nearest CSS named color, e.g. "royalblue" — a human handle when the site has no token name. */
export function nearestColorName(hex: string): string {
  if (!namedList) {
    namedList = Object.entries(colorsNamed).map(([name, num]) => ({
      name,
      hex: `#${num.toString(16).padStart(6, '0')}`,
    }));
  }
  const target = parse(hex);
  if (!target) return hex;
  let best = '';
  let bestDist = Infinity;
  for (const entry of namedList) {
    const dist = oklabDistance(target, entry.hex);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry.name;
    }
  }
  return best;
}

export interface ColorFormats {
  hex: string;
  rgb: string;
  hsl: string;
  oklch: string;
}

export function colorFormats(hex: string): ColorFormats {
  const parsed = parse(hex);
  if (!parsed) return { hex, rgb: hex, hsl: hex, oklch: hex };
  const ok = toOklch(parsed);
  const oklch = ok
    ? `oklch(${(ok.l * 100).toFixed(1)}% ${(ok.c ?? 0).toFixed(3)} ${(ok.h ?? 0).toFixed(1)})`
    : hex;
  return {
    hex,
    rgb: formatRgb(parsed) ?? hex,
    hsl: formatHsl(parsed) ?? hex,
    oklch,
  };
}

export function isGray(hex: string): boolean {
  const parsed = parse(hex);
  if (!parsed) return false;
  const ok = toOklch(parsed);
  return (ok?.c ?? 0) < 0.03;
}

export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contrastBadge(ratio: number): { label: string; pass: boolean } {
  if (ratio >= 7) return { label: 'AAA ✓', pass: true };
  if (ratio >= 4.5) return { label: 'AA ✓', pass: true };
  if (ratio >= 3) return { label: 'AA ✗', pass: false };
  return { label: '✗', pass: false };
}
