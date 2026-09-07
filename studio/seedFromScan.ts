/**
 * Scan → brand. Turns what the panel found on a page into a BrandConfig.
 *
 * The rule this file exists to obey: **every value here comes from the page, or
 * from the engine's neutral defaults — never from somebody's brand.** An earlier
 * version spread a personal preset and overrode three fields, so a scan of any
 * site produced that person's type scale, radii, ramp names and even their
 * tone-of-voice adjectives, recoloured. The values below are observations, and
 * the exported docs say so.
 *
 * Seeds only for colour: the seven primitives are what a human edits, and the
 * ramps and semantics are the engine's job downstream.
 */

import { converter, differenceEuclidean, parse } from 'culori';
import type { ScanResult, ValueTally } from '@/shared/types';
import type {
  BrandConfig,
  ScaleConfig,
  ScaleRole,
  ShadowLevel,
  TypeRole,
} from './engine/types';
import {
  DEFAULT_BREAKPOINTS,
  DEFAULT_CONTAINERS,
  DEFAULT_FLUID_RANGE,
  DEFAULT_MOTION,
  DEFAULT_OPACITY,
  DEFAULT_POLISH,
  DEFAULT_SHADOWS,
  DEFAULT_SHELL,
  DEFAULT_SPACING,
  DEFAULT_TYPE_ROLES,
  DEFAULT_Z_LAYERS,
} from './engine/defaults';
import { slugify } from './storage';

const toOklch = converter('oklch');
const distance = differenceEuclidean('oklab');

/* ---------------- colour ---------------- */

interface Candidate {
  hex: string;
  chroma: number;
  lightness: number;
  count: number;
  usage: ScanResult['colors'][number]['usage'];
  varNames: string[];
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
      usage: color.usage,
      varNames: color.varNames,
    });
  }
  return out;
}

/**
 * Assign the four status ramps from the page's own palette — exclusively.
 *
 * Matching each role independently lets one colour win several: stripe.com has
 * a single orange that is the nearest candidate to both the warning and the
 * danger target, which would ship an error badge indistinguishable from a
 * warning. So all (role, candidate) pairs are scored and taken best-first, and
 * a colour already claimed cannot be claimed again. A role with no match near
 * enough keeps a neutral default rather than a wrong answer dressed up as an
 * observation.
 */
function assignStatusColours(
  pool: Candidate[],
): Record<StatusRole, Candidate | null> {
  const MAX_DISTANCE = 0.13;
  const scored: { role: StatusRole; candidate: Candidate; d: number }[] = [];

  for (const role of STATUS_ROLES) {
    const target = parse(STATUS_HUES[role]);
    if (!target) continue;
    for (const candidate of pool) {
      if (candidate.chroma < 0.08) continue;
      const d = distance(target, candidate.hex);
      if (d < MAX_DISTANCE) scored.push({ role, candidate, d });
    }
  }
  scored.sort((a, b) => a.d - b.d);

  const taken = new Set<string>();
  const out = { success: null, warning: null, danger: null, info: null } as Record<
    StatusRole,
    Candidate | null
  >;
  for (const { role, candidate, d: _d } of scored) {
    if (out[role] || taken.has(candidate.hex)) continue;
    out[role] = candidate;
    taken.add(candidate.hex);
  }
  return out;
}

/**
 * What the site calls this colour. A page that ships `--brand-primary` has
 * already named its own system; echoing that name back is more useful than any
 * label we could invent.
 */
function nameFor(candidate: Candidate | null | undefined, fallback: string): string {
  const varName = candidate?.varNames.find((n) => n.length <= 40);
  if (!varName) return fallback;
  const words = varName
    .replace(/^--/, '')
    .split(/[-_]/)
    .filter((w) => w && !/^\d+$/.test(w) && !/^(color|colour|c)$/i.test(w));
  if (!words.length) return fallback;
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 24);
}

type StatusRole = 'success' | 'warning' | 'danger' | 'info';
const STATUS_ROLES: StatusRole[] = ['success', 'warning', 'danger', 'info'];

const STATUS_HUES: Record<StatusRole, string> = {
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0284c7',
};

function buildScales(scan: ScanResult): ScaleConfig[] {
  const pool = candidates(scan);
  const chromatic = pool
    .filter((c) => c.chroma >= 0.05 && c.lightness > 0.15 && c.lightness < 0.92)
    .sort((a, b) => b.chroma * Math.log1p(b.count) - a.chroma * Math.log1p(a.count));

  // Prefer a neutral the page actually sets text in — that is the ink of the
  // site, and it carries the warm/cool cast the rest of the system should share.
  const neutrals = pool
    .filter((c) => c.chroma < 0.05 && c.lightness < 0.55)
    .sort((a, b) => {
      const textish = (x: Candidate) => (x.usage.includes('text') ? 1 : 0);
      return textish(b) - textish(a) || b.count - a.count;
    });

  const primary = chromatic[0];
  const secondary = chromatic.find(
    (c) => c.hex !== primary?.hex && (!primary || distance(primary.hex, c.hex) > 0.15),
  );
  const neutral = neutrals[0] ?? chromatic.find((c) => c.lightness < 0.4);

  const scales: ScaleConfig[] = [
    { role: 'primary', name: nameFor(primary, 'Primary'), seed: primary?.hex ?? '#2563EB' },
    { role: 'secondary', name: nameFor(secondary, 'Accent'), seed: secondary?.hex ?? '#7C3AED' },
    {
      role: 'neutral',
      name: nameFor(neutral, 'Neutral'),
      seed: neutral?.hex ?? '#1F2937',
      // A neutral seeded from a real page is often slightly tinted; hold that
      // cast but keep it from reading as a colour.
      tuning: {
        light: { maxChroma: 0.03 },
        dark: { maxChroma: 0.035 },
      },
    },
  ];

  const status = assignStatusColours(chromatic);
  for (const role of STATUS_ROLES) {
    const found = status[role];
    scales.push({
      role: role as ScaleRole,
      name: nameFor(found, role.charAt(0).toUpperCase() + role.slice(1)),
      seed: found?.hex ?? STATUS_HUES[role],
    });
  }
  return scales;
}

/* ---------------- type ---------------- */

const ROLE_ORDER = [
  'display',
  'heading-lg',
  'heading',
  'heading-sm',
  'body-lg',
  'body',
  'body-sm',
  'label',
] as const;

const px = (value: string): number => parseFloat(value) || 0;

/**
 * The page's real type scale. `fontUsage[].variants` already carries every
 * size/weight/line-height combination with a frequency count, so the ladder is
 * observed rather than assumed — including whether this site even has a display
 * size, which most don't.
 */
function buildTypeRoles(scan: ScanResult): TypeRole[] {
  const bodyFamily = scan.fontUsage.find((f) => f.roles.includes('body'));
  const headingFamily = scan.fontUsage.find((f) => f.roles.includes('headings'));
  const codeFamily = scan.fontUsage.find((f) => f.roles.includes('code'));

  const variants = scan.fontUsage
    .filter((f) => !f.roles.includes('code'))
    .flatMap((f) => f.variants.map((v) => ({ ...v, headings: f.roles.includes('headings') })))
    .filter((v) => px(v.size) >= 9 && px(v.size) <= 200);
  if (!variants.length) return DEFAULT_TYPE_ROLES;

  // The most-used size is the body size; everything above it is a heading step,
  // everything below is fine print.
  const byCount = [...variants].sort((a, b) => b.count - a.count);
  const bodySize = px(byCount[0]!.size);

  const distinct = new Map<number, (typeof variants)[number]>();
  for (const v of variants) {
    const size = Math.round(px(v.size));
    const existing = distinct.get(size);
    if (!existing || v.count > existing.count) distinct.set(size, v);
  }
  const above = Array.from(distinct.entries())
    .filter(([size]) => size > bodySize)
    .sort((a, b) => b[0] - a[0]);
  const below = Array.from(distinct.entries())
    .filter(([size]) => size < bodySize)
    .sort((a, b) => b[0] - a[0]);

  const rem = (value: number) => Math.round((value / 16) * 1000) / 1000;
  const familyFor = (isHeading: boolean) =>
    isHeading && headingFamily && headingFamily !== bodyFamily ? 'display' : 'sans';

  const roles: TypeRole[] = [];
  const push = (
    role: TypeRole['role'],
    entry: (typeof variants)[number] | undefined,
    fallbackSize: number,
  ) => {
    const size = entry ? px(entry.size) : fallbackSize;
    const weight = entry ? parseInt(entry.weight, 10) || 400 : 400;
    const lineHeight = entry ? px(entry.lineHeight) / size : 1.5;
    roles.push({
      role,
      family: familyFor(size > bodySize),
      sizeRem: rem(size),
      lineHeight: Number.isFinite(lineHeight) && lineHeight > 0.8 ? Math.round(lineHeight * 100) / 100 : 1.4,
      weight,
    });
  };

  // Up to four heading steps, largest first, then body, then two small steps.
  const headingSlots = ROLE_ORDER.slice(0, 4);
  headingSlots.forEach((role, i) => {
    const entry = above[i]?.[1];
    if (entry || i < 2) push(role, entry, bodySize * [2.2, 1.6, 1.3, 1.15][i]!);
  });
  push('body-lg', distinct.get(Math.round(bodySize * 1.125)), bodySize * 1.125);
  push('body', byCount[0], bodySize);
  push('body-sm', below[0]?.[1], bodySize * 0.875);
  push('label', below[1]?.[1] ?? below[0]?.[1], bodySize * 0.8125);

  if (codeFamily) {
    const codeVariant = codeFamily.variants[0];
    roles.push({
      role: 'code',
      family: 'mono',
      sizeRem: rem(codeVariant ? px(codeVariant.size) : bodySize * 0.875),
      lineHeight: 1.5,
      weight: 400,
    });
  }
  return roles;
}

/** Only load what the page actually loads, and only from a real webfont host. */
function buildFontLinks(scan: ScanResult): string[] {
  const links = new Set<string>();
  for (const face of scan.fontFaces) {
    if (face.service === 'google') {
      const family = face.family.replace(/\s+/g, '+');
      const weights = face.weights.map((w) => parseInt(w, 10)).filter(Number.isFinite);
      const axis = weights.length ? `:wght@${[...new Set(weights)].sort((a, b) => a - b).join(';')}` : '';
      links.add(`https://fonts.googleapis.com/css2?family=${family}${axis}&display=swap`);
    }
  }
  return Array.from(links).slice(0, 4);
}

/* ---------------- shape & rhythm ---------------- */

const lengths = (tallies: ValueTally[]): number[] =>
  tallies.map((t) => parseFloat(t.value)).filter((n) => Number.isFinite(n) && n > 0);

/**
 * The grid the page is really on.
 *
 * Not a GCD: one off-grid value ruins it. Real stripe.com data — 16, 8, 32, 24,
 * 4, 12, 6, 64, 10, 40 — has a GCD of 2 because of the 6px and 10px, which
 * would claim a 2px grid nobody designed on. Instead take the coarsest base
 * that explains most of the observed weight, so a genuine 8px site reports 8
 * and a mostly-4px site with a couple of strays reports 4.
 */
function spacingBase(tallies: ValueTally[]): number {
  const observed = tallies
    .map((t) => ({ px: parseFloat(t.value), count: t.count }))
    .filter((o) => Number.isFinite(o.px) && o.px > 0);
  const total = observed.reduce((sum, o) => sum + o.count, 0);
  if (!total) return 4;

  for (const base of [8, 4, 2]) {
    const explained = observed
      .filter((o) => o.px % base === 0)
      .reduce((sum, o) => sum + o.count, 0);
    if (explained / total >= 0.85) return base;
  }
  return 4;
}

function buildSpacing(scan: ScanResult): BrandConfig['spacing'] {
  const values = lengths(scan.shape.spacing);
  if (values.length < 3) return DEFAULT_SPACING;
  const basePx = spacingBase(scan.shape.spacing);
  // Off-grid strays are dropped: they are accidents in the page, not steps.
  const blessed = [...new Set(values.filter((n) => n % basePx === 0))]
    .sort((a, b) => a - b)
    .slice(0, 10);
  return blessed.length >= 3 ? { basePx, blessed } : DEFAULT_SPACING;
}

function buildRadius(scan: ScanResult): BrandConfig['radius'] {
  // A pill (9999px) is a shape decision, not a step on the radius scale.
  const values = lengths(scan.shape.radii).filter((n) => n <= 64);
  if (!values.length) return { basePx: 0, concentric: false };
  const basePx = Math.round(values[0]!);
  return { basePx, concentric: basePx > 0 };
}

function buildShadows(scan: ScanResult): BrandConfig['shadows'] {
  const observed = scan.shape.shadows
    .map((s) => s.value)
    .filter((v) => v && v !== 'none' && v.length < 220);
  if (observed.length < 2) return DEFAULT_SHADOWS;

  // Shallowest to deepest by blur radius, mapped onto the three levels the
  // engine names. A page with one shadow keeps the defaults for the rest.
  const blur = (v: string) => {
    const nums = v.match(/-?\d+(\.\d+)?px/g)?.map(parseFloat) ?? [];
    return nums[2] ?? nums[1] ?? 0;
  };
  const sorted = [...observed].sort((a, b) => blur(a) - blur(b));
  const pick = (i: number) => sorted[Math.min(i, sorted.length - 1)]!;
  const levels: ShadowLevel[] = [
    { name: 'sm', layers: [pick(0)] },
    { name: 'raised', layers: [pick(Math.floor(sorted.length / 2))] },
    { name: 'overlay', layers: [pick(sorted.length - 1)] },
  ];
  return { levels };
}

/* ---------------- the logo ---------------- */

/**
 * The best logo candidate: an inline SVG with real drawing in it, from the top
 * of the document. Favicons and single-path icons are usually not the mark.
 */
function findLogo(scan: ScanResult): string | undefined {
  const candidate = scan.svgs.find(
    (s) =>
      s.markup &&
      s.source === 'inline' &&
      s.markup.length > 220 &&
      s.markup.length < 12000 &&
      !/^<svg[^>]*>\s*<(circle|rect)\b[^>]*\/?>\s*<\/svg>$/i.test(s.markup),
  );
  return candidate?.markup;
}

/* ---------------- assembly ---------------- */

export function seedBrandFromScan(scan: ScanResult): BrandConfig {
  const host = (() => {
    try {
      return new URL(scan.url).hostname.replace(/^www\./, '');
    } catch {
      return 'scanned-site';
    }
  })();

  const heading = scan.fontUsage.find((f) => f.roles.includes('headings'));
  const body = scan.fontUsage.find((f) => f.roles.includes('body'));
  const mono = scan.fontUsage.find((f) => f.roles.includes('code'));
  const stack = (family: string | undefined, fallback: string) =>
    family ? `"${family}", ${fallback}` : fallback;

  const families: BrandConfig['typography']['families'] = {
    sans: stack(body?.family ?? heading?.family, 'system-ui, sans-serif'),
    mono: stack(mono?.family, 'ui-monospace, SFMono-Regular, Menlo, monospace'),
  };
  if (heading?.family && heading.family !== body?.family) {
    families.display = stack(heading.family, families.sans);
  }

  const scannedAt = new Date(scan.scannedAt).toISOString().slice(0, 10);

  return {
    $schemaVersion: 1,
    meta: {
      id: `scan-${scan.scannedAt}`,
      name: host,
      slug: slugify(host),
      domain: host,
      logoSvg: findLogo(scan),
      // Voice is a human decision about a brand. A scan cannot see it, so it
      // stays empty rather than borrowing somebody else's adjectives.
      voice: [],
      deviations: [
        `Seeded from a scan of ${scan.url} on ${scannedAt} at ${scan.viewport.width}×${scan.viewport.height}. Every value here is an observation of that page, not a decision anyone made — review it before building on it.`,
        ...(scan.unreadableSheets.length
          ? [
              `${scan.unreadableSheets.length} cross-origin stylesheet(s) could not be read during that scan, so the palette and type scale may be incomplete.`,
            ]
          : []),
      ],
    },
    color: { scales: buildScales(scan), semanticOverrides: [] },
    typography: {
      families,
      fluidRange: DEFAULT_FLUID_RANGE,
      fontLinks: buildFontLinks(scan),
      fontFiles: [],
      roles: buildTypeRoles(scan),
    },
    layout: {
      breakpoints: DEFAULT_BREAKPOINTS,
      containers: DEFAULT_CONTAINERS,
      zLayers: DEFAULT_Z_LAYERS,
      shell: DEFAULT_SHELL,
    },
    spacing: buildSpacing(scan),
    opacity: DEFAULT_OPACITY,
    radius: buildRadius(scan),
    shadows: buildShadows(scan),
    motion: DEFAULT_MOTION,
    rules: { polish: DEFAULT_POLISH },
  };
}
