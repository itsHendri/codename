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
    accent: '#6bb5ff',
    accentWash: 'rgba(107, 181, 255, 0.14)',
    cardBg: '#1a1a1a',
    cardInk: '#bcbcbc',
    cardMuted: '#767676',
    cardLine: '#303030',
    chromeBg: '#141414',
    field: '#222222',
    fieldHover: '#2a2a2a',
    thumb: '#393939',
  },
  light: {
    accent: '#006acc',
    accentWash: 'rgba(0, 106, 204, 0.10)',
    cardBg: '#ffffff',
    cardInk: '#303030',
    cardMuted: '#767676',
    cardLine: '#dcdcdc',
    chromeBg: '#fafafa',
    field: '#f0f0f0',
    fieldHover: '#e8e8e8',
    thumb: '#ffffff',
  },
} as const;

export type OverlayTheme = keyof typeof OVERLAY;

/**
 * The strip across the top of the page and the panel's tab bar share this
 * height, so the two read as one piece of chrome rather than two tools.
 */
export const BAR_HEIGHT = 40;
