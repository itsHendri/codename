import { describe, expect, it } from 'vitest';
import {
  cascadeOrder,
  conditionKey,
  describe as describeCondition,
  describeLong,
  maxWidthOf,
  mediaFor,
  normaliseCondition,
  pseudosOf,
  selectorFor,
  stateClass,
  widthConditions,
  type Condition,
} from './conditions';

const hover: Condition = { kind: 'state', state: 'hover' };
const focus: Condition = { kind: 'state', state: 'focus' };
const dark: Condition = { kind: 'scheme', scheme: 'dark' };
const tablet: Condition = { kind: 'width', preset: 'Tablet', maxWidth: 768 };

describe('conditionKey', () => {
  it('tells the states, the scheme and each width apart', () => {
    const keys = [undefined, hover, focus, dark, tablet].map(conditionKey);
    expect(keys).toEqual(['default', 'state:hover', 'state:focus', 'scheme:dark', 'width:768']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keys two widths of the same size the same, whatever the preset is called', () => {
    expect(conditionKey({ kind: 'width', preset: 'Tablet', maxWidth: 768 })).toBe(
      conditionKey({ kind: 'width', preset: 'Something else', maxWidth: 768 }),
    );
  });
});

describe('selectorFor', () => {
  it('writes the real pseudo-class and the stand-in class together', () => {
    expect(selectorFor('.btn', hover)).toBe('.btn:hover, .btn.codename-state-hover');
  });

  it('uses :focus-visible, so a click does not light up a focus ring', () => {
    expect(selectorFor('.btn', focus)).toContain(':focus-visible');
    expect(selectorFor('.btn', focus)).not.toContain(':focus,');
  });

  it('leaves a selector alone for everything that is not a state', () => {
    expect(selectorFor('.btn', undefined)).toBe('.btn');
    expect(selectorFor('.btn', dark)).toBe('.btn');
    expect(selectorFor('.btn', tablet)).toBe('.btn');
  });

  it('spreads over a selector list rather than suffixing the last of it', () => {
    // `.a, .b:hover` would leave `.a` styled in every state.
    expect(selectorFor('.a, .b', hover)).toBe('.a:hover, .a.codename-state-hover, .b:hover, .b.codename-state-hover');
  });
});

describe('mediaFor', () => {
  it('puts a width edit inside its query', () => {
    expect(mediaFor(tablet)).toBe('@media (max-width: 768px)');
  });

  it('puts a dark edit inside the scheme query, unless the panel is already painting dark', () => {
    expect(mediaFor(dark)).toBe('@media (prefers-color-scheme: dark)');
    // The preview repaints the page as dark whatever the browser thinks, so
    // the query would never match and the edit would be invisible.
    expect(mediaFor(dark, true)).toBe(null);
  });

  it('wraps nothing else', () => {
    expect(mediaFor(undefined)).toBe(null);
    expect(mediaFor(hover)).toBe(null);
  });
});

describe('cascadeOrder', () => {
  it('runs least specific first, so each can override the one before', () => {
    const order = [undefined, tablet, dark, hover].map(cascadeOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(cascadeOrder(hover)).toBeGreaterThan(cascadeOrder(dark));
    expect(cascadeOrder(dark)).toBeGreaterThan(cascadeOrder(tablet));
  });
});

describe('describe', () => {
  it('says what a person would call it', () => {
    expect([undefined, hover, dark, tablet].map(describeCondition)).toEqual(['default', 'hover', 'dark', '≤768']);
  });

  it('spells it out where a brief has to stand alone', () => {
    expect(describeLong(hover)).toBe('`:hover`');
    expect(describeLong(focus)).toBe('`:focus-visible`');
    expect(describeLong(dark)).toBe("the page's own dark mode");
    expect(describeLong(tablet)).toBe('`@media (max-width: 768px)`');
  });
});

describe('pseudosOf', () => {
  it('reads a page that only ever styled :focus as well as one that did not', () => {
    expect(pseudosOf('focus')).toEqual([':focus-visible', ':focus']);
    expect(pseudosOf('hover')).toEqual([':hover']);
  });
});

describe('widthConditions', () => {
  it('offers the bar\'s own presets, narrowest first, without the desktop ones', () => {
    const widths = widthConditions().map((c) => (c.kind === 'width' ? c.maxWidth : 0));
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(widths).toContain(768);
    // A max-width of 1920 matches everything, which is not a condition.
    expect(widths).not.toContain(1920);
  });
});

describe('normaliseCondition', () => {
  it('takes back what it wrote', () => {
    for (const c of [hover, dark, tablet]) expect(normaliseCondition(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'hover'],
    ['an unknown state', { kind: 'state', state: 'visited' }],
    ['a light scheme', { kind: 'scheme', scheme: 'light' }],
    ['a width of nothing', { kind: 'width', maxWidth: 0 }],
  ])('reads %s as the default state', (_, raw) => {
    expect(normaliseCondition(raw)).toBeUndefined();
  });
});

describe('stateClass', () => {
  it('is namespaced, so it cannot collide with the page', () => {
    expect(stateClass('hover')).toBe('codename-state-hover');
  });
});

describe('two widths at once', () => {
  const wide: Condition = { kind: 'width', preset: 'Laptop', maxWidth: 1280 };
  const narrow: Condition = { kind: 'width', preset: 'Mobile S', maxWidth: 375 };

  it('puts the narrower query last, so it wins where both match', () => {
    // At 320px both media queries apply and both rules are !important at the
    // same specificity, so source order is the whole story.
    expect(cascadeOrder(narrow)).toBeGreaterThan(cascadeOrder(wide));
  });

  it('keeps every width between the default and dark', () => {
    for (const w of [wide, narrow]) {
      expect(cascadeOrder(w)).toBeGreaterThan(cascadeOrder(undefined));
      expect(cascadeOrder(w)).toBeLessThan(cascadeOrder({ kind: 'scheme', scheme: 'dark' }));
    }
  });
});

describe('where the widths come from', () => {
  it('reads a max-width query', () => {
    expect(maxWidthOf('(max-width: 700px)')).toBe(700);
    expect(maxWidthOf('(max-width:700px)')).toBe(700);
  });

  it.each([['a min-width', '(min-width: 700px)'], ['no unit', '(max-width: 40em)'], ['a compound', '(max-width: 700px) and (min-width: 300px)'], ['nonsense', 'wat']])(
    'refuses %s',
    (_, query) => {
      expect(maxWidthOf(query)).toBe(null);
    },
  );

  it("offers the page's own breakpoints when it has any, narrowest first", () => {
    const widths = widthConditions(['(max-width: 900px)', '(max-width: 600px)', '(min-width: 1200px)']);
    expect(widths.map((c) => (c.kind === 'width' ? c.maxWidth : 0))).toEqual([600, 900]);
  });

  it("falls back to the device presets for a page that declares none", () => {
    expect(widthConditions([]).map((c) => (c.kind === 'width' ? c.preset : ''))).toContain('Tablet');
    expect(widthConditions(undefined).length).toBeGreaterThan(0);
  });

  it('does not offer a page a menu of every breakpoint it has', () => {
    const many = Array.from({ length: 20 }, (_, i) => `(max-width: ${(i + 1) * 100}px)`);
    expect(widthConditions(many)).toHaveLength(8);
  });
});
