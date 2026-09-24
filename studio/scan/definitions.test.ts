import { describe, expect, it } from 'vitest';
import type { CustomPropInfo } from '@/shared/types';
import { attachDefinitions, collectDefinitions, scopeOf } from './definitions';
import type { RuleLike } from './customProps';

/** A rule as the walker needs to see it. */
const rule = (selectorText: string, decls: Record<string, string>, cssRules?: RuleLike[]): RuleLike => {
  const keys = Object.keys(decls);
  const style = Object.assign(
    { length: keys.length, getPropertyValue: (p: string) => decls[p] ?? '', getPropertyPriority: () => '', cssText: '' },
    keys,
  ) as unknown as CSSStyleDeclaration;
  const props = Object.entries(decls)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  return { selectorText, style, cssText: `${selectorText} { ${props} }`, cssRules };
};
const group = (head: string, rules: RuleLike[]): RuleLike => ({ cssText: `${head} {}`, cssRules: rules, conditionText: head.replace(/^@\w+\s*/, '') });

describe('scopeOf', () => {
  it.each<[string, string[], string]>([
    [':root', [], 'root'],
    ['html', [], 'root'],
    [':root, html', [], 'root'],
    [":root:not([data-theme='light'])", ['(prefers-color-scheme: dark)'], 'dark'],
    [":root[data-theme='dark']", [], 'dark'],
    ['html.dark', [], 'dark'],
    ['.dark .card', [], 'dark'],
    [':root', ['(max-width: 700px)'], 'width'],
    ['.card', [], 'scoped'],
    [":root[data-theme='light']", [], 'scoped'],
    ['.card', ['(prefers-color-scheme: dark)'], 'dark'],
  ])('%s under %j is %s', (selector, media, scope) => {
    expect(scopeOf(selector, media)).toBe(scope);
  });
});

describe('collectDefinitions', () => {
  const forfontsake: RuleLike[] = [
    rule(':root', { '--ink': '#15171b', '--mark': '#be3a22' }),
    group('@media (prefers-color-scheme: dark)', [rule(":root:not([data-theme='light'])", { '--mark': '#e0603f' })]),
    rule(":root[data-theme='dark']", { '--mark': '#e0603f' }),
    group('@media (max-width: 700px)', [rule(':root', { '--mark': '#a02a12' })]),
    rule('.card', { '--mark': 'maroon' }),
  ];

  it('keeps every definition with its scope, in order', () => {
    const found = collectDefinitions([forfontsake]);
    expect(found.get('--mark')?.map((d) => [d.scope, d.value, d.selector])).toEqual([
      ['root', '#be3a22', ':root'],
      ['dark', '#e0603f', ":root:not([data-theme='light'])"],
      ['dark', '#e0603f', ":root[data-theme='dark']"],
      ['width', '#a02a12', ':root'],
      ['scoped', 'maroon', '.card'],
    ]);
    expect(found.get('--mark')?.[1]?.media).toEqual(['(prefers-color-scheme: dark)']);
    expect(found.get('--ink')).toHaveLength(1);
  });

  it('folds nesting and names the layer', () => {
    const nested = group('@layer base', [rule('.card', { '--pad': '8px' }, [rule('&.tight', { '--pad': '4px' })])]);
    const found = collectDefinitions([[nested]]);
    expect(found.get('--pad')?.map((d) => [d.selector, d.layer])).toEqual([
      ['.card', 'base'],
      [':is(.card).tight', 'base'],
    ]);
  });
});

describe('attachDefinitions', () => {
  it('attaches the definitions and follows aliases to a literal', () => {
    const props: CustomPropInfo[] = [
      { name: '--mark', value: '#be3a22' },
      { name: '--button-bg', value: 'var(--mark)' },
      { name: '--cta', value: 'var(--button-bg)' },
    ];
    const lists: RuleLike[][] = [[rule(':root', { '--mark': '#be3a22', '--button-bg': 'var(--mark)', '--cta': 'var(--button-bg)' })]];
    attachDefinitions(props, lists);
    expect(props[0]?.definitions?.[0]?.scope).toBe('root');
    expect(props[0]?.alias).toBeUndefined();
    expect(props[1]).toMatchObject({ alias: ['--mark'], resolved: '#be3a22' });
    expect(props[2]).toMatchObject({ alias: ['--button-bg', '--mark'], resolved: '#be3a22' });
  });
});
