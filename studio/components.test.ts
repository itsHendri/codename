// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { componentsSource, refineComponents } from './components';

/** Hang a React dev-build fiber off an element, owned by `owner`. */
const react = (el: Element, owner: object) => {
  (el as unknown as Record<string, unknown>)['__reactFiber$abc'] = { _debugOwner: owner };
};
const comp = (name: string) => ({ type: Object.assign(function () {}, { displayName: name }) });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('componentsSource', () => {
  it('finds each copy of a component where it starts, and counts them', () => {
    document.body.innerHTML = '<header><h1>Title</h1></header><main><article><p>a</p></article><article><p>b</p></article></main>';
    const app = comp('App');
    const header = comp('TopBar');
    const cardA = comp('Card');
    const cardB = { type: cardA.type };
    const [headerEl, h1, main, art1, p1, art2, p2] = Array.from(document.body.querySelectorAll('*'));
    react(headerEl!, header);
    react(h1!, header);
    react(main!, app);
    react(art1!, cardA);
    react(p1!, cardA);
    react(art2!, cardB);
    react(p2!, cardB);

    const found = componentsSource(1000, 10);
    const card = found.find((c) => c.name === 'Card')!;
    expect(card).toMatchObject({ via: 'react', count: 2 });
    // Where each copy starts, not every element inside it.
    expect(card.roots).toEqual(['body > :nth-child(2) > :nth-child(1)', 'body > :nth-child(2) > :nth-child(2)']);
    expect(found.find((c) => c.name === 'TopBar')).toMatchObject({ count: 1, roots: ['body > :nth-child(1)'] });
    // Every root the selector names is the element it was found at.
    expect(document.querySelector(card.roots[1]!)).toBe(art2);
  });

  it('reads Vue’s instance and file', () => {
    document.body.innerHTML = '<nav><a>x</a></nav>';
    const inst = { type: { __name: 'NavBar', __file: 'src/components/NavBar.vue' } };
    for (const el of Array.from(document.body.querySelectorAll('*'))) (el as unknown as Record<string, unknown>).__vnode = { ctx: inst };
    expect(componentsSource(1000, 10)).toEqual([{ via: 'vue', name: 'NavBar', file: 'src/components/NavBar.vue', roots: ['body > :nth-child(1)'], count: 1 }]);
  });

  it('says nothing about a page with no dev build behind it', () => {
    document.body.innerHTML = '<div><p>plain</p></div>';
    expect(componentsSource(1000, 10)).toEqual([]);
  });

  it('keeps only so many roots, and still counts them all', () => {
    document.body.innerHTML = '<ul>' + '<li>x</li>'.repeat(5) + '</ul>';
    const row = comp('Row');
    for (const li of Array.from(document.body.querySelectorAll('li'))) react(li, { type: row.type });
    const [r] = componentsSource(1000, 2);
    expect(r).toMatchObject({ name: 'Row', count: 5 });
    expect(r!.roots).toHaveLength(2);
  });
});

describe('refineComponents', () => {
  it('drops internals and wrappers, merges what unwraps to one name, biggest first', () => {
    const out = refineComponents([
      { via: 'react', name: 'Provider', roots: ['body'], count: 1 },
      { via: 'react', name: 'Memo(Card)', roots: ['a'], count: 3 },
      { via: 'react', name: 'Card', roots: ['b'], count: 2 },
      { via: 'react', name: 'TopBar', roots: ['c'], count: 1 },
      { via: 'svelte', name: 'Nope', roots: ['d'], count: 1 },
      { via: 'react', name: 'div', roots: ['e'], count: 0 },
    ]);
    expect(out).toEqual([
      { name: 'Card', via: 'react', count: 5, roots: ['a', 'b'] },
      { name: 'TopBar', via: 'react', count: 1, roots: ['c'] },
    ]);
  });

  it('answers garbage with nothing', () => {
    expect(refineComponents(null)).toEqual([]);
    expect(refineComponents({})).toEqual([]);
  });
});
