/**
 * The panel's face for what Codename draws in the page (the rail, the bar).
 *
 * A shadow root cannot declare a face of its own (Chrome only honours
 * @font-face from the document), so the face is added to the document's font
 * set under a name no page uses, `Codename Inter`, and the page's own text
 * can never pick it up by accident. A page whose CSP refuses extension fonts
 * keeps the system face the stack falls back to.
 */

import type { PublicPath } from 'wxt/browser';

const FAMILY = 'Codename Inter';

const SUBSETS: { file: PublicPath; unicodeRange: string }[] = [
  {
    file: '/fonts/InterVariable-latin.woff2',
    unicodeRange:
      'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  },
  {
    file: '/fonts/InterVariable-latin-ext.woff2',
    unicodeRange:
      'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  },
];

export const INPAGE_FONT = `'${FAMILY}', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`;

let added = false;

export function addInpageFont(): void {
  if (added || typeof FontFace === 'undefined' || !document.fonts) return;
  added = true;
  for (const { file, unicodeRange } of SUBSETS) {
    try {
      const face = new FontFace(FAMILY, `url(${chrome.runtime.getURL(file)}) format('woff2')`, {
        weight: '100 900',
        unicodeRange,
      });
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch {
      // No runtime (the harness page) or a refused URL: the stack falls back.
    }
  }
}
