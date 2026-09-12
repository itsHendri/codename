/**
 * The edited system, derived once from the session and shared by whoever
 * needs it: the Variables tab to render, the hand-off to describe, and the
 * live re-skin to push to the page.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig, Mode, ResolvedTokens } from '@/studio/engine/types';
import { resolveTokens } from '@/studio/engine/resolve';
import { seedBrandFromScan } from '@/studio/seedFromScan';
import { buildColorMap, buildLengthMap, buildLengthReskin, buildReskin, hexOf, manualOverrides, mergeOverrides, type Override } from '@/studio/reskin';
import { isLengthMapEmpty, type LengthMap } from '@/studio/reskinRules';
import { diffSystem, type SystemChange } from '@/studio/systemDiff';
import { applyReskin, type ReskinResult } from './messaging';

export interface Paint {
  /** What the page's own variables become. */
  overrides: Override[];
  /** old hex → new hex, for colours the page hardcodes. */
  colorMap: Record<string, string>;
}

export interface DesignModel {
  /** What the page actually uses. */
  seeded: BrandConfig;
  /** The system being shown: the edit if there is one, else the seed. */
  brand: BrandConfig;
  resolved: ResolvedTokens;
  baseline: ResolvedTokens;
  /** The system itself was edited (a seed, a role, the grid). */
  edited: boolean;
  /** Anything at all was decided: the system, a variable or a colour by hand. */
  dirty: boolean;
  /** What the page should show now, including a dark preview. */
  paint: Paint;
  /** What goes to the agent: the decisions, in light. A preview is not a decision. */
  handoff: Paint;
  /** Lengths the page's rules should move, keyed by property. */
  lengthMap: LengthMap | null;
  /** Scale decisions, which may have no variable behind them at all. */
  system: SystemChange[];
}

const prune = (map: Record<string, string>) =>
  Object.fromEntries(Object.entries(map).filter(([from, to]) => from.toUpperCase() !== to.toUpperCase()));

export function useDesignModel(
  scan: ScanResult | null,
  config: BrandConfig | null,
  mode: Mode,
  varOverrides: Record<string, string>,
  colorEdits: Record<string, string>,
  locks: string[] = [],
): DesignModel | null {
  // The reading of the page changes only when the page is read again; a
  // colour picker firing per frame must not re-derive it, or resolve the
  // untouched baseline, every time.
  const seed = useMemo(() => {
    if (!scan) return null;
    const seeded = seedBrandFromScan(scan);
    return { seeded, baseline: resolveTokens(seeded) };
  }, [scan]);

  return useMemo(() => {
    if (!scan || !seed) return null;
    const { seeded, baseline } = seed;
    const brand = config ?? seeded;
    const resolved = config ? resolveTokens(brand) : baseline;
    const edited = config !== null;
    const manual = manualOverrides(varOverrides, scan.customProps);
    const colours = prune(colorEdits);
    // A locked variable is one the person said to keep: no seed, scale or
    // hand value moves it, in the preview or in the brief — and neither does
    // a colour rewrite, since the rule that defines it holds its hex.
    const locked = new Set(locks);
    const unlocked = (list: Override[]) => (locked.size ? list.filter((o) => !locked.has(o.name)) : list);
    const lockedHex = new Set(
      scan.customProps.filter((p) => locked.has(p.name)).map((p) => hexOf(p.value)?.toUpperCase()).filter((h): h is string => !!h),
    );
    const withoutLocked = (map: Record<string, string>) =>
      lockedHex.size ? Object.fromEntries(Object.entries(map).filter(([from]) => !lockedHex.has(from.toUpperCase()))) : map;

    const paintFor = (target: Mode, withSystem: boolean): Paint => ({
      overrides: unlocked(
        mergeOverrides(
          withSystem
            ? [
                ...buildReskin(scan.customProps, baseline, resolved, target),
                ...buildLengthReskin(scan.customProps, baseline, resolved, scan.rootFontSize),
              ]
            : [],
          manual,
        ),
      ),
      colorMap: withoutLocked({ ...(withSystem ? buildColorMap(scan.colors, baseline, resolved, target) : {}), ...colours }),
    });

    // In dark the engine has something to paint even before any edit.
    const paint = paintFor(mode, edited || mode === 'dark');
    const handoff = mode === 'light' ? paint : paintFor('light', edited);
    const lengthMap = edited ? buildLengthMap(baseline, resolved) : null;
    return {
      seeded,
      brand,
      resolved,
      baseline,
      edited,
      dirty: edited || manual.length > 0 || Object.keys(colours).length > 0,
      paint,
      handoff,
      lengthMap: isLengthMapEmpty(lengthMap) ? null : lengthMap,
      system: edited ? diffSystem(seeded, brand) : [],
    };
  }, [scan, seed, config, mode, varOverrides, colorEdits, locks]);
}

/**
 * Push the model to the page whenever it changes, and again after the page
 * reloads. Sending an empty set is how the page is restored, so "live off"
 * and "reverted" are the same message.
 */
export function useLiveReskin(
  tabId: number | null,
  live: boolean,
  model: DesignModel | null,
  generation: number,
): ReskinResult | null {
  const [result, setResult] = useState<ReskinResult | null>(null);
  const lastSent = useRef<{ tabId: number | null; key: string }>({ tabId: null, key: '' });

  const overrides = live ? (model?.paint.overrides ?? []) : [];
  const colorMap = live ? (model?.paint.colorMap ?? {}) : {};
  const lengthMap = live ? (model?.lengthMap ?? null) : null;

  useEffect(() => {
    if (!tabId) return;
    const key = JSON.stringify([generation, overrides, colorMap, lengthMap]);
    const empty = overrides.length === 0 && Object.keys(colorMap).length === 0 && lengthMap === null;
    if (lastSent.current.tabId === tabId && lastSent.current.key === key) return;
    // A fresh tab with nothing to apply needs no message; the page is its own.
    if (lastSent.current.tabId !== tabId && empty) {
      lastSent.current = { tabId, key };
      setResult(null);
      return;
    }
    // A drag fires per frame; the page repaints at most every few frames and
    // always ends on the last value: a newer key cancels the timer, and a
    // repeat of a key that was cancelled but never sent arms it again, since
    // `lastSent` is only written when the message actually goes.
    const timer = window.setTimeout(() => {
      lastSent.current = { tabId, key };
      void applyReskin(tabId, overrides, colorMap, lengthMap).then((r) => setResult(empty ? null : r));
    }, 40);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, generation, overrides, colorMap, lengthMap]);

  return result;
}
