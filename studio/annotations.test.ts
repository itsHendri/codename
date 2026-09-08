import { describe, expect, it } from 'vitest';
import { describeTarget, selectorsOf, targetKindLabel, type CommentTarget } from './annotations';

const element: CommentTarget = { kind: 'element', selector: '.btn', matches: 1 };
const many: CommentTarget = { kind: 'element', selector: 'a.btn', matches: 3 };
const set: CommentTarget = { kind: 'elements', selectors: ['.a', '.b', '.c'] };
const region: CommentTarget = {
  kind: 'region',
  rect: { x: 40.4, y: 120.6, width: 320.2, height: 180 },
  within: 'main',
};
const text: CommentTarget = { kind: 'text', selector: '.hero p', quote: 'the quick brown' };

describe('describeTarget', () => {
  it('names one element, and says when the selector covers several', () => {
    expect(describeTarget(element)).toBe('.btn');
    expect(describeTarget(many)).toBe('a.btn (3 elements)');
  });

  it('lists a set', () => {
    expect(describeTarget(set)).toBe('3 elements: .a, .b, .c');
  });

  it('gives a region its size and place, rounded', () => {
    expect(describeTarget(region)).toBe('a 320 × 180 region at 40, 121, inside main');
    expect(describeTarget({ ...region, within: undefined })).toBe('a 320 × 180 region at 40, 121');
  });

  it('quotes the text and says where it lives', () => {
    expect(describeTarget(text)).toBe('"the quick brown" in .hero p');
  });
});

describe('selectorsOf', () => {
  it('gives the pins something to anchor to, and nothing for a free region', () => {
    expect(selectorsOf(element)).toEqual(['.btn']);
    expect(selectorsOf(set)).toEqual(['.a', '.b', '.c']);
    expect(selectorsOf(text)).toEqual(['.hero p']);
    expect(selectorsOf(region)).toEqual(['main']);
    expect(selectorsOf({ ...region, within: undefined })).toEqual([]);
  });
});

describe('targetKindLabel', () => {
  it('is one word, or a count', () => {
    expect(targetKindLabel(element)).toBe('element');
    expect(targetKindLabel(set)).toBe('3 elements');
    expect(targetKindLabel(region)).toBe('region');
    expect(targetKindLabel(text)).toBe('text');
  });
});
