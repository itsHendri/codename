import { describe, expect, it } from 'vitest';
import { stepValue } from './NumberField';

describe('stepValue', () => {
  it('steps a number and keeps its unit', () => {
    expect(stepValue('12px', 1)).toBe('13px');
    expect(stepValue('1.5rem', 0.1)).toBe('1.6rem');
    expect(stepValue('0', 10)).toBe('10');
    expect(stepValue('400', 100)).toBe('500');
    expect(stepValue('-2px', -1)).toBe('-3px');
  });

  it('keeps two decimals at most and strips trailing zeros', () => {
    expect(stepValue('1.333px', 0.1)).toBe('1.43px');
    expect(stepValue('0.9', 0.1)).toBe('1');
  });

  it('leaves keywords alone', () => {
    expect(stepValue('auto', 1)).toBe('auto');
    expect(stepValue('normal', -1)).toBe('normal');
  });
});
