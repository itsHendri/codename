import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/shared/types';
import { critique, critiqueToText } from './critique';
import { seedBrandFromScan } from './seedFromScan';

function scanOf(over: Partial<ScanResult> = {}): ScanResult {
  return {
    url: 'http://localhost:5173/',
    title: 'forfontsake',
    scannedAt: Date.now(),
    viewport: { width: 1280, height: 800, dpr: 2 },
    fontFaces: [],
    fontUsage: [
      {
        family: 'Inter',
        elementCount: 300,
        roles: ['body'],
        variants: [
          { size: '15px', weight: '400', lineHeight: '24px', count: 200 },
          { size: '28px', weight: '600', lineHeight: '34px', count: 8 },
          { size: '13px', weight: '400', lineHeight: '18px', count: 3 },
          { size: '11px', weight: '400', lineHeight: '14px', count: 2 },
          { size: '10px', weight: '400', lineHeight: '13px', count: 2 },
          { size: '9px', weight: '400', lineHeight: '12px', count: 1 },
        ],
      },
    ],
    colors: [
      { hex: '#15171B', usage: ['text'], count: 513, varNames: [] },
      { hex: '#E7E4DB', usage: ['background'], count: 49, varNames: [] },
      { hex: '#E8E5DC', usage: ['background'], count: 2, varNames: [] },
      { hex: '#BE3A22', usage: ['text'], count: 24, varNames: [] },
    ],
    gradients: [],
    contrastPairs: [
      { fg: '#15171B', bg: '#E7E4DB', ratio: 14.1, count: 400 },
      { fg: '#9A9890', bg: '#E7E4DB', ratio: 2.6, count: 12 },
      { fg: '#6C6A61', bg: '#E7E4DB', ratio: 4.1, count: 69 },
    ],
    svgs: [],
    customProps: [],
    shape: {
      radii: [{ value: '4px', count: 40 }],
      shadows: [],
      spacing: [
        { value: '8px', count: 90 },
        { value: '16px', count: 70 },
        { value: '24px', count: 30 },
        { value: '6px', count: 12 },
      ],
    },
    cssText: '',
    unreadableSheets: [],
    stats: { elementsSampled: 900, styleSheets: 2 },
    ...over,
  };
}

describe('critique', () => {
  const scan = scanOf();
  const c = critique(scan, seedBrandFromScan(scan));
  const kinds = (k: string) => c.findings.filter((f) => f.kind === k);

  it('flags contrast that misses AA, worse ratios harder', () => {
    const contrast = kinds('contrast');
    expect(contrast.map((f) => f.level)).toEqual(['warn', 'fail']);
    expect(contrast[0]!.message).toContain('4.1:1');
    expect(contrast[0]!.message).toContain('69 elements');
    expect(contrast[1]!.detail).toMatchObject({ fg: '#9A9890', ratio: 2.6 });
  });

  it('names the spacing that is off the grid, with counts', () => {
    const [spacing] = kinds('spacing');
    expect(spacing!.message).toContain('6px ×12');
    expect(spacing!.detail).toMatchObject({ basePx: 8 });
  });

  it('pairs colours close enough to be one colour written twice', () => {
    const [dupe] = kinds('colour');
    expect(dupe!.message).toContain('#E8E5DC');
    expect(dupe!.message).toContain('#E7E4DB');
    expect(kinds('colour')).toHaveLength(1);
  });

  it('notes sizes beyond the ladder read off the page', () => {
    // 13 and 11 become body-sm and label, 10 rounds onto 11; 9 is the long tail.
    const [type] = kinds('type');
    expect(type!.message).toContain('9px ×1');
    expect(type!.message).not.toContain('13px');
    expect(type!.message).not.toContain('10px');
  });

  it('sums up, and reads as one line per finding', () => {
    expect(c.summary).toBe('1 fail · 3 warn · 1 note');
    const text = critiqueToText(c, 'localhost:5173');
    expect(text).toContain('[fail] contrast');
    expect(text.split('\n').filter((l) => l.startsWith('- ')).length).toBe(c.findings.length);
  });

  it('says so when there is nothing to flag', () => {
    const clean = scanOf({
      contrastPairs: [{ fg: '#15171B', bg: '#E7E4DB', ratio: 14.1, count: 400 }],
      colors: [{ hex: '#15171B', usage: ['text'], count: 1, varNames: [] }],
      shape: { radii: [], shadows: [], spacing: [{ value: '8px', count: 9 }, { value: '16px', count: 9 }, { value: '24px', count: 9 }] },
      fontUsage: [{ family: 'Inter', elementCount: 10, roles: ['body'], variants: [{ size: '15px', weight: '400', lineHeight: '24px', count: 10 }] }],
    });
    const quiet = critique(clean, seedBrandFromScan(clean));
    expect(quiet.findings).toEqual([]);
    expect(critiqueToText(quiet, 'x')).toContain('Nothing to flag');
  });

  it('counts unreadable stylesheets as a limit on everything else', () => {
    const partial = critique(scanOf({ unreadableSheets: ['https://cdn/x.css'] }), seedBrandFromScan(scan));
    expect(kinds.call(null, 'coverage').length).toBe(0);
    expect(partial.findings.some((f) => f.kind === 'coverage')).toBe(true);
  });
});

describe('accessibility facts', () => {
  it('counts what a screen reader or a keyboard would meet, with totals', () => {
    const scan = scanOf({
      a11y: {
        images: 40,
        imagesWithoutAlt: 3,
        headingSkips: [{ from: 2, to: 4, count: 3 }],
        targets: 30,
        smallTargets: 5,
        focusOutlineRemoved: 2,
      },
    });
    const c = critique(scan, seedBrandFromScan(scan));
    const kinds = c.findings.map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['alt', 'headings', 'targets', 'focus']));
    expect(c.findings.find((f) => f.kind === 'alt')).toMatchObject({ level: 'fail' });
    expect(c.findings.find((f) => f.kind === 'alt')?.message).toContain('3 of 40 images');
    expect(c.findings.find((f) => f.kind === 'headings')?.message).toContain('h2 → h4 ×3');
    expect(c.findings.find((f) => f.kind === 'targets')?.message).toContain('5 of 30 controls are under 24×24px');
    expect(c.findings.find((f) => f.kind === 'focus')).toMatchObject({ level: 'fail' });
    // Nothing is suggested; the text says what is, not what to do.
    expect(critiqueToText(c, 'localhost')).not.toMatch(/you should|instead use/i);
  });

  it('says nothing about accessibility when a scan predates the counts', () => {
    const c = critique(scanOf(), seedBrandFromScan(scanOf()));
    expect(c.findings.some((f) => ['alt', 'headings', 'targets', 'focus'].includes(f.kind))).toBe(false);
  });
});
