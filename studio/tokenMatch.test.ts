import { describe, expect, it } from 'vitest';
import { asReference, buildValueIndex, kindForProperty, suggestTokens, toPx, tokenHolding } from './tokenMatch';

const scan = {
  rootFontSize: 16,
  customProps: [
    { name: '--mark', value: '#be3a22' },
    { name: '--mark-soft', value: '#c24a35' },
    { name: '--ink', value: 'rgb(21, 23, 27)' },
    { name: '--space-4', value: '16px' },
    { name: '--space-6', value: '1.5rem' },
    { name: '--radius', value: '4px' },
    { name: '--shadow-md', value: '0 4px 12px rgba(0,0,0,0.12)' },
    { name: '--font-sans', value: 'Inter, sans-serif' },
    { name: '--not-a-value', value: 'var(--mark)' },
  ],
};

describe('toPx', () => {
  it('reads px and rem against the root size, and nothing else', () => {
    expect(toPx('16px')).toBe(16);
    expect(toPx('1.5rem', 16)).toBe(24);
    expect(toPx('1.5rem', 20)).toBe(30);
    expect(toPx('0')).toBe(0);
    expect(toPx('2em')).toBeNull();
    expect(toPx('auto')).toBeNull();
  });
});

describe('suggestTokens', () => {
  it('finds the exact colour token first and near ones after', () => {
    const s = suggestTokens('color', 'rgb(190, 58, 34)', scan);
    expect(s.map((x) => [x.name, x.exact])).toEqual([
      ['--mark', true],
      ['--mark-soft', false],
    ]);
    expect(asReference(s[0]!)).toBe('var(--mark)');
  });

  it('ignores colours that are too far and variables that are references', () => {
    expect(suggestTokens('color', '#00ff00', scan)).toEqual([]);
  });

  it('matches lengths across px and rem', () => {
    expect(suggestTokens('length', '24px', scan).map((x) => x.name)).toEqual(['--space-6']);
    expect(suggestTokens('length', '1rem', scan).map((x) => x.name)).toEqual(['--space-4']);
    expect(suggestTokens('length', '17px', scan)).toEqual([]);
  });

  it('matches shadows and fonts by normalised text', () => {
    expect(suggestTokens('shadow', '0 4px 12px  rgba(0,0,0,0.12)', scan)[0]?.name).toBe('--shadow-md');
    expect(suggestTokens('font', 'inter, sans-serif', scan)[0]?.name).toBe('--font-sans');
    expect(suggestTokens('font', 'Georgia', scan)).toEqual([]);
  });

  it('converts rem with the page root size, not an assumed 16', () => {
    const s = suggestTokens('length', '30px', { ...scan, rootFontSize: 20 });
    expect(s.map((x) => x.name)).toEqual(['--space-6']);
  });
});

describe('kindForProperty', () => {
  it('knows which properties take which kind of token, and which take none', () => {
    expect(kindForProperty('color')).toBe('color');
    expect(kindForProperty('border-top-color')).toBe('color');
    expect(kindForProperty('padding-left')).toBe('length');
    expect(kindForProperty('font-size')).toBe('length');
    expect(kindForProperty('box-shadow')).toBe('shadow');
    expect(kindForProperty('font-family')).toBe('font');
    // Nothing the page holds in a variable we can compare honestly.
    expect(kindForProperty('display')).toBeNull();
    expect(kindForProperty('text')).toBeNull();
  });
});

describe('tokenHolding', () => {
  const scan = {
    customProps: [
      { name: '--mark', value: '#BE3A22' },
      { name: '--space-2', value: '16px' },
    ],
    rootFontSize: 16,
  };
  const index = buildValueIndex(scan);

  it('names the one variable this page uses for the value, across units', () => {
    expect(tokenHolding(index, 'color', '#BE3A22')).toBe('--mark');
    expect(tokenHolding(index, 'padding-top', '1rem')).toBe('--space-2');
  });

  it('is exact, not perceptual: this is reported as a fact, not offered as a choice', () => {
    expect(tokenHolding(index, 'color', '#BE3A25')).toBeNull();
  });

  it('says nothing when several variables hold the value, because the page has not said which', () => {
    const many = buildValueIndex({
      customProps: [
        { name: '--radius-md', value: '16px' },
        { name: '--space-4', value: '16px' },
      ],
      rootFontSize: 16,
    });
    expect(tokenHolding(many, 'border-radius', '16px')).toBeNull();
  });

  it('says nothing for a reference or a property with no comparable token', () => {
    expect(tokenHolding(index, 'color', 'var(--mark)')).toBeNull();
    expect(tokenHolding(index, 'display', 'flex')).toBeNull();
  });
});
