import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/shared/types';
import { seedBrandFromScan } from './seedFromScan';
import { resolveTokens } from './engine/resolve';
import { hendriPreset } from './presets/hendri';
import { DEFAULT_TYPE_ROLES } from './engine/defaults';

function scan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    url: 'https://example.com/pricing',
    title: 'Example',
    scannedAt: Date.now(),
    viewport: { width: 1440, height: 900, dpr: 2 },
    fontFaces: [],
    fontUsage: [],
    colors: [],
    gradients: [],
    contrastPairs: [],
    svgs: [],
    customProps: [],
    shape: { radii: [], shadows: [], spacing: [] },
    cssText: '',
    unreadableSheets: [],
    stats: { elementsSampled: 0, styleSheets: 0 },
    ...overrides,
  };
}

const color = (hex: string, count = 10) => ({
  hex,
  usage: ['background' as const],
  count,
  varNames: [],
});

describe('seedBrandFromScan', () => {
  it('takes the most prominent chromatic colour as primary', () => {
    const brand = seedBrandFromScan(
      scan({ colors: [color('#F7F7F7', 900), color('#635BFF', 40), color('#111111', 500)] }),
    );
    expect(brand.color.scales.find((s) => s.role === 'primary')!.seed).toBe('#635BFF');
  });

  it('never picks a near-duplicate hue as the secondary', () => {
    // Two blues one step apart are one brand colour, not two.
    const brand = seedBrandFromScan(
      scan({ colors: [color('#635BFF', 90), color('#6F68FF', 80), color('#F1760F', 30)] }),
    );
    const secondary = brand.color.scales.find((s) => s.role === 'secondary')!.seed;
    expect(secondary).toBe('#F1760F');
  });

  it('falls back to a neutral default, never to somebody else\'s brand', () => {
    const brand = seedBrandFromScan(scan({ colors: [color('#FFFFFF', 100)] }));
    const primary = brand.color.scales.find((s) => s.role === 'primary')!;
    const hendriPrimary = hendriPreset.color.scales.find((s) => s.role === 'primary')!;
    expect(primary.seed).not.toBe(hendriPrimary.seed);
    expect(primary.name).toBe('Primary');
  });

  it('keeps a status seed only when the page really has that hue', () => {
    const withGreen = seedBrandFromScan(scan({ colors: [color('#16A34A', 50)] }));
    expect(withGreen.color.scales.find((s) => s.role === 'success')!.seed).toBe('#16A34A');

    // A page whose only colour is purple must not have its "success" ramp turn purple.
    const withoutGreen = seedBrandFromScan(scan({ colors: [color('#635BFF', 50)] }));
    expect(withoutGreen.color.scales.find((s) => s.role === 'success')!.seed).toBe(
      hendriPreset.color.scales.find((s) => s.role === 'success')!.seed,
    );
  });

  it('records where the values came from, because they are observations not decisions', () => {
    const brand = seedBrandFromScan(scan({ unreadableSheets: ['https://cdn.example.com/app.css'] }));
    expect(brand.meta.deviations[0]).toContain('Seeded from a scan');
    expect(brand.meta.deviations[0]).toContain('1440×900');
    expect(brand.meta.deviations[1]).toContain('cross-origin');
  });

  it('carries the page fonts into the family stacks over a generic fallback', () => {
    const brand = seedBrandFromScan(
      scan({
        fontUsage: [
          { family: 'Söhne', variants: [], elementCount: 20, roles: ['headings'] },
          { family: 'Source Serif 4', variants: [], elementCount: 80, roles: ['body'] },
        ],
      }),
    );
    expect(brand.typography.families.sans).toContain('Source Serif 4');
    expect(brand.typography.families.display).toContain('Söhne');
    // A scanned family name is no guarantee it loads, so a generic stack sits
    // behind it — but it must be a generic, not a personal typeface.
    expect(brand.typography.families.sans).toContain('system-ui');
    expect(brand.typography.families.sans).not.toContain('Space Grotesk');
  });

  it('produces a config the engine can resolve', () => {
    const brand = seedBrandFromScan(
      scan({ colors: [color('#0F62FE', 60), color('#DA1E28', 20), color('#21272A', 400)] }),
    );
    const resolved = resolveTokens(brand);
    expect(resolved.semantics.length).toBeGreaterThan(0);
    expect(resolved.declarations.light.length).toBeGreaterThan(0);
    expect(resolved.warnings.filter((w) => w.level === 'fail')).toHaveLength(0);
  });
});

/**
 * The regression this whole rewrite exists to prevent: a scan used to spread a
 * personal preset, so every scanned site inherited that person's type scale,
 * radii, ramp names and tone of voice, recoloured.
 */
describe('a scanned brand belongs to the scanned site', () => {
  const richScan = scan({
    url: 'https://example.com',
    colors: [
      { hex: '#0F62FE', usage: ['background'], count: 60, varNames: ['--brand-primary'] },
      { hex: '#DA1E28', usage: ['text'], count: 12, varNames: [] },
      { hex: '#21272A', usage: ['text'], count: 400, varNames: ['--text-ink'] },
    ],
    fontUsage: [
      {
        family: 'IBM Plex Sans',
        elementCount: 300,
        roles: ['body'],
        variants: [
          { size: '14px', weight: '400', lineHeight: '20px', count: 200 },
          { size: '32px', weight: '600', lineHeight: '40px', count: 12 },
          { size: '20px', weight: '600', lineHeight: '28px', count: 30 },
          { size: '12px', weight: '400', lineHeight: '16px', count: 40 },
        ],
      },
    ],
    shape: {
      radii: [{ value: '4px', count: 80 }, { value: '2px', count: 10 }],
      shadows: [
        { value: 'rgba(0,0,0,0.1) 0px 1px 2px 0px', count: 20 },
        { value: 'rgba(0,0,0,0.2) 0px 8px 24px 0px', count: 4 },
      ],
      spacing: [
        { value: '8px', count: 200 },
        { value: '16px', count: 150 },
        { value: '24px', count: 60 },
        { value: '32px', count: 20 },
      ],
    },
  });

  const brand = seedBrandFromScan(richScan);
  const json = JSON.stringify(brand);

  it('carries none of the preset\'s ramp names', () => {
    for (const name of hendriPreset.color.scales.map((s) => s.name)) {
      expect(json).not.toContain(`"${name}"`);
    }
  });

  it('leaves voice empty, because a scan cannot see a brand\'s tone', () => {
    expect(brand.meta.voice).toEqual([]);
    for (const adjective of hendriPreset.meta.voice) {
      expect(json).not.toContain(adjective);
    }
  });

  it('names a ramp what the site calls it', () => {
    expect(brand.color.scales.find((s) => s.role === 'primary')!.name).toBe('Brand Primary');
  });

  it('takes the radius from the page, not from a default', () => {
    expect(brand.radius.basePx).toBe(4);
  });

  it('takes the spacing grid from the page', () => {
    expect(brand.spacing.basePx).toBe(8);
    expect(brand.spacing.blessed).toEqual([8, 16, 24, 32]);
  });

  it('takes elevation from the page, shallowest first', () => {
    const layers = brand.shadows.levels.map((l) => l.layers[0]);
    expect(layers[0]).toContain('1px 2px');
    expect(layers[2]).toContain('8px 24px');
  });

  it('builds the type scale from what the page actually renders', () => {
    const body = brand.typography.roles.find((r) => r.role === 'body')!;
    // 14px body, not the default 16px ladder.
    expect(body.sizeRem).toBeCloseTo(0.875, 3);
    expect(body.lineHeight).toBeCloseTo(1.43, 1);

    const sizes = brand.typography.roles.map((r) => r.sizeRem);
    const defaults = DEFAULT_TYPE_ROLES.map((r) => r.sizeRem);
    expect(sizes).not.toEqual(defaults);
  });

  it('describes itself as an observation, with the source and the date', () => {
    expect(brand.meta.deviations[0]).toContain('https://example.com');
    expect(brand.meta.deviations[0]).toMatch(/not a decision anyone made/);
  });

  it('still resolves, and without contrast failures', () => {
    const resolvedBrand = resolveTokens(brand);
    expect(resolvedBrand.warnings.filter((w) => w.level === 'fail')).toHaveLength(0);
  });
});

describe('the spacing grid', () => {
  const withSpacing = (spacing: { value: string; count: number }[]) =>
    seedBrandFromScan(scan({ shape: { radii: [], shadows: [], spacing } })).spacing;

  it('reports the real grid when a couple of values sit off it', () => {
    // Measured on stripe.com. A GCD would answer 2 because of the 6px and 10px,
    // claiming a grid nobody designed on.
    const observed = withSpacing([
      { value: '16px', count: 171 },
      { value: '8px', count: 144 },
      { value: '32px', count: 76 },
      { value: '24px', count: 71 },
      { value: '4px', count: 55 },
      { value: '12px', count: 44 },
      { value: '6px', count: 39 },
      { value: '64px', count: 36 },
      { value: '10px', count: 23 },
      { value: '40px', count: 23 },
    ]);
    expect(observed.basePx).toBe(4);
    expect(observed.blessed).not.toContain(6);
    expect(observed.blessed).not.toContain(10);
  });

  it('reports 8 for a site actually on an 8px grid', () => {
    expect(
      withSpacing([
        { value: '8px', count: 100 },
        { value: '16px', count: 80 },
        { value: '24px', count: 40 },
        { value: '48px', count: 10 },
      ]).basePx,
    ).toBe(8);
  });
});

describe('status colours', () => {
  it('never gives two status roles the same colour', () => {
    // stripe.com ships one orange (#FF6118) that is the nearest candidate to
    // both the warning and the danger target. Matching roles independently
    // handed it to both, so an error badge and a warning badge came out
    // identical.
    const brand = seedBrandFromScan(
      scan({ colors: [color('#FF6118', 8), color('#533AFD', 52), color('#50617A', 160)] }),
    );
    const seeds = (['success', 'warning', 'danger', 'info'] as const).map(
      (role) => brand.color.scales.find((s) => s.role === role)!.seed.toUpperCase(),
    );
    expect(new Set(seeds).size).toBe(seeds.length);
    expect(seeds.filter((s) => s === '#FF6118')).toHaveLength(1);
  });

  it('gives each role its own best match when the page has several', () => {
    const brand = seedBrandFromScan(
      scan({
        colors: [
          color('#16A34A', 20), // green -> success
          color('#DC2626', 20), // red -> danger
          color('#0284C7', 20), // blue -> info
        ],
      }),
    );
    const seed = (role: 'success' | 'danger' | 'info') =>
      brand.color.scales.find((s) => s.role === role)!.seed.toUpperCase();
    expect(seed('success')).toBe('#16A34A');
    expect(seed('danger')).toBe('#DC2626');
    expect(seed('info')).toBe('#0284C7');
  });
});
