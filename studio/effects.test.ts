import { describe, expect, it } from 'vitest';
import { blurToCss, layerToCss, parseBlur, parseShadow, shadowRoundTrips, shadowToCss, splitList } from './effects';

describe('splitList', () => {
  it('splits on the commas between layers, not the ones inside a colour', () => {
    expect(splitList('0 1px 2px rgba(0, 0, 0, 0.2), inset 0 0 4px red')).toEqual([
      '0 1px 2px rgba(0, 0, 0, 0.2)',
      'inset 0 0 4px red',
    ]);
  });
});

describe('parseShadow', () => {
  it('reads the four lengths and the colour', () => {
    expect(parseShadow('1px 2px 3px 4px #000')).toEqual([
      { inset: false, x: '1px', y: '2px', blur: '3px', spread: '4px', color: '#000' },
    ]);
  });

  it('fills in what a short form leaves out', () => {
    expect(parseShadow('0 2px red')).toEqual([{ inset: false, x: '0', y: '2px', blur: '0px', spread: '0px', color: 'red' }]);
  });

  it('knows an inset from a drop shadow, wherever the word sits', () => {
    expect(parseShadow('inset 0 1px 2px #000')?.[0]?.inset).toBe(true);
    expect(parseShadow('0 1px 2px #000 inset')?.[0]?.inset).toBe(true);
    expect(parseShadow('0 1px 2px #000')?.[0]?.inset).toBe(false);
  });

  it('keeps a colour function whole', () => {
    expect(parseShadow('0 1px 2px rgba(0, 0, 0, 0.2)')?.[0]?.color).toBe('rgba(0, 0, 0, 0.2)');
    expect(parseShadow('0 1px 2px oklch(0.2 0.1 250 / 40%)')?.[0]?.color).toBe('oklch(0.2 0.1 250 / 40%)');
  });

  it('reads every layer of a list', () => {
    expect(parseShadow('0 1px 1px #111, 0 8px 24px #222')).toHaveLength(2);
  });

  it('reads nothing as nothing rather than as a failure', () => {
    expect(parseShadow('none')).toEqual([]);
    expect(parseShadow('  ')).toEqual([]);
  });

  it.each([
    ['a whole-value reference', 'var(--shadow-raised)'],
    ['one length', '4px #000'],
    ['five lengths', '1px 2px 3px 4px 5px #000'],
    ['two things that are not lengths', '0 1px 2px red blue'],
  ])('refuses %s, so the text field keeps it', (_, value) => {
    expect(parseShadow(value)).toBe(null);
  });
});

describe('writing a shadow back', () => {
  it('leaves out a spread of nothing', () => {
    expect(layerToCss({ inset: false, x: '0px', y: '2px', blur: '4px', spread: '0px', color: '#000' })).toBe('0px 2px 4px #000');
  });

  it('keeps a spread that is there', () => {
    expect(layerToCss({ inset: true, x: '0px', y: '2px', blur: '4px', spread: '2px', color: '#000' })).toBe(
      'inset 0px 2px 4px 2px #000',
    );
  });

  it('writes an empty list as none', () => {
    expect(shadowToCss([])).toBe('none');
  });

  it('survives a round trip through the fields', () => {
    for (const value of ['0px 2px 4px rgba(0, 0, 0, 0.15)', 'inset 0px 1px 0px #fff', '0px 1px 1px #111, 0px 8px 24px #222']) {
      expect(shadowToCss(parseShadow(value)!)).toBe(value);
    }
  });
});

describe('shadowRoundTrips', () => {
  it('lets the fields take what they can rebuild', () => {
    expect(shadowRoundTrips('0px 2px 4px rgba(0, 0, 0, 0.15)')).toBe(true);
    // A browser writes the zero spread out; dropping it means the same thing.
    expect(shadowRoundTrips('0px 2px 4px 0px rgb(0 0 0 / 15%)')).toBe(true);
  });

  it('keeps the text field in charge of what it cannot', () => {
    expect(shadowRoundTrips('var(--shadow-raised)')).toBe(false);
    expect(shadowRoundTrips('0 1px 2px red blue')).toBe(false);
  });
});

describe('blur', () => {
  it('reads a radius, and writes one back', () => {
    expect(parseBlur('blur(8px)')).toBe('8px');
    expect(blurToCss('8px')).toBe('blur(8px)');
  });

  it('reads no filter as no blur', () => {
    expect(parseBlur('none')).toBe('0px');
    expect(blurToCss('0px')).toBe('none');
  });

  it.each([
    ['a pipeline of several functions', 'blur(4px) saturate(1.2)'],
    ['a different function', 'saturate(1.2)'],
    ['a reference', 'var(--glass)'],
  ])('refuses %s rather than dropping the rest of it', (_, value) => {
    expect(parseBlur(value)).toBe(null);
  });
});
