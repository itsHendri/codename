/**
 * The audit trail of element edits, and the undo stack that is the same
 * thing read backwards.
 *
 * A change is a fact about one selector and one property. The log is
 * append-only; undo moves a cursor rather than deleting, so redo is free and
 * "what did I do" is always answerable. A drag-scrub commits many values in
 * quick succession, and those coalesce into one entry so undo steps feel
 * like edits, not frames.
 */

import { conditionKey, type MaybeCondition } from './conditions';
import type { ComponentOrigin } from './framework';

/** Where an element was put: inside `parent`, before `before`, or last when null. */
export interface MoveSpec {
  parent: string;
  before: string | null;
}

export interface ElementChange {
  id: string;
  selector: string;
  /** How many elements the selector matched when the change was made. */
  matches: number;
  /** false when the selector leans on :nth-of-type and will break on reorder. */
  stable: boolean;
  /** A CSS longhand, 'text' for an inline text edit, or 'move' for a reorder. */
  property: string;
  /**
   * The state this edit is about: hover, focus, active, dark or a width.
   * Absent is the default state, so a log written before conditions existed
   * reads correctly.
   */
  condition?: MaybeCondition;
  /** For 'move': the position, in selectors; `from`/`to` carry it in words for the brief. */
  move?: MoveSpec;
  /** For 'wrap': the new stack's id and what it holds. */
  wrap?: { id: string; members: string[] };
  from: string;
  /** `var(--x)` when a token was chosen; see `token`. */
  to: string;
  /** The token whose value was chosen, so the brief can say so. */
  token?: string;
  /** The component the dev build says rendered this, when it says. */
  component?: ComponentOrigin;
  status: 'pending' | 'applied' | 'reverted';
  at: string;
}

export interface ChangeLog {
  entries: ElementChange[];
  /** Entries at index >= cursor have been undone. */
  cursor: number;
}

export interface Rule {
  selector: string;
  property: string;
  value: string;
  /** Absent for the default state. */
  condition?: MaybeCondition;
}

/** Properties that belong to the element rather than to one of its states. */
export const STATELESS = new Set([
  'text',
  'move',
  'wrap',
  'transition',
  'transition-property',
  'transition-duration',
  'transition-delay',
  'transition-timing-function',
]);

/** Two commits to the same selector+property within this window are one edit. */
export const COALESCE_MS = 400;

export const emptyLog = (): ChangeLog => ({ entries: [], cursor: 0 });

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export function commit(
  log: ChangeLog,
  change: Omit<ElementChange, 'id' | 'status' | 'at'>,
  now: number = Date.now(),
): ChangeLog {
  // Committing after an undo discards the undone branch, as every editor does.
  const live = log.entries.slice(0, log.cursor);
  // A scrub is one edit. The entry to fold it into is usually the last one,
  // but a multi-selection, or a colour swapped through a selection, scrubs
  // several elements and properties at once, so their entries interleave:
  // look back through everything still warm for this element's entry for
  // this property in this state.
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i]!;
    if (e.status !== 'applied' || now - Date.parse(e.at) > COALESCE_MS) break;
    if (
      e.selector !== change.selector ||
      e.property !== change.property ||
      // The same property in another state is a different decision.
      conditionKey(e.condition) !== conditionKey(change.condition)
    )
      continue;
    // Keep the original `from`: undoing a scrub returns to where it started.
    const merged: ElementChange = { ...e, to: change.to, token: change.token, at: new Date(now).toISOString() };
    return { entries: [...live.slice(0, i), merged, ...live.slice(i + 1)], cursor: live.length };
  }
  const entry: ElementChange = {
    ...change,
    // Some properties are not about one state. Words and markup order are the
    // same in every state; a transition is the rule *between* states, and
    // writing it under `:hover` gives an element that animates in and snaps
    // out — the one place where the state you must hold to edit is the wrong
    // place to write.
    ...(STATELESS.has(change.property) ? { condition: undefined } : {}),
    id: newId(),
    status: 'applied',
    at: new Date(now).toISOString(),
  };
  return { entries: [...live, entry], cursor: live.length + 1 };
}

export const canUndo = (log: ChangeLog) => log.cursor > 0;
export const canRedo = (log: ChangeLog) => log.cursor < log.entries.length;

export function undo(log: ChangeLog): ChangeLog {
  return canUndo(log) ? { ...log, cursor: log.cursor - 1 } : log;
}

export function redo(log: ChangeLog): ChangeLog {
  return canRedo(log) ? { ...log, cursor: log.cursor + 1 } : log;
}

/** Take one change back without touching the ones around it. */
export function revert(log: ChangeLog, id: string): ChangeLog {
  return {
    ...log,
    entries: log.entries.map((e) => (e.id === id ? { ...e, status: 'reverted' } : e)),
  };
}

/** Take every change in force back at once. History stays; nothing is in effect. */
export function revertAll(log: ChangeLog): ChangeLog {
  return {
    ...log,
    entries: log.entries.map((e) => (e.status === 'applied' ? { ...e, status: 'reverted' } : e)),
  };
}

/** The changes currently in effect: applied, not undone, oldest first. */
export function active(log: ChangeLog): ElementChange[] {
  return log.entries.slice(0, log.cursor).filter((e) => e.status === 'applied');
}

/** Reorders in force, oldest first: each is applied on top of the ones before it. */
export function toMoves(log: ChangeLog): (MoveSpec & { selector: string })[] {
  return active(log)
    .filter((e) => e.property === 'move' && e.move)
    .map((e) => ({ selector: e.selector, ...e.move! }));
}

/**
 * A stack Codename puts around elements (Framer's "Add Stack", Figma's auto
 * layout on a selection) is a new element with an id of its own, so every
 * later edit to it has a selector that says which one it is.
 */
export const STACK_PREFIX = 'codename-stack-';
export const stackSelector = (id: string) => `div#${STACK_PREFIX}${id}`;
/** The stack an edit's selector is about, or null. */
export const stackIdOf = (selector: string): string | null => {
  const m = new RegExp(`^div#${STACK_PREFIX}([\\w-]+)$`).exec(selector);
  return m ? m[1]! : null;
};

/** Every wrap in force, oldest first, for the page to put in afresh. */
export function toWraps(log: ChangeLog): { id: string; members: string[] }[] {
  return active(log)
    .filter((e) => e.property === 'wrap' && e.wrap)
    .map((e) => ({ id: e.wrap!.id, members: e.wrap!.members }));
}

/**
 * What the page should be told: last write wins per selector, property and
 * state. A colour set on hover does not replace the one set by default.
 */
export function toRules(log: ChangeLog): Rule[] {
  const byKey = new Map<string, Rule>();
  for (const e of active(log)) {
    if (e.property === 'text' || e.property === 'move' || e.property === 'wrap') continue;
    byKey.set(`${e.selector} ${e.property} ${conditionKey(e.condition)}`, {
      selector: e.selector,
      property: e.property,
      value: e.to,
      ...(e.condition ? { condition: e.condition } : {}),
    });
  }
  return Array.from(byKey.values());
}

/** Text edits are applied by the inspector, not a stylesheet. */
export function toTextEdits(log: ChangeLog): { selector: string; text: string }[] {
  const byKey = new Map<string, string>();
  for (const e of active(log)) if (e.property === 'text') byKey.set(e.selector, e.to);
  return Array.from(byKey, ([selector, text]) => ({ selector, text }));
}

/** Group for display: one card per selector, most recently touched first. */
export function grouped(log: ChangeLog): { selector: string; changes: ElementChange[] }[] {
  const groups = new Map<string, ElementChange[]>();
  for (const e of log.entries) {
    const list = groups.get(e.selector) ?? [];
    list.push(e);
    groups.set(e.selector, list);
  }
  return Array.from(groups, ([selector, changes]) => ({ selector, changes })).reverse();
}
