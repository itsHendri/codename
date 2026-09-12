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
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync, type Dirent } from 'node:fs';
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
 * Blanks out comments while keeping every newline, so a line number found in
 * the result is the line number in the file. A definition inside a comment is
 * not a definition.
 */
export function stripComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (const ch of text.slice(i, stop)) out += ch === '\n' ? '\n' : ' ';
      i = stop;
    } else if (two === '//' && !/[:\w]/.test(text[i - 1] ?? '')) {
      // Only a line comment, never the `//` in a url — a preceding letter or
      // colon means this is part of something else.
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** What a definition sits inside, from the block headers open around it. */
export function contextOf(open: string[]): Definition['context'] {
  const heads = open.map((h) => h.toLowerCase());
  if (heads.some((h) => h.includes('prefers-color-scheme') && h.includes('dark'))) return 'dark';
  if (heads.some((h) => h.startsWith('@media') || h.startsWith('@container') || h.startsWith('@supports'))) return 'media';
  // A theme block is Tailwind v4's root; `:root` and a bare `html` are CSS's.
  const selector = [...heads].reverse().find((h) => !h.startsWith('@'));
  if (selector === undefined) return 'root';
  const cleaned = selector.replace(/[{\s]+$/, '').trim();
  if (/^@theme\b/.test(selector)) return 'root';
  if (cleaned === ':root' || cleaned === 'html' || cleaned === ':host' || cleaned === ':root,html' || cleaned === 'html,:root') {
    return 'root';
  }
  return 'scoped';
}

/** The value text of `--name:` on a line, or null when the line does not hold one. */
export function declarationOn(line: string, name: string): { value: string; start: number; end: number } | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[\\s;{])(${escaped})\\s*:`).exec(line);
  if (!match) return null;
  const start = match.index + match[1]!.length + match[2]!.length;
  const colon = line.indexOf(':', start);
  if (colon === -1) return null;
  // The declaration runs to its semicolon, or to the end of its block.
  let end = line.length;
  for (let i = colon + 1, depth = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === ';' || ch === '}') && depth <= 0) {
      end = i;
      break;
    }
  }
  return { value: line.slice(colon + 1, end).trim(), start: colon + 1, end };
}

/**
 * Every `--name:` in one CSS-like file, with the block it sits in.
 *
 * Walks statements rather than lines: a declaration that wraps over three
 * lines is one statement, and a block that opens halfway through a line still
 * puts what follows it in the right context.
 */
export function definitionsInCss(text: string, names: string[], file: string): Record<string, Definition[]> {
  const found: Record<string, Definition[]> = {};
  const stripped = stripComments(text);
  if (!names.some((n) => stripped.includes(n))) return found;

  const open: string[] = [];
  let buffer = '';
  let bufferLine = 1;
  let line = 1;

  /** A finished statement: a declaration, or the head of a block. */
  const takeDeclaration = () => {
    if (buffer.trim()) {
      for (const name of names) {
        const decl = declarationOn(buffer, name);
        if (!decl?.value) continue;
        (found[name] ??= []).push({
          file,
          line: bufferLine,
          kind: /@theme\b/i.test(open.join(' ')) ? 'theme' : 'css',
          context: contextOf(open),
          value: decl.value,
        });
      }
    }
    buffer = '';
    bufferLine = line;
  };

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]!;
    if (ch === '\n') {
      line++;
      buffer += ch;
      if (!buffer.trim()) bufferLine = line;
      continue;
    }
    if (ch === '{') {
      open.push(buffer.trim());
      buffer = '';
      bufferLine = line;
    } else if (ch === '}') {
      takeDeclaration();
      open.pop();
      buffer = '';
      bufferLine = line;
    } else if (ch === ';') {
      takeDeclaration();
    } else {
      if (!buffer.trim() && !/\s/.test(ch)) bufferLine = line;
      buffer += ch;
    }
  }
  takeDeclaration();
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
 * Writes one value into one definition, or refuses with a reason a person can
 * act on. Everything about it is narrow on purpose: this is the only write
 * the bridge ever makes.
 */
export function applyDefinition(cwd: string, edit: ApplyEdit, opts: FindOptions = {}): AppliedDefinition {
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
  const lines = text.split('\n');
  const index = edit.line - 1;
  const line = lines[index];
  if (line === undefined) throw new ApplyRefused(`${edit.file} has no line ${edit.line}`);

  const decl = declarationOn(line, edit.name);
  if (!decl) throw new ApplyRefused(`line ${edit.line} of ${edit.file} does not declare ${edit.name}`);
  // One declaration per line, or the value being replaced is a guess.
  if (declarationOn(line.slice(decl.end), edit.name)) {
    throw new ApplyRefused(`line ${edit.line} of ${edit.file} declares ${edit.name} more than once`);
  }

  // Only the value text moves; the indentation, the spacing after the colon
  // and anything else on the line are the file's business.
  const value = line.slice(decl.start, decl.end);
  const leading = value.slice(0, value.length - value.trimStart().length);
  const trailing = value.slice(value.trimEnd().length);
  lines[index] = line.slice(0, decl.start) + leading + edit.to + trailing + line.slice(decl.end);

  const temp = join(dirname(absolute), `.codename-${Date.now()}.tmp`);
  writeFileSync(temp, lines.join('\n'));
  renameSync(temp, absolute);

  return { name: edit.name, file: edit.file, line: edit.line, from: target.value, to: edit.to };
}
