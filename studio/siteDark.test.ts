import { describe, expect, it } from 'vitest';
import type { RuleLike } from './scan/customProps';
import { hoistDark, kindOf, lightOnlyMedia, previewReach } from './siteDark';

/* Rules the way a browser hands them over, built by hand. */
const style = (selectorText: string, body: string, props: string[] = []): RuleLike => ({
  cssText: `${selectorText} { ${body} }`,
  selectorText,
  style: Object.assign([...props], { length: props.length }) as unknown as CSSStyleDeclaration,
});
const media = (condition: string, ...cssRules: RuleLike[]): RuleLike => ({
  cssText: `@media ${condition} { … }`,
  conditionText: condition,
  media: { mediaText: condition },
  cssRules,
});
const supports = (condition: string, ...cssRules: RuleLike[]): RuleLike => ({
  cssText: `@supports ${condition} { … }`,
  conditionText: condition,
  cssRules,
});
const layer = (name: string, ...cssRules: RuleLike[]): RuleLike => ({ cssText: `@layer ${name} { … }`, cssRules });
const page = (selectorText: string): RuleLike => ({ cssText: '@page { margin: 1cm }', selectorText, style: {} as CSSStyleDeclaration });

const DARK = '(prefers-color-scheme: dark)';
const LIGHT = '(prefers-color-scheme: light)';

describe('kindOf', () => {
  it('reads a rule from what it has, and does not mistake @page for a style rule', () => {
    expect(kindOf(style('.a', 'color: red'))).toBe('style');
    expect(kindOf(media(DARK))).toBe('media');
    expect(kindOf(supports('(display: grid)'))).toBe('supports');
    expect(kindOf(layer('base'))).toBe('layer');
    expect(kindOf(page(':first'))).toBe('other');
    expect(kindOf({ cssText: '@font-face { }' })).toBe('other');
  });
});

describe('hoistDark', () => {
  it('re-emits dark rules without their query, keeping a breakpoint they were joined to', () => {
    const { css } = hoistDark([
      [
        style('.a', 'color: red'),
        media(DARK, style('.a', 'color: white')),
        media(`${DARK} and (max-width: 700px)`, style('.b', 'color: grey')),
        media('(max-width: 700px)', style('.c', 'color: blue')),
      ],
    ]);
    expect(css).toEqual(['.a { color: white }', '@media (max-width: 700px){.b { color: grey }}']);
  });

  it('keeps the grouping a dark rule was written under, and reaches dark blocks inside groups', () => {
    const { css } = hoistDark([
      [
        media(DARK, supports('(display: grid)', style('.g', 'display: grid')), layer('base', style('.l', 'color: white'))),
        layer('theme', media(DARK, style('.t', 'color: white'))),
      ],
    ]);
    expect(css).toEqual([
      '@supports (display: grid){.g { display: grid }}@layer base{.l { color: white }}',
      '@layer theme{.t { color: white }}',
    ]);
  });

  it('leaves light blocks and comma-joined dark arms alone', () => {
    const { css } = hoistDark([
      [media(LIGHT, style('.a', 'color: black')), media(`${DARK}, print`, style('.a', 'color: white'))],
    ]);
    expect(css).toEqual([]);
  });

  it('collects the hooks the page hangs its theme off, in daylight or not', () => {
    const { css, hooks } = hoistDark([
      [
        style('html.dark .card, [data-theme="dark"] .card', 'background: black'),
        media(DARK, style('.x', 'color: white')),
      ],
    ]);
    expect(css).toEqual(['.x { color: white }']);
    expect(Array.from(hooks.keys()).sort()).toEqual(['.dark', '[data-theme="dark"]']);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => style(`.r${i}`, 'color: red'));
    const { css } = hoistDark([[media(DARK, ...many)]], 10);
    expect(css[0]!.split('}').length - 1).toBeLessThanOrEqual(11);
  });
});

describe('lightOnlyMedia', () => {
  it('finds the light-only blocks wherever they are nested, and nothing else', () => {
    const light = media(LIGHT, style('.a', 'color: black'));
    const nested = media(`${LIGHT} and (min-width: 600px)`, style('.b', 'color: black'));
    const found = lightOnlyMedia([
      [light, media(DARK, style('.a', 'color: white')), supports('(display: grid)', layer('x', nested)), media('print', style('.p', 'color: black'))],
    ]);
    expect(found).toEqual([light, nested]);
  });
});

describe('previewReach', () => {
  const el = (id: string) => ({ id }) as unknown as Element;
  const a1 = el('a1');
  const a2 = el('a2');
  // The same element reached by two rules is one element reached.
  const on = { a: [a1, a2], b: [a1], bad: null };
  const site = {
    mediaMatches: (c: string) => c.includes('700'),
    supports: (c: string) => c.includes('grid'),
    query: (selector: string) => {
      const found = on[selector.replace('.', '') as keyof typeof on];
      if (found === null) throw new Error('bad selector');
      return found ?? [];
    },
  };

  it('counts rules, declares and reach, marking what applies and not what outlines itself', () => {
    const reach = previewReach(
      [
        style('.a', '--ink: red; color: var(--ink)', ['--ink', 'color']),
        style('.b', 'outline: 1px solid red', ['outline']),
        media('(max-width: 700px)', style('.a', 'color: blue', ['color'])),
        media('(max-width: 400px)', style('.c', 'color: blue', ['color'])),
        supports('(display: grid)', style('.b', 'color: blue', ['color'])),
        supports('(display: flex)', style('.b', 'color: blue', ['color'])),
        style('.bad', 'color: red', ['color']),
      ],
      site,
    );
    expect(reach.rules).toBe(7);
    expect(reach.declares).toEqual(['--ink']);
    expect(reach.selectors).toEqual(['.a', '.b']);
    expect(reach.matched.size).toBe(2);
    expect(reach.unreadable).toBe(1);
  });
});
