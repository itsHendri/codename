/**
 * Scan → brand. Turns what the side panel found on a page into a starting
 * BrandConfig, so "forge a system from this scan" is one click.
 *
 * Only the seven seeds are inferred. Everything downstream (ramps, semantics,
 * contrast) is the engine's job, and the point of the seeds/semantics split is
 * that a human then edits colour in exactly one place.
 */

import { converter, differenceEuclidean, parse } from 'culori';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig, ScaleConfig, ScaleRole } from './engine/types';
import { hendriPreset } from './presets/hendri';
import { slugify } from './storage';

const toOklch = converter('oklch');
const distance = differenceEuclidean('oklab');

interface Candidate {
  hex: string;
  chroma: number;
  lightness: number;
  count: number;
}

function candidates(scan: ScanResult): Candidate[] {
  const out: Candidate[] = [];
  for (const color of scan.colors) {
    const parsed = parse(color.hex);
    if (!parsed) continue;
    const ok = toOklch(parsed);
    if (!ok) continue;
    out.push({
      hex: color.hex,
      chroma: ok.c ?? 0,
      lightness: ok.l,
      count: color.count,
    });
  }
  return out;
}

/** Nearest candidate to a target hue, used to seed the status ramps from the page when it has them. */
function nearestTo(target: string, pool: Candidate[], minChroma = 0.08): string | null {
  const parsed = parse(target);
  if (!parsed) return null;
  let best: { hex: string; d: number } | null = null;
  for (const c of pool) {
    if (c.chroma < minChroma) continue;
    const d = distance(parsed, c.hex);
    if (!best || d < best.d) best = { hex: c.hex, d };
  }
  // Beyond this the page's colour is a different hue entirely and the preset's
  // status colour is the better answer than a wrong one.
  return best && best.d < 0.13 ? best.hex : null;
}

export function seedBrandFromScan(scan: ScanResult): BrandConfig {
  const pool = candidates(scan);
  const chromatic = pool
    .filter((c) => c.chroma >= 0.05 && c.lightness > 0.15 && c.lightness < 0.92)
    .sort((a, b) => b.chroma * Math.log1p(b.count) - a.chroma * Math.log1p(a.count));
  const neutrals = pool
    .filter((c) => c.chroma < 0.05 && c.lightness < 0.55)
    .sort((a, b) => b.count - a.count);

  const primary = chromatic[0]?.hex;
  // Second seed must be a genuinely different hue, not a shade of the first.
  const secondary = chromatic.find(
    (c) => c.hex !== primary && (!primary || distance(primary, c.hex) > 0.15),
  )?.hex;
  const neutral = neutrals[0]?.hex ?? chromatic.find((c) => c.lightness < 0.4)?.hex;

  const preset = (role: ScaleRole) =>
    hendriPreset.color.scales.find((s) => s.role === role)!;

  const scales: ScaleConfig[] = hendriPreset.color.scales.map((scale) => {
    switch (scale.role) {
      case 'primary':
        return primary ? { ...scale, seed: primary } : scale;
      case 'secondary':
        return secondary ? { ...scale, seed: secondary } : scale;
      case 'neutral':
        return neutral ? { ...scale, seed: neutral } : scale;
      case 'success':
      case 'warning':
      case 'danger':
      case 'info': {
        // Keep the page's own status colour when it plainly has one.
        const found = nearestTo(preset(scale.role).seed, chromatic);
        return found ? { ...scale, seed: found } : scale;
      }
      default:
        return scale;
    }
  });

  const host = (() => {
    try {
      return new URL(scan.url).hostname.replace(/^www\./, '');
    } catch {
      return 'scanned-site';
    }
  })();

  const families = { ...hendriPreset.typography.families };
  const heading = scan.fontUsage.find((f) => f.roles.includes('headings'));
  const body = scan.fontUsage.find((f) => f.roles.includes('body'));
  const mono = scan.fontUsage.find((f) => f.roles.includes('code'));
  if (body?.family) families.sans = `"${body.family}", ${hendriPreset.typography.families.sans}`;
  if (heading?.family && heading.family !== body?.family) {
    families.display = `"${heading.family}", ${families.sans}`;
  }
  if (mono?.family) families.mono = `"${mono.family}", ${hendriPreset.typography.families.mono}`;

  return {
    ...hendriPreset,
    meta: {
      ...hendriPreset.meta,
      id: `scan-${Date.now()}`,
      name: host,
      slug: slugify(host),
      domain: host,
      // The one thing a scan genuinely knows that a preset cannot: where this
      // came from, and that the values are observations rather than decisions.
      deviations: [
        `Seeded from a scan of ${scan.url} at ${scan.viewport.width}×${scan.viewport.height}. Every value below is a starting point taken from that page, not a decision anyone made — review the seeds before shipping.`,
        ...(scan.unreadableSheets.length
          ? [
              `${scan.unreadableSheets.length} cross-origin stylesheet(s) could not be read during that scan, so the palette may be incomplete.`,
            ]
          : []),
      ],
      logoSvg: undefined,
      logoFile: undefined,
    },
    color: { scales, semanticOverrides: [] },
    typography: { ...hendriPreset.typography, families, fontLinks: [], fontFiles: [] },
  };
}
