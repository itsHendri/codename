// @vitest-environment happy-dom
/**
 * The one place a page's own CSS is rewritten rather than read, and until now
 * the largest thing in the project with no test at all.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { collectOverrides, substitute } from './overrideSheet';

function sheet(css: string): CSSRuleList {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  return document.styleSheets[document.styleSheets.length - 1]!.cssRules;
}

const MAP = { '#BE3A22': '#1C7F5C' };

afterEach(() => {
  document.head.replaceChildren();
});

describe('substitute', () => {
  it('swaps a hex the map covers and leaves one it does not', () => {
    expect(substitute('#BE3A22', MAP)).toBe('#1C7F5C');
    expect(substitute('#123456', MAP)).toBe(null);
  });

  it('does not care how the hex was spelled', () => {
    expect(substitute('#be3a22', MAP)).toBe('#1C7F5C');
  });

  it('keeps an eight-digit hex\'s alpha pair', () => {
    expect(substitute('#BE3A2280', MAP)).toBe('#1C7F5C80');
  });

  it('expands a three-digit hex before looking it up', () => {
    expect(substitute('#f00', { '#FF0000': '#00FF00' })).toBe('#00FF00');
    expect(substitute('#f00a', { '#FF0000': '#00FF00' })).toBe('#00FF00a');
  });

  it('swaps the rgb spelling a browser serialises to, and stays in it', () => {
    // A value read back through the object model is `rgb(190, 58, 34)`, and an
    // alpha has nowhere to go in a six-digit hex.
    expect(substitute('rgb(190, 58, 34)', MAP)).toBe('rgb(28, 127, 92)');
    expect(substitute('rgba(190, 58, 34, 0.5)', MAP)).toBe('rgba(28, 127, 92, 0.5)');
  });

  it('swaps every colour in a value that holds several', () => {
    const map = { '#BE3A22': '#1C7F5C', '#FFFFFF': '#000000' };
    expect(substitute('1px solid #BE3A22, 0 0 2px #ffffff', map)).toBe('1px solid #1C7F5C, 0 0 2px #000000');
  });

  it('leaves a value alone when it holds nothing from the map', () => {
    expect(substitute('1px solid currentColor', MAP)).toBe(null);
    expect(substitute('', MAP)).toBe(null);
  });
});

describe('collectOverrides', () => {
  it('re-emits the rule under its own selector, so its states keep working', () => {
    const out = collectOverrides([sheet('.btn:hover { color: #BE3A22 }')], { colorMap: MAP });
    expect(out).toEqual(['.btn:hover{color:#1C7F5C}']);
  });

  it('says nothing about a rule holding no colour it knows', () => {
    expect(collectOverrides([sheet('.btn { color: #123456 }')], { colorMap: MAP })).toEqual([]);
  });

  it('says nothing at all when there is nothing to swap', () => {
    expect(collectOverrides([sheet('.btn { color: #BE3A22 }')], {})).toEqual([]);
  });

  it('keeps a declaration\'s priority, both ways', () => {
    // An `!important` original needs an `!important` shadow to beat it, and a
    // normal one must not become important.
    const out = collectOverrides([sheet('.a { color: #BE3A22 !important } .b { color: #BE3A22 }')], { colorMap: MAP });
    expect(out.join('')).toContain('.a{color:#1C7F5C !important}');
    expect(out.join('')).toContain('.b{color:#1C7F5C}');
  });

  it('puts an override back inside the query the original was written under', () => {
    // Otherwise a rule written for phones would repaint every width.
    const out = collectOverrides([sheet('@media (max-width: 700px) { .btn { color: #BE3A22 } }')], { colorMap: MAP });
    expect(out).toEqual(['@media (max-width: 700px){.btn{color:#1C7F5C}}']);
  });

  it('shares a wrapper between rules that sit next to each other in it', () => {
    const out = collectOverrides(
      [sheet('@media (max-width: 700px) { .a { color: #BE3A22 } .b { color: #BE3A22 } }')],
      { colorMap: MAP },
    );
    expect(out).toEqual(['@media (max-width: 700px){.a{color:#1C7F5C}.b{color:#1C7F5C}}']);
  });

  it('keeps the page\'s own order between two overrides', () => {
    // Two rules of equal specificity: which wins is the order they are in, so
    // grouping them out of order would change the answer.
    const out = collectOverrides(
      [sheet('.x { color: #BE3A22 } @media (max-width: 700px) { .y { color: #BE3A22 } } .z { color: #BE3A22 }')],
      { colorMap: MAP },
    );
    expect(out.join('').indexOf('.x')).toBeLessThan(out.join('').indexOf('.y'));
    expect(out.join('').indexOf('.y')).toBeLessThan(out.join('').indexOf('.z'));
  });

  it('swaps every declaration in a rule that holds the colour', () => {
    const out = collectOverrides([sheet('.btn { color: #BE3A22; border-color: #BE3A22; padding: 4px }')], {
      colorMap: MAP,
    });
    // A shorthand is expanded by the object model, so each longhand is swapped
    // and the untouched padding is left out entirely.
    expect(out.join('')).toContain('color:#1C7F5C');
    expect(out.join('')).toContain('border-top-color:#1C7F5C');
    expect(out.join('')).not.toContain('padding');
  });

  it('rewrites a length through the scale it was given', () => {
    const out = collectOverrides([sheet('.card { padding-top: 16px }')], {
      lengths: { space: { 16: 24 }, radius: {}, type: {} },
    });
    expect(out).toEqual(['.card{padding-top:24px}']);
  });

  it('leaves a length the scale says nothing about', () => {
    const out = collectOverrides([sheet('.card { padding-top: 13px }')], {
      lengths: { space: { 16: 24 }, radius: {}, type: {} },
    });
    expect(out).toEqual([]);
  });

  it('stops at its limit rather than walking a pathological page', () => {
    const many = Array.from({ length: 40 }, (_, i) => `.a${i} { color: #BE3A22 }`).join('\n');
    expect(collectOverrides([sheet(many)], { colorMap: MAP, limit: 5 }).join('').match(/color/g)).toHaveLength(5);
  });
});

describe('a page using native CSS nesting', () => {
  /** happy-dom does not parse nesting into child rules, so these are built. */
  const nested = (selectorText: string, decls: Record<string, string>, ...cssRules: unknown[]) => ({
    cssText: `${selectorText} {}`,
    selectorText,
    style: Object.assign(Object.keys(decls), { getPropertyValue: (k: string) => decls[k] ?? '', getPropertyPriority: () => '' }),
    cssRules,
  });

  it('resolves a nested selector instead of emitting it as written', () => {
    // `&:hover` on its own is `:scope:hover`, which at the top level of a
    // sheet is `:root:hover` — hovering anywhere on the page. And `& .inner`
    // would paint every `.inner` in the document, not this card's.
    const out = collectOverrides(
      [
        [
          nested(
            '.card',
            { color: '#BE3A22' },
            nested('&:hover', { color: '#BE3A22' }),
            nested('& .inner', { color: '#BE3A22' }),
          ),
        ],
      ] as never,
      { colorMap: MAP },
    );
    expect(out.join('')).not.toContain('&');
    expect(out.join('')).toContain(':is(.card):hover{color:#1C7F5C}');
    expect(out.join('')).toContain(':is(.card) .inner{color:#1C7F5C}');
  });
});
