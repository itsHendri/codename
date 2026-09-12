import { describe, expect, it } from 'vitest';
import type { Condition } from './conditions';
import {
  elementsSheet,
  hoistState,
  lastPseudoPosition,
  splitSelectorList,
  stateSheet,
  type PageRule,
} from './conditionSheet';

const hover: Condition = { kind: 'state', state: 'hover' };
const dark: Condition = { kind: 'scheme', scheme: 'dark' };
const tablet: Condition = { kind: 'width', preset: 'Tablet', maxWidth: 768 };

describe('elementsSheet', () => {
  it('writes a default rule the way it always did', () => {
    expect(elementsSheet([{ selector: '.btn', property: 'color', value: 'red' }])).toBe('.btn{color:red !important}');
  });

  it('keeps a state edit apart from the default one, and puts it after', () => {
    const sheet = elementsSheet([
      { selector: '.btn', property: 'color', value: 'blue', condition: hover },
      { selector: '.btn', property: 'color', value: 'red' },
    ]);
    expect(sheet.indexOf('red')).toBeLessThan(sheet.indexOf('blue'));
    expect(sheet).toContain('.btn:hover, .btn.codename-state-hover{color:blue !important}');
  });

  it('wraps a width edit in its query and a dark edit in the scheme', () => {
    expect(elementsSheet([{ selector: '.btn', property: 'padding', value: '4px', condition: tablet }])).toContain(
      '@media (max-width: 768px){',
    );
    expect(elementsSheet([{ selector: '.btn', property: 'color', value: '#eee', condition: dark }])).toContain(
      '@media (prefers-color-scheme: dark){',
    );
  });

  it('drops the scheme query while the panel is painting dark itself', () => {
    // The page is already being repainted as dark, so the query would never
    // match and the edit would silently do nothing.
    const sheet = elementsSheet([{ selector: '.btn', property: 'color', value: '#eee', condition: dark }], { darkPreview: true });
    expect(sheet).not.toContain('@media');
    expect(sheet).toContain('.btn{color:#eee !important}');
  });

  it('orders width, then dark, then state, so each can override the last', () => {
    const sheet = elementsSheet([
      { selector: '.b', property: 'color', value: 'd', condition: hover },
      { selector: '.b', property: 'color', value: 'c', condition: dark },
      { selector: '.b', property: 'color', value: 'b', condition: tablet },
      { selector: '.b', property: 'color', value: 'a' },
    ]);
    const at = (v: string) => sheet.indexOf(`color:${v}`);
    expect(at('a')).toBeLessThan(at('b'));
    expect(at('b')).toBeLessThan(at('c'));
    expect(at('c')).toBeLessThan(at('d'));
  });

  it('collects several properties in one state into one rule', () => {
    const sheet = elementsSheet([
      { selector: '.btn', property: 'color', value: 'blue', condition: hover },
      { selector: '.btn', property: 'background-color', value: 'white', condition: hover },
    ]);
    expect(sheet.match(/codename-state-hover/g)).toHaveLength(1);
    expect(sheet).toContain('color:blue !important;background-color:white !important');
  });

  it('says nothing when there is nothing to say', () => {
    expect(elementsSheet([])).toBe('');
  });
});

describe('splitSelectorList', () => {
  it('splits on top-level commas only', () => {
    expect(splitSelectorList('.a, .b')).toEqual(['.a', '.b']);
    expect(splitSelectorList(':is(.a, .b) .c')).toEqual([':is(.a, .b) .c']);
    expect(splitSelectorList('[data-x=","] , .b')).toEqual(['[data-x=","]', '.b']);
  });
});

describe('lastPseudoPosition', () => {
  it('finds a pseudo on the element itself', () => {
    expect(lastPseudoPosition('.btn:hover', [':hover'])).toMatchObject({ onLastCompound: true });
  });

  it.each([
    ['a descendant', '.card:hover .title'],
    ['a child', '.card:hover > .title'],
    ['a sibling', '.card:hover + .title'],
  ])('knows when the pseudo is on %s rather than the element', (_, selector) => {
    expect(lastPseudoPosition(selector, [':hover'])).toMatchObject({ onLastCompound: false });
  });

  it('ignores a pseudo inside a functional selector', () => {
    // `:not(:hover)` is a rule about not hovering; rewriting it would invert it.
    expect(lastPseudoPosition('.btn:not(:hover)', [':hover'])).toBe(null);
  });

  it('does not read :focus-visible as :focus', () => {
    expect(lastPseudoPosition('.btn:focus-visible', [':focus'])).toBe(null);
    expect(lastPseudoPosition('.btn:focus-visible', [':focus-visible', ':focus'])).toMatchObject({ onLastCompound: true });
  });

  it('says nothing about a selector with no pseudo at all', () => {
    expect(lastPseudoPosition('.btn', [':hover'])).toBe(null);
  });
});

describe('hoistState', () => {
  const rule = (selector: string, cssText = 'color: blue;', extra: Partial<PageRule> = {}): PageRule => ({
    selector,
    cssText,
    ...extra,
  });

  it('rewrites the pseudo into our class', () => {
    const [out] = hoistState([rule('.btn:hover')], 'hover', [':hover']);
    expect(out?.selector).toBe('.btn.codename-state-hover');
    expect(out?.onAncestor).toBe(false);
  });

  it('takes only the parts of a selector list that mention the pseudo', () => {
    const [out] = hoistState([rule('.a, .b:hover')], 'hover', [':hover']);
    // Re-emitting `.a` would style it as though it were always hovered.
    expect(out?.selector).toBe('.b.codename-state-hover');
  });

  it('reports an ancestor rule rather than pretending to paint it', () => {
    const [out] = hoistState([rule('.card:hover .title')], 'hover', [':hover']);
    expect(out).toMatchObject({ onAncestor: true, selector: '.card:hover .title' });
    // And it is left out of the sheet, since the class could not trigger it.
    expect(stateSheet([out!])).toBe('');
  });

  it('leaves rules with no pseudo alone entirely', () => {
    expect(hoistState([rule('.btn'), rule('.card .title')], 'hover', [':hover'])).toEqual([]);
  });

  it('reads both spellings of focus', () => {
    const out = hoistState([rule('.a:focus'), rule('.b:focus-visible')], 'focus', [':focus-visible', ':focus']);
    expect(out.map((h) => h.selector)).toEqual(['.a.codename-state-focus', '.b.codename-state-focus']);
  });

  it('keeps a rule inside the wrappers it was written in', () => {
    const out = hoistState([rule('.btn:hover', 'color: blue;', { groups: ['@media (min-width: 700px)', '@layer base'] })], 'hover', [':hover']);
    expect(stateSheet(out)).toBe('@media (min-width: 700px){@layer base{.btn.codename-state-hover{color: blue;}}}');
  });

  it('leaves an empty rule out of the sheet', () => {
    expect(stateSheet(hoistState([rule('.btn:hover', '  ')], 'hover', [':hover']))).toBe('');
  });

  it('handles a pseudo that is not the last thing on the compound', () => {
    const [out] = hoistState([rule('.btn:hover::after')], 'hover', [':hover']);
    expect(out?.selector).toBe('.btn.codename-state-hover::after');
  });
});

describe('the bare selector a hoisted rule carries', () => {
  const rule = (selector: string): PageRule => ({ selector, cssText: 'color: blue;' });

  it('is the selector with the pseudo simply taken out', () => {
    expect(hoistState([rule('.btn:hover')], 'hover', [':hover'])[0]?.bare).toBe('.btn');
    expect(hoistState([rule('a.link:hover span')], 'hover', [':hover'])[0]?.bare).toBe('a.link span');
  });

  it('is what the element itself should be tested against for an ancestor rule', () => {
    // `.card:hover .title` reaches `.title`, and `.title` is what gets asked.
    expect(hoistState([rule('.card:hover .title')], 'hover', [':hover'])[0]?.bare).toBe('.card .title');
  });

  it('keeps a bare part for each taken part of a list', () => {
    expect(hoistState([rule('.a:hover, .b:hover')], 'hover', [':hover'])[0]?.bare).toBe('.a, .b');
  });
});
