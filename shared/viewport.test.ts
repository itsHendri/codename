import { describe, expect, it } from 'vitest';
import { chromeDelta, planResize, presetFor, requestedBounds, viewportLabel } from './viewport';

describe('viewportLabel', () => {
  it('names a preset by its width', () => {
    expect(viewportLabel({ innerWidth: 768, innerHeight: 1024, zoom: 1 })).toBe('Tablet · 768 × 1024');
  });

  it('calls anything else Custom', () => {
    expect(viewportLabel({ innerWidth: 1103, innerHeight: 812, zoom: 1 })).toBe('Custom · 1103 × 812');
  });

  it('adds the zoom when the page is not at 100%', () => {
    expect(viewportLabel({ innerWidth: 1280, innerHeight: 640, zoom: 0.86 })).toBe('Laptop · 1280 × 640 · 86%');
  });

  it('tolerates a pixel of rounding', () => {
    expect(presetFor(1281)?.name).toBe('Laptop');
    expect(presetFor(1290)).toBeNull();
  });
});

describe('requestedBounds', () => {
  const outer = { width: 1470, height: 900 };

  it('adds the chrome delta so the inner size becomes the preset', () => {
    const inner = { width: 1100, height: 812 };
    expect(requestedBounds({ width: 768, height: 1024 }, inner, outer, 1)).toEqual({
      width: 768 + 370,
      height: 1024 + 88,
    });
  });

  it('un-scales a zoomed inner size before taking the delta', () => {
    // At 50% the page reports twice the CSS pixels it has device pixels for.
    const inner = { width: 2200, height: 1624 };
    expect(chromeDelta(inner, outer, 0.5)).toEqual({ width: 370, height: 88 });
  });

  it('never asks for a window smaller than the floor', () => {
    expect(requestedBounds({ width: 100, height: 100 }, { width: 100, height: 100 }, { width: 100, height: 100 }, 1)).toEqual({
      width: 500,
      height: 200,
    });
  });
});

describe('planResize', () => {
  const inner = { width: 1100, height: 812 };
  const outer = { width: 1470, height: 900 };

  it('keeps 100% when the window could grow enough', () => {
    const plan = planResize({ preset: { width: 768, height: 1024 }, inner, outer, zoom: 1, achieved: { width: 1138, height: 1112 } });
    expect(plan).toEqual({ zoom: 1, viewport: { width: 768, height: 1024 } });
  });

  it('zooms out when the display clamps the window', () => {
    // A MacBook: asked for 1650 wide, got the 1470 the display has.
    const plan = planResize({ preset: { width: 1280, height: 800 }, inner, outer, zoom: 1, achieved: { width: 1470, height: 900 } });
    expect(plan.zoom).toBe(0.86);
    expect(plan.viewport.width).toBe(1279);
  });

  it('plans from the un-zoomed delta when the page is already zoomed', () => {
    const plan = planResize({
      preset: { width: 1280, height: 800 },
      inner: { width: 1279, height: 944 },
      outer,
      zoom: 0.86,
      achieved: { width: 1470, height: 900 },
    });
    expect(plan.zoom).toBe(0.86);
  });
});
