import { describe, expect, it } from 'vitest';
import type { Definition } from '@/shared/protocol';
import { isComputedValue, scopeKindOf, targetsFor } from './writeScope';

const def = (over: Partial<Definition>): Definition => ({
  file: 'src/index.css',
  line: 1,
  kind: 'css',
  context: 'root',
  value: '#be3a22',
  ...over,
});

describe('scopeKindOf', () => {
  it.each<[Partial<Definition>, string]>([
    [{ selector: ':root' }, 'root'],
    [{ selector: 'html', context: 'root' }, 'root'],
    [{ kind: 'theme', context: 'root' }, 'theme'],
    [{ context: 'dark', media: ['@media (prefers-color-scheme: dark)'], selector: ":root:not([data-theme='light'])" }, 'dark'],
    [{ context: 'scoped', selector: ":root[data-theme='dark']" }, 'dark'],
    [{ context: 'scoped', selector: 'html.dark' }, 'dark'],
    [{ context: 'scoped', selector: '.dark' }, 'dark'],
    [{ context: 'media', media: ['@media (max-width: 700px)'], selector: ':root' }, 'width'],
    [{ context: 'scoped', selector: '.card' }, 'scoped'],
    [{ context: 'scoped', selector: ":root[data-theme='light']" }, 'scoped'],
    [{ kind: 'dtcg', context: 'root', file: 'tokens.json' }, 'file'],
  ])('%o is %s', (over, kind) => {
    expect(scopeKindOf(def(over))).toBe(kind);
  });
});

describe('targetsFor', () => {
  const forfontsake = [
    def({ line: 4, selector: ':root' }),
    def({ line: 12, context: 'dark', media: ['@media (prefers-color-scheme: dark)'], selector: ":root:not([data-theme='light'])", value: '#e0603f' }),
    def({ line: 22, context: 'scoped', selector: ":root[data-theme='dark']", value: '#e0603f' }),
    def({ line: 40, context: 'media', media: ['@media (max-width: 700px)'], selector: ':root', value: '#a02a12' }),
  ];

  it('a light edit lands in the root and leaves the dark blocks and the width alone', () => {
    const { targets, left, reason } = targetsFor('--mark', forfontsake, 'light');
    expect(reason).toBeUndefined();
    expect(targets.map((t) => t.line)).toEqual([4]);
    expect(left.map((t) => t.line)).toEqual([12, 22, 40]);
  });

  it('a dark edit lands in both spellings of the dark side when they agree', () => {
    const { targets, left, reason } = targetsFor('--mark', forfontsake, 'dark');
    expect(reason).toBeUndefined();
    expect(targets.map((t) => t.line)).toEqual([12, 22]);
    expect(left.map((t) => t.line)).toEqual([4, 40]);
  });

  it('refuses when the dark blocks disagree, and lists them', () => {
    const defs = [forfontsake[0]!, forfontsake[1]!, { ...forfontsake[2]!, value: '#ff0000' }];
    const { targets, reason } = targetsFor('--mark', defs, 'dark');
    expect(targets).toEqual([]);
    expect(reason).toMatch(/2 dark definitions that disagree/);
    expect(reason).toContain('src/index.css:12 (dark) = #e0603f');
    expect(reason).toContain('src/index.css:22 (dark) = #ff0000');
  });

  it('writes both halves of a `:root, html` split as one decision', () => {
    const defs = [def({ line: 4, selector: ':root' }), def({ line: 9, selector: 'html' })];
    expect(targetsFor('--mark', defs, 'light').targets.map((t) => t.line)).toEqual([4, 9]);
  });

  it('refuses a name that only lives under a width query, naming the scope', () => {
    const { reason } = targetsFor('--mark', [forfontsake[3]!], 'light');
    expect(reason).toMatch(/no definition at the root of the cascade; the page defines it only under width/);
  });

  it('refuses a dark edit on a page with no dark side', () => {
    const { reason } = targetsFor('--mark', [forfontsake[0]!], 'dark');
    expect(reason).toMatch(/no dark definition; the page defines it under root/);
  });

  it('does not write into a token file, and says where the name was found', () => {
    const { targets, left, reason } = targetsFor('--mark', [def({ kind: 'dtcg', file: 'tokens.json', line: 3 })], 'light');
    expect(targets).toEqual([]);
    expect(left).toHaveLength(1);
    expect(reason).toMatch(/only under file/);
  });

  it('refuses a definition the search could not place on a line', () => {
    expect(targetsFor('--mark', [def({ line: null })], 'light').reason).toMatch(/could not say on which line/);
  });

  it('says so when a name is not defined at all', () => {
    expect(targetsFor('--mark', [], 'light').reason).toMatch(/not defined anywhere/);
  });
});

describe('isComputedValue', () => {
  it.each(['var(--x)', 'calc(1rem + 2px)', 'color-mix(in oklch, red, blue)', ' clamp(1rem, 2vw, 3rem)', 'light-dark(#fff, #000)'])('%s is computed', (v) => {
    expect(isComputedValue(v)).toBe(true);
  });
  it.each(['#fff', '1rem', 'oklch(60% 0.2 30)', 'rgb(0 0 0 / 0.5)'])('%s is a literal', (v) => {
    expect(isComputedValue(v)).toBe(false);
  });
});
