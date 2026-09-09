import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bridgeFilePath,
  generateToken,
  readBridgeFile,
  readPairingCode,
  removeBridgeFile,
  TOKEN_RE,
  writeBridgeFile,
} from './pairing';

describe('generateToken', () => {
  it('is six characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const token = generateToken();
      expect(token).toMatch(TOKEN_RE);
      expect(token).not.toMatch(/[01OI]/);
    }
  });

  it('varies', () => {
    expect(new Set(Array.from({ length: 50 }, generateToken)).size).toBeGreaterThan(40);
  });
});

describe('bridge file', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tempHome = () => {
    const d = mkdtempSync(join(tmpdir(), 'codename-'));
    dirs.push(d);
    return d;
  };

  it('round-trips with mode 0600', () => {
    const path = bridgeFilePath(tempHome());
    const file = { token: 'K7M4XQ', port: 9612, pid: 4242, startedAt: '2026-09-08T00:00:00.000Z' };
    writeBridgeFile(path, file);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readBridgeFile(path)).toEqual(file);
  });

  it('reads a missing or malformed file as null', () => {
    const path = bridgeFilePath(tempHome());
    expect(readBridgeFile(path)).toBeNull();
    writeBridgeFile(path, { token: 'A', port: 1, pid: 1, startedAt: '' });
    expect(readBridgeFile(path)).not.toBeNull();
  });

  it('reads the code only while the process that wrote it is alive', () => {
    const path = bridgeFilePath(tempHome());
    writeBridgeFile(path, { token: 'K7M4XQ', port: 9612, pid: process.pid, startedAt: '' });
    expect(readPairingCode(path)).toEqual({ token: 'K7M4XQ', port: 9612 });
    // A pid no process has: the file is a leftover from a crash.
    writeBridgeFile(path, { token: 'K7M4XQ', port: 9612, pid: 2 ** 22 - 1, startedAt: '' });
    expect(readPairingCode(path)).toBeNull();
    expect(readPairingCode(bridgeFilePath(tempHome()))).toBeNull();
  });

  it('only removes a file that names our pid', () => {
    const path = bridgeFilePath(tempHome());
    writeBridgeFile(path, { token: 'K7M4XQ', port: 9612, pid: 4242, startedAt: '' });
    expect(removeBridgeFile(path, 1)).toBe(false);
    expect(readBridgeFile(path)).not.toBeNull();
    expect(removeBridgeFile(path, 4242)).toBe(true);
    expect(readBridgeFile(path)).toBeNull();
  });
});
