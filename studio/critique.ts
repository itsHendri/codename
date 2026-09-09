/**
 * What is wrong with the page, from what the scan already measured.
 *
 * Impeccable's contribution to the roadmap: an agent that can ask "what would
 * a designer flag here?" and get facts rather than taste. Every finding is
 * deterministic and comes with the numbers behind it — a contrast ratio and
 * how many elements carry it, a spacing value and how often it appears — so
 * the agent can act on it in source and the user can check it on the page.
 * Nothing here is a preference: a 6px gap on a 4px grid is a fact, and
 * whether it is a mistake is the reader's call.
 */

import { differenceEuclidean, parse } from 'culori';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig } from './engine/types';

export type FindingKind = 'contrast' | 'spacing' | 'colour' | 'type' | 'fonts' | 'radius' | 'coverage';

export interface Finding {
  kind: FindingKind;
  /** fail: a threshold is missed; warn: worth a look; note: information. */
  level: 'fail' | 'warn' | 'note';
  message: string;
  /** The numbers the message was written from. */
  detail: Record<string, unknown>;
}

export interface Critique {
  findings: Finding[];
  /** "2 fail · 3 warn · 1 note", for a one-line answer. */
  summary: string;
}

const distance = differenceEuclidean('oklab');

/** Two colours closer than this are one colour twice. Wider than a ramp step match (0.008), narrower than a suggestion (0.04). */
export const DUPLICATE_DISTANCE = 0.02;
/** WCAG AA for body text; large text passes at 3. */
const AA = 4.5;
const AA_LARGE = 3;
const MAX_PER_KIND = 8;

const px = (v: string) => parseFloat(v);

export function critique(scan: ScanResult, brand: BrandConfig): Critique {
  const findings: Finding[] = [];

  // Contrast: pairs the page actually renders, worst first by how many carry them.
  const failing = scan.contrastPairs
    .filter((p) => p.ratio < AA && p.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_PER_KIND);
  for (const p of failing) {
    findings.push({
      kind: 'contrast',
      level: p.ratio < AA_LARGE ? 'fail' : 'warn',
      message: `${p.fg} on ${p.bg} is ${p.ratio.toFixed(1)}:1 across ${p.count} ${p.count === 1 ? 'element' : 'elements'} — body text wants ${AA}:1${p.ratio >= AA_LARGE ? ', which only large text may go under' : ''}.`,
      detail: { fg: p.fg, bg: p.bg, ratio: p.ratio, count: p.count, required: AA },
    });
  }

  // Spacing: values off the grid the page is otherwise on.
  const base = brand.spacing.basePx;
  const offGrid = scan.shape.spacing
    .map((t) => ({ px: px(t.value), count: t.count }))
    .filter((t) => Number.isFinite(t.px) && t.px > 0 && t.px % base !== 0)
    .sort((a, b) => b.count - a.count);
  if (offGrid.length) {
    const shown = offGrid.slice(0, MAX_PER_KIND);
    findings.push({
      kind: 'spacing',
      level: 'warn',
      message: `${shown.map((t) => `${t.px}px ×${t.count}`).join(', ')} ${offGrid.length === 1 ? 'sits' : 'sit'} off the ${base}px grid the page is otherwise on.`,
      detail: { basePx: base, offGrid: shown },
    });
  }

  // Colours: two that are one colour twice.
  const parsed = scan.colors
    .map((c) => ({ hex: c.hex, count: c.count, lab: parse(c.hex) }))
    .filter((c) => c.lab);
  const seenPairs = new Set<string>();
  let dupes = 0;
  for (let i = 0; i < parsed.length && dupes < MAX_PER_KIND; i++) {
    for (let j = i + 1; j < parsed.length && dupes < MAX_PER_KIND; j++) {
      const a = parsed[i]!;
      const b = parsed[j]!;
      if (a.hex === b.hex) continue;
      const d = distance(a.hex, b.hex);
      if (d >= DUPLICATE_DISTANCE) continue;
      const key = [a.hex, b.hex].sort().join(' ');
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      dupes++;
      const [major, minor] = a.count >= b.count ? [a, b] : [b, a];
      findings.push({
        kind: 'colour',
        level: 'warn',
        message: `${minor.hex} (×${minor.count}) is ${d.toFixed(3)} from ${major.hex} (×${major.count}) — close enough to be the same colour written twice.`,
        detail: { a: major.hex, b: minor.hex, distance: Math.round(d * 1000) / 1000, counts: [major.count, minor.count] },
      });
    }
  }

  // Type: sizes the page renders that are on no step of its own ladder. The
  // ladder is read off usage, so this only fires when the page renders more
  // distinct sizes than the ladder has steps — the long tail of one-offs.
  const roleSizes = brand.typography.roles.map((r) => Math.round(r.sizeRem * 16));
  const sizes = new Map<number, number>();
  for (const f of scan.fontUsage) {
    if (f.roles.includes('code')) continue;
    for (const v of f.variants) {
      const size = Math.round(px(v.size));
      if (!Number.isFinite(size) || size < 8) continue;
      sizes.set(size, (sizes.get(size) ?? 0) + v.count);
    }
  }
  const strays = [...sizes]
    .filter(([size]) => !roleSizes.some((r) => Math.abs(r - size) <= 1))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PER_KIND);
  if (strays.length) {
    findings.push({
      kind: 'type',
      level: 'note',
      message: `${strays.map(([s, n]) => `${s}px ×${n}`).join(', ')} ${strays.length === 1 ? 'is' : 'are'} rendered but on no step of the type ladder (${roleSizes.join(', ')}).`,
      detail: { ladder: roleSizes, strays: strays.map(([size, count]) => ({ size, count })) },
    });
  }

  // Fonts: more families than a page needs.
  const families = scan.fontUsage.filter((f) => f.elementCount > 0).map((f) => f.family);
  if (families.length > 3) {
    findings.push({
      kind: 'fonts',
      level: 'warn',
      message: `${families.length} font families render on this page (${families.join(', ')}); two or three is usual.`,
      detail: { families },
    });
  }

  // Radius: a shape system with too many corners.
  const radii = scan.shape.radii
    .map((t) => px(t.value))
    .filter((r) => Number.isFinite(r) && r > 0 && r < 1000);
  const distinctRadii = [...new Set(radii)].sort((a, b) => a - b);
  if (distinctRadii.length > 4) {
    findings.push({
      kind: 'radius',
      level: 'note',
      message: `${distinctRadii.length} distinct corner radii (${distinctRadii.join(', ')}px); a scale usually holds three or four.`,
      detail: { radii: distinctRadii },
    });
  }

  // Coverage: what the scan could not see.
  if (scan.unreadableSheets.length) {
    findings.push({
      kind: 'coverage',
      level: 'note',
      message: `${scan.unreadableSheets.length} cross-origin stylesheet(s) could not be read, so every count above may be short.`,
      detail: { sheets: scan.unreadableSheets },
    });
  }

  const tally = (level: Finding['level']) => findings.filter((f) => f.level === level).length;
  const parts = [
    [tally('fail'), 'fail'],
    [tally('warn'), 'warn'],
    [tally('note'), 'note'],
  ].filter(([n]) => (n as number) > 0);
  const summary = parts.length ? parts.map(([n, l]) => `${n} ${l}`).join(' · ') : 'nothing to flag';
  return { findings, summary };
}

/** The critique as the agent reads it: one line per finding, numbers included. */
export function critiqueToText(c: Critique, host: string): string {
  if (!c.findings.length) return `Nothing to flag on ${host} from what the scan measured.`;
  const lines = [`Critique of ${host} — ${c.summary}. Facts from the rendered page, not taste.`, ''];
  for (const f of c.findings) lines.push(`- [${f.level}] ${f.kind}: ${f.message}`);
  return lines.join('\n');
}
