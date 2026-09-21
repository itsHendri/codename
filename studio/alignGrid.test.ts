import { describe, expect, it } from 'vitest';
import { cellOf, valuesFor } from './alignGrid';

describe('the alignment grid', () => {
  it('maps a row stack: columns are justify, rows are align', () => {
    expect(cellOf('flex-start', 'flex-start', 'row')).toEqual({ row: 0, col: 0 });
    expect(cellOf('center', 'center', 'row')).toEqual({ row: 1, col: 1 });
    expect(cellOf('flex-end', 'stretch', 'row')).toEqual({ row: 0, col: 2 });
    expect(valuesFor({ row: 2, col: 1 }, 'row')).toEqual({ justifyContent: 'center', alignItems: 'flex-end' });
  });

  it('maps a column stack the other way round', () => {
    expect(cellOf('flex-end', 'center', 'column')).toEqual({ row: 2, col: 1 });
    expect(valuesFor({ row: 0, col: 2 }, 'column')).toEqual({ justifyContent: 'flex-start', alignItems: 'flex-end' });
  });

  it('flips the main axis for a reversed direction, so the cell is still where the children go', () => {
    expect(cellOf('flex-start', 'flex-start', 'row-reverse')).toEqual({ row: 0, col: 2 });
    expect(valuesFor({ row: 0, col: 2 }, 'row-reverse')).toEqual({ justifyContent: 'flex-start', alignItems: 'flex-start' });
  });

  it('has no cell while the children are distributed', () => {
    expect(cellOf('space-between', 'center', 'row')).toBeNull();
    expect(cellOf('normal', 'normal', 'row')).toEqual({ row: 0, col: 0 });
  });

  it('round-trips every cell in both directions', () => {
    for (const direction of ['row', 'column', 'row-reverse', 'column-reverse']) {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const v = valuesFor({ row, col }, direction);
          expect(cellOf(v.justifyContent, v.alignItems, direction)).toEqual({ row, col });
        }
      }
    }
  });
});
