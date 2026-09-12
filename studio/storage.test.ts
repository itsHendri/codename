import { describe, expect, it } from 'vitest';
import { scopeSlug, slugify } from './storage';

describe('scopeSlug', () => {
  it('leaves a short key as slugify would', () => {
    expect(scopeSlug('http://localhost:3000')).toBe('localhost-3000');
    expect(scopeSlug('https://forfontsake.com')).toBe(slugify('https://forfontsake.com'));
  });

  it('keeps two long paths apart rather than truncating them together', () => {
    const a = scopeSlug('project:/Users/hendri/Development/acme-platform-frontend/apps/marketing');
    const b = scopeSlug('project:/Users/hendri/Development/acme-platform-frontend/apps/dashboard');
    // slugify alone cuts both at the same 60 characters, so they used to
    // share one record — and with it every decision and consent.
    expect(slugify('project:/Users/hendri/Development/acme-platform-frontend/apps/marketing')).toBe(
      slugify('project:/Users/hendri/Development/acme-platform-frontend/apps/dashboard'),
    );
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(60);
  });

  it('gives the same key for the same path every time', () => {
    const path = 'project:/Users/hendri/Development/some/rather/long/path/to/a/package/here';
    expect(scopeSlug(path)).toBe(scopeSlug(path));
  });

  it('always answers to something', () => {
    expect(scopeSlug('')).toBe('brand');
  });
});
