import { describe, expect, it } from 'vitest';
import { canNudge, nudge, nudgeByDrag, nudgeByKey } from './nudgeValue';

describe('nudge', () => {
  it('moves px, % and plain numbers by 1, or 8 with Shift', () => {
    expect(nudge('padding-top', '12px', 1)).toBe('13px');
    expect(nudge('padding-top', '12px', 1, true)).toBe('20px');
    expect(nudge('width', '50%', -1)).toBe('49%');
    expect(nudge('z-index', '3', 1)).toBe('4');
  });

  it('moves rem and em by an eighth, or 1 with Shift', () => {
    expect(nudge('font-size', '1rem', 1)).toBe('1.125rem');
    expect(nudge('letter-spacing', '0.5em', -1, true)).toBe('-0.5em');
  });

  it('moves a weight by 100 and keeps it between 1 and 1000', () => {
    expect(nudge('font-weight', '400', 1)).toBe('500');
    expect(nudge('font-weight', '950', 1)).toBe('1000');
    expect(nudge('font-weight', '50', -1)).toBe('1');
  });

  it('moves a percentage line-height by 10', () => {
    expect(nudge('line-height', '120%', 1)).toBe('130%');
  });

  it('keeps padding, gap and radius at zero or more; margins may go negative', () => {
    expect(nudge('padding-left', '0px', -1)).toBe('0px');
    expect(nudge('row-gap', '0px', -1)).toBe('0px');
    expect(nudge('border-radius', '0px', -1)).toBe('0px');
    expect(nudge('margin-top', '0px', -1)).toBe('-1px');
  });

  it('moves opacity by 1% or 10%, in the form it came in', () => {
    expect(nudge('opacity', '1', -1)).toBe('0.99');
    expect(nudge('opacity', '0.5', 1, true)).toBe('0.6');
    expect(nudge('opacity', '100%', 1)).toBe('100%');
  });

  it("uses the field's own step for a property it does not know", () => {
    expect(nudge('', '200ms', 1, false, 10)).toBe('210ms');
    expect(nudge('', '200ms', 1, true, 10)).toBe('280ms');
  });

  it('leaves what is not a number alone', () => {
    expect(nudge('width', 'auto', 1)).toBeNull();
    expect(nudge('color', 'var(--ink)', 1)).toBeNull();
    expect(canNudge('normal')).toBe(false);
    expect(canNudge('-2.5px')).toBe(true);
  });
});

describe('nudgeByKey', () => {
  it('snaps to the large grid on Shift before stepping along it', () => {
    expect(nudgeByKey('padding-top', '13px', 1, true)).toBe('16px');
    expect(nudgeByKey('padding-top', '16px', 1, true)).toBe('24px');
    expect(nudgeByKey('padding-top', '13px', -1, true)).toBe('8px');
    expect(nudgeByKey('opacity', '0.97', -1, true)).toBe('0.9');
  });
});

describe('nudgeByDrag', () => {
  it('takes one step per 16px of drag', () => {
    expect(nudgeByDrag('width', '100px', 10)).toBeNull();
    expect(nudgeByDrag('width', '100px', 16)).toBe('101px');
    expect(nudgeByDrag('width', '100px', -48)).toBe('97px');
  });

  it('takes one large step per 8px with Shift, the first onto the grid', () => {
    expect(nudgeByDrag('width', '13px', 8, true)).toBe('16px');
    expect(nudgeByDrag('width', '13px', 24, true)).toBe('32px');
  });
});
