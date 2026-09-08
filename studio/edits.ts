/**
 * What a person changed about a scanned system, kept apart from the scan.
 *
 * A scan is a reading of the page; an edit is a decision. Storing the edited
 * config whole would freeze the reading with it, so a rescan could never
 * improve what it observed. Storing only the deltas means a seed you moved
 * stays moved while everything else is read fresh — the same reasoning the
 * engine already applies to semantic overrides.
 */

import type { BrandConfig, ScaleRole, SemanticOverride } from './engine/types';

export interface BrandEdits {
  /** Seeds that differ from what the page uses, by ramp role. */
  seeds: Partial<Record<ScaleRole, string>>;
  semanticOverrides: SemanticOverride[];
}

export const noEdits = (): BrandEdits => ({ seeds: {}, semanticOverrides: [] });

export const isNoEdits = (e: BrandEdits): boolean =>
  Object.keys(e.seeds).length === 0 && e.semanticOverrides.length === 0;

/** The decisions in `edited` that `seeded` did not make. */
export function diffEdits(seeded: BrandConfig, edited: BrandConfig): BrandEdits {
  const seeds: BrandEdits['seeds'] = {};
  for (const scale of edited.color.scales) {
    const base = seeded.color.scales.find((s) => s.role === scale.role);
    if (base && base.seed.toLowerCase() !== scale.seed.toLowerCase()) seeds[scale.role] = scale.seed;
  }
  return { seeds, semanticOverrides: edited.color.semanticOverrides };
}

/**
 * Lay saved decisions over a fresh reading. A seed for a ramp the new scan no
 * longer has is dropped: the decision was about something that is gone.
 */
export function applyEdits(seeded: BrandConfig, edits: BrandEdits): BrandConfig {
  const known = new Set(seeded.color.scales.map((s) => s.role));
  const scales = seeded.color.scales.map((s) => {
    const seed = edits.seeds[s.role];
    return seed ? { ...s, seed } : s;
  });
  const semanticOverrides = edits.semanticOverrides.filter(
    (o) => (!o.light || known.has(o.light.scale)) && (!o.dark || known.has(o.dark.scale)),
  );
  return { ...seeded, color: { ...seeded.color, scales, semanticOverrides } };
}
