import { describe, expect, it } from 'vitest';
import { compose, decompose, IDENTITY, parseMatrix, parseTransform, transformRoundTrips, transformToCss } from './transform';

describe('a transform as fields', () => {
  it('reads a computed matrix apart into what the author meant', () => {
    expect(decompose([1, 0, 0, 1, 12, -4])).toEqual({ ...IDENTITY, x: 12, y: -4 });
    expect(decompose([1.2, 0, 0, 1.2, 0, 0])).toEqual({ ...IDENTITY, scaleX: 1.2, scaleY: 1.2 });
    const rotated = decompose(compose({ ...IDENTITY, rotate: 30 }));
    expect(rotated.rotate).toBe(30);
    expect(rotated.scaleX).toBe(1);
    expect(rotated.scaleY).toBe(1);
  });

  it('round-trips any 2D transform through the fields', () => {
    for (const t of [
      { x: 10, y: 20, rotate: 45, scaleX: 1.5, scaleY: 0.5, skewX: 10 },
      { x: 0, y: 0, rotate: -90, scaleX: 2, scaleY: 2, skewX: 0 },
      { x: -3.5, y: 8, rotate: 0, scaleX: 1, scaleY: -1, skewX: 20 },
    ]) {
      const back = decompose(compose(t));
      for (const k of Object.keys(t) as (keyof typeof t)[]) expect(back[k]).toBeCloseTo(t[k], 2);
    }
    expect(transformRoundTrips('matrix(0.866025, 0.5, -0.5, 0.866025, 10, 0)')).toBe(true);
    expect(transformRoundTrips('none')).toBe(true);
  });

  it('accepts a matrix3d that stays in the plane and refuses one that does not', () => {
    expect(parseMatrix('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)')).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseMatrix('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 5, 1)')).toBeNull();
    expect(transformRoundTrips('rotate3d(1, 1, 0, 45deg)')).toBe(false);
    expect(parseMatrix('matrix(1, 0, 0, 1, 10)')).toBeNull();
  });

  it('writes only what is not the identity, and none for nothing', () => {
    expect(transformToCss(IDENTITY)).toBe('none');
    expect(transformToCss({ ...IDENTITY, x: 10, y: 0 })).toBe('translate(10px, 0px)');
    expect(transformToCss({ ...IDENTITY, rotate: 15, scaleX: 1.2, scaleY: 1.2 })).toBe('rotate(15deg) scale(1.2)');
    expect(transformToCss({ ...IDENTITY, scaleX: 2, scaleY: 1, skewX: 5 })).toBe('skewX(5deg) scale(2, 1)');
  });

  it('reads back what it wrote, and nothing it did not', () => {
    expect(parseTransform('translate(10px, 0px) rotate(15deg) scale(1.2)')).toMatchObject({ x: 10, y: 0, rotate: 15, scaleX: 1.2, scaleY: 1.2 });
    expect(parseTransform('translateX(4px) scale(2, 1)')).toMatchObject({ x: 4, scaleX: 2, scaleY: 1 });
    expect(parseTransform('translate(10%, 0)')).toBeNull();
    expect(parseTransform('rotate(0.5turn)')).toBeNull();
    expect(parseTransform('var(--lift)')).toBeNull();
    expect(parseTransform('perspective(100px)')).toBeNull();
    expect(parseTransform('none')).toEqual(IDENTITY);
  });
});
