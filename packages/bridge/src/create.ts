/**
 * Adding a tokens stylesheet to a project, for a page that has none.
 *
 * The writer replaces values in definitions the page already has. A page
 * with no tokens has nothing to replace, so the first write is a new file
 * — `src/tokens.css`, say — and one line importing it from the stylesheet
 * the app already loads. That is the whole edit: the file is written once
 * and only if nothing is there already, the import is inserted after the
 * statements CSS requires to come first, and no other byte moves. Replacing
 * the page's literals with the new tokens is left to the agent, from the
 * brief; that is a judgement about every rule, not a splice.
 */

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import type { CreatedFile, EntryStylesheet } from '../../../shared/protocol';
import { writeFileAtomic } from './definitions';

export class CreateRefused extends Error {}

const read = (absolute: string): string | null => {
  try {
    return statSync(absolute).isFile() ? readFileSync(absolute, 'utf8') : null;
  } catch {
    return null;
  }
};

const inside = (cwd: string, path: string): string | null => {
  if (isAbsolute(path)) return null;
  const abs = normalize(join(cwd, path));
  const rel = relative(cwd, abs);
  if (!rel || rel.startsWith('..') || rel.split(sep).includes('node_modules')) return null;
  return rel.split(sep).join('/');
};

/**
 * The stylesheet the app loads first, where an import of the tokens file
 * belongs. Each framework has a conventional place; a Vite app says so in
 * `index.html` or the first CSS its entry module imports. Null when none of
 * these exist: the panel then offers the file to download instead of
 * guessing a place for it.
 */
export function entryStylesheet(cwd: string): EntryStylesheet | null {
  const conventional: [string, EntryStylesheet['via']][] = [
    ['app/globals.css', 'next'],
    ['src/app/globals.css', 'next'],
    ['src/styles/global.css', 'astro'],
    ['src/styles/globals.css', 'astro'],
  ];
  for (const [file, via] of conventional) if (read(join(cwd, file)) !== null) return { file, via };

  const html = read(join(cwd, 'index.html'));
  if (html !== null) {
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      if (!href || /^(https?:)?\/\//i.test(href)) continue;
      const file = inside(cwd, href.replace(/^\//, ''));
      if (file && read(join(cwd, file)) !== null) return { file, via: 'link' };
    }
  }
  for (const entry of ['src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js', 'src/index.tsx', 'src/index.ts', 'src/index.jsx', 'src/index.js']) {
    const text = read(join(cwd, entry));
    if (text === null) continue;
    for (const m of text.matchAll(/import\s+["']([^"']+\.css)["']/g)) {
      const file = inside(cwd, join(dirname(entry), m[1]!));
      if (file && read(join(cwd, file)) !== null) return { file, via: 'import' };
    }
  }
  for (const file of ['src/index.css', 'src/styles.css', 'src/global.css', 'src/app.css', 'styles/globals.css', 'style.css']) {
    if (read(join(cwd, file)) !== null) return { file, via: 'conventional' };
  }
  return null;
}

/**
 * Where a new `@import` may go: after the statements the grammar puts
 * first — `@charset`, other imports, `@layer a, b;` statement lists — and
 * the comments and blank lines between them. Before the first rule, so the
 * import is legal, and after the last import, so Tailwind's own comes first
 * and a `@theme` in the tokens file is read by it.
 */
export function importPoint(css: string): number {
  let i = 0;
  // Right after the last statement or comment consumed, so the import lands
  // on its own line directly below it and the blank lines after stay where
  // they were.
  let last = 0;
  const n = css.length;
  for (;;) {
    while (i < n && /\s/.test(css[i]!)) i++;
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) return last;
      i = last = end + 2;
      continue;
    }
    if (css[i] === '@') {
      const m = /^@(charset|import|layer)\b([^;{]*)(;|\{)/.exec(css.slice(i));
      if (m && m[3] === ';') {
        i = last = i + m[0].length;
        continue;
      }
    }
    return last;
  }
}

export interface CreateOptions {
  /** Project-relative path of the file to add; refused if it exists. */
  path: string;
  content: string;
  /** The stylesheet to import it from; refused if it does not exist. */
  importInto?: string;
}

/** The import line the entry gets, relative to itself. */
export function importLine(from: string, to: string): string {
  let rel = relative(dirname(from), to).split(sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return `@import '${rel}';`;
}

export function createTokensFile(cwd: string, opts: CreateOptions): CreatedFile {
  const file = inside(cwd, opts.path);
  if (!file) throw new CreateRefused(`${opts.path} is not inside the project`);
  if (!file.endsWith('.css')) throw new CreateRefused(`${opts.path} is not a stylesheet`);
  if (existsSync(join(cwd, file))) throw new CreateRefused(`${file} exists already; this bridge adds a file, it does not replace one`);
  if (!opts.content.trim()) throw new CreateRefused('nothing to write');

  let importedFrom: string | undefined;
  let line: number | undefined;
  let nextEntry: string | undefined;
  if (opts.importInto) {
    importedFrom = inside(cwd, opts.importInto) ?? undefined;
    const text = importedFrom ? read(join(cwd, importedFrom)) : null;
    if (!importedFrom || text === null) throw new CreateRefused(`${opts.importInto} is not a stylesheet in the project`);
    const statement = importLine(importedFrom, file);
    if (text.includes(statement)) throw new CreateRefused(`${importedFrom} imports ${file} already`);
    const at = importPoint(text);
    const before = text.slice(0, at);
    const after = text.slice(at);
    // On its own line: a newline before it unless it is the first thing in
    // the file, and one after it unless what follows already starts one.
    const lead = before.length && !before.endsWith('\n') ? '\n' : '';
    const trail = after.startsWith('\n') || after === '' ? '' : '\n';
    nextEntry = `${before}${lead}${statement}${after === '' ? '\n' : trail}${after}`;
    line = before.split('\n').length + (lead ? 1 : 0);
  }

  // The file first: if the import could not be written the file is at
  // worst unused, whereas an import of a file that never came is a broken build.
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileAtomic(join(cwd, file), opts.content.endsWith('\n') ? opts.content : `${opts.content}\n`, file);
  if (importedFrom && nextEntry !== undefined) writeFileAtomic(join(cwd, importedFrom), nextEntry, importedFrom);
  return { file, ...(importedFrom ? { importedFrom, line } : {}) };
}
