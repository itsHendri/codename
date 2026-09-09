import { describe, expect, it } from 'vitest';
import { converter, parse } from 'culori';
import type { CustomPropInfo } from '@/shared/types';
import { buildColorMap, buildReskin, manualOverrides, mergeOverrides, mirrorStep } from './reskin';
import { resolveTokens } from './engine/resolve';
import { seedBrandFromScan } from './seedFromScan';
import type { ScanResult } from '@/shared/types';

const toOklch = converter('oklch');
const hue = (hex: string) => toOklch(parse(hex)!)!.h ?? 0;
const lightness = (hex: string) => toOklch(parse(hex)!)!.l;

/** forfontsake's real token set — the project this was built against. */
const FORFONTSAKE: CustomPropInfo[] = [
  { name: '--ink', value: '#15171b' },
  { name: '--paper', value: '#e7e4db' },
  { name: '--plate', value: '#efece4' },
  { name: '--rule', value: '#cbc7bc' },
  { name: '--muted', value: '#6c6a61' },
  { name: '--mark', value: '#be3a22' },
  { name: '--track', value: '#d5d1c6' },
];

function scanOf(props: CustomPropInfo[], colors: { hex: string; count: number }[]): ScanResult {
  return {
    url: 'http://localhost:5173/',
    title: 'forfontsake',
    scannedAt: Date.now(),
    viewport: { width: 1280, height: 800, dpr: 2 },
    fontFaces: [],
    fontUsage: [],
    colors: colors.map((c) => ({
      hex: c.hex.toUpperCase(),
      usage: ['background' as const],
      count: c.count,
      varNames: props.filter((p) => p.value.toUpperCase() === c.hex.toUpperCase()).map((p) => p.name),
    })),
    gradients: [],
    contrastPairs: [],
    svgs: [],
    customProps: props,
    shape: { radii: [], shadows: [], spacing: [] },
    cssText: '',
    unreadableSheets: [],
    stats: { elementsSampled: 100, styleSheets: 1 },
  };
}

const scan = scanOf(FORFONTSAKE, [
  { hex: '#be3a22', count: 20 },
  { hex: '#15171b', count: 200 },
  { hex: '#e7e4db', count: 150 },
  { hex: '#6c6a61', count: 40 },
]);

const withSeed = (role: string, seed: string) => {
  const base = seedBrandFromScan(scan);
  return resolveTokens({
    ...base,
    color: {
      ...base.color,
      scales: base.color.scales.map((s) => (s.role === role ? { ...s, seed } : s)),
    },
  });
};

describe('buildReskin', () => {
  const before = resolveTokens(seedBrandFromScan(scan));

  it('does nothing when nothing changed', () => {
    expect(buildReskin(FORFONTSAKE, before, before)).toEqual([]);
  });

  it('moves the variable the seed was taken from', () => {
    // #be3a22 is forfontsake's --mark and the most chromatic colour, so it
    // becomes the primary seed. Dragging primary must move --mark.
    const after = withSeed('primary', '#1C7F5C');
    const overrides = buildReskin(FORFONTSAKE, before, after);
    const mark = overrides.find((o) => o.name === '--mark');
    expect(mark).toBeDefined();
    expect(mark!.from).toBe('#BE3A22');
    expect(mark!.to).not.toBe('#BE3A22');
    expect(mark!.reason).toBe('exact');
  });

  it('carries the new hue, not just any change', () => {
    const after = withSeed('primary', '#1C7F5C');
    const mark = buildReskin(FORFONTSAKE, before, after).find((o) => o.name === '--mark')!;
    // Green, like the seed it followed — within a few degrees.
    expect(Math.abs(hue(mark.to) - hue('#1C7F5C'))).toBeLessThan(12);
  });

  it('leaves the page\'s neutrals alone when only the brand hue moved', () => {
    const after = withSeed('primary', '#1C7F5C');
    const names = buildReskin(FORFONTSAKE, before, after).map((o) => o.name);
    // Paper and rule are near-achromatic: they have no hue to carry.
    expect(names).not.toContain('--paper');
    expect(names).not.toContain('--rule');
    expect(names).not.toContain('--track');
  });

  it('keeps a tint a tint — lightness is the variable\'s own', () => {
    const props: CustomPropInfo[] = [
      { name: '--mark', value: '#be3a22' },
      // A pale wash of the same hue, the kind a site uses for a badge.
      { name: '--mark-wash', value: '#f6d9d3' },
    ];
    const after = withSeed('primary', '#1C7F5C');
    const wash = buildReskin(props, before, after).find((o) => o.name === '--mark-wash');
    expect(wash).toBeDefined();
    const lightnessBefore = toOklch(parse('#f6d9d3')!)!.l;
    const lightnessAfter = toOklch(parse(wash!.to)!)!.l;
    expect(Math.abs(lightnessAfter - lightnessBefore)).toBeLessThan(0.03);
    // ...but it did change hue with the family.
    expect(wash!.to).not.toBe('#F6D9D3');
    expect(wash!.reason).toBe('family');
  });

  it('never rewrites a var() reference, only literal colours', () => {
    const props: CustomPropInfo[] = [
      { name: '--mark', value: '#be3a22' },
      { name: '--button-bg', value: 'var(--mark)' },
    ];
    const after = withSeed('primary', '#1C7F5C');
    const names = buildReskin(props, before, after).map((o) => o.name);
    expect(names).toContain('--mark');
    // The alias follows on its own through the cascade; rewriting it would
    // flatten the indirection the author chose.
    expect(names).not.toContain('--button-bg');
  });

  it('ignores non-colour variables', () => {
    const props: CustomPropInfo[] = [
      { name: '--mark', value: '#be3a22' },
      { name: '--radius', value: '4px' },
      { name: '--font-sans', value: 'Inter, sans-serif' },
      { name: '--duration', value: '200ms' },
    ];
    const after = withSeed('primary', '#1C7F5C');
    expect(buildReskin(props, before, after).map((o) => o.name)).toEqual(['--mark']);
  });

  it('emits each variable at most once', () => {
    const after = withSeed('primary', '#1C7F5C');
    const names = buildReskin([...FORFONTSAKE, ...FORFONTSAKE], before, after).map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('says nothing to do on a page with no custom properties', () => {
    // stripe.com: zero readable variables, so the clean path has no purchase.
    const after = withSeed('primary', '#1C7F5C');
    expect(buildReskin([], before, after)).toEqual([]);
  });
});

describe('buildColorMap — for pages with no variables to override', () => {
  const before = resolveTokens(seedBrandFromScan(scan));

  it('maps the colours the page actually paints with', () => {
    const after = withSeed('primary', '#1C7F5C');
    const map = buildColorMap([{ hex: '#BE3A22' }], before, after);
    expect(map['#BE3A22']).toBeDefined();
    expect(Math.abs(hue(map['#BE3A22']!) - hue('#1C7F5C'))).toBeLessThan(12);
  });

  it('is empty when nothing changed, so no rules get rewritten', () => {
    expect(buildColorMap([{ hex: '#BE3A22' }, { hex: '#15171B' }], before, before)).toEqual({});
  });

  it('leaves colours it has no claim on out of the map', () => {
    const after = withSeed('primary', '#1C7F5C');
    // A page neutral and an unrelated hue: neither belongs to the brand family.
    const map = buildColorMap([{ hex: '#CBC7BC' }, { hex: '#2A78D6' }], before, after);
    expect(map['#CBC7BC']).toBeUndefined();
    expect(map['#2A78D6']).toBeUndefined();
  });

  it('agrees with the variable path about the same colour', () => {
    // Both paths ask remapColor, so a site defining --mark and another
    // hardcoding #be3a22 must end up with the same new colour.
    const after = withSeed('primary', '#1C7F5C');
    const viaVar = buildReskin([{ name: '--mark', value: '#be3a22' }], before, after)[0]!;
    const viaMap = buildColorMap([{ hex: '#BE3A22' }], before, after);
    expect(viaMap['#BE3A22']).toBe(viaVar.to);
  });
});

describe('dark preview — the page as the system\'s other side', () => {
  const before = resolveTokens(seedBrandFromScan(scan));

  it('mirrors a step across the ramp', () => {
    expect(mirrorStep(50)).toBe(950);
    expect(mirrorStep(100)).toBe(900);
    expect(mirrorStep(500)).toBe(500);
    expect(mirrorStep(950)).toBe(50);
  });

  it('inverts ink and paper with no edit at all', () => {
    const map = buildColorMap([{ hex: '#15171B' }, { hex: '#E7E4DB' }], before, before, 'dark');
    // The ink goes light and the paper goes dark: that is what a dark mode is.
    expect(lightness(map['#15171B']!)).toBeGreaterThan(0.8);
    expect(lightness(map['#E7E4DB']!)).toBeLessThan(0.45);
  });

  it('reaches the page\'s variables the same way', () => {
    const names = buildReskin(FORFONTSAKE, before, before, 'dark').map((o) => o.name);
    expect(names).toContain('--ink');
    expect(names).toContain('--paper');
    expect(names).toContain('--rule');
  });

  it('keeps a chromatic colour that is not on a ramp where it is', () => {
    // An unrelated blue: no seed moved, so its family gives it nowhere to go.
    const map = buildColorMap([{ hex: '#2A78D6' }], before, before, 'dark');
    expect(map['#2A78D6']).toBeUndefined();
  });

  it('leaves the page alone in light with no edit, as before', () => {
    expect(buildColorMap([{ hex: '#15171B' }, { hex: '#E7E4DB' }], before, before, 'light')).toEqual({});
  });
});

describe('manual overrides — a value typed for one variable', () => {
  it('honours only names the page defines, and only real changes', () => {
    const out = manualOverrides({ '--mark': '#000000', '--paper': '#e7e4db', '--nope': '#fff' }, FORFONTSAKE);
    expect(out).toEqual([{ name: '--mark', from: '#be3a22', to: '#000000', reason: 'manual' }]);
  });

  it('beats the engine for the same name', () => {
    const merged = mergeOverrides(
      [{ name: '--mark', from: '#BE3A22', to: '#1C7F5C', reason: 'exact' }, { name: '--ink', from: '#15171b', to: '#000', reason: 'exact' }],
      [{ name: '--mark', from: '#be3a22', to: '#000000', reason: 'manual' }],
    );
    expect(merged.find((o) => o.name === '--mark')!.to).toBe('#000000');
    expect(merged).toHaveLength(2);
  });
});
