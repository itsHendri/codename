import { describe, expect, it } from 'vitest';
import {
  active,
  canRedo,
  canUndo,
  commit,
  emptyLog,
  grouped,
  redo,
  revert,
  toRules,
  toTextEdits,
  undo,
} from './changes';

const base = { selector: '.btn', matches: 1, stable: true, property: 'padding-top', from: '8px' };

describe('commit', () => {
  it('appends an applied entry and moves the cursor', () => {
    const log = commit(emptyLog(), { ...base, to: '12px' }, 1000);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ status: 'applied', to: '12px', from: '8px' });
    expect(log.cursor).toBe(1);
  });

  it('coalesces a scrub into one entry that undoes back to the start', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(log, { ...base, to: '10px' }, 1100);
    log = commit(log, { ...base, to: '11px' }, 1300);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ from: '8px', to: '11px' });
    expect(toRules(log)).toEqual([{ selector: '.btn', property: 'padding-top', value: '11px' }]);
  });

  it('does not coalesce across the window or across properties', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(log, { ...base, to: '10px' }, 2000);
    log = commit(log, { ...base, property: 'color', from: '#000', to: '#fff' }, 2001);
    expect(log.entries).toHaveLength(3);
  });

  it('discards the undone branch on a new commit', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(log, { ...base, property: 'color', from: '#000', to: '#fff' }, 2000);
    log = undo(log);
    log = commit(log, { ...base, property: 'margin-top', from: '0px', to: '4px' }, 3000);
    expect(log.entries.map((e) => e.property)).toEqual(['padding-top', 'margin-top']);
    expect(canRedo(log)).toBe(false);
  });
});

describe('undo / redo / revert', () => {
  it('moves the cursor without losing entries', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(log, { ...base, property: 'color', from: '#000', to: '#fff' }, 2000);
    expect(canUndo(log)).toBe(true);
    log = undo(log);
    expect(toRules(log)).toEqual([{ selector: '.btn', property: 'padding-top', value: '9px' }]);
    log = redo(log);
    expect(toRules(log)).toHaveLength(2);
    expect(undo(undo(undo(log))).cursor).toBe(0);
  });

  it('reverts one change and leaves the rest in force', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(log, { ...base, property: 'color', from: '#000', to: '#fff' }, 2000);
    log = revert(log, log.entries[0]!.id);
    expect(active(log).map((e) => e.property)).toEqual(['color']);
    expect(log.entries[0]!.status).toBe('reverted');
  });
});

describe('derived views', () => {
  it('separates text edits from rules and groups by selector newest first', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(
      log,
      { selector: 'h1', matches: 1, stable: true, property: 'text', from: 'Hi', to: 'Hello' },
      2000,
    );
    expect(toTextEdits(log)).toEqual([{ selector: 'h1', text: 'Hello' }]);
    expect(toRules(log)).toHaveLength(1);
    expect(grouped(log).map((g) => g.selector)).toEqual(['h1', '.btn']);
  });

  it('carries a shorthand through to the page untouched', () => {
    const log = commit(emptyLog(), { ...base, property: 'padding', from: '8px 16px', to: '12px' }, 1000);
    expect(toRules(log)).toEqual([{ selector: '.btn', property: 'padding', value: '12px' }]);
  });

  it('last write wins per selector and property in the rule list', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(log, { ...base, to: '20px' }, 5000);
    expect(toRules(log)).toEqual([{ selector: '.btn', property: 'padding-top', value: '20px' }]);
  });
});
