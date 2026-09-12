import { describe, expect, it } from 'vitest';
import { countFocusOutlineRemoved } from './a11y';

describe('countFocusOutlineRemoved', () => {
  it('counts rules that remove the ring on :focus, in any spelling', () => {
    expect(countFocusOutlineRemoved('.btn:focus { outline: none; } a:focus-visible{outline:0} input:focus { outline: 0px }')).toBe(3);
  });

  it('does not count the pattern that keeps the ring for the keyboard', () => {
    expect(countFocusOutlineRemoved('.btn:focus:not(:focus-visible) { outline: none; }')).toBe(0);
    expect(countFocusOutlineRemoved(':focus { outline: 2px solid red }')).toBe(0);
  });
});
