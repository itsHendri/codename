import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/shared/types';
import { buildSpecimenSpec } from './spec';

const scan = {
  url: 'http://localhost:5173/',
  title: 't',
  scannedAt: 0,
  viewport: { width: 1280, height: 800, dpr: 2 },
  fontFaces: [],
  fontUsage: [],
  colors: [
    { hex: '#15171B', usage: ['text'], count: 50, varNames: ['--ink'] },
    { hex: '#CBC7BC', usage: ['border'], count: 9, varNames: [] },
  ],
  gradients: [],
  contrastPairs: [
    { fg: '#15171B', bg: '#E7E4DB', ratio: 12.1, count: 40 },
    { fg: '#BE3A22', bg: '#E7E4DB', ratio: 4.6, count: 3 },
  ],
  svgs: [],
  customProps: [
    { name: '--ink', value: '#15171b', dark: '#e3e0d6', definitions: [{ value: '#15171b', selector: ':root', media: [], scope: 'root' }] },
    { name: '--space-4', value: '16px' },
    { name: '--radius-md', value: '6px' },
    { name: '--shadow-1', value: '0 1px 2px rgba(0,0,0,.2)' },
    { name: '--cta', value: 'var(--ink)', alias: ['--ink'], resolved: '#15171b' },
  ],
  shape: { radii: [{ value: '4px', count: 12 }], shadows: [], spacing: [{ value: '8px', count: 90 }, { value: '16px', count: 70 }] },
  cssText: '',
  unreadableSheets: [],
  stats: { elementsSampled: 10, styleSheets: 1 },
  typeStyles: [
    { name: 'h1', form: 'tag', selectorOrUtility: 'h1', tag: 'h1', fields: { size: { literal: '28px' }, lineHeight: { literal: '34px' } } },
    { name: 'xl', form: 'tailwind-theme', selectorOrUtility: 'text-xl', fields: { size: { token: '--text-xl' } } },
  ],
} as unknown as ScanResult;

describe('buildSpecimenSpec', () => {
  it('takes the type styles with the declarations that paint them', () => {
    const spec = buildSpecimenSpec(scan);
    expect(spec.type.map((t) => [t.form, t.selectorOrUtility])).toEqual([
      ['tag', 'h1'],
      ['tailwind-theme', 'text-xl'],
    ]);
    expect(spec.type[0]?.declarations).toEqual([
      ['font-size', '28px'],
      ['line-height', '34px'],
    ]);
  });

  it('lists colour variables with their scope, dark value and link, aliases included', () => {
    const spec = buildSpecimenSpec(scan, { '--ink': { role: 'neutral', step: 900 } });
    expect(spec.colours.map((c) => c.name)).toEqual(['--ink', '--cta']);
    expect(spec.colours[0]).toMatchObject({ dark: '#e3e0d6', link: 'neutral 900', scope: 'root' });
  });

  it('keeps the literals, the pairs by frequency, and the length values deduped and sorted', () => {
    const spec = buildSpecimenSpec(scan);
    expect(spec.literals).toEqual([{ hex: '#CBC7BC', usage: ['border'], count: 9 }]);
    expect(spec.pairs.map((p) => p.fg)).toEqual(['#15171B', '#BE3A22']);
    expect(spec.space.map((s) => s.value)).toEqual(['8px', '16px']);
    expect(spec.space[1]).toEqual({ name: '--space-4', value: '16px' });
    expect(spec.radii.map((r) => r.value)).toEqual(['4px', '6px']);
    expect(spec.shadows).toEqual([{ name: '--shadow-1', value: '0 1px 2px rgba(0,0,0,.2)' }]);
  });

  it('is empty where the page has nothing', () => {
    const bare = buildSpecimenSpec({ ...scan, typeStyles: [], customProps: [], colors: [], contrastPairs: [], shape: { radii: [], shadows: [], spacing: [] } });
    expect(bare.type).toEqual([]);
    expect(bare.colours).toEqual([]);
    expect(bare.space).toEqual([]);
  });
});
