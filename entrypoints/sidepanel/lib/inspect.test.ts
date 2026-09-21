import { describe, expect, it } from 'vitest';
import { paddingShorthand, readValue } from './inspect';
import { element } from '../test/chromeStub';

describe('paddingShorthand', () => {
  const box = (t: string, r: string, b: string, l: string) => ({
    paddingTop: t,
    paddingRight: r,
    paddingBottom: b,
    paddingLeft: l,
  });

  it('collapses to the shortest form that says the same thing', () => {
    expect(paddingShorthand(box('8px', '8px', '8px', '8px'))).toBe('8px');
    expect(paddingShorthand(box('8px', '16px', '8px', '16px'))).toBe('8px 16px');
    expect(paddingShorthand(box('8px', '16px', '4px', '16px'))).toBe('8px 16px 4px 16px');
    expect(paddingShorthand(box('0px', '0px', '0px', '0px'))).toBe('0');
  });
});

describe('the effects and motion properties', () => {
  it('reads each one back off the element, so an edit knows what it changed', () => {
    // Without this the brief said `transition: `` → `opacity 320ms``, which
    // states that the page had none when it may have had one.
    const el = element({ shadow: '0px 2px 4px #000', filter: 'blur(4px)', backdropFilter: 'none', transition: 'opacity 0.2s ease-out 0s' });
    expect(readValue(el, 'box-shadow')).toBe('0px 2px 4px #000');
    expect(readValue(el, 'filter')).toBe('blur(4px)');
    expect(readValue(el, 'backdrop-filter')).toBe('none');
    expect(readValue(el, 'transition')).toBe('opacity 0.2s ease-out 0s');
  });
});
