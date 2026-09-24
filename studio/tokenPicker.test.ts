import { describe, expect, it } from 'vitest';
import type { CustomPropInfo } from '@/shared/types';
import { filterTokens, rankTokens } from './tokenPicker';

const props: CustomPropInfo[] = [
  { name: '--gray-500', value: '#777', uses: 3 },
  { name: '--blue-50', value: '#eef', uses: 1 },
  { name: '--ink', value: '#15171b', uses: 41 },
  { name: '--ink-muted', value: 'var(--gray-500)', alias: ['--gray-500'], resolved: '#777', uses: 12 },
  { name: '--vermilion', value: '#be3a22', uses: 2 },
  { name: '--space-4', value: '16px', uses: 20 },
  { name: '--radius-2', value: '4px', uses: 5 },
  { name: '--shadow-1', value: '0 1px 2px rgb(0 0 0 / 0.2)', uses: 4 },
  { name: '--ease', value: 'cubic-bezier(.2,.7,.2,1)', uses: 2 },
];

describe('rankTokens', () => {
  it('puts roles first, plain names next, ramp steps last, and leaves other kinds out', () => {
    const r = rankTokens(props, 'color');
    expect(r.semantic.map((p) => p.name)).toEqual(['--ink', '--ink-muted']);
    expect(r.other.map((p) => p.name)).toEqual(['--vermilion']);
    expect(r.primitive.map((p) => p.name)).toEqual(['--blue-50', '--gray-500']);
  });
  it('counts an alias as semantic even when its name looks like a step', () => {
    const r = rankTokens([{ name: '--accent-500', value: 'var(--blue-500)', alias: ['--blue-500'], resolved: '#00f' }], 'color');
    expect(r.semantic).toHaveLength(1);
  });
  it('ranks lengths by their kind', () => {
    const r = rankTokens(props, 'length');
    expect([...r.semantic, ...r.other, ...r.primitive].map((p) => p.name).sort()).toEqual(['--radius-2', '--space-4']);
  });
});

describe('filterTokens', () => {
  it('filters every group by name or value', () => {
    const r = filterTokens(rankTokens(props, 'color'), 'ink');
    expect(r.semantic.map((p) => p.name)).toEqual(['--ink', '--ink-muted']);
    expect(r.primitive).toEqual([]);
    expect(filterTokens(rankTokens(props, 'color'), '#777').semantic.map((p) => p.name)).toEqual(['--ink-muted']);
  });
});
