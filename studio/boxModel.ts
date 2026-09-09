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
