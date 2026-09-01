/**
 * Persistence for Studio brands. Replaces Brand Forge's dev-server file sidecar
 * (`GET/PUT /api/brands/:slug`) — there is no filesystem here.
 *
 * Brands live in `chrome.storage.local` under `brand:<slug>`. Saving is explicit
 * from the caller's debounce; unlike the original there is no `.backup/`
 * directory, so the undo stack in the editor is the only safety net for a bad
 * edit within a session, and `listBrands()` is the only way back to an old one.
 */

import type { BrandConfig } from './engine/types';
import { migrateConfig } from './engine/schema';
import { hendriPreset } from './presets/hendri';

const KEY_PREFIX = 'brand:';
const INDEX_KEY = 'brandIndex';

/**
 * Outside the extension (a plain file:// preview of the built page) there is no
 * chrome.storage. Studio still has to render, so reads come back empty and
 * writes are dropped rather than throwing on load.
 */
function available(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export interface BrandSummary {
  slug: string;
  name: string;
  domain?: string;
  updatedAt: number;
}

function key(slug: string): string {
  return `${KEY_PREFIX}${slug}`;
}

export async function listBrands(): Promise<BrandSummary[]> {
  if (!available()) return [];
  const stored = await chrome.storage.local.get(INDEX_KEY);
  const index = (stored[INDEX_KEY] as BrandSummary[]) ?? [];
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadBrand(slug: string): Promise<BrandConfig | null> {
  if (!available()) return null;
  const stored = await chrome.storage.local.get(key(slug));
  const raw = stored[key(slug)];
  if (!raw) return null;
  // Same three-level merge the dev-server host needed: a shipped default can
  // gain a block, a key, or an item after a brand was saved.
  const { config, filled } = migrateConfig(raw, hendriPreset);
  if (filled.length) {
    console.info(`[studio] ${slug}: filled ${filled.length} missing field(s)`, filled);
  }
  return config;
}

export async function saveBrand(config: BrandConfig): Promise<void> {
  if (!available()) return;
  const { slug, name, domain } = config.meta;
  await chrome.storage.local.set({ [key(slug)]: config });
  const index = await listBrands();
  const entry: BrandSummary = { slug, name, domain, updatedAt: Date.now() };
  const next = [entry, ...index.filter((b) => b.slug !== slug)];
  await chrome.storage.local.set({ [INDEX_KEY]: next });
}

export async function deleteBrand(slug: string): Promise<void> {
  if (!available()) return;
  await chrome.storage.local.remove(key(slug));
  const index = await listBrands();
  await chrome.storage.local.set({ [INDEX_KEY]: index.filter((b) => b.slug !== slug) });
}

/** Slug that is safe as a storage key and a folder name. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'brand'
  );
}
