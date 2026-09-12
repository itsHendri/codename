/**
 * A design token file, read, and the page held up against it.
 *
 * Penpot and Figma both hand out W3C DTCG JSON now, and Tokens Studio has for
 * years; Codename already writes it. So the file is the one place a design
 * tool and a running page can be compared without either guessing about the
 * other — and the comparison is the interesting artefact, not the file.
 *
 * The report obeys the same rule as `critique`: facts with the numbers behind
 * them, and no fix button. "The page paints #BE3A22 on 24 elements and no
 * token in the file holds it" is a fact. Whether that is wrong is the
 * reader's call, because a file is not always the source of truth.
 */

import { differenceEuclidean } from 'culori';
import type { ScanResult } from '@/shared/types';
import { EXACT_DISTANCE, hexOf } from './reskin';
import { toPx } from './tokenMatch';

export interface FileToken {
  /** The dotted path DTCG gives it: `color.brand.primary`. */
  name: string;
  value: string;
  /** DTCG's `$type`, where the file states one. */
  type?: string;
}

export type DriftKind = 'drifted' | 'untokenised' | 'unused' | 'parse';

export interface DriftFinding {
  kind: DriftKind;
  level: 'fail' | 'warn' | 'note';
  message: string;
  detail: Record<string, unknown>;
}

export interface DriftReport {
  /** How many tokens were read out of the file. */
  tokens: number;
  findings: DriftFinding[];
  summary: string;
}

const oklab = differenceEuclidean('oklab');
const MAX_PER_KIND = 8;

/* ---------------- reading the file ---------------- */

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * DTCG 2025 writes a dimension as `{ value: 16, unit: "px" }`; earlier files
 * write `"16px"`, and plenty write a bare `16`. A bare number under a
 * dimension type is px — saying `16` instead would compare equal to nothing
 * and report every numeric token as both drifted and unused.
 */
const DIMENSIONAL = /^(dimension|spacing|size|sizing|borderradius|borderwidth)$/i;

function scalar(value: unknown, type?: string): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') {
    const bare = String(value);
    return type && DIMENSIONAL.test(type.replace(/[\s_-]/g, '')) && value !== 0 ? `${bare}px` : bare;
  }
  if (isRecord(value) && (typeof value.value === 'number' || typeof value.value === 'string') && typeof value.unit === 'string') {
    return `${value.value}${value.unit}`;
  }
  return null;
}

/** `{color.brand}` names another token; a chain of them resolves below. */
const aliasOf = (value: string): string | null => {
  const m = /^\{([^}]+)\}$/.exec(value.trim());
  return m ? m[1]!.trim() : null;
};

/**
 * Every token in a file, flattened to dotted paths. One walk handles both
 * shapes people actually have: DTCG groups with `$value` leaves, and plain
 * custom properties written against their own names (`"--brand": "#BE3A22"`),
 * which is what a page exports. A file that mixes them loses nothing.
 */
export function parseTokenFile(text: string): { tokens: FileToken[]; error?: string } {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (err) {
    return { tokens: [], error: `that file is not JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isRecord(root)) return { tokens: [], error: 'a token file should be a JSON object' };

  const tokens: FileToken[] = [];
  const walk = (node: Record<string, unknown>, path: string[], inheritedType?: string) => {
    const type = (typeof node.$type === 'string' ? node.$type : typeof node.type === 'string' ? node.type : undefined) ?? inheritedType;
    const raw = '$value' in node ? node.$value : 'value' in node ? node.value : undefined;
    const value = raw === undefined ? null : scalar(raw, type);
    if (value !== null) {
      if (path.length) tokens.push({ name: path.join('.'), value, ...(type ? { type } : {}) });
      return;
    }
    // Not a leaf after all: a group can hold a token named `value`, and a
    // composite `$value` is an object this does not pretend to understand.
    // Either way its children still count.
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      // A custom property written straight against its name, which is what a
      // page exports and what someone will paste in beside a DTCG group.
      if (key.startsWith('--') && typeof child === 'string') {
        const value = child.trim();
        if (value) tokens.push({ name: key, value, ...(type ? { type } : {}) });
        continue;
      }
      if (isRecord(child)) walk(child, [...path, key], type);
    }
  };
  walk(root, []);

  // Aliases resolve once the whole file is read, so order in the file does not matter.
  const byName = new Map(tokens.map((t) => [t.name, t]));
  for (const token of tokens) {
    let value = token.value;
    for (let hops = 0; hops < 8; hops++) {
      const alias = aliasOf(value);
      if (!alias) break;
      const target = byName.get(alias);
      if (!target) break;
      value = target.value;
    }
    token.value = value;
  }
  return { tokens: tokens.filter((t) => !aliasOf(t.value)) };
}

/* ---------------- holding the page up against it ---------------- */

/** `color.brand.primary`, `--color-brand-primary` and `colorBrandPrimary` are one name. */
export const normaliseName = (name: string): string =>
  name
    .replace(/^--/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[.\s_]+/g, '-')
    .toLowerCase();

/** The last dotted or dashed segment of a name: what `color.brand.mark` is really called. */
const lastSegment = (normalised: string): string => normalised.split('-').pop() ?? normalised;

/**
 * Every variable paired with its token, in one pass.
 *
 * A file nests (`color.brand.mark`) where a page flattens (`--mark`), so an
 * exact match on the normalised name is tried first and then a match on the
 * trailing segments. The ambiguity guard then looks both ways: a variable
 * that two tokens answer to is left alone, and so is a token that two
 * variables answer to. Without the second half a short token like `size`
 * collects `--icon-size`, `--font-size` and `--line-size`, and reports three
 * drifts that are really one bad pairing.
 */
export function pairAll(
  variables: { name: string }[],
  tokens: FileToken[],
): Map<string, FileToken> {
  const byNorm = new Map<string, FileToken[]>();
  const bySegment = new Map<string, FileToken[]>();
  for (const token of tokens) {
    const norm = normaliseName(token.name);
    (byNorm.get(norm) ?? byNorm.set(norm, []).get(norm)!).push(token);
    const seg = lastSegment(norm);
    (bySegment.get(seg) ?? bySegment.set(seg, []).get(seg)!).push(token);
  }

  const paired = new Map<string, FileToken>();
  const claims = new Map<string, string[]>();
  for (const variable of variables) {
    const name = normaliseName(variable.name);
    const exact = byNorm.get(name) ?? [];
    // The candidates worth checking share a last segment with the variable.
    const candidates = exact.length ? exact : (bySegment.get(lastSegment(name)) ?? []).filter((t) => {
      const n = normaliseName(t.name);
      return n.endsWith(`-${name}`) || name.endsWith(`-${n}`);
    });
    if (candidates.length !== 1) continue;
    const token = candidates[0]!;
    paired.set(variable.name, token);
    (claims.get(token.name) ?? claims.set(token.name, []).get(token.name)!).push(variable.name);
  }
  // A token two variables both answer to says nothing about either.
  for (const [tokenName, variableNames] of claims) {
    if (variableNames.length > 1) for (const v of variableNames) paired.delete(v);
    void tokenName;
  }
  return paired;
}

/** Whether two token values say the same thing, comparing colours and lengths on their own terms. */
export function sameValue(a: string, b: string, rootFontSize = 16): boolean {
  const an = a.trim().toLowerCase();
  const bn = b.trim().toLowerCase();
  if (an === bn) return true;
  const ah = hexOf(a);
  const bh = hexOf(b);
  if (ah && bh) return oklab(ah, bh) < EXACT_DISTANCE;
  const ap = toPx(a, rootFontSize);
  const bp = toPx(b, rootFontSize);
  if (ap !== null && bp !== null) return Math.abs(ap - bp) < 0.01;
  return false;
}

type DriftScan = Pick<ScanResult, 'customProps' | 'colors'> & Partial<Pick<ScanResult, 'rootFontSize' | 'shape'>>;

/** A value filed so membership is a lookup: colours by hex, lengths by px, the rest by text. */
function valueKeys(values: string[], rootFontSize: number): Set<string> {
  const keys = new Set<string>();
  for (const value of values) {
    const hex = hexOf(value);
    if (hex) keys.add(`c:${hex.toUpperCase()}`);
    const px = toPx(value, rootFontSize);
    if (px !== null) keys.add(`l:${px}`);
    keys.add(`s:${value.trim().toLowerCase()}`);
  }
  return keys;
}

const keysOf = (value: string, rootFontSize: number): string[] => [...valueKeys([value], rootFontSize)];

/**
 * What the page and the file disagree about. Three kinds, each a fact:
 * a variable and its token have drifted apart, a colour the page paints has
 * no token at all, and a token nothing on this page uses.
 *
 * Named pairs are compared with the same tolerance the engine uses elsewhere,
 * since a name says the two are meant to be the same thing. The bulk
 * membership tests are exact: a colour a shade off a token is not that token,
 * and saying so is the point of the report.
 */
export function driftReport(scan: DriftScan, tokens: FileToken[], fileName = 'the token file'): DriftReport {
  const rootFontSize = scan.rootFontSize ?? 16;
  const findings: DriftFinding[] = [];

  // Drifted: the page and the file agree on a name and disagree on the value.
  const paired = pairAll(scan.customProps, tokens);
  const drifted: { variable: string; token: string; page: string; file: string }[] = [];
  const matchedTokens = new Set<string>();
  for (const prop of scan.customProps) {
    const token = paired.get(prop.name);
    if (!token) continue;
    matchedTokens.add(token.name);
    if (!sameValue(prop.value, token.value, rootFontSize)) {
      drifted.push({ variable: prop.name, token: token.name, page: prop.value.trim(), file: token.value });
    }
  }
  if (drifted.length) {
    const shown = drifted.slice(0, MAX_PER_KIND);
    findings.push({
      kind: 'drifted',
      level: 'fail',
      message: `${drifted.length} ${drifted.length === 1 ? 'variable has' : 'variables have'} drifted from ${fileName}: ${shown
        .map((d) => `${d.variable} is ${d.page}, ${d.token} is ${d.file}`)
        .join('; ')}${drifted.length > shown.length ? ', …' : ''}.`,
      detail: { drifted: shown, total: drifted.length },
    });
  }

  // Untokenised: a colour the page paints that no token in the file holds.
  const tokenKeys = valueKeys(tokens.map((t) => t.value), rootFontSize);
  const untokenised = scan.colors.filter((c) => !tokenKeys.has(`c:${c.hex.toUpperCase()}`)).sort((a, b) => b.count - a.count);
  if (untokenised.length) {
    const shown = untokenised.slice(0, MAX_PER_KIND);
    findings.push({
      kind: 'untokenised',
      level: 'warn',
      message: `${untokenised.length} ${untokenised.length === 1 ? 'colour the page paints is' : 'colours the page paints are'} in no token in ${fileName}: ${shown
        .map((c) => `${c.hex} ×${c.count}`)
        .join(', ')}${untokenised.length > shown.length ? ', …' : ''}.`,
      detail: { colours: shown.map((c) => ({ hex: c.hex, count: c.count })), total: untokenised.length },
    });
  }

  // Unused: a token whose name no variable carries and whose value the page
  // neither paints nor lays out with. Lengths count too, or every spacing
  // token in the file would read as unused on a page that is built on them.
  const renderedKeys = valueKeys(
    [
      ...scan.colors.map((c) => c.hex),
      ...scan.customProps.map((p) => p.value),
      ...(scan.shape?.spacing ?? []).map((t) => t.value),
      ...(scan.shape?.radii ?? []).map((t) => t.value),
    ],
    rootFontSize,
  );
  const unused = tokens.filter(
    (t) => !matchedTokens.has(t.name) && !keysOf(t.value, rootFontSize).some((key) => renderedKeys.has(key)),
  );
  if (unused.length) {
    const shown = unused.slice(0, MAX_PER_KIND);
    findings.push({
      kind: 'unused',
      level: 'note',
      message: `${unused.length} of ${tokens.length} tokens in ${fileName} reach nothing on this page: ${shown
        .map((t) => `${t.name} (${t.value})`)
        .join(', ')}${unused.length > shown.length ? ', …' : ''}.`,
      detail: { unused: shown.map((t) => t.name), total: unused.length },
    });
  }

  const tally = (level: DriftFinding['level']) => findings.filter((f) => f.level === level).length;
  const parts = ([['fail', tally('fail')], ['warn', tally('warn')], ['note', tally('note')]] as const).filter(([, n]) => n > 0);
  return {
    tokens: tokens.length,
    findings,
    summary: parts.length ? parts.map(([l, n]) => `${n} ${l}`).join(' · ') : 'the page and the file agree',
  };
}

/** The report as the agent reads it, in the same voice as the critique. */
export function driftToText(report: DriftReport, host: string, fileName: string): string {
  if (!report.findings.length) {
    return `${host} and ${fileName} agree, across ${report.tokens} tokens.`;
  }
  const lines = [
    `${host} against ${fileName} — ${report.summary}, across ${report.tokens} tokens. Facts from the rendered page, not taste; the file is not automatically right.`,
    '',
  ];
  for (const f of report.findings) lines.push(`- [${f.level}] ${f.kind}: ${f.message}`);
  return lines.join('\n');
}
