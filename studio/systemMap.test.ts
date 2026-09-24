import { describe, expect, it } from 'vitest';
import type { CustomPropInfo } from '@/shared/types';
import { resolveTokens } from './engine/resolve';
import { seedBrandFromScan } from './seedFromScan';
import { inferColourLinks, linkedBy, linkedOverrides, mergeLinks } from './systemMap';
import type { ScanResult } from '@/shared/types';

const scan = {
  url: 'http://localhost:5173/',
  title: 't',
  scannedAt: 0,
  viewport: { width: 1280, height: 800, dpr: 2 },
  fontFaces: [],
  fontUsage: [{ family: 'Inter', elementCount: 10, roles: ['body'], variants: [{ size: '15px', weight: '400', lineHeight: '24px', count: 10 }] }],
  colors: [
    { hex: '#15171B', usage: ['text'], count: 50, varNames: ['--ink'] },
    { hex: '#BE3A22', usage: ['text'], count: 20, varNames: ['--mark'] },
  ],
  gradients: [],
  contrastPairs: [],
  svgs: [],
  customProps: [
    { name: '--ink', value: '#15171b' },
    { name: '--mark', value: '#be3a22' },
    { name: '--cta', value: 'var(--mark)', alias: ['--mark'], resolved: '#be3a22' },
    { name: '--paper', value: '#e7e4db' },
  ],
  shape: { radii: [], shadows: [], spacing: [] },
  cssText: '',
  unreadableSheets: [],
  stats: { elementsSampled: 10, styleSheets: 1 },
} as unknown as ScanResult;
const seeded = seedBrandFromScan(scan);
const resolved = resolveTokens(seeded);

describe('inferColourLinks', () => {
  it('links a variable that sits on a step, through an alias too', () => {
    const { links } = inferColourLinks(scan.customProps, resolved);
    expect(links['--mark']).toEqual(links['--cta']);
    expect(links['--mark']?.role).toBe('primary');
  });
  it('leaves a variable off every ramp alone', () => {
    const { links } = inferColourLinks([{ name: '--odd', value: '#7f3f9f' }], resolved);
    expect(links['--odd']).toBeUndefined();
  });
});

describe('mergeLinks and linkedBy', () => {
  it('lets a stored decision win, including a stored null', () => {
    const merged = mergeLinks({ '--mark': { role: 'primary', step: 600 } }, { '--mark': null, '--paper': { role: 'neutral', step: 100 } });
    expect(merged['--mark']).toBeNull();
    expect(linkedBy(merged).get('neutral:100')).toEqual(['--paper']);
  });
});

describe('linkedOverrides', () => {
  it('moves a linked variable to its step after a seed change, and nothing when nothing moved', () => {
    const { links } = inferColourLinks(scan.customProps, resolved);
    const link = links['--mark']!;
    const same = linkedOverrides(links, scan.customProps, resolved, resolved, 'light');
    expect(same).toEqual([]);
    const moved = resolveTokens({
      ...seeded,
      color: { ...seeded.color, scales: seeded.color.scales.map((s) => (s.role === 'primary' ? { ...s, seed: '#1c7f5c' } : s)) },
    });
    const out = linkedOverrides(links, scan.customProps, resolved, moved, 'light');
    const mark = out.find((o) => o.name === '--mark');
    expect(mark).toMatchObject({ reason: 'link', to: moved.scales.primary.steps.light[link.step].hex.toUpperCase() });
  });
  it('mirrors the step in dark', () => {
    const links = { '--mark': { role: 'primary' as const, step: 600 as const } };
    const out = linkedOverrides(links, scan.customProps, resolved, resolved, 'dark');
    expect(out[0]?.to).toBe(resolved.scales.primary.steps.dark[400].hex.toUpperCase());
  });
});
