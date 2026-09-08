/**
 * The pairing code and the file that advertises a running bridge.
 *
 * `~/.codename/bridge.json` is how the extension (and a second `codename-bridge`
 * invocation) finds the live process. It is written 0600 because the token in
 * it is the whole authentication story for the local socket.
 */

import { randomInt } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Uppercase alphanumerics minus the glyphs people misread: 0/O and 1/I. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const TOKEN_LENGTH = 6;
export const TOKEN_RE = new RegExp(`^[${ALPHABET}]{${TOKEN_LENGTH}}$`);

export function generateToken(): string {
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) token += ALPHABET[randomInt(ALPHABET.length)];
  return token;
}

export interface BridgeFile {
  token: string;
  port: number;
  pid: number;
  startedAt: string;
}

export const bridgeFilePath = (home = homedir()): string => join(home, '.codename', 'bridge.json');

export function readBridgeFile(path: string): BridgeFile | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<BridgeFile>;
    if (typeof raw.token !== 'string' || typeof raw.port !== 'number' || typeof raw.pid !== 'number') return null;
    return { token: raw.token, port: raw.port, pid: raw.pid, startedAt: String(raw.startedAt ?? '') };
  } catch {
    return null;
  }
}

export function writeBridgeFile(path: string, file: BridgeFile): void {
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
  // writeFileSync's mode only applies on create; an existing file keeps its bits.
  chmodSync(path, 0o600);
}

/** Removes the file only when it still describes this process. */
export function removeBridgeFile(path: string, pid: number): boolean {
  const current = readBridgeFile(path);
  if (!current || current.pid !== pid) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}
