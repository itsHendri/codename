import { describe, expect, it } from 'vitest';
import type { CustomPropInfo, ElementProps, TypeStyle } from '@/shared/types';
import { describeForm, fieldPx, sizeLabel, styleOf } from './typeStyleMatch';

const props: CustomPropInfo[] = [
  { name: '--text-xl', value: '1.25rem' },
  { name: '--text-xl--line-height', value: '1.75rem' },
  { name: '--fs-display', value: 'var(--fs-3)', alias: ['--fs-3'], resolved: '48px' },
];
const styles: TypeStyle[] = [
  { name: 'display', form: 'class', selectorOrUtility: '.text-display', fields: { size: { token: '--fs-display' }, lineHeight: { literal: '1.1' } } },
  { name: 'h1', form: 'tag', selectorOrUtility: 'h1', tag: 'h1', fields: { size: { literal: '28px' }, lineHeight: { literal: '34px' } } },
  { name: 'h1', form: 'class', selectorOrUtility: '.h1', fields: { size: { literal: '28px' }, lineHeight: { literal: '34px' } } },
  { name: 'xl', form: 'tailwind-theme', selectorOrUtility: 'text-xl', fields: { size: { token: '--text-xl' }, lineHeight: { token: '--text-xl--line-height' } } },
];
const el = (over: Partial<ElementProps> & { fontSize?: string; lineHeight?: string }): ElementProps =>
  ({
    tag: 'h1',
    type: { fontFamily: 'Inter', fontSize: over.fontSize ?? '28px', fontWeight: '600', lineHeight: over.lineHeight ?? '34px', letterSpacing: 'normal', textAlign: 'left' },
    ...over,
  }) as unknown as ElementProps;

describe('fieldPx and sizeLabel', () => {
  it('resolves literals, rems and tokens', () => {
    expect(fieldPx({ literal: '28px' }, props)).toBe(28);
    expect(fieldPx({ literal: '1.25rem' }, props)).toBe(20);
    expect(fieldPx({ token: '--text-xl' }, props)).toBe(20);
    expect(fieldPx({ token: '--fs-display' }, props)).toBe(48);
    expect(fieldPx({ literal: '1.1' }, props, 16, 48)).toBeCloseTo(52.8);
  });
  it('labels a style by its numbers', () => {
    expect(sizeLabel(styles[1]!, props)).toBe('28/34');
    expect(sizeLabel(styles[3]!, props)).toBe('20/28');
    expect(sizeLabel(styles[0]!, props)).toBe('48/52.8');
  });
});

describe('styleOf', () => {
  it('says "is" when the authored size is the style\'s token', () => {
    const e = el({ fontSize: '48px', authored: { 'font-size': { value: 'var(--fs-display)', token: '--fs-display', rule: { selector: '.text-display', groups: [] }, important: false, certain: true } } });
    expect(styleOf(e, styles, props)).toMatchObject({ style: { name: 'display' }, how: 'is' });
  });
  it('says "is" when the winning rule is the style\'s selector or utility', () => {
    const tag = el({ authored: { 'font-size': { value: '28px', rule: { selector: 'h1', groups: [] }, important: false, certain: true } } });
    expect(styleOf(tag, styles, props)).toMatchObject({ style: { form: 'tag' }, how: 'is' });
    const util = el({ fontSize: '20px', lineHeight: '28px', authored: { 'font-size': { value: 'var(--text-xl)', token: '--text-xl', rule: { selector: '.text-xl', groups: [] }, important: false, certain: true } } });
    expect(styleOf(util, styles, props)).toMatchObject({ style: { name: 'xl' }, how: 'is' });
  });
  it('says "matches" on the numbers, preferring the element\'s own tag', () => {
    expect(styleOf(el({}), styles, props)).toMatchObject({ style: { form: 'tag', name: 'h1' }, how: 'matches' });
    expect(styleOf(el({ tag: 'p' } as Partial<ElementProps>), styles, props)).toMatchObject({ style: { form: 'tag' }, how: 'matches' });
  });
  it('is nothing when nothing agrees, or the page has no styles', () => {
    expect(styleOf(el({ fontSize: '13px', lineHeight: '20px' }), styles, props)).toBeNull();
    expect(styleOf(el({}), [], props)).toBeNull();
  });
});

describe('describeForm', () => {
  it('names each form as the project writes it', () => {
    expect(describeForm(styles[0]!)).toBe('the class `.text-display`');
    expect(describeForm(styles[1]!)).toBe('the `h1 {}` rule');
    expect(describeForm(styles[3]!)).toBe('the Tailwind utility `text-xl` (`--text-xl`)');
    expect(describeForm({ name: 'h2', form: 'vars', selectorOrUtility: 'h2', fields: { size: { token: '--font-size-h2' }, lineHeight: { token: '--leading-h2' } } })).toBe('the variables `--font-size-h2`, `--leading-h2`');
  });
});
