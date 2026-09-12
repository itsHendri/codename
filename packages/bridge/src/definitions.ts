/**
 * Where a custom property is defined in source.
 *
 * The extension only ever sees a rendered page, so it has always refused to
 * name a file and a line: that would be a guess. The bridge is different — it
 * is running in the folder, so it can look. What it reports is a find, and
 * where a find is ambiguous it says how many rather than picking one.
 *
 * Applying an edit is deliberately narrower than finding one. Only a
 * definition at the root of the cascade, alone on its line, still holding the
 * value it held when it was found, can be written to. Everything else is
 * handed back to the person with the reason.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, type Dirent } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import type { AppliedDefinition, Definition, DefinitionsPayload } from '../../../shared/protocol';
import { pairAll, parseTokenFile } from '@/studio/tokenFile';
import { repoRelative, resolveInside } from './repo';

export const MAX_FILES = 5_000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const BUDGET_MS = 800;

/** Folders that hold build output or dependencies, never a source of truth. */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.git', '.next', '.nuxt', '.output',
  '.svelte-kit', '.wxt', 'coverage', '.cache', '.turbo', '.vercel', 'vendor',
]);

/** Files whose text can hold a custom property declaration. */
const CSS_LIKE = new Set(['.css', '.scss', '.less', '.pcss', '.sass', '.styl', '.html', '.vue', '.svelte', '.astro']);

const isTokenJson = (name: string): boolean => name.endsWith('.json') && /token|theme|design/i.test(name);

export const isSearchable = (name: string): boolean => CSS_LIKE.has(extname(name).toLowerCase()) || isTokenJson(name);

export interface Run {
  (cmd: string, args: string[], cwd: string): string | null;
}

const defaultRun: Run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 5_000, maxBuffer: 32 * 1024 * 1024 });
  if (r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
  return r.stdout;
};

/**
 * Every file worth reading, repository-relative. Git knows what is ignored,
 * so it is asked first; a folder that is not a repository gets a walk with
 * the usual suspects pruned.
 */
export function listFiles(cwd: string, run: Run = defaultRun, max = MAX_FILES): { files: string[]; truncated: boolean } {
  const tracked = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd);
  if (tracked !== null) {
    const all = tracked.split('\0').filter(Boolean).filter(isSearchable);
    return { files: all.slice(0, max), truncated: all.length > max };
  }

  const files: string[] = [];
  let truncated = false;
  const walk = (dir: string, prefix: string) => {
    if (truncated) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.isFile() && isSearchable(entry.name)) {
        if (files.length >= max) {
          truncated = true;
          return;
        }
        files.push(`${prefix}${entry.name}`);
      }
    }
  };
  walk(cwd, '');
  return { files, truncated };
}

/**
 * Blanks out comments while keeping every character position, so an offset
 * into the result is an offset into the file. A definition inside a comment
 * is not a definition.
 *
 * A `//` is a comment only outside strings and brackets and not straight
 * after a colon — otherwise `url(//cdn/x.png)`, `"//a"` and `https://x` each
 * blank the rest of their line and swallow the declarations after it.
 */
export function stripComments(text: string): string {
  const out: string[] = [];
  let i = 0;
  let quote = '';
  let depth = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (quote) {
      out.push(ch);
      if (ch === '\\' && i + 1 < text.length) {
        out.push(text[i + 1]!);
        i += 2;
        continue;
      }
      if (ch === quote) quote = '';
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out.push(ch);
      i++;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '/*') {
      const at = text.indexOf('*/', i + 2);
      const stop = at === -1 ? text.length : at + 2;
      for (const c of text.slice(i, stop)) out.push(c === '\n' ? '\n' : ' ');
      i = stop;
    } else if (two === '//' && depth === 0 && text[i - 1] !== ':') {
      const at = text.indexOf('\n', i);
      const stop = at === -1 ? text.length : at;
      out.push(' '.repeat(stop - i));
      i = stop;
    } else {
      if (ch === '(') depth++;
      else if (ch === ')' && depth > 0) depth--;
      out.push(ch);
      i++;
    }
  }
  return out.join('');
}

/** Selectors that put a definition at the root of the cascade. */
const ROOT_SELECTORS = new Set([':root', 'html', ':host', ':root,html', 'html,:root']);

/** What a definition sits inside, from the block heads open around it. */
export function contextOf(open: string[]): Definition['context'] {
  const heads = open.map((h) => h.toLowerCase());
  if (heads.some((h) => h.includes('prefers-color-scheme') && h.includes('dark'))) return 'dark';
  if (heads.some((h) => h.startsWith('@media') || h.startsWith('@container') || h.startsWith('@supports'))) return 'media';
  // `@layer`, `@theme` and the like wrap without scoping; the innermost real
  // selector is what decides, and no selector at all means the top level.
  const selector = [...heads].reverse().find((h) => !h.startsWith('@'));
  if (selector === undefined) return 'root';
  const cleaned = selector.replace(/[{\s]+$/, '').trim().replace(/\s*,\s*/g, ',');
  return ROOT_SELECTORS.has(cleaned) ? 'root' : 'scoped';
}

/**
 * Where the value of `--name` sits inside one statement, or null.
 *
 * `text` has already had its comments blanked. The value ends at the first
 * `;` or `}` outside brackets and quotes, which is where the browser ends it
 * too — so `url("a;b")` and `var(--x, a)` stay whole.
 */
export function declarationOn(text: string, name: string): { value: string; start: number; end: number } | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[\\s;{])(${escaped})\\s*:`).exec(text);
  if (!match) return null;
  const colon = text.indexOf(':', match.index + match[1]!.length + match[2]!.length);
  if (colon === -1) return null;
  let end = text.length;
  let depth = 0;
  let quote = '';
  for (let i = colon + 1; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === ';' || ch === '}') && depth <= 0) {
      end = i;
      break;
    }
  }
  return { value: text.slice(colon + 1, end).trim(), start: colon + 1, end };
}

/** A definition, plus which name it is and exactly where its value sits. */
export interface Located extends Definition {
  name: string;
  /** Offsets of the trimmed value text in the file. */
  valueStart: number;
  valueEnd: number;
}

/**
 * Every `--name:` in one CSS-like file, with the block it sits in and the
 * span of its value.
 *
 * Walks statements rather than lines, so a declaration wrapped over three
 * lines is one statement; and carries offsets rather than a line number
 * alone, so the write path replaces exactly the text the search read. Quotes
 * are tracked, because a `}` inside a string does not close a block.
 */
export function scanCss(text: string, names: string[], file: string): Located[] {
  const stripped = stripComments(text);
  if (!names.some((n) => stripped.includes(n))) return [];

  const found: Located[] = [];
  const open: string[] = [];
  let start = 0;
  let line = 1;
  let statementLine = 1;
  let quote = '';

  /**
   * The head of a block. Taken from the end of the buffer: in a `.vue` or
   * `.astro` file everything before `</style>` is markup, not a selector, and
   * in `.a > .b` it is the right-hand side that scopes.
   */
  const headOf = (raw: string) => {
    const lastLine = raw.split('\n').pop() ?? raw;
    return (lastLine.split('>').pop() ?? lastLine).trim();
  };

  const take = (from: number, to: number, atLine: number) => {
    const statement = stripped.slice(from, to);
    if (!statement.trim()) return;
    for (const name of names) {
      const decl = declarationOn(statement, name);
      if (!decl?.value) continue;
      const raw = statement.slice(decl.start, decl.end);
      const lead = raw.length - raw.trimStart().length;
      const trail = raw.length - raw.trimEnd().length;
      found.push({
        name,
        file,
        line: atLine,
        kind: /@theme\b/i.test(open.join(' ')) ? 'theme' : 'css',
        context: contextOf(open),
        value: decl.value,
        valueStart: from + decl.start + lead,
        valueEnd: from + decl.end - trail,
      });
    }
  };

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]!;
    if (ch === '\n') line++;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '}' || ch === ';') {
      if (ch === '{') open.push(headOf(stripped.slice(start, i)));
      else {
        take(start, i, statementLine);
        if (ch === '}') open.pop();
      }
      start = i + 1;
      statementLine = line;
    } else if (!/\s/.test(ch) && !stripped.slice(start, i).trim()) {
      // The statement begins at its first real character, not at the
      // whitespace the last one left behind.
      statementLine = line;
    }
  }
  take(start, stripped.length, statementLine);
  return found;
}

/** Every `--name:` in one CSS-like file, keyed by name, as the protocol reports them. */
export function definitionsInCss(text: string, names: string[], file: string): Record<string, Definition[]> {
  const found: Record<string, Definition[]> = {};
  for (const hit of scanCss(text, names, file)) {
    const { name, valueStart, valueEnd, ...definition } = hit;
    void valueStart;
    void valueEnd;
    (found[name] ??= []).push(definition);
  }
  return found;
}

/**
 * Tokens in a JSON file that answer to one of the names.
 *
 * The pairing is the one the token-file report already uses, ambiguity guard
 * and all: a variable two tokens could answer to is left unpaired rather than
 * assigned to whichever came first.
 */
export function definitionsInJson(text: string, names: string[], file: string): Record<string, Definition[]> {
  const found: Record<string, Definition[]> = {};
  const { tokens } = parseTokenFile(text);
  if (!tokens.length) return found;
  const paired = pairAll(names.map((name) => ({ name })), tokens);
  const lines = text.split('\n');

  for (const [name, token] of paired) {
    // The line of the leaf's own key, when the file names it exactly once.
    const key = token.name.split('.').pop() ?? token.name;
    const needle = `"${key}"`;
    const hits = lines.reduce<number[]>((acc, line, i) => (line.includes(needle) ? [...acc, i + 1] : acc), []);
    found[name] = [
      {
        file,
        line: hits.length === 1 ? hits[0]! : null,
        kind: token.name.startsWith('--') ? 'flat-json' : 'dtcg',
        context: 'root',
        value: token.value,
      },
    ];
  }
  return found;
}

export interface FindOptions {
  run?: Run;
  now?: () => number;
  budgetMs?: number;
  maxFiles?: number;
}

/** Where each of `names` is defined in the project, as far as a search can tell. */
export function findDefinitions(cwd: string, names: string[], opts: FindOptions = {}): DefinitionsPayload {
  const { run = defaultRun, now = Date.now, budgetMs = BUDGET_MS, maxFiles = MAX_FILES } = opts;
  const wanted = [...new Set(names.filter((n) => n.startsWith('--')))];
  if (!wanted.length) return { found: {} };

  const started = now();
  const { files, truncated: tooMany } = listFiles(cwd, run, maxFiles);
  const found: Record<string, Definition[]> = {};
  let truncated = tooMany;

  for (const file of files) {
    if (now() - started > budgetMs) {
      truncated = true;
      break;
    }
    const absolute = resolveInside(cwd, file);
    if (!absolute) continue;
    let text: string;
    try {
      if (statSync(absolute).size > MAX_FILE_BYTES) continue;
      text = readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    const here = isTokenJson(file) ? definitionsInJson(text, wanted, file) : definitionsInCss(text, wanted, file);
    for (const [name, hits] of Object.entries(here)) (found[name] ??= []).push(...hits);
  }

  return { found, ...(truncated ? { truncated: true } : {}) };
}

/* ---------------- writing one of them ---------------- */

export class ApplyRefused extends Error {}

export interface ApplyEdit {
  name: string;
  from: string;
  to: string;
  file: string;
  line: number;
}

/** Whitespace and case are not a difference; anything else is. */
const sameValue = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * A value that could only ever be a value.
 *
 * Everything here would end the declaration or start another one, and the
 * consent the person gave was for one value in one definition — not for
 * arbitrary text at that offset. An agent asking for `red; } body {…` is
 * refused rather than trusted.
 */
export function badValue(to: string): string | null {
  if (!to.trim()) return 'the new value is empty';
  if (/[;{}]/.test(to)) return 'a value cannot contain `;`, `{` or `}`';
  if (/[\n\r]/.test(to)) return 'a value cannot span lines';
  if (to.includes('/*') || to.includes('*/') || to.includes('//')) return 'a value cannot contain a comment';
  if (to.length > 500) return 'that value is too long to be one';
  // Unbalanced brackets or an unclosed quote would swallow what follows.
  let depth = 0;
  let quote = '';
  for (let i = 0; i < to.length; i++) {
    const ch = to[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return 'that value has unbalanced brackets';
  }
  if (depth !== 0) return 'that value has unbalanced brackets';
  if (quote) return 'that value has an unclosed quote';
  return null;
}

/**
 * Writes one value into one definition, or refuses with a reason a person can
 * act on. Everything about it is narrow on purpose: this is the only write
 * the bridge ever makes.
 *
 * The file is searched again here rather than trusting what was found
 * earlier, and the write uses the offsets that search returned — so a
 * declaration that wrapped over three lines is replaced as the one thing it
 * is, and a file that changed since the panel last heard about it is refused
 * rather than written over.
 */
export function applyDefinition(cwd: string, edit: ApplyEdit, opts: FindOptions = {}): AppliedDefinition {
  const wrong = badValue(edit.to);
  if (wrong) throw new ApplyRefused(wrong);

  const { found } = findDefinitions(cwd, [edit.name], opts);
  const candidates = found[edit.name] ?? [];
  if (!candidates.length) throw new ApplyRefused(`${edit.name} is not defined anywhere this bridge can see`);

  const roots = candidates.filter((c) => c.context === 'root');
  if (roots.length !== 1) {
    const where = candidates.map((c) => `${c.file}${c.line ? `:${c.line}` : ''} (${c.context})`).join(', ');
    throw new ApplyRefused(
      roots.length === 0
        ? `every definition of ${edit.name} sits inside a media query or a scoped selector, so which one wins depends on the page: ${where}`
        : `${edit.name} has ${roots.length} definitions at the root of the cascade, so this cannot pick one: ${where}`,
    );
  }
  const target = roots[0]!;
  if (target.file !== edit.file || target.line !== edit.line) {
    throw new ApplyRefused(
      `${edit.name} has moved since it was found — it is now at ${target.file}${target.line ? `:${target.line}` : ''}`,
    );
  }
  if (target.kind !== 'css' && target.kind !== 'theme') {
    throw new ApplyRefused(`${edit.name} is defined in a token file, which this does not edit`);
  }
  if (!sameValue(target.value, edit.from)) {
    throw new ApplyRefused(`${edit.name} is \`${target.value}\` in source, not \`${edit.from}\`; it changed since it was read`);
  }

  const absolute = resolveInside(cwd, edit.file);
  if (!absolute) throw new ApplyRefused(`"${edit.file}" is outside the folder this bridge is running in`);
  const text = readFileSync(absolute, 'utf8');

  // The span comes from a fresh read of this file, so it cannot be stale
  // against the bytes about to be written.
  const here = scanCss(text, [edit.name], edit.file).filter((d) => d.context === 'root');
  if (here.length !== 1) throw new ApplyRefused(`${edit.name} is no longer the only root definition in ${edit.file}`);
  const span = here[0]!;
  if (span.line !== edit.line || !sameValue(span.value, edit.from)) {
    throw new ApplyRefused(`${edit.file} changed while this was being applied; nothing was written`);
  }

  const next = text.slice(0, span.valueStart) + edit.to + text.slice(span.valueEnd);
  // A temp file and a rename, so a reader never sees half a file — wearing
  // the permissions the original had, since the default would widen them.
  const mode = (() => {
    try {
      return statSync(absolute).mode & 0o777;
    } catch {
      return 0o644;
    }
  })();
  const temp = join(dirname(absolute), `.codename-${process.pid}-${randomBytes(4).toString('hex')}.tmp`);
  try {
    writeFileSync(temp, next, { mode });
    chmodSync(temp, mode);
    renameSync(temp, absolute);
  } catch (err) {
    try {
      unlinkSync(temp);
    } catch {
      /* it may never have been created */
    }
    throw new ApplyRefused(`could not write ${edit.file}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { name: edit.name, file: edit.file, line: edit.line, from: span.value, to: edit.to };
}
