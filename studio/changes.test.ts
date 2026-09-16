import { describe, expect, it } from 'vitest';
import {
  revertAll,
  toMoves,
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

  it('reverts everything at once and keeps the history', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(log, { ...base, property: 'color', from: '#000', to: '#fff' }, 2000);
    log = revertAll(log);
    expect(active(log)).toEqual([]);
    expect(toRules(log)).toEqual([]);
    expect(log.entries).toHaveLength(2);
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

  it('keeps reorders out of the rules and lists them in order', () => {
    let log = commit(emptyLog(), { ...base, to: '9px' }, 1000);
    log = commit(
      log,
      { selector: 'article.card:nth-of-type(3)', matches: 1, stable: false, property: 'move', from: 'last in `main`', to: 'before `article.card:nth-of-type(1)`', move: { parent: 'main', before: 'article.card:nth-of-type(1)' } },
      2000,
    );
    expect(toRules(log)).toHaveLength(1);
    expect(toMoves(log)).toEqual([{ selector: 'article.card:nth-of-type(3)', parent: 'main', before: 'article.card:nth-of-type(1)' }]);
    expect(toMoves(undo(log))).toEqual([]);
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

describe('conditions in the log', () => {
  const hover = { kind: 'state', state: 'hover' } as const;
  const base = { selector: '.btn', matches: 1, stable: true, property: 'color', from: '#000', to: '#111' };

  it('does not coalesce across states, however fast the scrub', () => {
    const t = Date.now();
    let log = commit(emptyLog(), base, t);
    log = commit(log, { ...base, to: '#222', condition: hover }, t + 10);
    expect(log.entries).toHaveLength(2);
  });

  it('still coalesces inside one state', () => {
    const t = Date.now();
    let log = commit(emptyLog(), { ...base, condition: hover }, t);
    log = commit(log, { ...base, to: '#222', condition: hover }, t + 10);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.to).toBe('#222');
  });

  it('sends the default and the state rule to the page as two rules', () => {
    const t = Date.now();
    let log = commit(emptyLog(), base, t);
    log = commit(log, { ...base, to: '#222', condition: hover }, t + 1000);
    const rules = toRules(log);
    expect(rules).toHaveLength(2);
    expect(rules.find((r) => r.condition)?.value).toBe('#222');
    expect(rules.find((r) => !r.condition)?.value).toBe('#111');
  });

  it('refuses a condition on words and on markup order', () => {
    const t = Date.now();
    let log = commit(emptyLog(), { ...base, property: 'text', to: 'Hi', condition: hover }, t);
    log = commit(log, { ...base, property: 'move', to: 'after .x', move: { parent: '.p', before: null }, condition: hover }, t + 1000);
    expect(log.entries.every((e) => e.condition === undefined)).toBe(true);
  });

  it('undoes a state edit like any other', () => {
    const t = Date.now();
    let log = commit(emptyLog(), base, t);
    log = commit(log, { ...base, to: '#222', condition: hover }, t + 1000);
    log = undo(log);
    expect(toRules(log)).toHaveLength(1);
    expect(toRules(log)[0]?.condition).toBeUndefined();
  });
});

describe('a log read back from storage', () => {
  it('keeps a condition it recognises', () => {
    const hover = { kind: 'state', state: 'hover' } as const;
    const log = commit(emptyLog(), { selector: '.b', matches: 1, stable: true, property: 'color', from: '#0', to: '#1', condition: hover });
    const back = JSON.parse(JSON.stringify(log)) as typeof log;
    expect(normaliseCondition(back.entries[0]?.condition)).toEqual(hover);
    expect(toRules(back)[0]?.condition).toEqual(hover);
  });

  it('turns one it does not into the default state rather than a broken selector', () => {
    // A log written by another build. `.b` with a state called `wat` renders
    // `.bundefined`, which invalidates the whole rule and paints nothing.
    expect(normaliseCondition({ kind: 'state', state: 'wat' })).toBeUndefined();
    expect(selectorFor('.b', normaliseCondition({ kind: 'state', state: 'wat' }))).toBe('.b');
  });
});
import { normaliseCondition, selectorFor } from './conditions';

describe('properties that are not about one state', () => {
  const hover = { kind: 'state', state: 'hover' } as const;
  const base = { selector: '.btn', matches: 1, stable: true, from: 'none', to: 'opacity 200ms ease' };

  it('files a transition against the element, not against the state being held', () => {
    // Play is only offered while a state is held, so this is the normal way
    // to reach the field — and `sel:hover { transition }` animates in and
    // snaps out, which is not what anyone means.
    const log = commit(emptyLog(), { ...base, property: 'transition', condition: hover });
    expect(log.entries[0]?.condition).toBeUndefined();
    expect(toRules(log)[0]?.condition).toBeUndefined();
  });

  it('still files a colour against the state', () => {
    const log = commit(emptyLog(), { ...base, property: 'color', to: '#fff', condition: hover });
    expect(log.entries[0]?.condition).toEqual(hover);
  });
});
