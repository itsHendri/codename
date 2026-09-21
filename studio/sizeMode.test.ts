import { describe, expect, it } from 'vitest';
import { modeOf, onMainAxis, writeMode, type SizeEvidence } from './sizeMode';

const block = (over: Partial<SizeEvidence> = {}): SizeEvidence => ({
  axis: 'width',
  inFlex: false,
  parentDirection: 'row',
  flexGrow: '0',
  ...over,
});
const flexChild = (over: Partial<SizeEvidence> = {}): SizeEvidence => block({ inFlex: true, ...over });

describe('reading a size mode', () => {
  it('claims nothing from a computed pixel count alone', () => {
    expect(modeOf(block())).toBeNull();
    expect(modeOf(block({ axis: 'height' }))).toBeNull();
  });

  it('reads what this log wrote', () => {
    expect(modeOf(block({ written: '240px' }))).toBe('fixed');
    expect(modeOf(block({ written: '1.5rem' }))).toBe('fixed');
    expect(modeOf(block({ written: '50%' }))).toBe('relative');
    expect(modeOf(block({ written: 'fit-content' }))).toBe('fit');
    expect(modeOf(block({ written: 'max-content' }))).toBe('fit');
    expect(modeOf(block({ written: 'calc(100% - 2rem)' }))).toBeNull();
  });

  it('reads auto for what it means in block flow, and not at all on a flex main axis', () => {
    expect(modeOf(block({ written: 'auto' }))).toBe('fill');
    expect(modeOf(block({ axis: 'height', written: 'auto' }))).toBe('fit');
    expect(modeOf(flexChild({ written: 'auto' }))).toBeNull();
  });

  it('reads a growing flex child as filling its main axis only', () => {
    expect(modeOf(flexChild({ flexGrow: '1' }))).toBe('fill');
    expect(modeOf(flexChild({ flexGrow: '1', axis: 'height' }))).toBeNull();
    expect(modeOf(flexChild({ flexGrow: '1', axis: 'height', parentDirection: 'column' }))).toBe('fill');
    expect(modeOf(flexChild({ flexGrow: '0' }))).toBeNull();
    expect(modeOf(flexChild({ writtenFlex: '1 1 0%' }))).toBe('fill');
  });
});

describe('writing a size mode', () => {
  it('pins, fits and shares', () => {
    expect(writeMode('fixed', block(), 239.6, 1000)).toEqual([{ property: 'width', value: '240px' }]);
    expect(writeMode('fit', block(), 240, 1000)).toEqual([{ property: 'width', value: 'fit-content' }]);
    expect(writeMode('relative', block(), 333, 1000)).toEqual([{ property: 'width', value: '33.3%' }]);
    expect(writeMode('relative', block(), 500, 0)).toEqual([{ property: 'width', value: '100%' }]);
  });

  it('fills by growing on a flex main axis, stretching across it, and auto or 100% in block flow', () => {
    expect(writeMode('fill', flexChild(), 1, 1)).toEqual([{ property: 'flex', value: '1 1 0%' }]);
    expect(writeMode('fill', flexChild({ axis: 'height' }), 1, 1)).toEqual([
      { property: 'align-self', value: 'stretch' },
      { property: 'height', value: 'auto' },
    ]);
    expect(writeMode('fill', block(), 1, 1)).toEqual([{ property: 'width', value: 'auto' }]);
    expect(writeMode('fill', block({ axis: 'height' }), 1, 1)).toEqual([{ property: 'height', value: '100%' }]);
  });

  it('knows which axis is the main one', () => {
    expect(onMainAxis(block())).toBe(false);
    expect(onMainAxis(flexChild())).toBe(true);
    expect(onMainAxis(flexChild({ parentDirection: 'column-reverse' }))).toBe(false);
    expect(onMainAxis(flexChild({ axis: 'height', parentDirection: 'column-reverse' }))).toBe(true);
  });
});
