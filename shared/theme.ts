/**
 * Colours the in-page overlay paints with. It renders inside the site, in a
 * closed shadow root, where the panel's stylesheet cannot reach — so the
 * values are literals here, and theme.test.ts checks they match style.css.
 */
export const OVERLAY = {
  dark: {
    accent: '#46e76f',
    accentWash: 'rgba(70, 231, 111, 0.12)',
    cardBg: '#1a1a1a',
    cardInk: '#bcbcbc',
    cardMuted: '#767676',
    cardLine: '#393939',
  },
  light: {
    accent: '#1f9a3f',
    accentWash: 'rgba(31, 154, 63, 0.10)',
    cardBg: '#ffffff',
    cardInk: '#303030',
    cardMuted: '#767676',
    cardLine: '#dcdcdc',
  },
} as const;

export type OverlayTheme = keyof typeof OVERLAY;
