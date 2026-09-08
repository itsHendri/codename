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

export interface ElementChange {
  id: string;
  selector: string;
  /** How many elements the selector matched when the change was made. */
  matches: number;
  /** false when the selector leans on :nth-of-type and will break on reorder. */
  stable: boolean;
  /** A CSS longhand, or 'text' for an inline text edit. */
  property: string;
  from: string;
  /** `var(--x)` when a token was chosen; see `token`. */
  to: string;
  /** The token whose value was chosen, so the brief can say so. */
  token?: string;
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
}

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
  const last = live[live.length - 1];
  if (
    last &&
    last.selector === change.selector &&
    last.property === change.property &&
    last.status === 'applied' &&
    now - Date.parse(last.at) <= COALESCE_MS
  ) {
    // Keep the original `from`: undoing a scrub returns to where it started.
    const merged: ElementChange = {
      ...last,
      to: change.to,
      token: change.token,
      at: new Date(now).toISOString(),
    };
    return { entries: [...live.slice(0, -1), merged], cursor: live.length };
  }
  const entry: ElementChange = {
    ...change,
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

/** The changes currently in effect: applied, not undone, oldest first. */
export function active(log: ChangeLog): ElementChange[] {
  return log.entries.slice(0, log.cursor).filter((e) => e.status === 'applied');
}

/** What the page should be told: last write wins per selector and property. */
export function toRules(log: ChangeLog): Rule[] {
  const byKey = new Map<string, Rule>();
  for (const e of active(log)) {
    if (e.property === 'text') continue;
    byKey.set(`${e.selector} ${e.property}`, {
      selector: e.selector,
      property: e.property,
      value: e.to,
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
