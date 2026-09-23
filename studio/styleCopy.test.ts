import { describe, expect, it } from 'vitest';
import { pasteEdits } from './styleCopy';

describe('pasteEdits', () => {
  it('makes one edit per property that differs, and leaves the rest', () => {
    const source = { color: '#ffffff', 'background-color': '#be3a22', 'font-weight': '600', 'padding-top': '8px' };
    const target = { color: '#ffffff', 'background-color': '#e7e4db', 'font-weight': '400', 'padding-top': '8px' };
    expect(pasteEdits(source, target)).toEqual([
      { property: 'font-weight', from: '400', to: '600' },
      { property: 'background-color', from: '#e7e4db', to: '#be3a22' },
    ]);
  });

  it('carries nothing it could not read on both sides', () => {
    expect(pasteEdits({ color: '' }, { color: '#000' })).toEqual([]);
    expect(pasteEdits({ color: '#000' }, {})).toEqual([]);
  });

  it('never carries position or size', () => {
    const edits = pasteEdits({ width: '10px', 'margin-top': '4px' } as never, { width: '20px', 'margin-top': '0px' } as never);
    expect(edits).toEqual([]);
  });
});
