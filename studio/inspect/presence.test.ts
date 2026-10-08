import { describe, expect, it } from 'vitest';
import type { ElementProps } from '@/shared/types';
import { element } from '@/entrypoints/sidepanel/test/chromeStub';
import { isTransparent, presence, removals } from './presence';

const el = (over: Record<string, unknown> = {}) => element(over) as unknown as ElementProps;
const bare = () =>
  el({
    box: { ...element().box, paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' },
    color: { text: '#15171B', background: '#FFFFFF', border: '#CBC7BC', fill: 'rgba(0, 0, 0, 0)' },
  });

describe('presence', () => {
  it('folds what a plain heading leaves empty', () => {
    expect(presence(bare())).toEqual({
      padding: false,
      margin: false,
      background: false,
      border: false,
      shadow: false,
      effects: false,
      motion: false,
    });
  });

  it('opens what the page sets', () => {
    const p = presence(
      el({
        border: { width: '1px', style: 'solid', color: '#000' },
        shadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.1)',
        transform: 'matrix(1, 0, 0, 1, 10, 0)',
        transition: 'opacity 0.2s ease 0s',
      }),
    );
    expect(p.padding).toBe(true);
    expect(p.background).toBe(true);
    expect(p.border).toBe(true);
    expect(p.shadow).toBe(true);
    expect(p.effects).toBe(true);
    expect(p.motion).toBe(true);
  });

  it('opens what this panel has written, even where the page reads as nothing', () => {
    expect(presence(bare(), { 'padding-top': '0px', 'box-shadow': 'none' })).toMatchObject({ padding: true, shadow: true });
  });

  it('keeps Background open when the inspector did not say what the element paints', () => {
    expect(presence(el({ color: { text: '#000', background: '#fff', border: '#000' } })).background).toBe(true);
  });

  it('reads a solid style at zero width as no border', () => {
    expect(presence(el({ border: { width: '0px', style: 'solid', color: '#000' } })).border).toBe(false);
  });
});

describe('removals', () => {
  it('takes back only the sides that are set', () => {
    expect(removals(el(), 'padding')).toEqual([
      ['padding-top', '0px'],
      ['padding-right', '0px'],
      ['padding-bottom', '0px'],
      ['padding-left', '0px'],
    ]);
    expect(removals(el({ transform: 'matrix(1, 0, 0, 1, 10, 0)' }), 'effects')).toEqual([['transform', 'none']]);
    expect(removals(el({ transition: 'opacity 0.2s ease 0s' }), 'motion')).toEqual([['transition', 'none']]);
  });
});

describe('isTransparent', () => {
  it('knows the spellings of nothing', () => {
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true);
    expect(isTransparent('transparent')).toBe(true);
    expect(isTransparent('#FFFFFF00')).toBe(true);
    expect(isTransparent('rgb(0 0 0 / 0)')).toBe(true);
    expect(isTransparent('rgb(231, 228, 219)')).toBe(false);
  });
});
