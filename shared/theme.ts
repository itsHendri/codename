/**
 * Colours the in-page overlay paints with. It renders inside the site, in a
 * closed shadow root, where the panel's stylesheet cannot reach — so the
 * values are literals here, and theme.test.ts checks they match style.css.
 */
export const OVERLAY = {
  dark: {
    accent: '#6bb3ff',
    accentWash: 'rgba(107, 179, 255, 0.12)',
    cardBg: '#302d2b',
    cardInk: '#edebe7',
    cardMuted: '#a5a19b',
    cardLine: '#504c48',
  },
  light: {
    accent: '#2563eb',
    accentWash: 'rgba(37, 99, 235, 0.08)',
    cardBg: '#ffffff',
    cardInk: '#14110d',
    cardMuted: '#67635d',
    cardLine: '#d6d4d0',
  },
} as const;

export type OverlayTheme = keyof typeof OVERLAY;
