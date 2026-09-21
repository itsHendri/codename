/**
 * Four sides as the shortest shorthand that says the same thing, units kept:
 * `8px` when all agree, `8px 16px` when the pairs do, all four otherwise.
 * Shared by the panel's change log and the card on the page, which must show
 * and record the same value for the same box.
 */
export function paddingShorthand(box: {
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
}): string {
  const z = (v: string) => (v === '0px' ? '0' : v);
  const [t, r, b, l] = [box.paddingTop, box.paddingRight, box.paddingBottom, box.paddingLeft].map(z);
  if (t === r && r === b && b === l) return t!;
  if (t === b && r === l) return `${t} ${r}`;
  return `${t} ${r} ${b} ${l}`;
}

/**
 * A computed length as a design tool shows it: pixel values to two decimals,
 * everything else as it came. `getComputedStyle` reports `96.6641px` where
 * Figma and Framer show `96.66`, and a field that scrubs from `96.6641` to
 * `97.6641` reads as broken. Only `px` is touched: an `em`, a `%` or a
 * keyword already means what it says.
 */
export function roundPx(value: string): string {
  return value.replace(/(-?\d+\.\d{3,})px\b/g, (_m, n: string) => `${Math.round(parseFloat(n) * 100) / 100}px`);
}
