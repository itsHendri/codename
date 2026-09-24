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
 * **No guessed file positions.** The extension sees the rendered page, not the
 * repo, so nothing here is derived from a stylesheet URL beyond what it is: a
 * hint about where the browser loaded some CSS. A position appears in a brief
 * only when the bridge, which runs inside the project, has searched the files
 * and found exactly one definition. That is a find, not a guess; where it
 * finds several, the brief says how many rather than choosing.
 */

import type { Definition } from '@/shared/protocol';
import { describeKeyframes, namesIn } from './animation';
import type { ScanResult } from '@/shared/types';
import { describeOrigin, type ComponentOrigin } from './framework';
import { buildValueIndex, tokenHolding } from './tokenMatch';
import type { Override } from './reskin';
import { stackIdOf, typeStyleDeclarations, type ElementChange } from './changes';
import { describeForm } from './typeStyleMatch';
import type { TypeStyle } from '@/shared/types';
import { cascadeOrder, conditionKey, describe as describeCondition, describeLong, type MaybeCondition } from './conditions';
import type { SystemChange } from './systemDiff';

export interface TokenChange {
  name: string;
  from: string;
  to: string;
  /**
   * Where the bridge found this defined in the project. A find, not a guess:
   * absent when no bridge is paired, and more than one entry means the
   * cascade decides which applies.
   */
  definedAt?: Definition[];
  /**
   * Set when the search that produced `definedAt` stopped before reading the
   * whole project, so what it found is not everything there is.
   */
  definedAtPartial?: boolean;
  /**
   * Set when the person wrote this definition to source from the panel, with
   * what the page said about it: seen to paint it (`ok`, or absent), not yet
   * seen (`pending`, `silent`, `unchecked`), or painting something else, so
   * the write was put back (`contradicted`, with what it read).
   */
  applied?: { file: string; line: number; verified?: 'pending' | 'ok' | 'silent' | 'contradicted' | 'unchecked'; seen?: string };
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
  /** Which state this is about; absent is the default one. */
  condition?: MaybeCondition;
  from: string;
  /** `var(--x)` when a token was chosen. */
  to: string;
  token?: string;
  /** For 'wrap': the new stack and the elements it holds. */
  wrap?: { id: string; members: string[] };
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
  /** The variable the element was taken off on purpose; the literal is meant. */
  detached?: string;
  /** For 'type-style': the style chosen, so the brief can say how the project writes it. */
  typeStyle?: TypeStyle;
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
  /** The project a paired bridge is running in, when there is one. */
  project?: { name: string; path: string; branch?: string };
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
    // The same property in two states is two decisions, not one overwriting
    // the other.
    const key = `${e.selector}\u0000${e.property}\u0000${conditionKey(e.condition)}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.to = e.to;
      prev.token = e.token;
      prev.detached = e.detached;
      prev.typeStyle = e.typeStyle;
    } else {
      byKey.set(key, {
        selector: e.selector,
        matches: e.matches,
        stable: e.stable,
        property: e.property,
        ...(e.condition ? { condition: e.condition } : {}),
        from: e.from,
        to: e.to,
        token: e.token,
        ...(e.detached ? { detached: e.detached } : {}),
        ...(e.typeStyle ? { typeStyle: e.typeStyle } : {}),
        ...(e.component ? { component: e.component } : {}),
        ...(e.wrap ? { wrap: e.wrap } : {}),
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
  /** What a paired bridge knows: the project, where each token lives, what is already applied. */
  repo: {
    project?: ChangeSet['project'];
    definitions?: Record<string, Definition[]>;
    /** The search behind `definitions` stopped early; what it found is not everything. */
    definitionsTruncated?: boolean;
    applied?: { name: string; file: string; line: number; value: string; verified?: NonNullable<TokenChange['applied']>['verified']; seen?: string }[];
  } = {},
): ChangeSet {
  const propByName = new Map(scan.customProps.map((p) => [p.name, p]));

  const appliedByName = new Map((repo.applied ?? []).map((a) => [a.name, a]));
  const tokens: TokenChange[] = overrides.map((o) => {
    const prop = propByName.get(o.name);
    const alsoAt = Object.entries(prop?.atWidth ?? {}).map(([query, value]) => ({ query, value }));
    const definedAt = repo.definitions?.[o.name];
    // Only while it still holds what was written: moved again, it is a change
    // the agent has not heard about and must not be told to skip.
    const wrote = appliedByName.get(o.name);
    const applied = wrote && wrote.value === o.to ? wrote : undefined;
    return {
      name: o.name,
      from: o.from,
      to: o.to,
      source: prop?.source,
      uses: prop?.uses,
      reason: o.reason,
      ...(definedAt?.length ? { definedAt, ...(repo.definitionsTruncated ? { definedAtPartial: true } : {}) } : {}),
      ...(applied
        ? {
            applied: {
              file: applied.file,
              line: applied.line,
              ...(applied.verified ? { verified: applied.verified } : {}),
              ...(applied.seen ? { seen: applied.seen } : {}),
            },
          }
        : {}),
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
    ...(repo.project ? { project: repo.project } : {}),
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
    if (e.token || e.detached || e.property === 'text' || e.property === 'move' || e.property === 'wrap' || e.property === 'type-style') return e;
    // The index holds each variable's base value. Under the page's dark mode
    // or inside a width query the same name may hold something else, and
    // naming it would be a wrong fact rather than a helpful one — so nothing
    // is said. A state does not change a variable's value, so it still can.
    if (e.condition && e.condition.kind !== 'state') return e;
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
    '- Values were read from the rendered page. The stylesheet URLs are where the browser loaded the CSS; find the real definitions in the repository, or call `find_definition` and this bridge will search it for you.',
    '- A line already named "defined at file:line" was found in the repository, not guessed. Where a brief says a token has several definitions, read them before editing: which one wins is the cascade\'s business.',
    '- A token the person applied themselves is already in source and says so in the brief; do not write it again.',
    '- Change nothing that is not named. Colours and tokens left out of a brief were left alone on purpose.',
    '- An element line under a state heading is about that state only — `:hover`, `:focus-visible`, `:active`, the page\'s own dark mode, or a max-width query. Put it where that state is written, not on the base rule.',
    '- A preview you paint with apply_css is a proposal, not a change; it needs the person\'s consent in the panel menu, they can see and clear it, and only source edits count.',
  ];
  if (locked.length) {
    lines.push(`- Keep these tokens exactly as they are, whatever a brief touches: ${locked.map((n) => `\`${n}\``).join(', ')}.`);
  }
  return lines.join('\n');
}

/**
 * Properties whose change is movement, and so carries the reduced-motion
 * duty. A filter is not one of them: frosted glass does not move, and a note
 * about motion on a static blur is noise.
 */
const MOTION_PROPS = new Set(['transition', 'transition-duration', 'transition-property', 'transition-timing-function', 'animation']);

/** Whether an edit asks for movement, rather than asking for less of it. */
const asksForMotion = (e: ElementEdit): boolean => {
  if (!MOTION_PROPS.has(e.property)) return false;
  const to = e.to.trim().toLowerCase();
  // Taking a transition away is the opposite of the thing being warned about.
  return to !== 'none' && to !== '' && !/^(all\s+)?0s\b/.test(to);
};

/**
 * What putting an element on a type style means in this project's terms:
 * the utility, the class or the variables to use, or — for a style that is
 * a tag rule — the declarations to carry over, since the tag itself stays.
 */
function describeTypeStyleChange(style: TypeStyle, selector: string): string {
  const decls = typeStyleDeclarations(style)
    .map(([p, v]) => `${p}: ${v}`)
    .join('; ');
  if (style.form === 'tag') {
    return `give it the declarations of ${describeForm(style)} (${decls}) — the element keeps its own tag; a class that holds them is the cleaner home`;
  }
  return `put it on ${describeForm(style)} instead (${decls}); keep the tag`;
}

/**
 * Where a token is defined, in one line, or nothing.
 *
 * One definition is named. Several are counted and listed, because which one
 * applies is the cascade's business and picking would be the guess this
 * whole file exists to avoid. None says nothing at all.
 */
export function describeDefinitions(t: TokenChange): string | null {
  if (t.applied) {
    const at = `${t.applied.file}:${t.applied.line}`;
    switch (t.applied.verified) {
      case 'contradicted':
        return `written to ${at} and put back, because the page then painted \`${t.applied.seen ?? 'something else'}\`: another definition wins the cascade there — find it before editing`;
      case 'pending':
      case 'silent':
      case 'unchecked':
        return `already written to ${at}, though the page has not been seen to paint it yet — do not write it again; if it still shows the old value after a reload, say so`;
      default:
        return `already applied in ${at} — do not write this one again`;
    }
  }
  const found = t.definedAt ?? [];
  if (!found.length) return null;
  const at = (d: Definition) => `${d.file}${d.line ? `:${d.line}` : ''}`;
  // A search that stopped early found these, not necessarily all of them, and
  // "defined at" alone would state the one as the only one.
  const partial = t.definedAtPartial
    ? ' — the search stopped before it had read the whole project, so there may be others'
    : '';
  if (found.length === 1) return `${partial ? 'found' : 'defined'} at ${at(found[0]!)}${partial}`;
  const listed = found
    .slice(0, 4)
    .map((d) => `${at(d)}${d.context === 'root' ? '' : ` (${d.context})`}`)
    .join(', ');
  const more = found.length > 4 ? `, and ${found.length - 4} more` : '';
  return `${found.length} definitions: ${listed}${more} — read them before editing; which one applies is the cascade's business${partial}`;
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

  const where = set.project
    ? `${host}, running from ${set.project.name}${set.project.branch ? ` on ${set.project.branch}` : ''}`
    : host;
  lines.push(`Apply a design change I made against ${where}.`);
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
      const position = describeDefinitions(t);
      if (position) lines.push(`  - ${position}`);
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
    // Motion is the one kind of edit that has a duty attached to it, and the
    // engine's own polish rules already say so; a brief that asks for a
    // transition and does not mention it is asking for half the work.
    if (set.elements.some(asksForMotion)) {
      lines.push('');
      lines.push(
        'A line naming `transition`, `animation` or a filter is motion: pair it with `@media (prefers-reduced-motion: reduce)`, where the duration drops to near zero, and keep the change visible without the movement.',
      );
    }
    if (set.elements.some((e) => e.condition)) {
      lines.push('');
      lines.push(
        'A line under a state heading is about that state only: `hover` means `:hover`, `focus` means `:focus-visible`, `active` means `:active`, `dark` means this page\'s own dark mode, and a width means that media query. Lines with no heading are the default state.',
      );
    }
    // A named preset is defined nowhere in the project yet; the brief says
    // what it is, in words, since it carries no rule bodies.
    const presets = new Set<string>();
    for (const e of set.elements) if (e.property === 'animation') for (const name of namesIn(e.to)) presets.add(name);
    const defined = Array.from(presets).map(describeKeyframes).filter((d): d is string => d !== null);
    if (defined.length) {
      lines.push('');
      lines.push(`Keyframes to define, once, wherever the project keeps its animations: ${defined.join('; ')}.`);
    }
    lines.push('');
    const bySelector = new Map<string, ElementEdit[]>();
    for (const e of set.elements) bySelector.set(e.selector, [...(bySelector.get(e.selector) ?? []), e]);
    for (const [selector, edits] of bySelector) {
      const first = edits[0]!;
      const scope = first.matches > 1 ? ` (${first.matches} elements)` : '';
      const positional = first.stable ? '' : ' — positional selector, find the element by its content';
      // A stack Codename made is not in the source yet: say what to make,
      // and give the styles as the new element's, not as edits to `#codename-stack-…`.
      const wrapped = edits.find((e) => e.property === 'wrap' && e.wrap)?.wrap;
      if (wrapped) {
        const members = wrapped.members.map((m) => `\`${m}\``).join(', ');
        const loose = wrapped.members.some((m) => m.includes(':nth-of-type')) ? ' Some of these are positional selectors; find them by their content.' : '';
        lines.push(
          `- A new stack: put ${members} inside one new element, where they stand now and in this order. This is a change to the markup. Give the new element these styles, however this project writes layout:${loose}`,
        );
      } else if (stackIdOf(selector)) {
        // Edits to a stack whose wrap was undone: nothing to make.
        continue;
      } else lines.push(`- \`${selector}\`${scope}${positional}`);
      // Where a dev build named the component, that is the file to open.
      if (first.component) lines.push(`  - rendered by ${describeOrigin(first.component)}`);
      // Grouped by state, default first, so the ordinary case reads exactly
      // as it did before conditions existed.
      const byCondition = new Map<string, ElementEdit[]>();
      for (const e of edits) {
        const key = conditionKey(e.condition);
        byCondition.set(key, [...(byCondition.get(key) ?? []), e]);
      }
      // The same order the sheet uses, so the brief describes the cascade
      // the person was looking at: default, then widths, then dark, then the
      // states.
      const order = [...byCondition.keys()].sort(
        (a, b) => cascadeOrder(byCondition.get(a)![0]!.condition) - cascadeOrder(byCondition.get(b)![0]!.condition),
      );
      for (const key of order) {
        const group = byCondition.get(key)!;
        const condition = group[0]!.condition;
        const indent = condition ? '    ' : '  ';
        if (condition) lines.push(`  - ${describeCondition(condition)} — ${describeLong(condition)}`);
        for (const e of group) {
          if (e.property === 'wrap') continue;
          lines.push(
            e.property === 'text'
              ? `${indent}- text: ${JSON.stringify(e.from)} → ${JSON.stringify(e.to)}`
              : e.property === 'move'
                ? `${indent}- move it: it was ${e.from}; put it ${e.to}. This is a change to the markup's order, not a style.`
                : e.property === 'type-style' && e.typeStyle
                  ? `${indent}- type style: \`${e.from || 'none'}\` → \`${e.to}\` — ${describeTypeStyleChange(e.typeStyle, first.selector)}`
                  : `${indent}- \`${e.property}\`: \`${e.from}\` → \`${e.to}\`${
                      e.token
                        ? ` (the token \`${e.token}\`)`
                        : e.detached
                          ? ` — taken off \`${e.detached}\` on purpose; write the literal, not the variable`
                          : e.couldBe
                            ? ` — this page defines \`${e.couldBe}\` with that value; use it unless the literal was meant`
                            : ''
                    }`,
          );
        }
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
  // Where the bridge searched the project, the positions above are the answer
  // to "where is this defined"; telling the agent to go and find them again
  // would send it looking for what it has already been handed.
  const located = set.tokens.some((t) => t.definedAt?.length || t.applied);
  lines.push(
    located
      ? '- These values were read from the rendered page; the file positions above come from a search of this project. Where a token has more than one definition, read them before editing.'
      : '- These values were read from the rendered page, so the stylesheet URLs are where the browser loaded the CSS — find the real definitions in the source.',
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
