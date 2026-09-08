import { describe, expect, it } from 'vitest';
import type { BrandConfig } from './engine/types';
import { hendriPreset } from './presets/hendri';
import { applyEdits, diffEdits, isNoEdits, noEdits } from './edits';

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
    const edits = {
      seeds: { primary: '#123456', nope: '#000000' } as never,
      semanticOverrides: [
        { name: 'primary', light: { scale: 'primary' as const, step: 500 as const } },
        { name: 'ghost', light: { scale: 'nope' as never, step: 500 as const } },
      ],
    };
    const applied = applyEdits(seeded, edits);
    expect(applied.color.scales.find((s) => s.role === 'primary')!.seed).toBe('#123456');
    expect(applied.color.semanticOverrides.map((o) => o.name)).toEqual(['primary']);
  });
});
