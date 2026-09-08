import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apca, LC_THRESHOLD } from '@/studio/engine/contrast';
import { OVERLAY } from '@/shared/theme';

/**
 * The panel's palette is Ship Studio's, adopted deliberately, and it does not
 * meet the APCA thresholds Codename holds scanned sites to.
 *
 * So this file stopped asserting a standard the palette does not reach and
 * started recording what it actually achieves. The numbers below are a pin: if
 * someone edits a token, the measurement moves and this fails, which is the
 * regression guard that matters. The one hard rule kept is the ladder — each
 * ink level must stay dimmer than the one above it, or the hierarchy the
 * palette exists to express has stopped working.
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
const lc = (text: string, on: string) => Math.round(Math.abs(apca(text, on)));

it('defines every token both themes need', () => {
  expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
});

describe.each(Object.entries(themes))('%s theme', (name, t) => {
  const surfaces = ['surface-app', 'surface-panel', 'surface-control', 'surface-recessed', 'surface-raised'];

  it.each(surfaces)('keeps the ink ladder in order on %s', (surface) => {
    const on = t[surface]!;
    const ladder = ['ink', 'ink-secondary', 'ink-muted', 'ink-faint'].map((k) => lc(t[k]!, on));
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i], `${surface}: level ${i} must be dimmer than level ${i - 1}`).toBeLessThan(
        ladder[i - 1]!,
      );
    }
  });

  it('keeps text on an accent or status fill readable', () => {
    // The one place the old thresholds still apply: a label sitting on a
    // coloured fill has no other cue to fall back on.
    expect(lc(t['accent-ink']!, t.accent!)).toBeGreaterThanOrEqual(LC_THRESHOLD.ui);
    expect(lc(t['warn-ink']!, t['warn-soft']!)).toBeGreaterThanOrEqual(LC_THRESHOLD.ui);
  });

  it('gives the in-page overlay the same accent and surfaces', () => {
    const overlay = OVERLAY[name as 'dark' | 'light'];
    expect(overlay.accent).toBe(t.accent);
    expect(overlay.cardBg).toBe(t['surface-panel']);
    expect(overlay.cardInk).toBe(t.ink);
    expect(overlay.cardMuted).toBe(t['ink-muted']);
  });
});

/**
 * What the adopted palette actually measures, on the panel's own surface.
 * Body copy wants Lc 75 and the panel's previous floor for small text was 45;
 * neither is met here, and that is the cost of matching Ship Studio.
 */
it('records the contrast this palette actually achieves', () => {
  const t = themes.dark;
  expect({
    ink: lc(t.ink!, t['surface-panel']!),
    secondary: lc(t['ink-secondary']!, t['surface-panel']!),
    muted: lc(t['ink-muted']!, t['surface-panel']!),
    faint: lc(t['ink-faint']!, t['surface-panel']!),
  }).toEqual({ ink: 65, secondary: 45, muted: 29, faint: 12 });
  expect(LC_THRESHOLD.body).toBe(75);
});
