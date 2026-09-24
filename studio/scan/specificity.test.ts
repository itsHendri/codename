import { describe, expect, it } from 'vitest';
import { compare, specificity } from './specificity';

describe('specificity', () => {
  it.each<[string, [number, number, number]]>([
    ['*', [0, 0, 0]],
    ['h1', [0, 0, 1]],
    ['h1 + p', [0, 0, 2]],
    ['.card', [0, 1, 0]],
    ['.card .title', [0, 2, 0]],
    ['#title', [1, 0, 0]],
    ['h1#title.big', [1, 1, 1]],
    ['a[href]', [0, 1, 1]],
    ["[data-theme='dark'] .x", [0, 2, 0]],
    ['li:first-child', [0, 1, 1]],
    ['li:nth-child(2n+1)', [0, 1, 1]],
    ['li:nth-child(2 of .x)', [0, 2, 1]],
    ['p::before', [0, 0, 2]],
    ['p:before', [0, 0, 2]],
    [':root', [0, 1, 0]],
    [':root:not([data-theme="light"])', [0, 2, 0]],
    [':is(#a, .b) span', [1, 0, 1]],
    [':where(.a, #b) span', [0, 0, 1]],
    ['.a:has(> img)', [0, 1, 1]],
    [':is(.card) .title', [0, 2, 0]],
    ['.a\\:hover', [0, 1, 0]],
  ])('%s is %j', (sel, expected) => {
    expect(specificity(sel)).toEqual(expected);
  });

  it('orders as the cascade does', () => {
    expect(compare([0, 1, 0], [0, 0, 5])).toBeGreaterThan(0);
    expect(compare([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(compare([0, 1, 1], [0, 1, 1])).toBe(0);
  });
});
