import { describe, expect, it } from 'vitest';
import type { BrandConfig, ResolvedTokens } from './engine/types';
import { hendriPreset } from './presets/hendri';
import { resolveTokens } from './engine/resolve';
import { buildLengthReskin, lengthKind, lengthPx } from './reskin';

const base = (): BrandConfig => structuredClone(hendriPreset);
const resolve = (c: BrandConfig): ResolvedTokens => resolveTokens(c);

/** The system with its spacing grid moved from 4 to 6. */
function regridded(from: BrandConfig, oldBase: number, newBase: number): BrandConfig {
  const next = structuredClone(from);
  next.spacing = {
    basePx: newBase,
    blessed: from.spacing.blessed.map((v) => Math.round(v / oldBase) * newBase),
  };
  return next;
}

describe('lengthPx', () => {
  it('reads px and rem against the page root size, and nothing else', () => {
    expect(lengthPx('16px')).toBe(16);
    expect(lengthPx('1.5rem', 16)).toBe(24);
    expect(lengthPx('1.5rem', 20)).toBe(30);
    expect(lengthPx('2em')).toBeNull();
    expect(lengthPx('auto')).toBeNull();
  });
});

describe('lengthKind', () => {
  it('reads the family off the name', () => {
    expect(lengthKind('--space-4')).toBe('space');
    expect(lengthKind('--gap-sm')).toBe('space');
    expect(lengthKind('--radius-md')).toBe('radius');
    expect(lengthKind('--rounded-lg')).toBe('radius');
    expect(lengthKind('--font-size-lg')).toBe('type');
    expect(lengthKind('--text-xl')).toBe('type');
    expect(lengthKind('--whatever')).toBeNull();
  });

  it('does not claim a colour variable that happens to say text', () => {
    // Reached only for values that are already lengths, but the name alone
    // must not be enough to call --text-primary a font size.
    expect(lengthKind('--text-primary')).toBeNull();
  });
});

describe('buildLengthReskin', () => {
  const before = base();
  const after = regridded(before, before.spacing.basePx, before.spacing.basePx + 2);
  const step = before.spacing.blessed[2]!;
  const moved = after.spacing.blessed[2]!;

  it('moves a spacing variable onto the new grid', () => {
    const out = buildLengthReskin(
      [{ name: '--space-md', value: `${step}px` }],
      resolve(before),
      resolve(after),
    );
    expect(out).toEqual([
      { name: '--space-md', from: `${step}px`, to: `${moved}px`, reason: 'grid' },
    ]);
  });

  it('writes the new value back in the unit the page used', () => {
    const out = buildLengthReskin(
      [{ name: '--gap', value: `${step / 16}rem` }],
      resolve(before),
      resolve(after),
      16,
    );
    expect(out[0]?.to).toBe(`${moved / 16}rem`);
  });

  it('leaves alone a length the system did not move', () => {
    expect(
      buildLengthReskin([{ name: '--space-odd', value: '7px' }], resolve(before), resolve(after)),
    ).toEqual([]);
  });

  it('leaves alone a nameless length two families disagree about', () => {
    // No hint in the name, and only one family claims it, so it still moves…
    const named = buildLengthReskin(
      [{ name: '--thing', value: `${step}px` }],
      resolve(before),
      resolve(after),
    );
    expect(named).toHaveLength(1);

    // …but once type claims the same value and moves it somewhere else, the
    // two families disagree and it is left alone.
    const beforeType = structuredClone(before);
    beforeType.typography.roles[0]!.sizeRem = step / 16;
    const typeToo = structuredClone(after);
    typeToo.typography.roles[0]!.sizeRem = (step + 5) / 16;
    const conflicted = buildLengthReskin(
      [{ name: '--thing', value: `${step}px` }],
      resolve(beforeType),
      resolve(typeToo),
    );
    expect(conflicted).toEqual([]);
  });

  it('moves a font size when the type scale moves', () => {
    const bigger = structuredClone(before);
    bigger.typography.roles = bigger.typography.roles.map((r) =>
      r.role === 'body' ? { ...r, sizeRem: r.sizeRem * 1.25 } : r,
    );
    const body = before.typography.roles.find((r) => r.role === 'body')!;
    const out = buildLengthReskin(
      [{ name: '--font-size-body', value: `${Math.round(body.sizeRem * 16)}px` }],
      resolve(before),
      resolve(bigger),
    );
    expect(out[0]).toMatchObject({ name: '--font-size-body', reason: 'scale' });
  });

  it('ignores colours, keywords and anything that is not a length', () => {
    expect(
      buildLengthReskin(
        [
          { name: '--brand', value: '#be3a22' },
          { name: '--space-auto', value: 'auto' },
          { name: '--ref', value: 'var(--space-4)' },
        ],
        resolve(before),
        resolve(after),
      ),
    ).toEqual([]);
  });
});
