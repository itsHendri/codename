import { describe, expect, it } from 'vitest';
import { plainVar, resolveAlias } from './alias';

const table: Record<string, string> = {
  '--mark': '#be3a22',
  '--button-bg': 'var(--mark)',
  '--cta': 'var(--button-bg)',
  '--loop-a': 'var(--loop-b)',
  '--loop-b': 'var(--loop-a)',
  '--pad': 'calc(var(--space) * 2)',
  '--space': '8px',
  '--missing-fallback': 'var(--nope, #fff)',
};
const lookup = (name: string) => table[name];

describe('plainVar', () => {
  it('reads a bare reference and its fallback', () => {
    expect(plainVar('var(--x)')).toEqual({ name: '--x', fallback: null });
    expect(plainVar(' var( --x , #fff ) ')).toEqual({ name: '--x', fallback: '#fff' });
    expect(plainVar('var(--x, rgb(0 0 0))')).toEqual({ name: '--x', fallback: 'rgb(0 0 0)' });
  });
  it('is null for anything that is not one var() on its own', () => {
    expect(plainVar('calc(var(--x) * 2)')).toBeNull();
    expect(plainVar('var(--x) var(--y)')).toBeNull();
    expect(plainVar('#fff')).toBeNull();
  });
});

describe('resolveAlias', () => {
  it('follows a chain to the literal', () => {
    expect(resolveAlias(table['--cta']!, lookup)).toEqual({ chain: ['--button-bg', '--mark'], resolved: '#be3a22' });
  });
  it('is empty for a literal', () => {
    expect(resolveAlias('#be3a22', lookup)).toEqual({ chain: [], resolved: null });
  });
  it('is empty for a computed value that merely contains a var()', () => {
    expect(resolveAlias(table['--pad']!, lookup)).toEqual({ chain: [], resolved: null });
  });
  it('gives up on a cycle', () => {
    expect(resolveAlias(table['--loop-a']!, lookup)).toEqual({ chain: ['--loop-b', '--loop-a'], resolved: null });
  });
  it('takes a literal fallback when the name is not defined', () => {
    expect(resolveAlias(table['--missing-fallback']!, lookup)).toEqual({ chain: ['--nope'], resolved: '#fff' });
  });
});
