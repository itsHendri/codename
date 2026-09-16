import { describe, expect, it } from 'vitest';
import {
  easingToCss,
  entryToCss,
  matchEasing,
  msToTime,
  namedEasings,
  parseTransition,
  timeToMs,
  transitionRoundTrips,
  transitionToCss,
} from './motion';

describe('times', () => {
  it('reads seconds and milliseconds as the same thing', () => {
    expect(timeToMs('0.2s')).toBe(200);
    expect(timeToMs('200ms')).toBe(200);
    expect(timeToMs('0s')).toBe(0);
  });

  it('refuses anything that is not a time', () => {
    expect(timeToMs('200')).toBe(null);
    expect(timeToMs('fast')).toBe(null);
  });

  it('writes them back the way a stylesheet would', () => {
    expect(msToTime(200)).toBe('200ms');
    expect(msToTime(0)).toBe('0s');
  });
});

describe('parseTransition', () => {
  it('reads a property, a duration and a curve', () => {
    expect(parseTransition('opacity 200ms ease-out')).toEqual([
      { property: 'opacity', durationMs: 200, delayMs: 0, easing: 'ease-out' },
    ]);
  });

  it('takes the first time for the duration and the second for the delay', () => {
    expect(parseTransition('opacity 0.2s 0.1s ease-out')?.[0]).toMatchObject({ durationMs: 200, delayMs: 100 });
  });

  it('does not care what order the pieces come in', () => {
    // CSS lets the curve sit anywhere after the property; only the two times
    // are positional.
    expect(parseTransition('ease-out 200ms opacity')?.[0]).toMatchObject({ property: 'opacity', easing: 'ease-out' });
  });

  it('keeps a curve whole, and a reference as a reference', () => {
    expect(parseTransition('opacity 200ms cubic-bezier(0.2, 0, 0, 1)')?.[0]?.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');
    expect(parseTransition('opacity 200ms var(--ease-out)')?.[0]?.easing).toBe('var(--ease-out)');
  });

  it('reads every entry of a list', () => {
    expect(parseTransition('opacity 200ms ease, transform 300ms ease-in')).toHaveLength(2);
  });

  it('defaults a bare duration to every property', () => {
    expect(parseTransition('200ms')?.[0]).toMatchObject({ property: 'all', durationMs: 200 });
  });

  it('reads nothing as nothing', () => {
    expect(parseTransition('none')).toEqual([]);
    expect(parseTransition('')).toEqual([]);
  });

  it.each([
    ['a whole-value reference', 'var(--transition)'],
    ['three times', 'opacity 1s 2s 3s'],
    ['two properties', 'opacity transform 200ms'],
    ['a reference with no duration beside it', 'opacity var(--duration-fast)'],
    ['two references', 'opacity var(--duration) var(--ease)'],
  ])('refuses %s, so the text field keeps it', (_, value) => {
    expect(parseTransition(value)).toBe(null);
  });

  it('will not put a duration token in the easing slot', () => {
    // `opacity var(--duration-fast)` read as a curve and written back as
    // `opacity 0s var(--duration-fast)` is a declaration the browser throws
    // away, and the fields would have shown 0ms for it.
    expect(transitionRoundTrips('opacity var(--duration-fast)')).toBe(false);
    // With a duration present there is nothing left for the reference to be.
    expect(parseTransition('opacity 200ms var(--ease-out)')?.[0]?.easing).toBe('var(--ease-out)');
  });
});

describe('writing a transition back', () => {
  it('leaves out a delay of nothing', () => {
    expect(entryToCss({ property: 'opacity', durationMs: 200, delayMs: 0, easing: 'ease-out' })).toBe('opacity 200ms ease-out');
  });

  it('keeps a delay that is there, after the curve', () => {
    expect(entryToCss({ property: 'opacity', durationMs: 200, delayMs: 100, easing: 'ease-out' })).toBe(
      'opacity 200ms ease-out 100ms',
    );
  });

  it('writes an empty list as none', () => {
    expect(transitionToCss([])).toBe('none');
  });

  it('survives a round trip through the fields', () => {
    for (const value of ['opacity 200ms ease-out', 'transform 300ms var(--ease-out) 50ms', 'color 150ms ease, background-color 150ms ease']) {
      expect(transitionToCss(parseTransition(value)!)).toBe(value);
    }
  });

  it('lets the fields take what a browser writes back', () => {
    // Computed style spells every part out, in seconds.
    expect(transitionRoundTrips('opacity 0.2s ease-out 0s')).toBe(true);
    expect(transitionRoundTrips('var(--transition)')).toBe(false);
  });
});

describe('namedEasings', () => {
  const pageVars = [
    { name: '--ease-out', value: 'cubic-bezier(0.2, 0, 0, 1)' },
    { name: '--motion-easing-spring', value: 'cubic-bezier(0.5, 1.6, 0.4, 0.7)' },
    { name: '--mark', value: '#BE3A22' },
    { name: '--ease-broken', value: 'not-a-curve' },
  ];

  it("offers the page's own names first", () => {
    const found = namedEasings(pageVars, { out: 'cubic-bezier(0.2, 0, 0, 1)' });
    expect(found.slice(0, 2).map((e) => e.name)).toEqual(['--ease-out', '--motion-easing-spring']);
    expect(found.slice(0, 2).every((e) => e.fromPage)).toBe(true);
  });

  it('leaves out a variable that is not a curve, whatever it is called', () => {
    const names = namedEasings(pageVars).map((e) => e.name);
    expect(names).not.toContain('--mark');
    expect(names).not.toContain('--ease-broken');
  });

  it("falls back to the system's names and then to plain CSS", () => {
    const found = namedEasings([], { out: 'cubic-bezier(0.2, 0, 0, 1)' });
    expect(found[0]).toMatchObject({ name: 'out (system)', fromPage: false });
    expect(found.map((e) => e.name)).toContain('linear');
  });

  it("does not give the engine's curve a CSS keyword's name", () => {
    // `ease-out` is a curve of its own. Labelling the engine's `out` with it
    // made the keyword unreachable and showed the wrong curve for a page
    // that writes `ease-out`.
    const found = namedEasings([], { out: 'cubic-bezier(0.2, 0, 0, 1)' });
    expect(found.find((e) => e.name === 'ease-out')?.value).toBe('ease-out');
    expect(found.filter((e) => e.name === 'ease-out')).toHaveLength(1);
  });

  it('writes a page variable as a reference and a keyword as itself', () => {
    expect(easingToCss({ name: '--ease-out', value: 'cubic-bezier(0.2, 0, 0, 1)', fromPage: true })).toBe('var(--ease-out)');
    expect(easingToCss({ name: 'ease-out', value: 'ease-out', fromPage: false })).toBe('ease-out');
  });
});

describe('matchEasing', () => {
  const easings = namedEasings([{ name: '--ease-out', value: 'cubic-bezier(0.2, 0, 0, 1)' }], {});

  it('says nothing when two names hold the same curve', () => {
    // Naming one of them would be provenance the CSS does not have.
    const two = namedEasings(
      [
        { name: '--ease-out', value: 'cubic-bezier(0.2, 0, 0, 1)' },
        { name: '--ease-standard', value: 'cubic-bezier(0.2, 0, 0, 1)' },
      ],
      {},
    );
    expect(matchEasing('cubic-bezier(0.2, 0, 0, 1)', two)).toBe(null);
  });

  it('does not mind how the curve was spaced', () => {
    expect(matchEasing('cubic-bezier(0.2,0,0,1)', easings)?.name).toBe('--ease-out');
  });

  it('recognises a reference as the name behind it', () => {
    expect(matchEasing('var(--ease-out)', easings)?.name).toBe('--ease-out');
  });

  it('recognises a curve written out as the name that holds it', () => {
    expect(matchEasing('cubic-bezier(0.2, 0, 0, 1)', easings)?.name).toBe('--ease-out');
  });

  it('says nothing about a curve no name holds', () => {
    expect(matchEasing('cubic-bezier(0.9, 0, 0.1, 1)', easings)).toBe(null);
    expect(matchEasing('', easings)).toBe(null);
  });
});
