// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { attributeComponent, componentOf, describeOrigin, probeSource, refineProbe } from './framework';

/** Hang a fake React fiber off a node the way a dev build does. */
function withFiber(el: Element, fiber: unknown) {
  (el as unknown as Record<string, unknown>)[`__reactFiber$${Math.random().toString(36).slice(2)}`] = fiber;
}

describe('probeSource', () => {
  it('names the component a React dev build says rendered the element', () => {
    document.body.innerHTML = '<button id="b">Buy</button>';
    const el = document.getElementById('b')!;
    function PriceCard() {}
    withFiber(el, { type: 'button', _debugOwner: { type: PriceCard } });
    expect(probeSource('#b')).toEqual({ via: 'react', name: 'PriceCard' });
  });

  it('reads a server component owner, which names itself rather than a type', () => {
    document.body.innerHTML = '<div id="s"></div>';
    withFiber(document.getElementById('s')!, { type: 'div', _debugOwner: { name: 'PricingPage' } });
    expect(probeSource('#s')).toEqual({ via: 'react', name: 'PricingPage' });
  });

  it('says nothing for a production build, where there is a fiber but no owner', () => {
    document.body.innerHTML = '<div id="p"></div>';
    function Sc() {}
    // A minified ancestor is exactly the name we must not report as a fact.
    withFiber(document.getElementById('p')!, { type: 'div', return: { type: Sc, return: null } });
    expect(probeSource('#p')).toBeNull();
  });

  it('takes the Vue owner from the vnode, not the instance the element was patched into', () => {
    document.body.innerHTML = '<h2 id="slotted">$29</h2>';
    const el = document.getElementById('slotted')!;
    // Slot content: patched inside BaseCard, but written in PricingPage.
    Object.assign(el, {
      __vnode: { ctx: { type: { __name: 'PricingPage', __file: 'src/PricingPage.vue' } } },
      __vueParentComponent: { type: { __name: 'BaseCard', __file: 'src/BaseCard.vue' } },
    });
    expect(probeSource('#slotted')).toEqual({ via: 'vue', name: 'PricingPage', file: 'src/PricingPage.vue' });
  });

  it('says nothing for an element no framework has touched, or a selector that matches nothing', () => {
    document.body.innerHTML = '<div id="plain" class="PriceCard"></div>';
    expect(probeSource('#plain')).toBeNull();
    expect(probeSource('#missing')).toBeNull();
    expect(probeSource('((')).toBeNull();
  });
});

describe('refineProbe', () => {
  it('judges the raw name, unwrapping the wrappers and rejecting the empty ones', () => {
    expect(refineProbe({ via: 'react', name: 'Memo(Field)' })).toEqual({ name: 'Field', via: 'react' });
    expect(refineProbe({ via: 'react', name: 'Provider' })).toBeNull();
    expect(refineProbe({ via: 'react', name: '' })).toBeNull();
    expect(refineProbe(null)).toBeNull();
  });

  it('keeps a file only when the build stated one', () => {
    expect(refineProbe({ via: 'vue', name: 'Hero', file: 'src/Hero.vue' })).toEqual({
      name: 'Hero',
      via: 'vue',
      file: 'src/Hero.vue',
    });
    expect(refineProbe({ via: 'vue', name: 'Hero' })).toEqual({ name: 'Hero', via: 'vue' });
  });
});

describe('attributeComponent', () => {
  it('reads a build plugin attribute on the element itself', () => {
    document.body.innerHTML = '<button id="b" data-component="PriceCard">Buy</button>';
    expect(attributeComponent(document.getElementById('b')!)).toEqual({ name: 'PriceCard', via: 'attribute' });
  });

  it('does not take an ancestor label for the thing you selected', () => {
    document.body.innerHTML = '<div data-component="Layout"><a id="link" href="#">Terms</a></div>';
    expect(attributeComponent(document.getElementById('link')!)).toBeNull();
  });

  it('keeps a whole path, including a Windows drive letter', () => {
    document.body.innerHTML =
      '<div id="v" data-v-inspector="src/components/Hero.vue:12:4"></div><div id="w" data-v-inspector="C:/proj/src/Hero.vue:12:4"></div>';
    expect(attributeComponent(document.getElementById('v')!)).toEqual({
      name: 'Hero',
      via: 'attribute',
      file: 'src/components/Hero.vue',
    });
    expect(attributeComponent(document.getElementById('w')!)).toEqual({
      name: 'Hero',
      via: 'attribute',
      file: 'C:/proj/src/Hero.vue',
    });
  });

  it('says nothing where no build wrote anything, whatever the class is called', () => {
    document.body.innerHTML = '<div class="PriceCard" id="plain"></div>';
    expect(componentOf(document.getElementById('plain')!)).toBeNull();
  });
});

describe('describeOrigin', () => {
  it('says how it knows, so the brief can be read as a fact', () => {
    expect(describeOrigin({ name: 'PriceCard', via: 'react' })).toBe("PriceCard, as React's dev build names it");
    expect(describeOrigin({ name: 'Hero', via: 'vue', file: 'src/Hero.vue' })).toBe(
      "Hero (src/Hero.vue), as Vue's dev build names it",
    );
  });
});
