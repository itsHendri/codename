import { describe, expect, it } from 'vitest';
import { rewriteLength, type LengthMap } from './reskinRules';

const map: LengthMap = {
  type: {
    '15': { size: { from: 15, to: 18 }, weight: { from: 400, to: 500 }, lineHeight: { from: 1.6, to: 1.5 } },
    '28': { weight: { from: 600, to: 700 } },
  },
  space: { '8': 12, '16': 24, '24': 36 },
  radius: { '4': 8 },
};

describe('rewriteLength', () => {
  it('moves a font-size that is a role size, in the unit it was written', () => {
    expect(rewriteLength('font-size', '15px', map, null)).toBe('18px');
    expect(rewriteLength('font-size', '0.9375rem', map, null, 16)).toBe('1.125rem');
    expect(rewriteLength('font-size', '17px', map, null)).toBeNull();
  });

  it('moves a weight only inside a rule whose font-size names the role', () => {
    expect(rewriteLength('font-weight', '400', map, 15)).toBe('500');
    expect(rewriteLength('font-weight', 'normal', map, 15)).toBe('500');
    expect(rewriteLength('font-weight', '400', map, null)).toBeNull();
    expect(rewriteLength('font-weight', '700', map, 15)).toBeNull();
    expect(rewriteLength('font-weight', '600', map, 28)).toBe('700');
  });

  it('moves a line-height as a ratio or as a length against the new size', () => {
    expect(rewriteLength('line-height', '1.6', map, 15)).toBe('1.5');
    expect(rewriteLength('line-height', '24px', map, 15)).toBe('27px');
    expect(rewriteLength('line-height', '1.4', map, 15)).toBeNull();
    expect(rewriteLength('line-height', '1.6', map, null)).toBeNull();
  });

  it('moves a spacing shorthand only when every length in it is a step', () => {
    expect(rewriteLength('padding', '8px 16px', map, null)).toBe('12px 24px');
    expect(rewriteLength('margin', '0 auto 24px', map, null)).toBe('0 auto 36px');
    expect(rewriteLength('padding', '8px 10px', map, null)).toBeNull();
    expect(rewriteLength('gap', '1rem', map, null, 16)).toBe('1.5rem');
  });

  it('moves a single radius and leaves shapes alone', () => {
    expect(rewriteLength('border-radius', '4px', map, null)).toBe('8px');
    expect(rewriteLength('border-radius', '4px 4px 0 0', map, null)).toBeNull();
    expect(rewriteLength('border-radius', '9999px', map, null)).toBeNull();
  });

  it('refuses what it cannot reason about', () => {
    expect(rewriteLength('padding', 'calc(8px + 1vw)', map, null)).toBeNull();
    expect(rewriteLength('padding', 'var(--space-2)', map, null)).toBeNull();
    expect(rewriteLength('padding', '50%', map, null)).toBeNull();
    expect(rewriteLength('padding', '1em', map, null)).toBeNull();
    expect(rewriteLength('--space-2', '8px', map, null)).toBeNull();
    expect(rewriteLength('width', '8px', map, null)).toBeNull();
  });
});
