/**
 * The keys and commands the bar answers to, as data: the shortcut sheet
 * (Shift+?) draws this list, the command menu (Cmd+K) searches it, and a
 * test keeps the two from drifting from what the keys actually do.
 */

export interface Shortcut {
  /** How the keys read, the way Figma prints them. */
  keys: string;
  what: string;
}

export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/** ⌘ on a Mac, Ctrl elsewhere, for a sheet the person reads. */
export const modKey = (mac: boolean) => (mac ? '⌘' : 'Ctrl+');
const alt = (mac: boolean) => (mac ? '⌥' : 'Alt+');

export function shortcutSheet(mac: boolean): ShortcutGroup[] {
  const m = modKey(mac);
  const a = alt(mac);
  return [
    {
      title: 'Selecting',
      items: [
        { keys: 'Click', what: 'Select, or let go' },
        { keys: 'Shift+Click', what: 'Add or take out' },
        { keys: 'Enter', what: 'First child' },
        { keys: 'Shift+Enter', what: 'Parent' },
        { keys: 'Tab', what: 'Next sibling' },
        { keys: 'Shift+Tab', what: 'Previous sibling' },
        { keys: '↑ ↓ ← →', what: 'Walk the tree' },
        { keys: 'Esc', what: 'Step back' },
      ],
    },
    {
      title: 'Editing',
      items: [
        { keys: 'Drag', what: 'Move, beside or into a box' },
        { keys: 'Drag a handle', what: 'Padding, margin, gap, size' },
        { keys: `${a}Drag`, what: 'Padding or margin, all sides' },
        { keys: `${m}${a}C`, what: 'Copy style' },
        { keys: `${m}${a}V`, what: 'Paste style' },
        { keys: 'Shift+A', what: 'Wrap in a stack' },
        { keys: `${m}Z`, what: 'Undo' },
        { keys: `${m}Shift+Z`, what: 'Redo' },
      ],
    },
    {
      title: 'Looking',
      items: [
        { keys: `Hold ${mac ? '⌥' : 'Alt'}`, what: 'Measure' },
        { keys: 'P', what: 'Preview' },
        { keys: 'C', what: 'Comment' },
        { keys: `${a}L`, what: 'Left panel' },
        { keys: `${m}K`, what: 'Command menu' },
        { keys: 'Shift+?', what: 'Shortcuts' },
      ],
    },
  ];
}

/**
 * Whether `query` matches `text` as a design tool's menu matches: every
 * word of the query is the start of a word in the text, or a run of letters
 * found in order. Scored so the tighter match comes first; null is no match.
 */
export function matchScore(query: string, text: string, loose = true): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const words = q.split(/\s+/);
  // Every word the start of a word: the best kind of hit.
  const starts = t.split(/[\s\-_.#>:()/]+/).filter(Boolean);
  if (words.every((w) => starts.some((s) => s.startsWith(w)))) return 100 - Math.min(50, t.length);
  if (t.includes(q)) return 60 - Math.min(40, t.indexOf(q));
  // Letters in order: "wst" finds "wrap in a stack". Only for a name, and
  // only from three letters on: two letters in order are found in nearly
  // everything, and a list of nearly everything is no answer.
  if (!loose || q.replace(/\s+/g, '').length < 3) return null;
  let i = 0;
  for (const ch of q.replace(/\s+/g, '')) {
    i = t.indexOf(ch, i);
    if (i < 0) return null;
    i++;
  }
  return 10;
}

/** The commands that match, best first, keeping the list's own order among equals. */
export function search<T extends { label: string; also?: string }>(items: T[], query: string, limit = 12): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: Math.max(matchScore(query, item.label) ?? -1, item.also ? (matchScore(query, item.also, false) ?? -1) : -1),
    }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}
