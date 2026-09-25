import { describe, expect, it } from 'vitest';
import { hookFromSelector, hookKey, isDarkMedia, isLightOnly, widthLabel, widthOfMedia, withoutDarkQuery, pageScheme } from './siteMode';

describe('withoutDarkQuery', () => {
  it('drops the dark query and keeps what it was joined with', () => {
    expect(withoutDarkQuery('(prefers-color-scheme: dark)')).toBeNull();
    expect(withoutDarkQuery('(prefers-color-scheme:dark) and (min-width: 600px)')).toBe('(min-width: 600px)');
    expect(withoutDarkQuery('screen and (prefers-color-scheme: dark)')).toBeNull();
  });

  it('leaves a negated dark query alone: it is a light block', () => {
    expect(withoutDarkQuery('not (prefers-color-scheme: dark)')).toBeUndefined();
    expect(withoutDarkQuery('not all and (prefers-color-scheme: dark)')).toBeUndefined();
    expect(isLightOnly('not (prefers-color-scheme: dark)')).toBe(true);
    expect(isLightOnly('(prefers-color-scheme: light)')).toBe(true);
    expect(isLightOnly('(prefers-color-scheme: dark)')).toBe(false);
    expect(isLightOnly('(min-width: 600px)')).toBe(false);
  });

  it('leaves a condition it cannot simplify alone', () => {
    expect(withoutDarkQuery('(prefers-color-scheme: dark), print')).toBeUndefined();
    expect(withoutDarkQuery('(min-width: 600px)')).toBeUndefined();
    expect(isDarkMedia('(min-width: 600px)')).toBe(false);
  });
});

describe('hookFromSelector', () => {
  it('reads class and attribute hooks off the leftmost compound', () => {
    expect(hookFromSelector('html.dark .card')).toEqual({ kind: 'class', name: 'dark' });
    expect(hookFromSelector('.dark-theme body')).toEqual({ kind: 'class', name: 'dark-theme' });
    expect(hookFromSelector(':root[data-theme="dark"] .x')).toEqual({ kind: 'attr', name: 'data-theme', value: 'dark' });
    expect(hookFromSelector("[data-bs-theme='dark']")).toEqual({ kind: 'attr', name: 'data-bs-theme', value: 'dark' });
  });

  it('does not mistake a dark-named thing deeper in the selector for a mode', () => {
    expect(hookFromSelector('.card .dark-badge')).toBeNull();
    expect(hookFromSelector('.darkroom')).toBeNull();
    expect(hookFromSelector('.btn:hover')).toBeNull();
  });

  it('names a hook the way it would be written', () => {
    expect(hookKey({ kind: 'class', name: 'dark' })).toBe('.dark');
    expect(hookKey({ kind: 'attr', name: 'data-theme', value: 'dark' })).toBe('[data-theme="dark"]');
  });
});

describe('widthOfMedia', () => {
  it('reads a width feature out of a condition and writes it one way', () => {
    expect(widthOfMedia('screen and (max-width:700px)')).toBe('(max-width: 700px)');
    expect(widthOfMedia('(min-width: 48em) and (max-width: 1024px)')).toBe('(min-width: 48em) and (max-width: 1024px)');
  });

  it('reads the range syntax the same way', () => {
    expect(widthOfMedia('(width <= 700px)')).toBe('(max-width: 700px)');
    expect(widthOfMedia('(400px <= width <= 700px)')).toBe('(min-width: 400px) and (max-width: 700px)');
  });

  it('is not a breakpoint when there is no width, or when the block is a scheme', () => {
    expect(widthOfMedia('print')).toBeNull();
    expect(widthOfMedia('(prefers-reduced-motion: reduce)')).toBeNull();
    // The dark reading owns this value; filing it under a width too would say it changes twice.
    expect(widthOfMedia('(prefers-color-scheme: dark) and (max-width: 700px)')).toBeNull();
  });
});

describe('widthLabel', () => {
  it('shortens a pixel width to a chip and leaves the rest in words', () => {
    expect(widthLabel('(max-width: 700px)')).toBe('≤700');
    expect(widthLabel('(min-width: 1024px)')).toBe('≥1024');
    expect(widthLabel('(min-width: 48em)')).toBe('(min-width: 48em)');
  });
});

describe('a negated media query', () => {
  it('is not read as the breakpoint it names', () => {
    // `not all and (max-width: 700px)` applies *above* 700. Reading it as a
    // 700px breakpoint would file its variables under the opposite of what
    // the page says.
    expect(widthOfMedia('not all and (max-width: 700px)')).toBe(null);
    expect(widthOfMedia('not screen and (min-width: 900px)')).toBe(null);
  });

  it('still reads the ordinary ones', () => {
    expect(widthOfMedia('screen and (max-width: 700px)')).toBe('(max-width: 700px)');
    expect(widthOfMedia('(max-width: 700px)')).toBe('(max-width: 700px)');
  });
});

describe('pageScheme', () => {
  const base = { prefersDark: false, hasDarkRules: false, hookOn: false, colorScheme: 'normal' };
  it('is dark when the page has switched itself there, or follows a dark system, or says so', () => {
    expect(pageScheme({ ...base, hookOn: true })).toBe('dark');
    expect(pageScheme({ ...base, prefersDark: true, hasDarkRules: true })).toBe('dark');
    expect(pageScheme({ ...base, colorScheme: 'dark' })).toBe('dark');
  });
  it('is light when the page has no dark side, whatever the system prefers', () => {
    expect(pageScheme({ ...base, prefersDark: true })).toBe('light');
    expect(pageScheme({ ...base, hasDarkRules: true })).toBe('light');
    expect(pageScheme({ ...base, colorScheme: 'light dark' })).toBe('light');
  });
});
