// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { compositeOverWhite, contrast, opaqueBackground, parseRgba, toHex } from './colour';
import { buildLayers, find, findAll, layerLabel, MAX_LAYERS, neighbour, ownText } from './dom';
import { dropIndex, dropZone, placeMenu, placeSizeLabel, regionFrom, takesChildren } from './geometry';
import { readProps, roundedStyle } from './readProps';
import { element } from '@/entrypoints/sidepanel/test/chromeStub';

describe('colour', () => {
  it('reads computed colours as hex and knows transparent from opaque', () => {
    expect(parseRgba('rgb(21, 23, 27)')).toEqual({ r: 21, g: 23, b: 27, a: 1 });
    expect(parseRgba('rgba(21, 23, 27, 0.5)')?.a).toBe(0.5);
    expect(parseRgba('rgb(21 23 27 / 40%)')?.a).toBe(0.4);
    expect(toHex('rgb(21, 23, 27)')).toBe('#15171B');
    expect(toHex('rgba(0, 0, 0, 0)')).toBeNull();
    expect(toHex('transparent')).toBeNull();
  });

  it('measures contrast to one decimal, and not against nothing', () => {
    expect(contrast('#000000', '#FFFFFF')).toBe(21);
    expect(contrast('#15171B', '#E7E4DB')).toBe(14.1);
    expect(contrast(null, '#FFFFFF')).toBeNull();
  });

  it('composites translucent layers nearest-first over white', () => {
    expect(compositeOverWhite([])).toBe('#FFFFFF');
    expect(compositeOverWhite([{ r: 0, g: 0, b: 0, a: 0.5 }])).toBe('#808080');
    // The nearer layer sits on top of the farther one.
    expect(compositeOverWhite([{ r: 255, g: 0, b: 0, a: 1 }, { r: 0, g: 0, b: 255, a: 1 }])).toBe('#FF0000');
  });

  it('finds the colour behind an element through its ancestors', () => {
    document.body.innerHTML = '<div id="a"><div id="b"><span id="c">x</span></div></div>';
    const styles: Record<string, string> = { a: 'rgb(0, 0, 255)', b: 'rgba(255, 0, 0, 0.5)', c: 'rgba(0, 0, 0, 0)' };
    const style = (el: Element) => ({ backgroundColor: styles[el.id] ?? 'rgba(0, 0, 0, 0)' }) as CSSStyleDeclaration;
    expect(opaqueBackground(document.getElementById('c')!, style)).toBe('#800080');
  });
});

describe('the page as structure', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <header id="top"><h1 id="title">Grit</h1><p class="lede">Type, <em>treated</em>.</p></header>
      <main class="plate x-9f8a7">
        <article class="card"><h2 class="card-title">One</h2></article>
        <article class="card"><h2 class="card-title">Two</h2></article>
        <svg class="mark"><path d="M0 0"/><path d="M1 1"/></svg>
        <script>1</script>
        <codename-inspector></codename-inspector>
      </main>`;
  });

  it('knows when an element\'s own children are text', () => {
    expect(ownText(document.getElementById('title')!)).toBe('Grit');
    expect(ownText(document.querySelector('.lede')!)).toBeNull();
    expect(ownText(document.querySelector('svg')!)).toBeNull();
  });

  it('labels a row by tag, id and the classes that will still be there tomorrow', () => {
    expect(layerLabel(document.getElementById('title')!)).toBe('h1#title');
    expect(layerLabel(document.querySelector('main')!)).toBe('main.plate');
    expect(layerLabel(document.querySelector('em')!)).toBe('em');
  });

  it('walks to a neighbour, never the root, never what is skipped', () => {
    const title = document.getElementById('title')!;
    expect(neighbour(title, 'parent')?.id).toBe('top');
    expect(neighbour(title, 'next')?.className).toBe('lede');
    expect(neighbour(title, 'prev')).toBeNull();
    expect(neighbour(document.querySelector('.lede')!, 'child')?.tagName).toBe('EM');
    expect(neighbour(document.body, 'parent')).toBeNull();
    expect(neighbour(title, 'next', (el) => el.classList.contains('lede'))).toBeNull();
  });

  it('lists the page flat with depths and descendant counts, leaving out drawing and chrome', () => {
    const skip = (el: Element) => el.tagName.toLowerCase() === 'codename-inspector';
    const layers = buildLayers(document.body, skip);
    const labels = layers.map((l) => `${l.depth}:${l.label}`);
    expect(labels).toEqual([
      '0:body', '1:header#top', '2:h1#title', '2:p.lede', '3:em', '1:main.plate', '2:article.card', '3:h2.card-title', '2:article.card', '3:h2.card-title', '2:svg.mark',
    ]);
    expect(layers[0]).toMatchObject({ descendants: 10, tag: 'body' });
    expect(layers[1]).toMatchObject({ descendants: 3, hidden: false });
    expect(layers[2]).toMatchObject({ text: 'Grit', matches: 1 });
    // Two cards share a class selector: that is the component badge.
    expect(layers[6]).toMatchObject({ matches: 2, intent: 'article.card' });
    // The svg is one layer; its paths are drawing, not structure.
    expect(layers[10]).toMatchObject({ descendants: 0 });
  });

  it('reads hidden from the style it is given, and stops at the cap', () => {
    const style = (el: Element) => ({ display: el.id === 'top' ? 'none' : 'block', visibility: 'visible' }) as CSSStyleDeclaration;
    const layers = buildLayers(document.body, () => false, style);
    expect(layers.find((l) => l.label === 'header#top')).toMatchObject({ hidden: true, display: 'none' });
    const many = document.createElement('div');
    for (let i = 0; i < MAX_LAYERS + 50; i++) many.appendChild(document.createElement('i'));
    expect(buildLayers(many).length).toBe(MAX_LAYERS);
    expect(buildLayers(null)).toEqual([]);
  });

  it('looks a selector up without trusting it to parse', () => {
    expect(findAll('.card')).toMatchObject({ matches: 2 });
    expect(findAll('.card')?.first?.tagName).toBe('ARTICLE');
    expect(findAll(':nope(')).toEqual({ first: null, matches: 0 });
    expect(findAll(undefined)).toEqual({ first: null, matches: 0 });
    expect(find('#title')?.tagName).toBe('H1');
    expect(find('[')).toBeNull();
  });
});

describe('reading an element', () => {
  it('reads every field the panel shows, with lengths rounded and the breadcrumb from body down', () => {
    document.body.innerHTML = '<main><h1 id="title" style="width: 96.6641px; padding: 8px 16px">Grit</h1></main>';
    const h1 = document.getElementById('title')!;
    const props = readProps(h1);
    expect(props).toMatchObject({ selector: 'h1#title', tag: 'h1', text: 'Grit', matches: 1, stable: true });
    expect(props.breadcrumb.map((b) => b.tag)).toEqual(['body', 'main', 'h1']);
    expect(props.box.width).toBe('96.66px');
    expect(props.box.paddingLeft).toBe('16px');
    expect(props.child).toMatchObject({ inFlex: false });
    // The same keys as the fixture the panel is tested against: the two must not drift.
    expect(Object.keys(props).sort()).toEqual(Object.keys(element()).sort());
    expect(Object.keys(props.box).sort()).toEqual(Object.keys(element().box).sort());
  });

  it('rounds through a style whose methods still work', () => {
    document.body.innerHTML = '<p style="margin-left: 1.23456px">x</p>';
    const cs = roundedStyle(document.querySelector('p')!);
    expect(cs.marginLeft).toBe('1.23px');
    expect(() => cs.getPropertyValue('margin-left')).not.toThrow();
  });
});

describe('placing the chrome', () => {
  const viewport = { width: 1000, height: 600 };
  const menu = { width: 208, height: 220 };

  it('opens the menu at the pointer, flipped at the right and bottom edges, and never under the bar', () => {
    expect(placeMenu({ x: 100, y: 100 }, menu, viewport, 44)).toEqual({ left: 100, top: 100 });
    expect(placeMenu({ x: 900, y: 100 }, menu, viewport, 44)).toEqual({ left: 692, top: 100 });
    expect(placeMenu({ x: 100, y: 500 }, menu, viewport, 44)).toEqual({ left: 100, top: 280 });
    expect(placeMenu({ x: 100, y: 10 }, menu, viewport, 44)).toEqual({ left: 100, top: 44 });
    expect(placeMenu({ x: 100, y: 200 }, menu, { width: 1000, height: 150 }, 44)).toEqual({ left: 100, top: 44 });
  });

  it('centres the size label under the box, or above it at the bottom of the viewport', () => {
    expect(placeSizeLabel({ x: 100, y: 100, width: 200, height: 50 }, viewport, 44)).toEqual({ left: 200, top: 153 });
    expect(placeSizeLabel({ x: 100, y: 560, width: 200, height: 50 }, viewport, 44)).toEqual({ left: 200, top: 539 });
    expect(placeSizeLabel({ x: -100, y: 0, width: 20, height: 10 }, viewport, 44)).toEqual({ left: 40, top: 13 });
    expect(placeSizeLabel({ x: 100, y: 590, width: 20, height: 10 }, viewport, 44)).toEqual({ left: 110, top: 569 });
  });

  it('drops a dragged element before the sibling whose middle is past the pointer', () => {
    const stack = [0, 50, 100].map((top) => ({ top, bottom: top + 40, left: 0, width: 300, height: 40 }));
    expect(dropIndex(stack, 10, 5, false)).toBe(0);
    expect(dropIndex(stack, 10, 75, false)).toBe(2);
    expect(dropIndex(stack, 10, 139, false)).toBeNull();
    // Two rows of two, across: the row under the pointer, then left to right.
    const grid = [
      { top: 0, bottom: 40, left: 0, width: 100, height: 40 },
      { top: 0, bottom: 40, left: 110, width: 100, height: 40 },
      { top: 50, bottom: 90, left: 0, width: 100, height: 40 },
      { top: 50, bottom: 90, left: 110, width: 100, height: 40 },
    ];
    expect(dropIndex(grid, 120, 20, true)).toBe(1);
    expect(dropIndex(grid, 200, 20, true)).toBe(2);
    expect(dropIndex(grid, 40, 70, true)).toBe(2);
    expect(dropIndex(grid, 200, 70, true)).toBeNull();
    expect(dropIndex([], 0, 0, true)).toBeNull();
  });

  it('tells a drag from a click', () => {
    expect(regionFrom({ x: 10, y: 10 }, { x: 14, y: 12 })).toBeNull();
    expect(regionFrom({ x: 50, y: 40 }, { x: 10, y: 60 })).toEqual({ x: 10, y: 40, width: 40, height: 20 });
  });
});

describe('dropping on the page', () => {
  const card = { top: 100, left: 0, width: 300, height: 120, bottom: 220, right: 300 };

  it('reads the edges of a box as beside it and its middle as into it', () => {
    expect(dropZone(card, 150, 105, false, true)).toBe('before');
    expect(dropZone(card, 150, 160, false, true)).toBe('into');
    expect(dropZone(card, 150, 215, false, true)).toBe('after');
  });

  it('reads a box laid out side by side along its x', () => {
    expect(dropZone(card, 5, 160, true, true)).toBe('before');
    expect(dropZone(card, 295, 160, true, true)).toBe('after');
    expect(dropZone(card, 150, 102, true, true)).toBe('into');
  });

  it('splits a box that takes nothing in at its midpoint', () => {
    expect(dropZone(card, 150, 150, false, false)).toBe('before');
    expect(dropZone(card, 150, 170, false, false)).toBe('after');
  });

  it('keeps the edge bands usable on small and large boxes', () => {
    const chip = { top: 0, left: 0, width: 40, height: 20, bottom: 20, right: 40 };
    // A fifth of 20 is 4, held at 6: the middle 8px is still into.
    expect(dropZone(chip, 20, 5, false, true)).toBe('before');
    expect(dropZone(chip, 20, 10, false, true)).toBe('into');
    const hero = { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 };
    // A fifth of 600 would swallow the box; 18px is the edge.
    expect(dropZone(hero, 400, 30, false, true)).toBe('into');
    expect(dropZone(hero, 400, 590, false, true)).toBe('after');
  });

  it('takes boxes in, and keeps text and replaced elements out', () => {
    for (const tag of ['div', 'section', 'main', 'li', 'ul', 'nav', 'header', 'article']) expect(takesChildren(tag)).toBe(true);
    for (const tag of ['p', 'h2', 'a', 'button', 'img', 'svg', 'input', 'SPAN']) expect(takesChildren(tag)).toBe(false);
  });
});
