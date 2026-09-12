/**
 * Accessibility facts read from stylesheet text. The scanner counts what it
 * meets on its walk; this is the one count that lives in the CSS rather than
 * the DOM, kept here so it can be tested without a page.
 */

/**
 * Rules that take the focus ring away: `:focus { outline: none }` and its
 * spellings. `:focus:not(:focus-visible) { outline: none }` is the accepted
 * way to hide the ring for the mouse and keep it for the keyboard, so a
 * selector that names `:focus-visible` inside `:not(...)` is not counted.
 */
export function countFocusOutlineRemoved(cssText: string): number {
  let count = 0;
  for (const m of cssText.matchAll(/([^{}]*:focus[^{}]*)\{([^}]*)\}/gi)) {
    const selector = m[1] ?? '';
    const body = m[2] ?? '';
    if (/:not\([^)]*:focus-visible/i.test(selector)) continue;
    if (/\boutline\s*:\s*(?:none|0)(?:px)?\b/i.test(body)) count++;
  }
  return count;
}
