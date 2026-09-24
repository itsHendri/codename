import { describe, expect, it } from 'vitest';
import type { CustomPropInfo } from '@/shared/types';
import { detectTypeStyles } from './typeStyles';
import type { RuleLike } from './customProps';

const rule = (selectorText: string, decls: Record<string, string>): RuleLike => {
  const keys = Object.keys(decls);
  const style = Object.assign(
    { length: keys.length, getPropertyValue: (p: string) => decls[p] ?? '', getPropertyPriority: () => '', cssText: '' },
    keys,
  ) as unknown as CSSStyleDeclaration;
  return { selectorText, style, cssText: `${selectorText} {}` };
};
const group = (head: string, rules: RuleLike[]): RuleLike => ({ cssText: `${head} {}`, cssRules: rules, conditionText: head.replace(/^@\w+\s*/, '') });
const prop = (name: string, value: string): CustomPropInfo => ({ name, value });

describe('detectTypeStyles', () => {
  it('reads Tailwind v4 theme tokens with their sub-variables, and not the utilities twice', () => {
    const props = [prop('--text-xl', '1.25rem'), prop('--text-xl--line-height', '1.75rem'), prop('--text-xl--letter-spacing', '-0.01em'), prop('--text-xl--font-weight', '600'), prop('--text-sm', '0.875rem')];
    const lists = [[rule('.text-xl', { 'font-size': 'var(--text-xl)', 'line-height': 'var(--text-xl--line-height)' })]];
    const styles = detectTypeStyles(props, lists);
    expect(styles.map((s) => [s.form, s.selectorOrUtility])).toEqual([
      ['tailwind-theme', 'text-xl'],
      ['tailwind-theme', 'text-sm'],
    ]);
    expect(styles[0]?.fields).toEqual({
      size: { token: '--text-xl' },
      lineHeight: { token: '--text-xl--line-height' },
      tracking: { token: '--text-xl--letter-spacing' },
      weight: { token: '--text-xl--font-weight' },
    });
  });

  it('groups one-variable-per-field styles by suffix, unless a rule already reads them as its style', () => {
    const props = [prop('--font-size-h1', '2.5rem'), prop('--leading-h1', '1.1'), prop('--tracking-h1', '-0.02em'), prop('--font-size-body', '1rem'), prop('--leading-orphan', '1.5'), prop('--fs-eyebrow', '12px')];
    const styles = detectTypeStyles(props, [[rule('.eyebrow', { 'font-size': 'var(--fs-eyebrow)' })]]);
    expect(styles.map((s) => s.form)).toContain('class');
    expect(styles.filter((s) => s.form === 'vars').map((s) => s.name)).toEqual(['h1', 'body']);
    expect(styles.map((s) => s.name)).toEqual(['h1', 'body', 'eyebrow']);
    const bare = detectTypeStyles(props.slice(0, 5), []);
    expect(bare.map((s) => [s.form, s.name])).toEqual([
      ['vars', 'h1'],
      ['vars', 'body'],
    ]);
    expect(bare[0]?.fields).toEqual({ size: { token: '--font-size-h1' }, lineHeight: { token: '--leading-h1' }, tracking: { token: '--tracking-h1' } });
  });

  it('reads a class and a tag rule, with tokens and literals per field', () => {
    const props = [prop('--ink', '#000'), prop('--fs-display', '3rem')];
    const lists = [[rule('.text-display', { 'font-size': 'var(--fs-display)', 'line-height': '1.1', 'font-weight': '700' }), rule('h1, .h1', { 'font-size': '28px', 'line-height': '34px' }), rule('p', { 'font-size': '15px', color: 'var(--ink)' })]];
    const styles = detectTypeStyles(props, lists);
    expect(styles.map((s) => [s.form, s.selectorOrUtility, s.tag])).toEqual([
      ['class', '.text-display', undefined],
      ['tag', 'h1', 'h1'],
      ['class', '.h1', undefined],
      ['tag', 'p', 'p'],
    ]);
    expect(styles[0]?.fields).toEqual({ size: { token: '--fs-display' }, lineHeight: { literal: '1.1' }, weight: { literal: '700' } });
    expect(styles[1]?.fields.size).toEqual({ literal: '28px' });
  });

  it('ignores rules under a width or a dark condition, and compound selectors', () => {
    const lists = [[group('@media (max-width: 700px)', [rule('h1', { 'font-size': '22px' })]), group('@media (prefers-color-scheme: dark)', [rule('h2', { 'font-size': '22px' })]), rule('.card h3', { 'font-size': '18px' }), rule('nav', { 'font-size': '12px' })]];
    expect(detectTypeStyles([], lists)).toEqual([]);
  });

  it('answers nothing for a page with no type styles', () => {
    expect(detectTypeStyles([prop('--ink', '#000')], [[rule('.card', { padding: '8px' })]])).toEqual([]);
  });
});
