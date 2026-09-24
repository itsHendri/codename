import { describe, expect, it } from 'vitest';
import { lineHeightFor, nearestRatio, ratioName, scaleSize, stepsOf, trackingFor } from './typeScale';

describe('stepsOf', () => {
  it('ranks sizes as steps from the body, keeping the gaps the page keeps', () => {
    const steps = stepsOf([15, 28, 17, 13, 40], 15);
    expect([...steps.entries()].sort((a, b) => a[1] - b[1])).toEqual([
      [13, -1],
      [15, 0],
      [17, 1],
      [28, 2],
      [40, 3],
    ]);
  });
});

describe('nearestRatio', () => {
  it('reads a clean scale back', () => {
    expect(nearestRatio([16, 20, 25, 31.3, 12.8], 16)).toBeCloseTo(1.25, 2);
  });
  it('fits a messy ladder to the closest ratio', () => {
    expect(nearestRatio([15, 17, 28, 40], 15)).toBeGreaterThan(1.3);
    expect(nearestRatio([15, 17, 28, 40], 15)).toBeLessThan(1.45);
  });
  it('falls back sensibly with nothing but the body', () => {
    expect(nearestRatio([15], 15)).toBe(1.25);
  });
});

describe('scaleSize, ratioName', () => {
  it('computes and names', () => {
    expect(scaleSize(16, 1.25, 2)).toBe(25);
    expect(scaleSize(16, 1.25, -1)).toBe(12.8);
    expect(ratioName(1.25)).toBe('major third');
    expect(ratioName(1.3)).toBeNull();
  });
});

describe('lineHeightFor, trackingFor', () => {
  it('tightens with size and lands on a 4px rhythm', () => {
    expect(lineHeightFor(16)).toBe(24);
    expect(lineHeightFor(48)).toBe(52);
    expect(lineHeightFor(28) % 4).toBe(0);
    expect(trackingFor(12)).toBe(0.01);
    expect(trackingFor(48)).toBe(-0.02);
    expect(trackingFor(22)).toBeLessThan(0.01);
  });
});
