/**
 * Whether the panel is running in the page rather than in Chrome's side
 * panel, and for which tab.
 *
 * The panel is one app with two homes. In Chrome's side panel it follows
 * whichever tab is active in its window. Drawn in the page — an iframe the
 * `panel` content script docks on the right, under the bar — it belongs to
 * the one tab it was drawn in, which the script names in the URL
 * (`sidepanel.html?tab=42`). The side panel remains for pages Chrome will not
 * let an extension draw in.
 */
export function embeddedTab(search: string = typeof location === 'undefined' ? '' : location.search): number | null {
  const id = Number(new URLSearchParams(search).get('tab'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The in-page panel's width: Chrome's side panel floor to a comfortable two thirds of a laptop. */
export const PANEL_DEFAULT = 360;
export const PANEL_MIN = 320;
export const PANEL_MAX = 520;
export const clampPanel = (w: number) => Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(w)));

const RESTRICTED_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

/** A page Chrome will not let an extension read or draw in. */
export function isRestricted(url: string | undefined): boolean {
  if (!url) return true;
  if (RESTRICTED_PREFIXES.some((p) => url.startsWith(p))) return true;
  if (url.startsWith('https://chromewebstore.google.com')) return true;
  return false;
}
