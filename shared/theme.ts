/**
 * Colours the in-page overlay paints with. It renders inside the site, in a
 * closed shadow root, where the panel's stylesheet cannot reach — so the
 * values are literals here, and theme.test.ts checks they match style.css.
 */
export const OVERLAY = {
  dark: {
    accent: '#6bb5ff',
    accentWash: 'rgba(107, 181, 255, 0.14)',
    cardBg: '#1a1a1a',
    cardInk: '#bcbcbc',
    cardMuted: '#767676',
    cardLine: '#393939',
  },
  light: {
    accent: '#006acc',
    accentWash: 'rgba(0, 106, 204, 0.10)',
    cardBg: '#ffffff',
    cardInk: '#303030',
    cardMuted: '#767676',
    cardLine: '#dcdcdc',
  },
} as const;

export type OverlayTheme = keyof typeof OVERLAY;
