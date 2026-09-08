/**
 * The edited system, derived once from the session and shared by whoever
 * needs it: the Design tab to render, the hand-off to describe, and the live
 * re-skin to push to the page.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig, Mode, ResolvedTokens } from '@/studio/engine/types';
import { resolveTokens } from '@/studio/engine/resolve';
import { seedBrandFromScan } from '@/studio/seedFromScan';
import { buildColorMap, buildReskin, type Override } from '@/studio/reskin';
import { applyReskin, type ReskinResult } from './messaging';

export interface DesignModel {
  /** What the page actually uses. */
  seeded: BrandConfig;
  /** The system being shown: the edit if there is one, else the seed. */
  brand: BrandConfig;
  resolved: ResolvedTokens;
  baseline: ResolvedTokens;
  edited: boolean;
  /** What the page's own variables become under the edit. */
  overrides: Override[];
  /** old hex → new hex, for pages with no variables to override. */
  colorMap: Record<string, string>;
}

export function useDesignModel(
  scan: ScanResult | null,
  config: BrandConfig | null,
  mode: Mode,
): DesignModel | null {
  return useMemo(() => {
    if (!scan) return null;
    const seeded = seedBrandFromScan(scan);
    const brand = config ?? seeded;
    const resolved = resolveTokens(brand);
    const baseline = config ? resolveTokens(seeded) : resolved;
    const edited = config !== null;
    return {
      seeded,
      brand,
      resolved,
      baseline,
      edited,
      overrides: edited ? buildReskin(scan.customProps, baseline, resolved, mode) : [],
      colorMap: edited ? buildColorMap(scan.colors, baseline, resolved, mode) : {},
    };
  }, [scan, config, mode]);
}

/**
 * Push the model to the page whenever it changes. Sending an empty set is how
 * the page is restored, so "live off" and "reverted" are the same message.
 */
export function useLiveReskin(
  tabId: number | null,
  live: boolean,
  model: DesignModel | null,
): ReskinResult | null {
  const [result, setResult] = useState<ReskinResult | null>(null);
  const lastSent = useRef<{ tabId: number | null; key: string }>({ tabId: null, key: '' });

  const overrides = live ? (model?.overrides ?? []) : [];
  const colorMap = live ? (model?.colorMap ?? {}) : {};

  useEffect(() => {
    if (!tabId) return;
    const key = JSON.stringify([overrides, colorMap]);
    const empty = overrides.length === 0 && Object.keys(colorMap).length === 0;
    if (lastSent.current.tabId === tabId && lastSent.current.key === key) return;
    // A fresh tab with nothing to apply needs no message; the page is its own.
    if (lastSent.current.tabId !== tabId && empty) {
      lastSent.current = { tabId, key };
      setResult(null);
      return;
    }
    lastSent.current = { tabId, key };
    void applyReskin(tabId, overrides, colorMap).then((r) => setResult(empty ? null : r));
  }, [tabId, overrides, colorMap]);

  return result;
}
