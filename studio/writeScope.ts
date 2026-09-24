/**
 * Which definitions a token edit is allowed to land in.
 *
 * A variable is defined in scopes: the root of the cascade, the page's dark
 * side (a `prefers-color-scheme` block or a hook like `.dark`), a width
 * query, a component selector. An edit made under one side of the page is a
 * decision about that side and no other, so the light value goes only to the
 * root (and a Tailwind `@theme`), the dark value only to the dark blocks, and
 * a width or component scope is never written by a token edit at all — it is
 * reported, and the person or the agent decides.
 *
 * Shared by the bridge, which writes, and the panel, which offers Write only
 * where the bridge would not refuse.
 */

import type { Definition } from '@/shared/protocol';
import { hookFromSelector, isDarkMedia } from './siteMode';

export type ScopeKind = 'root' | 'theme' | 'dark' | 'width' | 'scoped' | 'file';
export type EditMode = 'light' | 'dark';

/** What scope a definition sits in, as a write sees it. */
export function scopeKindOf(def: Definition): ScopeKind {
  if (def.kind === 'dtcg' || def.kind === 'flat-json') return 'file';
  const media = def.media ?? [];
  if (media.some(isDarkMedia)) return 'dark';
  if (def.selector && hookFromSelector(def.selector)) return 'dark';
  if (def.kind === 'theme') return 'theme';
  if (media.length) return 'width';
  return def.context === 'root' ? 'root' : 'scoped';
}

/** Whitespace and case are not a difference; anything else is. */
export const sameText = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/** A value that is computed from others, so a literal in its place changes what it means. */
export const isComputedValue = (value: string): boolean => /^(var|calc|color-mix|clamp|min|max|light-dark)\(/i.test(value.trim());

const WANTED: Record<EditMode, Set<ScopeKind>> = {
  light: new Set(['root', 'theme']),
  dark: new Set(['dark']),
};

const describe = (d: Definition, kind: ScopeKind) => `${d.file}${d.line ? `:${d.line}` : ''} (${kind})`;

export interface Targets {
  /** The definitions the edit lands in. Empty when `reason` is set. */
  targets: Definition[];
  /** Definitions of the same name in other scopes, left alone. */
  left: Definition[];
  /** Why nothing can be written, in a sentence that starts with the name. */
  reason?: string;
}

/**
 * Splits a name's definitions into the ones an edit under `mode` may write
 * and the ones it leaves alone, or says why none may be written.
 *
 * Several definitions in the wanted scope are one decision spelled twice
 * when they agree — `:root, html` split in two, or a dark side kept both
 * as a media block and as a hook — and are all written. When they disagree,
 * which one wins depends on the page, and nothing is written.
 */
export function targetsFor(name: string, defs: Definition[], mode: EditMode): Targets {
  const kinds = defs.map((d) => ({ d, kind: scopeKindOf(d) }));
  const wanted = WANTED[mode];
  const targets = kinds.filter((k) => wanted.has(k.kind)).map((k) => k.d);
  const left = kinds.filter((k) => !wanted.has(k.kind)).map((k) => k.d);
  if (!defs.length) return { targets: [], left: [], reason: `${name} is not defined anywhere this bridge can see` };
  if (!targets.length) {
    const scopes = [...new Set(kinds.map((k) => k.kind))].join(', ');
    return {
      targets: [],
      left,
      reason:
        mode === 'light'
          ? `${name} has no definition at the root of the cascade; the page defines it only under ${scopes}`
          : `${name} has no dark definition; the page defines it under ${scopes}`,
    };
  }
  const unplaced = targets.filter((t) => !t.line);
  if (unplaced.length) {
    return { targets: [], left, reason: `${name} is defined in ${unplaced[0]!.file}, but the search could not say on which line` };
  }
  const values = new Set(targets.map((t) => t.value.replace(/\s+/g, ' ').trim().toLowerCase()));
  if (values.size > 1) {
    const listed = kinds
      .filter((k) => wanted.has(k.kind))
      .map((k) => `${describe(k.d, k.kind)} = ${k.d.value}`)
      .join(', ');
    return {
      targets: [],
      left,
      reason: `${name} has ${targets.length} ${mode} definitions that disagree, so which one wins depends on the page: ${listed}`,
    };
  }
  return { targets, left };
}
