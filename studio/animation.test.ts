import { describe, expect, it } from 'vitest';
import {
  animationRoundTrips,
  animationToCss,
  describeKeyframes,
  keyframesCss,
  namesIn,
  parseAnimation,
  timelineFor,
  triggerEntry,
  triggerOf,
} from './animation';

describe('an animation as fields', () => {
  it('reads the computed form and the written form the same way', () => {
    const computed = parseAnimation('0.6s ease-out 0s 1 normal both running fade');
    const written = parseAnimation('fade 600ms ease-out');
    expect(computed).toEqual([{ name: 'fade', durationMs: 600, delayMs: 0, easing: 'ease-out', iterations: '1', direction: 'normal', fill: 'both' }]);
    expect(written?.[0]).toMatchObject({ name: 'fade', durationMs: 600, easing: 'ease-out', fill: 'none' });
  });

  it('is no entries for none, and keeps a curve or a variable whole', () => {
    expect(parseAnimation('none 0s ease 0s 1 normal none running')).toEqual([]);
    expect(parseAnimation('none')).toEqual([]);
    expect(parseAnimation('spin 2s cubic-bezier(0.2, 0, 0, 1) infinite')?.[0]).toMatchObject({ easing: 'cubic-bezier(0.2, 0, 0, 1)', iterations: 'infinite' });
    expect(parseAnimation('spin 2s var(--ease-out) infinite')?.[0]).toMatchObject({ easing: 'var(--ease-out)' });
  });

  it('fails closed on what the fields would lose', () => {
    expect(parseAnimation('fade 1s 2s 3s')).toBeNull();
    expect(parseAnimation('1s ease')).toBeNull();
    expect(parseAnimation('fade 1s "quoted"')).toBeNull();
    expect(animationRoundTrips('fade 600ms ease-out 0s 1 normal both')).toBe(true);
    expect(animationRoundTrips('fade 1s 2s 3s')).toBe(false);
  });

  it('writes one declaration per entry and none for nothing', () => {
    expect(animationToCss([])).toBe('none');
    expect(animationToCss(parseAnimation('a 1s ease, b 200ms linear 100ms infinite alternate')!)).toBe(
      'a 1000ms ease 0s 1 normal none, b 200ms linear 100ms infinite alternate none',
    );
  });
});

describe('triggers', () => {
  it('are one declaration each, and read back as themselves', () => {
    const appear = triggerEntry('appear', 'codename-fade-in');
    const loop = triggerEntry('loop', 'codename-pulse');
    const scroll = triggerEntry('scroll', 'codename-rise');
    expect(triggerOf(appear, 'auto')).toBe('appear');
    expect(triggerOf(loop, 'auto')).toBe('loop');
    expect(triggerOf(scroll, timelineFor('scroll'))).toBe('scroll');
    expect(triggerOf(undefined, 'auto')).toBeNull();
    expect(timelineFor('appear')).toBe('auto');
    expect(animationRoundTrips(animationToCss([loop]))).toBe(true);
  });
});

describe('named keyframes', () => {
  it('defines a preset for a sheet and describes it for a brief, without a rule body', () => {
    expect(keyframesCss('codename-fade-in')).toBe('@keyframes codename-fade-in{from{opacity:0}to{opacity:1}}');
    expect(describeKeyframes('codename-fade-in')).toBe('@keyframes codename-fade-in: from opacity 0 to opacity 1');
    expect(describeKeyframes('codename-fade-in')).not.toMatch(/[{}]/);
    expect(keyframesCss('fade')).toBeNull();
    expect(namesIn('codename-rise 600ms ease-out, spin 1s linear infinite')).toEqual(['codename-rise', 'spin']);
  });
});
