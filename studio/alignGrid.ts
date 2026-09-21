/**
 * The 3×3 alignment grid every design tool draws, as `justify-content` and
 * `align-items`.
 *
 * Columns are the inline direction of the page and rows the block direction,
 * whatever the flex direction — so the cell you click is where the children
 * go, and the mapping to the two properties flips with the direction. The
 * distributing values (`space-between` and the rest) have no cell; they are
 * their own control, and while one is set the grid shows the cross axis only.
 */

export type Placement = 'start' | 'center' | 'end';
export interface Cell {
  /** 0 = top, 2 = bottom. */
  row: number;
  /** 0 = left, 2 = right. */
  col: number;
}

const PLACEMENTS: readonly Placement[] = ['start', 'center', 'end'];

const toPlacement = (v: string): Placement | null => {
  const s = v.trim();
  if (s === 'flex-start' || s === 'start' || s === 'normal' || s === 'stretch' || s === 'left') return 'start';
  if (s === 'center') return 'center';
  if (s === 'flex-end' || s === 'end' || s === 'right') return 'end';
  return null;
};

const toCss = (p: Placement) => (p === 'start' ? 'flex-start' : p === 'end' ? 'flex-end' : 'center');

/** Whether the direction runs down the page. */
const isColumn = (direction: string) => direction.startsWith('column');

/** The cell the two properties light up, or null when one of them distributes. */
export function cellOf(justifyContent: string, alignItems: string, direction: string): Cell | null {
  const main = toPlacement(justifyContent);
  const cross = toPlacement(alignItems);
  if (main === null || cross === null) return null;
  const flip = (p: Placement) => (p === 'start' ? 'end' : p === 'end' ? 'start' : p);
  const reversed = direction.endsWith('-reverse');
  const m = reversed ? flip(main) : main;
  return isColumn(direction)
    ? { row: PLACEMENTS.indexOf(m), col: PLACEMENTS.indexOf(cross) }
    : { row: PLACEMENTS.indexOf(cross), col: PLACEMENTS.indexOf(m) };
}

/** The two properties a cell means. */
export function valuesFor(cell: Cell, direction: string): { justifyContent: string; alignItems: string } {
  const rowP = PLACEMENTS[cell.row] ?? 'start';
  const colP = PLACEMENTS[cell.col] ?? 'start';
  const reversed = direction.endsWith('-reverse');
  const flip = (p: Placement) => (reversed ? (p === 'start' ? 'end' : p === 'end' ? 'start' : p) : p);
  return isColumn(direction)
    ? { justifyContent: toCss(flip(rowP)), alignItems: toCss(colP) }
    : { justifyContent: toCss(flip(colP)), alignItems: toCss(rowP) };
}
