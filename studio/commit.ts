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
import type { Override } from './reskin';

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
}

export interface ColorChange {
  from: string;
  to: string;
  /** Declarations painting with this literal, across readable stylesheets. */
  uses: number;
}

export interface ChangeSet {
  site: string;
  editedAt: string;
  /** Whether this looks like a project running on your own machine. */
  local: boolean;
  tokens: TokenChange[];
  colors: ColorChange[];
  /** Stylesheets that could not be read, so the count may be short. */
  unreadable: string[];
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

export function buildChangeSet(
  scan: ScanResult,
  overrides: Override[],
  colorMap: Record<string, string>,
): ChangeSet {
  const propByName = new Map(scan.customProps.map((p) => [p.name, p]));

  const tokens: TokenChange[] = overrides.map((o) => {
    const prop = propByName.get(o.name);
    return {
      name: o.name,
      from: o.from,
      to: o.to,
      source: prop?.source,
      uses: prop?.uses,
      reason: o.reason,
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
    unreadable: scan.unreadableSheets,
  };
}

export function isEmpty(set: ChangeSet): boolean {
  return set.tokens.length === 0 && set.colors.length === 0;
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
        t.reason === 'family' ? 'followed the brand hue' : null,
      ]
        .filter(Boolean)
        .join('; ');
      lines.push(`- \`${t.name}\`: \`${t.from}\` → \`${t.to}\`${detail ? `  (${detail})` : ''}`);
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
