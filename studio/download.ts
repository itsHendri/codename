/**
 * Export transport for the extension. Brand Forge had two: a dev-server that
 * wrote a tree to disk, and a one-file-at-a-time browser fallback. Neither
 * exists here, so the whole bundle ships as a single ZIP — which is also the
 * only way to hand someone a `skill/` folder from a browser.
 */

import { strToU8, zipSync } from 'fflate';
import type { ExportFile } from './export/bundle';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function zipBundle(files: ExportFile[], rootDir: string): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[`${rootDir}/${file.path}`] =
      file.encoding === 'base64' ? base64ToBytes(file.content) : strToU8(file.content);
  }
  return zipSync(entries, { level: 6 });
}

export function download(filename: string, data: Uint8Array | string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadBundle(files: ExportFile[], slug: string): void {
  download(`${slug}-design-system.zip`, zipBundle(files, slug), 'application/zip');
}
