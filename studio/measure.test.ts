import { describe, expect, it } from 'vitest';
import { measure, type Rect } from './measure';

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

describe('measure', () => {
  it('returns nothing for identical rects', () => {
    expect(measure(rect(0, 0, 10, 10), rect(0, 0, 10, 10))).toEqual([]);
  });

  it('reports one x gap for horizontally disjoint rects that share the same y extent', () => {
    const segs = measure(rect(0, 0, 10, 10), rect(20, 0, 10, 10));
    expect(segs).toEqual([{ axis: 'x', from: 10, to: 20, at: 5, length: 10, kind: 'gap' }]);
  });

  it('adds y insets when horizontally disjoint rects are vertically offset', () => {
    const segs = measure(rect(0, 0, 10, 10), rect(20, 5, 10, 10));
    expect(segs).toEqual([
      { axis: 'x', from: 10, to: 20, at: 7.5, length: 10, kind: 'gap' },
      // no x overlap, so y segments sit at the midpoint of a's x extent
      { axis: 'y', from: 0, to: 5, at: 5, length: 5, kind: 'inset' },
      { axis: 'y', from: 10, to: 15, at: 5, length: 5, kind: 'inset' },
    ]);
  });

  it('reports four insets when b is contained in a', () => {
    const segs = measure(rect(0, 0, 100, 100), rect(20, 30, 40, 20));
    expect(segs).toEqual([
      { axis: 'x', from: 0, to: 20, at: 40, length: 20, kind: 'inset' },
      { axis: 'x', from: 60, to: 100, at: 40, length: 40, kind: 'inset' },
      { axis: 'y', from: 0, to: 30, at: 40, length: 30, kind: 'inset' },
      { axis: 'y', from: 50, to: 100, at: 40, length: 50, kind: 'inset' },
    ]);
  });

  it('drops zero-length gaps for touching edges', () => {
    expect(measure(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toEqual([]);
    expect(measure(rect(0, 0, 10, 10), rect(0, 10, 10, 10))).toEqual([]);
  });

  it('handles negative coordinates', () => {
    const segs = measure(rect(-30, -30, 10, 10), rect(-10, -10, 10, 10));
    expect(segs).toEqual([
      { axis: 'x', from: -20, to: -10, at: -25, length: 10, kind: 'gap' },
      { axis: 'y', from: -20, to: -10, at: -25, length: 10, kind: 'gap' },
    ]);
  });

  it('rounds lengths to one decimal', () => {
    const [gap] = measure(rect(0, 0, 10.33, 10), rect(20.01, 0, 5, 10));
    expect(gap?.length).toBe(9.7);
  });
});
