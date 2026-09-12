import { describe, expect, it } from 'vitest';
import type { ColorInfo, ScanResult } from '@/shared/types';
import { driftReport, driftToText, normaliseName, pairAll, parseTokenFile, sameValue } from './tokenFile';

const DTCG = JSON.stringify({
  color: {
    $type: 'color',
    brand: { $value: '#BE3A22' },
    accent: { $value: '#1C7F5C' },
    link: { $value: '{color.brand}' },
  },
  space: {
    $type: 'dimension',
    2: { $value: { value: 16, unit: 'px' } },
  },
});

describe('parseTokenFile', () => {
  it('flattens groups to dotted paths, inherits $type, and reads a dimension object', () => {
    const { tokens, error } = parseTokenFile(DTCG);
    expect(error).toBeUndefined();
    expect(tokens).toContainEqual({ name: 'color.brand', value: '#BE3A22', type: 'color' });
    expect(tokens).toContainEqual({ name: 'space.2', value: '16px', type: 'dimension' });
  });

  it('resolves an alias to the value it points at, whatever the order in the file', () => {
    const { tokens } = parseTokenFile(DTCG);
    expect(tokens.find((t) => t.name === 'color.link')?.value).toBe('#BE3A22');
    // An alias with no target is dropped rather than reported as a literal.
    const dangling = parseTokenFile(JSON.stringify({ a: { $value: '{nowhere.at.all}' } }));
    expect(dangling.tokens).toEqual([]);
  });

  it('reads a flat map of custom properties as itself', () => {
    const { tokens } = parseTokenFile(JSON.stringify({ '--brand': '#BE3A22', '--space-2': '16px' }));
    expect(tokens).toEqual([
      { name: '--brand', value: '#BE3A22' },
      { name: '--space-2', value: '16px' },
    ]);
  });

  it('says what is wrong rather than throwing', () => {
    expect(parseTokenFile('not json').error).toMatch(/not JSON/);
    expect(parseTokenFile('[1,2]').error).toMatch(/JSON object/);
  });
});

describe('normaliseName and sameValue', () => {
  it('reads one name three ways as one name', () => {
    expect(normaliseName('color.brand.primary')).toBe('color-brand-primary');
    expect(normaliseName('--color-brand-primary')).toBe('color-brand-primary');
    expect(normaliseName('colorBrandPrimary')).toBe('color-brand-primary');
  });

  it('compares colours and lengths on their own terms', () => {
    expect(sameValue('#BE3A22', '#be3a22')).toBe(true);
    expect(sameValue('1rem', '16px')).toBe(true);
    expect(sameValue('#BE3A22', '#1C7F5C')).toBe(false);
    expect(sameValue('Inter', 'Helvetica')).toBe(false);
  });
});

const scan: Pick<ScanResult, 'customProps' | 'colors' | 'rootFontSize' | 'shape'> = {
  rootFontSize: 16,
  shape: { spacing: [{ value: '16px', count: 40 }], radii: [{ value: '4px', count: 12 }], shadows: [] },
  customProps: [
    { name: '--color-brand', value: '#CC0000' },
    { name: '--space-2', value: '1rem' },
  ],
  colors: [
    { hex: '#CC0000', usage: ['text'], count: 24, varNames: ['--color-brand'] },
    { hex: '#334455', usage: ['background'], count: 9, varNames: [] },
  ],
};

describe('driftReport', () => {
  it('names a variable and its token that no longer agree', () => {
    const { tokens } = parseTokenFile(DTCG);
    const report = driftReport(scan, tokens, 'tokens.json');
    const drifted = report.findings.find((f) => f.kind === 'drifted');
    expect(drifted?.level).toBe('fail');
    expect(drifted?.message).toContain('--color-brand is #CC0000, color.brand is #BE3A22');
    // The lengths agree across units, so the grid is not reported as drift.
    expect(drifted?.message).not.toContain('--space-2');
  });

  it('names colours the page paints that no token holds, and tokens nothing reaches', () => {
    const { tokens } = parseTokenFile(DTCG);
    const report = driftReport(scan, tokens, 'tokens.json');
    expect(report.findings.find((f) => f.kind === 'untokenised')?.message).toContain('#334455 ×9');
    const unused = report.findings.find((f) => f.kind === 'unused');
    expect(unused?.message).toContain('color.accent');
    // A token whose name a variable carries is reached, even when it has drifted.
    expect(unused?.message).not.toContain('color.brand');
    // A spacing token the page lays out with is reached, though nothing paints it.
    expect(unused?.message).not.toContain('space.2');
  });

  it('says so plainly when the page and the file agree', () => {
    const agreeing = parseTokenFile(JSON.stringify({ '--color-brand': '#CC0000', '--space-2': '16px', extra: { $value: '#334455' } }));
    const report = driftReport(scan, agreeing.tokens, 'tokens.json');
    expect(report.findings).toEqual([]);
    expect(driftToText(report, 'localhost', 'tokens.json')).toBe('localhost and tokens.json agree, across 3 tokens.');
  });

  it('reads as facts, never as instructions', () => {
    const { tokens } = parseTokenFile(DTCG);
    const text = driftToText(driftReport(scan, tokens, 'tokens.json'), 'localhost', 'tokens.json');
    expect(text).toContain('the file is not automatically right');
    expect(text).not.toMatch(/you should|change it to|fix/i);
  });
});

describe('pairing across nesting', () => {
  const tokens = [
    { name: 'color.brand.mark', value: '#BE3A22' },
    { name: 'space.2', value: '16px' },
    { name: 'color.ink', value: '#15171B' },
    { name: 'text.ink', value: '#000000' },
  ];

  it('pairs a flat page variable with a nested token by its trailing segments', () => {
    expect(pairAll([{ name: '--mark' }], tokens).get('--mark')?.name).toBe('color.brand.mark');
    expect(pairAll([{ name: '--brand-mark' }], tokens).get('--brand-mark')?.name).toBe('color.brand.mark');
  });

  it('says nothing when two tokens could both be meant', () => {
    // color.ink and text.ink both end in "ink"; the file does not say which.
    expect(pairAll([{ name: '--ink' }], tokens).get('--ink')).toBeUndefined();
  });

  it('does not pair on a partial segment', () => {
    const paired = pairAll([{ name: '--k' }, { name: '--nothing-like-it' }], tokens);
    expect(paired.size).toBe(0);
  });
});

describe('shapes a real file actually has', () => {
  it('keeps a group that happens to contain a token named "value"', () => {
    const { tokens } = parseTokenFile(JSON.stringify({ border: { width: { $value: '1px' }, value: { $value: '2px' } } }));
    expect(tokens.map((t) => t.name).sort()).toEqual(['border.value', 'border.width']);
  });

  it('reads a bare number under a dimension type as px, which is what it means', () => {
    const { tokens } = parseTokenFile(JSON.stringify({ space: { $type: 'dimension', md: { $value: 16 } } }));
    expect(tokens[0]).toEqual({ name: 'space.md', value: '16px', type: 'dimension' });
    // A plain number with no dimension type is left as it was written.
    const plain = parseTokenFile(JSON.stringify({ ratio: { $type: 'number', golden: { $value: 1.618 } } }));
    expect(plain.tokens[0]?.value).toBe('1.618');
  });

  it('does not report a numeric dimension as both drifted and unused', () => {
    const { tokens } = parseTokenFile(JSON.stringify({ space: { $type: 'dimension', 2: { $value: 16 } } }));
    const report = driftReport(scan, tokens, 'tokens.json');
    expect(report.findings.some((f) => f.kind === 'drifted')).toBe(false);
    expect(report.findings.some((f) => f.kind === 'unused')).toBe(false);
  });

  it('counts everything it found, and shows the first few', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      hex: `#${i.toString(16).padStart(2, '0')}00FF`,
      usage: ['text'] as ColorInfo['usage'],
      count: 40 - i,
      varNames: [],
    }));
    const report = driftReport({ ...scan, colors: [...many] }, [{ name: 'only', value: '#123456' }], 'tokens.json');
    const untokenised = report.findings.find((f) => f.kind === 'untokenised');
    expect(untokenised?.message).toContain('40 colours the page paints');
    expect(untokenised?.detail.total).toBe(40);
  });
});

describe('pairAll', () => {
  const tokens = [
    { name: 'size', value: '8px' },
    { name: 'radius', value: '4px' },
  ];

  it('leaves a short token alone when several variables would answer to it', () => {
    const paired = pairAll([{ name: '--icon-size' }, { name: '--font-size' }, { name: '--border-radius' }], tokens);
    // size is claimed by two variables, so it pairs with neither.
    expect(paired.get('--icon-size')).toBeUndefined();
    expect(paired.get('--font-size')).toBeUndefined();
    // radius is claimed by one, so that pairing stands.
    expect(paired.get('--border-radius')?.name).toBe('radius');
  });

  it('does not invent drift from a token that no variable uniquely answers to', () => {
    const report = driftReport(
      { customProps: [{ name: '--icon-size', value: '24px' }, { name: '--font-size', value: '14px' }], colors: [] },
      tokens,
      'tokens.json',
    );
    expect(report.findings.some((f) => f.kind === 'drifted')).toBe(false);
  });
});
