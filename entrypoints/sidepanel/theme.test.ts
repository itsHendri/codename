import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apca, LC_THRESHOLD } from '@/studio/engine/contrast';
import { OVERLAY } from '@/shared/theme';

/**
 * The panel audits sites for contrast; this holds it to the same standard.
 * Both token blocks are parsed straight out of style.css.
 */
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `block ${selector}`).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    Array.from(body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g), (m) => [m[1], m[2]]),
  );
}

const themes = { dark: tokens(':root'), light: tokens(":root[data-theme='light']") };

describe.each(Object.entries(themes))('%s theme', (name, t) => {
  const surfaces = ['surface-app', 'surface-panel', 'surface-control', 'surface-recessed', 'surface-raised'];

  it('defines every token both themes need', () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });

  it.each(surfaces)('ink levels clear their Lc floor on %s', (surface) => {
    expect(Math.abs(apca(t.ink!, t[surface]!))).toBeGreaterThanOrEqual(LC_THRESHOLD.body);
    expect(Math.abs(apca(t['ink-secondary']!, t[surface]!))).toBeGreaterThanOrEqual(LC_THRESHOLD.ui);
    // Muted is for labels and hints — small text, but still text.
    expect(Math.abs(apca(t['ink-muted']!, t[surface]!))).toBeGreaterThanOrEqual(45);
    // Faint is for chrome: dismiss buttons, dividers with a glyph.
    expect(Math.abs(apca(t['ink-faint']!, t[surface]!))).toBeGreaterThanOrEqual(LC_THRESHOLD['non-text']);
  });

  it('keeps text readable on accent and status fills', () => {
    expect(Math.abs(apca(t['accent-ink']!, t.accent!))).toBeGreaterThanOrEqual(LC_THRESHOLD.ui);
    expect(Math.abs(apca(t['warn-ink']!, t['warn-soft']!))).toBeGreaterThanOrEqual(LC_THRESHOLD.ui);
    // Accent text is short UI labels (links, the active tab), never body copy.
    expect(Math.abs(apca(t.accent!, t['surface-panel']!))).toBeGreaterThanOrEqual(45);
  });

  it('gives the in-page overlay the same accent', () => {
    expect(OVERLAY[name as 'dark' | 'light'].accent).toBe(t.accent);
  });
});

it('light values in the system-preference fallback match the explicit light block', () => {
  const start = css.indexOf(':root:not([data-theme])');
  const body = css.slice(start, css.indexOf('}', start));
  for (const [k, v] of Object.entries(themes.light)) expect(body).toContain(`--${k}: ${v};`);
});
