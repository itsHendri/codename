import { describe, expect, it } from 'vitest';
import { clampRatio } from './SplitPane';

describe('clampRatio', () => {
  it('keeps both panes visible', () => {
    expect(clampRatio(0.5)).toBe(0.5);
    expect(clampRatio(0)).toBe(0.15);
    expect(clampRatio(1)).toBe(0.85);
    expect(clampRatio(NaN)).toBe(0.15);
    expect(clampRatio(0.9, 0.2, 0.6)).toBe(0.6);
  });
});
