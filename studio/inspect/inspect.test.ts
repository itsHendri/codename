// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { compositeOverWhite, contrast, opaqueBackground, parseRgba, toHex } from './colour';
import { buildLayers, find, findAll, layerLabel, MAX_LAYERS, neighbour, ownText } from './dom';
import { placeCard, placeSizeLabel, regionFrom } from './geometry';
import { asLengths, asPx, editValues } from './editValues';
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
  const card = { width: 232, height: 200 };

  it('puts the edit card under the selection, clear of its size label, above it when there is no room, and inside the viewport', () => {
    expect(placeCard({ x: 100, y: 100, width: 300, height: 40 }, card, viewport, 48)).toEqual({ left: 100, top: 168 });
    expect(placeCard({ x: 100, y: 500, width: 300, height: 40 }, card, viewport, 48)).toEqual({ left: 100, top: 272 });
    expect(placeCard({ x: 900, y: 10, width: 300, height: 40 }, card, viewport, 48)).toEqual({ left: 760, top: 78 });
    expect(placeCard({ x: 0, y: 0, width: 10, height: 10 }, card, viewport, 48, { left: -50, top: 590 })).toEqual({ left: 8, top: 392 });
  });

  it('centres the size label under the box, or above it at the bottom of the viewport', () => {
    expect(placeSizeLabel({ x: 100, y: 100, width: 200, height: 50 }, viewport, 44)).toEqual({ left: 200, top: 153 });
    expect(placeSizeLabel({ x: 100, y: 560, width: 200, height: 50 }, viewport, 44)).toEqual({ left: 200, top: 539 });
    expect(placeSizeLabel({ x: -100, y: 0, width: 20, height: 10 }, viewport, 44)).toEqual({ left: 40, top: 13 });
    expect(placeSizeLabel({ x: 100, y: 590, width: 20, height: 10 }, viewport, 44)).toEqual({ left: 110, top: 569 });
  });

  it('tells a drag from a click', () => {
    expect(regionFrom({ x: 10, y: 10 }, { x: 14, y: 12 })).toBeNull();
    expect(regionFrom({ x: 50, y: 40 }, { x: 10, y: 60 })).toEqual({ x: 10, y: 40, width: 40, height: 20 });
  });
});

describe('the edit card\'s values', () => {
  it('turns typed numbers into pixels and keeps units', () => {
    expect(asPx('8')).toBe('8px');
    expect(asPx(' 1.5rem ')).toBe('1.5rem');
    expect(asLengths('8 16')).toBe('8px 16px');
    expect(asLengths('8px 1em')).toBe('8px 1em');
  });

  it('picks the most-reached-for properties, text only when it is editable', () => {
    expect(editValues(element() as never)).toEqual({
      text: 'Grit',
      color: '#15171B',
      'background-color': '#E7E4DB',
      'font-size': '28px',
      'font-weight': '600',
      padding: '8px 16px',
      'border-radius': '0px',
    });
    expect(editValues(element({ text: null }) as never)).not.toHaveProperty('text');
  });
});
