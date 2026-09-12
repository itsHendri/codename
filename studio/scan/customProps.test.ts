// @vitest-environment happy-dom
/**
 * The reading passes, against real stylesheets.
 *
 * Every bug this project has had in reading a page lived in a walk like these
 * and was found by looking at a page. A stylesheet is a string, so they can be
 * asked directly instead.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { CustomPropInfo } from '@/shared/types';
import { attachDarkValues, attachWidthValues, eachStyleRule, extractCustomProps, type RuleLike } from './customProps';

/**
 * A rule built by hand.
 *
 * happy-dom parses `@layer` into nothing and does not support nested CSS, so
 * these two — which is where a definition went missing before — can only be
 * asked structurally. That is also why the walk is structural.
 */
const group = (cssText: string, conditionText: string, ...cssRules: RuleLike[]): RuleLike => ({
  cssText,
  conditionText,
  cssRules,
});
const styleRule = (selectorText: string, decls: Record<string, string>, ...cssRules: RuleLike[]): RuleLike => ({
  cssText: `${selectorText} {}`,
  selectorText,
  style: Object.assign(Object.keys(decls), {
    getPropertyValue: (k: string) => decls[k] ?? '',
  }) as unknown as CSSStyleDeclaration,
  cssRules,
});

/** A stylesheet in the document, as the scanner would meet it. */
function sheet(css: string): CSSRuleList {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  return document.styleSheets[document.styleSheets.length - 1]!.cssRules;
}

const props = (...names: [string, string][]): CustomPropInfo[] =>
  names.map(([name, value]) => ({ name, value, uses: 1 }));

afterEach(() => {
  document.head.replaceChildren();
});

describe('eachStyleRule', () => {
  it('carries the media conditions open around a rule', () => {
    const seen: [string, string[]][] = [];
    eachStyleRule([sheet('@media (max-width: 700px) { @media print { .a { color: red } } }')], (r, media) =>
      seen.push([r.selectorText, media]),
    );
    expect(seen).toEqual([['.a', ['(max-width: 700px)', 'print']]]);
  });

  it('passes through the wrappers that are not conditions', () => {
    const seen: string[][] = [];
    eachStyleRule([sheet('@supports (display: grid) { .a { color: red } }')], (_r, media) => seen.push(media));
    expect(seen).toEqual([[]]);
  });

  it('passes through a layer, which not every engine even names', () => {
    const seen: string[][] = [];
    eachStyleRule(
      [[group('@layer base {}', '', group('@media (max-width: 700px) {}', '(max-width: 700px)', styleRule('.a', {})))]],
      (_r, media) => seen.push(media),
    );
    expect(seen).toEqual([['(max-width: 700px)']]);
  });

  it('sees a media query nested inside a style rule', () => {
    const seen: [string, string[]][] = [];
    eachStyleRule(
      [[styleRule('.card', { color: 'red' }, group('@media (max-width: 700px) {}', '(max-width: 700px)', styleRule('.card', { color: 'blue' })))]],
      (r, media) => seen.push([r.selectorText, media]),
    );
    expect(seen).toEqual([
      ['.card', []],
      ['.card', ['(max-width: 700px)']],
    ]);
  });

  it('follows an @import into the sheet it pulls in', () => {
    const seen: string[] = [];
    eachStyleRule(
      [[{ cssText: '@import url(a.css);', styleSheet: { cssRules: [styleRule('.a', {})] } }]],
      (r) => seen.push(r.selectorText),
    );
    expect(seen).toEqual(['.a']);
  });

  it('stops at its limit rather than walking a pathological page', () => {
    const many = Array.from({ length: 50 }, (_, i) => `.a${i} { color: red }`).join('\n');
    let count = 0;
    eachStyleRule([sheet(many)], () => count++, 10);
    expect(count).toBeLessThanOrEqual(10);
  });
});

describe('extractCustomProps', () => {
  it('keeps the first definition, as the cascade did', () => {
    const css = ':root { --mark: red } .x { --mark: blue }';
    const found = extractCustomProps([{ href: 'a.css', text: css }], css);
    expect(found).toEqual([{ name: '--mark', value: 'red', source: 'a.css', uses: 0 }]);
  });

  it('counts how many declarations lean on each one', () => {
    const css = ':root{--mark:red}.a{color:var(--mark)}.b{border-color:var(--mark)}';
    expect(extractCustomProps([{ href: null, text: css }], css)[0]?.uses).toBe(2);
  });
});

describe('attachDarkValues', () => {
  it('takes the value from under a dark media query', () => {
    const p = props(['--ink', '#111']);
    attachDarkValues(p, [sheet('@media (prefers-color-scheme: dark) { :root { --ink: #eee } }')]);
    expect(p[0]?.dark).toBe('#eee');
  });

  it('takes it from a theme hook too', () => {
    const p = props(['--ink', '#111']);
    attachDarkValues(p, [sheet('html.dark { --ink: #eee }')]);
    expect(p[0]?.dark).toBe('#eee');
  });

  it('sees one nested inside a layer inside a media query', () => {
    const p = props(['--ink', '#111']);
    attachDarkValues(p, [
      [
        group(
          '@media (prefers-color-scheme: dark) {}',
          '(prefers-color-scheme: dark)',
          group('@layer base {}', '', styleRule(':root', { '--ink': '#eee' })),
        ),
      ],
    ]);
    expect(p[0]?.dark).toBe('#eee');
  });

  it('says nothing when the dark value is the same as the light one', () => {
    const p = props(['--ink', '#111']);
    attachDarkValues(p, [sheet('@media (prefers-color-scheme: dark) { :root { --ink: #111 } }')]);
    expect(p[0]?.dark).toBeUndefined();
  });
});

describe('attachWidthValues', () => {
  it('records a redefinition under its query', () => {
    const p = props(['--gap', '16px']);
    attachWidthValues(p, [sheet(':root{--gap:16px} @media (max-width: 700px) { :root { --gap: 12px } }')]);
    expect(p[0]?.atWidth).toEqual({ '(max-width: 700px)': '12px' });
    expect(p[0]?.onlyAt).toBeUndefined();
  });

  it('marks a variable the page defines only under a query', () => {
    const p = props(['--gap', '12px']);
    attachWidthValues(p, [sheet('@media (max-width: 700px) { :root { --gap: 12px } }')]);
    expect(p[0]?.onlyAt).toBe('(max-width: 700px)');
  });

  it('leaves a dark redefinition to the dark pass', () => {
    const p = props(['--ink', '#111']);
    attachWidthValues(p, [sheet('@media (prefers-color-scheme: dark) { :root { --ink: #eee } }')]);
    expect(p[0]?.atWidth).toBeUndefined();
  });

  it('collects the widths the page is written against', () => {
    const found = new Set<string>();
    attachWidthValues(props(), [
      sheet('@media (max-width: 700px) { .a { color: red } } @media (min-width: 1024px) { .b { color: blue } }'),
    ], found);
    expect([...found].sort()).toEqual(['(max-width: 700px)', '(min-width: 1024px)']);
  });

  it('collects a breakpoint nested inside a dark block, which is still a width the page uses', () => {
    const found = new Set<string>();
    attachWidthValues(props(), [
      sheet('@media (prefers-color-scheme: dark) { @media (max-width: 600px) { .a { color: red } } }'),
    ], found);
    expect([...found]).toEqual(['(max-width: 600px)']);
  });

  it('does not read a negated query as the breakpoint it names', () => {
    // `not all and (max-width: 700px)` applies *above* 700.
    const found = new Set<string>();
    const p = props(['--gap', '16px']);
    attachWidthValues(p, [sheet('not all and (max-width: 700px) { :root { --gap: 12px } }')], found);
    expect([...found]).toEqual([]);
    expect(p[0]?.atWidth).toBeUndefined();
  });

  it('nests two queries into one condition', () => {
    const p = props(['--gap', '16px']);
    attachWidthValues(p, [
      sheet('@media (max-width: 900px) { @media (min-width: 400px) { :root { --gap: 12px } } }'),
    ]);
    expect(Object.keys(p[0]?.atWidth ?? {})[0]).toContain('and');
  });
});
