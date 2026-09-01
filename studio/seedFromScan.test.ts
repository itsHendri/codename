import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/shared/types';
import { seedBrandFromScan } from './seedFromScan';
import { resolveTokens } from './engine/resolve';
import { hendriPreset } from './presets/hendri';

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

  it('falls back to the preset when a page has no usable colour', () => {
    const brand = seedBrandFromScan(scan({ colors: [color('#FFFFFF', 100)] }));
    expect(brand.color.scales.find((s) => s.role === 'primary')!.seed).toBe(
      hendriPreset.color.scales.find((s) => s.role === 'primary')!.seed,
    );
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

  it('carries the page fonts into the family stacks with a fallback behind them', () => {
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
    // The preset's stack stays behind it — a scanned family name is not a guarantee it loads.
    expect(brand.typography.families.sans).toContain(hendriPreset.typography.families.sans);
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
