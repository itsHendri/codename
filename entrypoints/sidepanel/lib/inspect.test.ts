import { describe, expect, it } from 'vitest';
import { paddingShorthand } from './inspect';

describe('paddingShorthand', () => {
  const box = (t: string, r: string, b: string, l: string) => ({
    paddingTop: t,
    paddingRight: r,
    paddingBottom: b,
    paddingLeft: l,
  });

  it('collapses to the shortest form that says the same thing', () => {
    expect(paddingShorthand(box('8px', '8px', '8px', '8px'))).toBe('8px');
    expect(paddingShorthand(box('8px', '16px', '8px', '16px'))).toBe('8px 16px');
    expect(paddingShorthand(box('8px', '16px', '4px', '16px'))).toBe('8px 16px 4px 16px');
    expect(paddingShorthand(box('0px', '0px', '0px', '0px'))).toBe('0');
  });
});
