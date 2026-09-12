/**
 * Reading files out of the folder the bridge runs in.
 *
 * The one rule: nothing outside that folder, ever. A path is resolved and
 * then checked against the real root, so `../`, an absolute path and a
 * symlink pointing away all fail the same way — as null, not an exception
 * with a filesystem path in it.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** The absolute path of `rel` inside `cwd`, or null when it escapes. */
export function resolveInside(cwd: string, rel: string): string | null {
  let root: string;
  try {
    root = realpathSync(cwd);
  } catch {
    return null;
  }
  const absolute = isAbsolute(rel) ? rel : resolve(root, rel);
  // Resolve symlinks where the target exists; where it does not, the lexical
  // path is all there is, and it still has to sit inside.
  let real: string;
  try {
    real = realpathSync(absolute);
  } catch {
    real = resolve(absolute);
  }
  if (real !== root && !real.startsWith(root + sep)) return null;
  return real;
}

/** `rel` as the repository sees it: relative, posix separators. */
export function repoRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/');
}

export interface ReadResult {
  path: string;
  content: string;
}

/**
 * Reads a file inside the project. Errors are worded for an agent, since one
 * of them will read them.
 */
export function readProjectFile(cwd: string, rel: string, maxBytes = MAX_FILE_BYTES): ReadResult {
  const absolute = resolveInside(cwd, rel);
  if (!absolute) throw new Error(`"${rel}" is outside the folder this bridge is running in; give a path inside the project`);
  let size: number;
  try {
    size = statSync(absolute).size;
  } catch {
    throw new Error(`no file at "${rel}" in this project`);
  }
  if (size > maxBytes) throw new Error(`"${rel}" is ${Math.round(size / 1024)}kB; the limit is ${Math.round(maxBytes / 1024)}kB`);
  return { path: rel, content: readFileSync(absolute, 'utf8') };
}
