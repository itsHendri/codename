/**
 * What leaves the panel when you hand a design change to your agent.
 *
 * The change list is a commit, not a log: it describes the edit you made, in
 * the vocabulary of the project you made it against, so an agent can apply it
 * to source. Two rules shape everything here.
 *
 * **Names and old values, never a rendered stylesheet.** Handing over
 * `--brand-primary: #533AFD → #1C7F5C` lets the agent edit one definition.
 * Handing over the resolved CSS invites it to stamp a hex across forty
 * components, which is the thing a token system exists to prevent.
 *
 * **No file positions.** The extension sees the rendered page, not the repo; it
 * would be guessing at line numbers. The agent has the repo and can find a
 * definition properly. What it gets instead is the stylesheet URL the browser
 * loaded — a hint, labelled as one.
 */

import type { ScanResult } from '@/shared/types';
import { describeOrigin, type ComponentOrigin } from './framework';
import { buildValueIndex, tokenHolding } from './tokenMatch';
import type { Override } from './reskin';
import type { ElementChange } from './changes';
import type { SystemChange } from './systemDiff';

export interface TokenChange {
  name: string;
  from: string;
  to: string;
  /** Where the browser loaded the defining stylesheet. A hint, not a fact. */
  source?: string;
  /** Declarations referencing this token. */
  uses?: number;
  /** Whether the value sat on a ramp or was carried along by hue. */
  reason: Override['reason'];
  /**
   * Where the page defines this token again under a width media query, and
   * to what. The edit leaves these alone; the agent needs to know they exist
   * so it does not miss an override the page still applies at that width.
   */
  alsoAt?: { query: string; value: string }[];
  /** Set when the page defines this token only under a width media query; `from` is its value there. */
  onlyAt?: string;
}

export interface ColorChange {
  from: string;
  to: string;
  /** Declarations painting with this literal, across readable stylesheets. */
  uses: number;
}

/**
 * One property on one selector, as the agent should apply it: the value the
 * page had before any edit and the value it has now. A scrub that went
 * through twenty values is one line.
 */
export interface ElementEdit {
  selector: string;
  /** How many elements the selector matched. */
  matches: number;
  /** false when the selector is positional and will not survive a reorder. */
  stable: boolean;
  /** A CSS longhand, or 'text'. */
  property: string;
  from: string;
  /** `var(--x)` when a token was chosen. */
  to: string;
  token?: string;
  /**
   * The component the page's own dev build says rendered this. Not a guess
   * from the markup: React, Vue and Angular dev builds each name it, and a
   * built site names nothing, in which case this is absent.
   */
  component?: ComponentOrigin;
  /**
   * A page variable that already holds exactly this value, where the edit
   * wrote the literal anyway. The agent is told, and decides.
   */
  couldBe?: string;
}

/** A note the user pinned, in the form the agent works from. */
export interface CommentNote {
  id: string;
  /** The target in words: a selector, a set, a region, or a quote. */
  about: string;
  /** Selectors the note names, when it names any. */
  selectors: string[];
  text: string;
}

export interface ChangeSet {
  site: string;
  editedAt: string;
  /** Whether this looks like a project running on your own machine. */
  local: boolean;
  tokens: TokenChange[];
  colors: ColorChange[];
  /** Scale decisions with no variable behind them; source is the only handle. */
  system: SystemChange[];
  elements: ElementEdit[];
  /** Pending notes; resolved and dismissed ones stay out of the brief. */
  comments: CommentNote[];
  /** Stylesheets that could not be read, so the count may be short. */
  unreadable: string[];
  /** Tokens the person locked: keep their definitions as they are, whatever else follows. */
  locked?: string[];
}

/** Collapse a log into one edit per selector and property, in first-touched order. */
export function summariseElements(entries: ElementChange[]): ElementEdit[] {
  const byKey = new Map<string, ElementEdit>();
  for (const e of entries) {
    const key = `${e.selector}\u0000${e.property}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.to = e.to;
      prev.token = e.token;
    } else {
      byKey.set(key, {
        selector: e.selector,
        matches: e.matches,
        stable: e.stable,
        property: e.property,
        from: e.from,
        to: e.to,
        token: e.token,
        ...(e.component ? { component: e.component } : {}),
      });
    }
  }
  // An edit that ended where it started is not an edit.
  return Array.from(byKey.values()).filter((e) => e.from !== e.to);
}

const countLiteral = (css: string, hex: string): number => {
  const short = hex.toLowerCase();
  const rgb = `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(
    hex.slice(5, 7),
    16,
  )})`;
  const lower = css.toLowerCase();
  return lower.split(short).length - 1 + lower.split(rgb.toLowerCase()).length - 1;
};

export function isLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
  } catch {
    return false;
  }
}

/** The little a hand-off needs to know about the page; a full scan has all of it. */
export type ScanLike = Pick<ScanResult, 'url' | 'cssText' | 'customProps' | 'unreadableSheets'> &
  Partial<Pick<ScanResult, 'rootFontSize'>>;

export function buildChangeSet(
  scan: ScanLike,
  overrides: Override[],
  colorMap: Record<string, string>,
  elements: ElementChange[] = [],
  comments: CommentNote[] = [],
  system: SystemChange[] = [],
  locked: string[] = [],
): ChangeSet {
  const propByName = new Map(scan.customProps.map((p) => [p.name, p]));

  const tokens: TokenChange[] = overrides.map((o) => {
    const prop = propByName.get(o.name);
    const alsoAt = Object.entries(prop?.atWidth ?? {}).map(([query, value]) => ({ query, value }));
    return {
      name: o.name,
      from: o.from,
      to: o.to,
      source: prop?.source,
      uses: prop?.uses,
      reason: o.reason,
      ...(alsoAt.length ? { alsoAt } : {}),
      ...(prop?.onlyAt ? { onlyAt: prop.onlyAt } : {}),
    };
  });

  // A colour that a token already covers is not reported twice: the token is
  // the better handle, and listing both invites the agent to do the job twice.
  const coveredByToken = new Set(overrides.map((o) => o.from.toUpperCase()));
  const colors: ColorChange[] = Object.entries(colorMap)
    .filter(([from]) => !coveredByToken.has(from.toUpperCase()))
    .map(([from, to]) => ({ from, to, uses: countLiteral(scan.cssText, from) }))
    .filter((c) => c.uses > 0)
    .sort((a, b) => b.uses - a.uses);

  return {
    site: scan.url,
    editedAt: new Date().toISOString(),
    local: isLocal(scan.url),
    tokens,
    colors,
    system,
    elements: withTokenHints(summariseElements(elements), scan),
    comments,
    unreadable: scan.unreadableSheets,
    ...(locked.length ? { locked } : {}),
  };
}

/**
 * Mark the edits that wrote a literal where one of the page's own variables
 * already holds that exact value. Not a correction — the person may have
 * meant the literal — but a fact the agent should have before it edits
 * source. The index is built once, because this runs on every keystroke of a
 * drag.
 */
function withTokenHints(edits: ElementEdit[], scan: ScanLike): ElementEdit[] {
  if (!edits.length) return edits;
  const index = buildValueIndex({ customProps: scan.customProps, rootFontSize: scan.rootFontSize });
  const rootFontSize = scan.rootFontSize ?? 16;
  return edits.map((e) => {
    if (e.token || e.property === 'text' || e.property === 'move') return e;
    const holder = tokenHolding(index, e.property, e.to, rootFontSize);
    return holder ? { ...e, couldBe: holder } : e;
  });
}

export function isEmpty(set: ChangeSet): boolean {
  return (
    set.tokens.length === 0 &&
    set.colors.length === 0 &&
    set.system.length === 0 &&
    set.elements.length === 0 &&
    set.comments.length === 0
  );
}

/**
 * The rules that hold whatever the brief says, written once so the agent has
 * them before it asks for anything. The bridge hands this to every connected
 * agent as its instructions and as a resource; the brief repeats the ones
 * that apply to the change in hand.
 */
export function standingRules(locked: string[] = []): string {
  const lines = [
    'Codename hands you design changes a person made against a live page.',
    '',
    '- Edit the definition of each token named; never replace its usages, and never paste a rendered stylesheet into source.',
    '- Values were read from the rendered page. The stylesheet URLs are where the browser loaded the CSS; find the real definitions in the repository.',
    '- Change nothing that is not named. Colours and tokens left out of a brief were left alone on purpose.',
    '- A preview you paint with apply_css is a proposal, not a change; it needs the person\'s consent in the panel menu, they can see and clear it, and only source edits count.',
  ];
  if (locked.length) {
    lines.push(`- Keep these tokens exactly as they are, whatever a brief touches: ${locked.map((n) => `\`${n}\``).join(', ')}.`);
  }
  return lines.join('\n');
}

/**
 * The instruction an agent receives. Written as a brief rather than a diff: it
 * says what changed, where to look, and — because this is the failure mode that
 * matters — what not to do.
 */
export function toPrompt(set: ChangeSet): string {
  const lines: string[] = [];
  const host = (() => {
    try {
      return new URL(set.site).host;
    } catch {
      return set.site;
    }
  })();

  lines.push(`Apply a design change I made against ${host}.`);
  lines.push('');

  if (set.tokens.length) {
    lines.push(
      `## Token changes — ${set.tokens.length} ${set.tokens.length === 1 ? 'definition' : 'definitions'}`,
    );
    lines.push('');
    lines.push('Edit the definition of each token. Do not replace usages.');
    lines.push('');
    for (const t of set.tokens) {
      const detail = [
        t.uses ? `${t.uses} ${t.uses === 1 ? 'usage' : 'usages'}` : null,
        t.source ? `loaded from ${t.source}` : null,
        t.reason === 'family' ? 'followed the brand hue'
          : t.reason === 'grid' ? 'a step on the spacing or radius scale'
            : t.reason === 'scale' ? 'a size on the type scale'
              : t.reason === 'manual' ? 'set by hand'
                : null,
      ]
        .filter(Boolean)
        .join('; ');
      lines.push(`- \`${t.name}\`: \`${t.from}\` → \`${t.to}\`${detail ? `  (${detail})` : ''}`);
      if (t.onlyAt) lines.push(`  - the page defines this only at ${t.onlyAt}; there is no base value, so that definition is the one to edit`);
      for (const a of t.alsoAt ?? []) {
        lines.push(`  - also defined at ${a.query} as \`${a.value}\`; left alone — decide whether it should follow`);
      }
    }
    lines.push('');
  }

  if (set.colors.length) {
    lines.push(`## Hardcoded colours — ${set.colors.length}`);
    lines.push('');
    lines.push(
      set.tokens.length
        ? 'These are literals with no token behind them. Change them where they appear.'
        : 'This page defines no colour tokens, so these are literals. Change them where they appear — and consider introducing tokens for them, since a value used this many times is a token in all but name.',
    );
    lines.push('');
    for (const c of set.colors) {
      lines.push(
        `- \`${c.from}\` → \`${c.to}\`  (${c.uses} ${c.uses === 1 ? 'occurrence' : 'occurrences'} in the stylesheets I could read)`,
      );
    }
    lines.push('');
  }

  if (set.system.length) {
    lines.push(`## Scale changes — ${set.system.length}`);
    lines.push('');
    lines.push(
      'Decisions about the system rather than about one colour. Where this page holds them in a variable, that variable is in the list above and is the thing to edit; where it does not, these values are written somewhere in source and this is what they should become.',
    );
    lines.push('');
    for (const c of set.system) {
      lines.push(`- ${c.area} · ${c.label}: \`${c.from}\` → \`${c.to}\``);
    }
    lines.push('');
  }

  if (set.elements.length) {
    lines.push(`## Element changes — ${set.elements.length}`);
    lines.push('');
    lines.push(
      'Each line is one property on one selector, read from the rendered page: the value before I touched it and the value I settled on. Apply the same intent in source at whatever specificity the rule already has; where the new value is `var(--x)`, use that token.',
    );
    lines.push('');
    const bySelector = new Map<string, ElementEdit[]>();
    for (const e of set.elements) bySelector.set(e.selector, [...(bySelector.get(e.selector) ?? []), e]);
    for (const [selector, edits] of bySelector) {
      const first = edits[0]!;
      const scope = first.matches > 1 ? ` (${first.matches} elements)` : '';
      const positional = first.stable ? '' : ' — positional selector, find the element by its content';
      lines.push(`- \`${selector}\`${scope}${positional}`);
      // Where a dev build named the component, that is the file to open.
      if (first.component) lines.push(`  - rendered by ${describeOrigin(first.component)}`);
      for (const e of edits) {
        lines.push(
          e.property === 'text'
            ? `  - text: ${JSON.stringify(e.from)} → ${JSON.stringify(e.to)}`
            : e.property === 'move'
              ? `  - move it: it was ${e.from}; put it ${e.to}. This is a change to the markup's order, not a style.`
              : `  - \`${e.property}\`: \`${e.from}\` → \`${e.to}\`${e.token ? ` (the token \`${e.token}\`)` : e.couldBe ? ` — this page defines \`${e.couldBe}\` with that value; use it unless the literal was meant` : ''}`,
        );
      }
    }
    lines.push('');
  }

  if (set.comments.length) {
    lines.push(`## Comments — ${set.comments.length}`);
    lines.push('');
    lines.push(
      'Notes I pinned on the page. Each says what it is about: an element, a set of them, a region given in page coordinates, or a quoted run of text.',
    );
    lines.push('');
    set.comments.forEach((c, i) => {
      const positional = c.selectors.some((s) => s.includes(':nth-of-type'))
        ? ' — positional selectors, find these by their content'
        : '';
      lines.push(`${i + 1}. ${c.about} — ${c.id}${positional}`);
      lines.push(`   ${c.text.replace(/\n/g, '\n   ')}`);
    });
    lines.push('');
  }

  if (set.locked?.length) {
    lines.push(`## Keep as is — ${set.locked.length}`);
    lines.push('');
    lines.push('I locked these tokens. Leave their definitions exactly as they are, whatever the changes above touch.');
    lines.push('');
    for (const name of set.locked) lines.push(`- \`${name}\``);
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push(
    '- These values were read from the rendered page, so the stylesheet URLs are where the browser loaded the CSS — find the real definitions in the source.',
  );
  lines.push('- Change nothing else. Colours not listed here were deliberately left alone.');
  if (set.unreadable.length) {
    lines.push(
      `- ${set.unreadable.length} stylesheet(s) could not be read, so there may be occurrences I could not see.`,
    );
  }
  if (!set.local) {
    lines.push(
      '- This was edited against a deployed site rather than a local dev server, so check the mapping to source before applying.',
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function toJson(set: ChangeSet): string {
  return JSON.stringify(set, null, 2);
}
