import { describe, expect, it } from 'vitest';
import type { BrandConfig } from './engine/types';
import { hendriPreset } from './presets/hendri';
import { applyEdits, diffEdits, isNoEdits, noEdits, normaliseEdits, regrid } from './edits';

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

  it('drops decisions about ramps the new reading does not have', () => {
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
    expect(applied.color.semanticOverrides.map((o) => o.name)).toEqual(['primary']);
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
