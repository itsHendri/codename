import { describe, expect, it } from 'vitest';
import type { BrandConfig } from './engine/types';
import { hendriPreset } from './presets/hendri';
import { diffSystem } from './systemDiff';

const base = (): BrandConfig => structuredClone(hendriPreset);

describe('diffSystem', () => {
  it('is empty when nothing was decided', () => {
    expect(diffSystem(base(), base())).toEqual([]);
  });

  it('reports a type size in px, whatever it is stored in', () => {
    const after = base();
    const body = after.typography.roles.find((r) => r.role === 'body')!;
    const was = base().typography.roles.find((r) => r.role === 'body')!;
    body.sizeRem = 18 / 16;
    expect(diffSystem(base(), after)).toEqual([
      { area: 'type', label: 'body size', from: `${was.sizeRem * 16}px`, to: '18px' },
    ]);
  });

  it('reports weight and line-height separately', () => {
    const after = base();
    const heading = after.typography.roles.find((r) => r.role === 'heading')!;
    heading.weight = 800;
    heading.lineHeight = 1.1;
    const out = diffSystem(base(), after);
    expect(out.map((c) => c.label)).toEqual(['heading weight', 'heading line-height']);
    expect(out.every((c) => c.area === 'type')).toBe(true);
  });

  it('reports the grid and the radius', () => {
    const after = base();
    after.spacing = { basePx: 6, blessed: [6, 12, 24] };
    after.radius = { ...after.radius, basePx: base().radius.basePx + 4 };
    const out = diffSystem(base(), after);
    expect(out).toEqual([
      { area: 'spacing', label: 'grid step', from: `${base().spacing.basePx}px`, to: '6px' },
      {
        area: 'radius',
        label: 'base radius',
        from: `${base().radius.basePx}px`,
        to: `${base().radius.basePx + 4}px`,
      },
    ]);
  });

  it('ignores a role the new reading no longer has', () => {
    const after = base();
    after.typography.roles = after.typography.roles.filter((r) => r.role !== 'code');
    expect(diffSystem(base(), after)).toEqual([]);
  });
});
