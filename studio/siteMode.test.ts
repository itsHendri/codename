import { describe, expect, it } from 'vitest';
import { hookFromSelector, hookKey, isDarkMedia, withoutDarkQuery } from './siteMode';

describe('withoutDarkQuery', () => {
  it('drops the dark query and keeps what it was joined with', () => {
    expect(withoutDarkQuery('(prefers-color-scheme: dark)')).toBeNull();
    expect(withoutDarkQuery('(prefers-color-scheme:dark) and (min-width: 600px)')).toBe('(min-width: 600px)');
    expect(withoutDarkQuery('screen and (prefers-color-scheme: dark)')).toBeNull();
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
