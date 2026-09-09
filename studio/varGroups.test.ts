import { describe, expect, it } from 'vitest';
import { classifyProp, groupCustomProps } from './varGroups';

describe('classifyProp', () => {
  it('reads colours in any literal form', () => {
    expect(classifyProp('#be3a22')).toBe('colour');
    expect(classifyProp('rgb(190, 58, 34)')).toBe('colour');
    expect(classifyProp('oklch(60% 0.15 30)')).toBe('colour');
  });

  it('reads lengths, including ones it cannot convert', () => {
    expect(classifyProp('4px')).toBe('length');
    expect(classifyProp('1.5rem')).toBe('length');
    expect(classifyProp('2em')).toBe('length');
    expect(classifyProp('100%')).toBe('length');
  });

  it('tells a shadow from a colour and a font from a word', () => {
    expect(classifyProp('0 1px 2px rgba(0,0,0,.2)')).toBe('shadow');
    expect(classifyProp('0 4px 16px #00000033')).toBe('shadow');
    expect(classifyProp('Inter, sans-serif')).toBe('font');
    expect(classifyProp('"Geist Mono", ui-monospace, monospace')).toBe('font');
  });

  it('leaves references and the unreadable in other', () => {
    expect(classifyProp('var(--mark)')).toBe('other');
    expect(classifyProp('200ms')).toBe('other');
    expect(classifyProp('600')).toBe('other');
    expect(classifyProp('')).toBe('other');
  });
});

describe('groupCustomProps', () => {
  it('groups in kind order and skips empty kinds and repeats', () => {
    const groups = groupCustomProps([
      { name: '--duration', value: '200ms' },
      { name: '--mark', value: '#be3a22' },
      { name: '--mark', value: '#000000' },
      { name: '--space-2', value: '8px' },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['colour', 'length', 'other']);
    expect(groups[0]!.props.map((p) => p.value)).toEqual(['#be3a22']);
  });
});
