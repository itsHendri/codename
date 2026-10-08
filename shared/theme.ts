/**
 * Colours the in-page overlay paints with. It renders inside the site, in a
 * closed shadow root, where the panel's stylesheet cannot reach — so the
 * values are literals here, and theme.test.ts checks each one against the
 * token it stands for in shared/tokens.css. The bar is chrome like the rail
 * and the panel's tab strip, so it sits on `surface-app` with a `line` edge,
 * which is what the rail's strip wears; cards float on `surface-panel`.
 */
export const OVERLAY = {
  dark: {
    accent: '#57b6ff',
    accentWash: 'rgba(87, 182, 255, 0.14)',
    cardBg: '#1e1e1e',
    cardInk: '#e8e8e8',
    cardMuted: '#878787',
    cardLine: '#2a2a2a',
    chromeBg: '#161616',
    field: '#242424',
    fieldHover: '#2e2e2e',
    thumb: '#3a3a3a',
  },
  light: {
    accent: '#0096ff',
    accentWash: 'rgba(0, 150, 255, 0.12)',
    cardBg: '#ffffff',
    cardInk: '#242424',
    cardMuted: '#777777',
    cardLine: '#dcdcdb',
    chromeBg: '#f5f5f4',
    field: '#e9e9e8',
    fieldHover: '#dddddc',
    thumb: '#ffffff',
  },
} as const;

export type OverlayTheme = keyof typeof OVERLAY;

/**
 * The strip across the top of the page and the panel's tab bar share this
 * height, so the two read as one piece of chrome rather than two tools.
 */
export const BAR_HEIGHT = 40;
