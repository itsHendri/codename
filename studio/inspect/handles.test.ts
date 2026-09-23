import { describe, expect, it } from 'vitest';
import { dragged, handlesFor, snap, stepsOf, written } from './handles';

const box = { x: 100, y: 100, width: 200, height: 120 };
const edges = (n: number) => ({ top: n, right: n, bottom: n, left: n });

describe('handlesFor', () => {
  it('draws padding inside, margin outside, and size on the far edges', () => {
    const hs = handlesFor(box, edges(16), edges(8), null);
    const at = (k: string) => hs.find((h) => h.kind === k)!.box;
    expect(at('padding-top').y).toBeGreaterThan(box.y);
    expect(at('margin-top').y).toBeLessThan(box.y);
    expect(at('padding-left').x).toBeGreaterThan(box.x);
    expect(at('margin-right').x).toBeGreaterThan(box.x + box.width);
    expect(at('width').x).toBeCloseTo(box.x + box.width - 2);
    expect(hs.some((h) => h.kind === 'gap')).toBe(false);
  });

  it('adds a gap bar between the first two children when there is a gap', () => {
    const hs = handlesFor(box, edges(0), edges(0), { between: { x: 140, y: 110, width: 12, height: 100 }, axis: 'x' });
    expect(hs.find((h) => h.kind === 'gap')).toMatchObject({ axis: 'x' });
  });

  it('draws nothing on a selection too small to aim at', () => {
    expect(handlesFor({ x: 0, y: 0, width: 20, height: 20 }, edges(0), edges(0), null)).toEqual([]);
  });
});

describe('dragged', () => {
  it('grows padding inward, margin outward, size right and down, never below zero', () => {
    expect(dragged('padding-top', 16, 0, 8)).toBe(24);
    expect(dragged('padding-right', 16, -8, 0)).toBe(24);
    expect(dragged('margin-top', 8, 0, -8)).toBe(16);
    expect(dragged('margin-left', 8, -4, 0)).toBe(12);
    expect(dragged('width', 200, 30, 0)).toBe(230);
    expect(dragged('padding-bottom', 4, 0, 50)).toBe(0);
    // A gap follows the way its children run.
    expect(dragged('gap', 12, 6, 40, 'x')).toBe(18);
    expect(dragged('gap', 12, 40, 6, 'y')).toBe(18);
  });
});

describe('snap', () => {
  const steps = stepsOf({ '8': '--space-2', '16': '--space-4' }, [12, 16, 24]);

  it('reads the scale from the variables first, then what the page uses', () => {
    expect(steps).toEqual([{ px: 8, token: '--space-2' }, { px: 12 }, { px: 16, token: '--space-4' }, { px: 24 }]);
  });

  it('lands on a step it passes close to, and on the pixel otherwise', () => {
    expect(snap(15, steps)).toEqual({ px: 16, token: '--space-4' });
    expect(snap(22.6, steps)).toEqual({ px: 24 });
    expect(snap(29.6, steps)).toEqual({ px: 30 });
  });

  it('writes a variable as a reference and anything else in px', () => {
    expect(written({ px: 16, token: '--space-4' })).toEqual({ to: 'var(--space-4)', token: '--space-4' });
    expect(written({ px: 19 })).toEqual({ to: '19px' });
  });
});
