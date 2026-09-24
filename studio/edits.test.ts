import { describe, expect, it } from 'vitest';
import type { BrandConfig } from './engine/types';
import { hendriPreset } from './presets/hendri';
import { applyEdits, diffEdits, editsKey, isNoEdits, noEdits, normaliseEdits, regrid } from './edits';

const base = (): BrandConfig => structuredClone(hendriPreset);

describe('diffEdits / applyEdits', () => {
  it('records only the seed that moved', () => {
    const seeded = base();
    const edited = structuredClone(seeded);
    edited.color.scales[0]!.seed = '#1C7F5C';
    const edits = diffEdits(seeded, edited);
    expect(edits.seeds).toEqual({ [seeded.color.scales[0]!.role]: '#1C7F5C' });
    expect(isNoEdits(diffEdits(seeded, seeded))).toBe(true);
    expect(isNoEdits(noEdits())).toBe(true);
  });

  it('round-trips through a fresh reading and keeps the rest of the reading', () => {
    const seeded = base();
    const edited = structuredClone(seeded);
    edited.color.scales[0]!.seed = '#1C7F5C';
    const edits = diffEdits(seeded, edited);

    const rescan = base();
    rescan.spacing.basePx = 6; // the page changed its grid since
    const applied = applyEdits(rescan, edits);
    expect(applied.color.scales[0]!.seed).toBe('#1C7F5C');
    expect(applied.spacing.basePx).toBe(6);
  });

  it('drops decisions about ramps the new reading does not have, and old semantic overrides', () => {
    const seeded = base();
    // The shape a store held before vars, colours and type existed.
    const legacy = {
      seeds: { primary: '#123456', nope: '#000000' } as never,
      semanticOverrides: [
        { name: 'primary', light: { scale: 'primary' as const, step: 500 as const } },
        { name: 'ghost', light: { scale: 'nope' as never, step: 500 as const } },
      ],
    };
    const applied = applyEdits(seeded, legacy as never);
    expect(applied.color.scales.find((s) => s.role === 'primary')!.seed).toBe('#123456');
    // Nothing in the panel can show or remove a semantic override now, so a
    // stored one does not come back to keep the site marked as edited.
    expect(applied.color.semanticOverrides).toEqual([]);
    const edited = structuredClone(seeded);
    edited.color.semanticOverrides = [{ name: 'primary', light: { scale: 'primary', step: 500 } }];
    expect(isNoEdits(diffEdits(seeded, edited))).toBe(true);
  });

  it('keeps type, grid and radius decisions across a rescan', () => {
    const seeded = base();
    const edited = structuredClone(seeded);
    const body = edited.typography.roles.find((r) => r.role === 'body')!;
    body.sizeRem = 1.125;
    body.weight = 500;
    edited.spacing = regrid(edited.spacing, edited.spacing.basePx + 2);
    edited.radius = { ...edited.radius, basePx: 12, concentric: true };

    const edits = diffEdits(seeded, edited);
    expect(edits.type.body).toEqual({ sizeRem: 1.125, weight: 500 });
    expect(edits.spacingBasePx).toBe(seeded.spacing.basePx + 2);
    expect(edits.radiusBasePx).toBe(12);
    expect(isNoEdits(edits)).toBe(false);

    const applied = applyEdits(base(), edits);
    expect(applied.typography.roles.find((r) => r.role === 'body')).toMatchObject({ sizeRem: 1.125, weight: 500 });
    expect(applied.spacing.basePx).toBe(seeded.spacing.basePx + 2);
    expect(applied.radius.basePx).toBe(12);
  });

  it('drops a type decision about a role the new reading does not render', () => {
    const seeded = base();
    const edits = { ...noEdits(), type: { display: { sizeRem: 5 } } };
    const rescan = base();
    rescan.typography.roles = rescan.typography.roles.filter((r) => r.role !== 'display');
    expect(applyEdits(rescan, edits).typography.roles.some((r) => r.role === 'display')).toBe(false);
  });

  it('counts a variable or a colour set by hand as an edit', () => {
    expect(isNoEdits({ ...noEdits(), vars: { '--mark': '#000' } })).toBe(false);
    expect(isNoEdits({ ...noEdits(), colors: { '#BE3A22': '#000000' } })).toBe(false);
    expect(normaliseEdits({ seeds: {}, semanticOverrides: [] }).vars).toEqual({});
  });
});

describe('regrid', () => {
  it('keeps the shape of the steps the page uses', () => {
    expect(regrid({ basePx: 4, blessed: [4, 8, 24] }, 6)).toEqual({ basePx: 6, blessed: [6, 12, 36] });
  });
});

describe('locks', () => {
  it('load as an empty list from a store that predates them, and count as an edit once set', () => {
    expect(normaliseEdits({ seeds: {}, semanticOverrides: [], vars: {}, colors: {}, type: {} }).locks).toEqual([]);
    expect(isNoEdits(normaliseEdits(null))).toBe(true);
    expect(isNoEdits({ ...noEdits(), locks: ['--ink'] })).toBe(false);
  });
});

describe('editsKey', () => {
  const project = { path: '/Users/x/site', name: 'site', root: '/Users/x/site', branch: 'main' };

  it('files a local page under the project the bridge is running in', () => {
    expect(editsKey('http://localhost:3000', project, true)).toBe('project:/Users/x/site');
  });

  it('falls back to the repository root rather than a subfolder', () => {
    expect(editsKey('http://localhost:3000', { path: '/Users/x/site/apps/web', name: 'web' }, true)).toBe(
      'project:/Users/x/site/apps/web',
    );
    expect(editsKey('http://localhost:3000', { ...project, path: '/Users/x/site/apps/web' }, true)).toBe(
      'project:/Users/x/site',
    );
  });

  it('keys a deployed site by its origin, whatever folder the terminal is in', () => {
    expect(editsKey('https://forfontsake.com', project, false)).toBe('https://forfontsake.com');
  });

  it('keys by origin when no bridge is paired', () => {
    expect(editsKey('http://localhost:3000', null, true)).toBe('http://localhost:3000');
  });
});

describe('links, pins and dark values', () => {
  it('round-trips a pinned step through the config', async () => {
    const { seedBrandFromScan } = await import('./seedFromScan');
    const { diffEdits, applyEdits } = await import('./edits');
    const scan = {
      url: 'http://localhost:5173/', title: 't', scannedAt: 0, viewport: { width: 1280, height: 800, dpr: 2 }, fontFaces: [],
      fontUsage: [{ family: 'Inter', elementCount: 10, roles: ['body'], variants: [{ size: '15px', weight: '400', lineHeight: '24px', count: 10 }] }],
      colors: [{ hex: '#BE3A22', usage: ['text'], count: 20, varNames: ['--mark'] }], gradients: [], contrastPairs: [], svgs: [],
      customProps: [{ name: '--mark', value: '#be3a22' }], shape: { radii: [], shadows: [], spacing: [] }, cssText: '', unreadableSheets: [], stats: { elementsSampled: 10, styleSheets: 1 },
    } as unknown as import('@/shared/types').ScanResult;
    const seeded = seedBrandFromScan(scan);
    const edited = { ...seeded, color: { ...seeded.color, scales: seeded.color.scales.map((s) => (s.role === 'primary' ? { ...s, overrides: { light: { 600: '#123456' } } } : s)) } };
    const edits = diffEdits(seeded, edited);
    expect(edits.pins).toEqual({ primary: { 600: '#123456' } });
    const back = applyEdits(seeded, edits);
    expect(back.color.scales.find((s) => s.role === 'primary')?.overrides?.light).toEqual({ 600: '#123456' });
  });

  it('counts links, pins and dark values as edits', async () => {
    const { isNoEdits, noEdits } = await import('./edits');
    expect(isNoEdits(noEdits())).toBe(true);
    expect(isNoEdits({ ...noEdits(), links: { '--mark': null } })).toBe(false);
    expect(isNoEdits({ ...noEdits(), darkVars: { '--mark': '#000' } })).toBe(false);
    expect(isNoEdits({ ...noEdits(), pins: { primary: { 600: '#000' } } })).toBe(false);
  });
});
