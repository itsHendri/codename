import { describe, expect, it } from 'vitest';
import { matchScore, search, shortcutSheet } from './commands';

describe('the shortcut sheet', () => {
  it('prints the modifier the platform uses', () => {
    const mac = shortcutSheet(true).flatMap((g) => g.items.map((i) => i.keys)).join(' ');
    const pc = shortcutSheet(false).flatMap((g) => g.items.map((i) => i.keys)).join(' ');
    expect(mac).toContain('⌘⌥C');
    expect(pc).toContain('Ctrl+Alt+C');
  });
});

describe('matching a command', () => {
  it('prefers words that start words, then a run, then letters in order', () => {
    expect(matchScore('wrap st', 'Wrap in a stack')).toBeGreaterThan(matchScore('ap in', 'Wrap in a stack')!);
    expect(matchScore('ap in', 'Wrap in a stack')).toBeGreaterThan(matchScore('wst', 'Wrap in a stack')!);
    expect(matchScore('zzz', 'Wrap in a stack')).toBeNull();
    // Two letters in order are in nearly everything; they are not a match.
    expect(matchScore('wr', 'Window size')).toBeNull();
  });

  it('searches a list, best first, and finds by other words too', () => {
    const items = [
      { label: 'Preview', also: 'visitor play' },
      { label: 'Paste style' },
      { label: 'Select parent' },
    ];
    expect(search(items, 'pa').map((i) => i.label)).toEqual(['Paste style', 'Select parent']);
    expect(search(items, 'play').map((i) => i.label)).toEqual(['Preview']);
    expect(search(items, '').map((i) => i.label)).toEqual(['Preview', 'Paste style', 'Select parent']);
  });
});
