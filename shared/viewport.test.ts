import { describe, expect, it } from 'vitest';
import { clampFrame, frameFor, kindFor, presetFor, presetsOf, viewportLabel } from './viewport';

describe('presetFor', () => {
  it('names a size by the preset it is', () => {
    expect(presetFor({ width: 768, height: 1024 })?.name).toBe('Tablet');
  });

  it('tolerates a pixel of rounding either way', () => {
    expect(presetFor({ width: 1281, height: 799 })?.name).toBe('Laptop');
  });

  it('needs the height to match as well, since a frame is both', () => {
    expect(presetFor({ width: 768, height: 600 })).toBe(null);
  });
});

describe('presetsOf', () => {
  it('lists the frames of one kind, for the menu beside its icon', () => {
    expect(presetsOf('phone').map((p) => p.name)).toEqual(['Mobile S', 'Mobile L']);
    expect(presetsOf('laptop').map((p) => p.name)).toEqual(['Laptop', 'Laptop L']);
  });
});

describe('kindFor', () => {
  it('puts a width typed by hand in the band its preset would be in', () => {
    expect([390, 820, 1366, 1920].map(kindFor)).toEqual(['phone', 'tablet', 'laptop', 'desktop']);
  });
});

describe('clampFrame', () => {
  it('keeps a size inside the limits, in whole pixels', () => {
    expect(clampFrame({ width: 99999, height: 50 })).toEqual({ width: 2560, height: 200 });
    expect(clampFrame({ width: 390.6, height: 844.2 })).toEqual({ width: 391, height: 844 });
  });

  it('treats something that is not a number as the smallest frame', () => {
    expect(clampFrame({ width: Number.NaN, height: Number.POSITIVE_INFINITY })).toEqual({ width: 200, height: 200 });
  });
});

describe('frameFor', () => {
  it('names a preset and gives it its kind', () => {
    expect(frameFor({ width: 375, height: 667 })).toEqual({ width: 375, height: 667, kind: 'phone', name: 'Mobile S' });
  });

  it('calls a typed size custom, with the kind its width implies', () => {
    expect(frameFor({ width: 390, height: 844 })).toMatchObject({ width: 390, height: 844, kind: 'phone', name: null });
  });
});

describe('viewportLabel', () => {
  it('says the window when there is no frame', () => {
    expect(viewportLabel(null, { width: 1103.4, height: 812 })).toBe('Window · 1103 × 812');
  });

  it('names the frame, and the scale when it is not full size', () => {
    const frame = frameFor({ width: 1280, height: 800 });
    expect(viewportLabel(frame, { width: 1100, height: 800 }, 1)).toBe('Laptop · 1280 × 800');
    expect(viewportLabel(frame, { width: 1100, height: 800 }, 0.76)).toBe('Laptop · 1280 × 800 · 76%');
  });

  it('calls a typed size custom', () => {
    expect(viewportLabel(frameFor({ width: 390, height: 844 }), { width: 1100, height: 800 })).toBe('Custom · 390 × 844');
  });
});
