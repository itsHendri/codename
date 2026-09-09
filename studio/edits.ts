/**
 * What a person changed about a scanned system, kept apart from the scan.
 *
 * A scan is a reading of the page; an edit is a decision. Storing the edited
 * config whole would freeze the reading with it, so a rescan could never
 * improve what it observed. Storing only the deltas means a seed you moved
 * stays moved while everything else is read fresh — the same reasoning the
 * engine already applies to semantic overrides.
 *
 * Two of the deltas are not about the config at all. `vars` is the page's own
 * variables set by hand, and `colors` its observed literals; both are decisions
 * about the page, laid over whatever the next scan reads.
 */

import type { BrandConfig, ScaleRole, SemanticOverride, TypeRole, TypeRoleName } from './engine/types';

export type TypeEdit = Partial<Pick<TypeRole, 'sizeRem' | 'weight' | 'lineHeight'>>;

export interface BrandEdits {
  /** Seeds that differ from what the page uses, by ramp role. */
  seeds: Partial<Record<ScaleRole, string>>;
  semanticOverrides: SemanticOverride[];
  /** Page variables set by hand: name → value. */
  vars: Record<string, string>;
  /** Observed colours set by hand: old hex (upper case) → new hex. */
  colors: Record<string, string>;
  /** Type roles moved by hand, by role. */
  type: Partial<Record<TypeRoleName, TypeEdit>>;
  spacingBasePx?: number;
  radiusBasePx?: number;
}

export const noEdits = (): BrandEdits => ({
  seeds: {},
  semanticOverrides: [],
  vars: {},
  colors: {},
  type: {},
});

/** A stored object from before a field existed still has to load. */
export const normaliseEdits = (stored: Partial<BrandEdits> | null | undefined): BrandEdits => ({
  ...noEdits(),
  ...(stored ?? {}),
});

export const isNoEdits = (e: BrandEdits): boolean =>
  Object.keys(e.seeds).length === 0 &&
  e.semanticOverrides.length === 0 &&
  Object.keys(e.vars ?? {}).length === 0 &&
  Object.keys(e.colors ?? {}).length === 0 &&
  Object.keys(e.type ?? {}).length === 0 &&
  e.spacingBasePx === undefined &&
  e.radiusBasePx === undefined;

/**
 * Moving the grid rescales the steps the page uses, keeping their shape: a
 * page on 4px that uses 4, 8, 24 becomes 6, 12, 36 rather than a fresh ladder.
 */
export function regrid(spacing: BrandConfig['spacing'], basePx: number): BrandConfig['spacing'] {
  const old = spacing.basePx || 1;
  const blessed = [
    ...new Set(spacing.blessed.map((v) => Math.max(basePx, Math.round(v / old) * basePx))),
  ].sort((a, b) => a - b);
  return { basePx, blessed };
}

/** The decisions in `edited` that `seeded` did not make. */
export function diffEdits(seeded: BrandConfig, edited: BrandConfig): BrandEdits {
  const edits = noEdits();
  for (const scale of edited.color.scales) {
    const base = seeded.color.scales.find((s) => s.role === scale.role);
    if (base && base.seed.toLowerCase() !== scale.seed.toLowerCase()) edits.seeds[scale.role] = scale.seed;
  }
  // Semantic overrides are not persisted any more: the panel has no surface
  // that shows or removes one, and a stored override kept a site marked as
  // edited forever. The field stays in the shape so old stores still load.
  edits.semanticOverrides = [];

  const baseRoles = new Map(seeded.typography.roles.map((r) => [r.role, r]));
  for (const role of edited.typography.roles) {
    const was = baseRoles.get(role.role);
    if (!was) continue;
    const delta: TypeEdit = {};
    if (was.sizeRem !== role.sizeRem) delta.sizeRem = role.sizeRem;
    if (was.weight !== role.weight) delta.weight = role.weight;
    if (was.lineHeight !== role.lineHeight) delta.lineHeight = role.lineHeight;
    if (Object.keys(delta).length) edits.type[role.role] = delta;
  }
  if (seeded.spacing.basePx !== edited.spacing.basePx) edits.spacingBasePx = edited.spacing.basePx;
  if (seeded.radius.basePx !== edited.radius.basePx) edits.radiusBasePx = edited.radius.basePx;
  return edits;
}

/**
 * Lay saved decisions over a fresh reading. A seed for a ramp the new scan no
 * longer has is dropped, and so is a role it no longer renders: the decision
 * was about something that is gone.
 */
export function applyEdits(seeded: BrandConfig, stored: BrandEdits): BrandConfig {
  const edits = normaliseEdits(stored);
  const known = new Set(seeded.color.scales.map((s) => s.role));
  const scales = seeded.color.scales.map((s) => {
    const seed = edits.seeds[s.role];
    return seed ? { ...s, seed } : s;
  });
  // Stored by an older panel; nothing can show them now, so they are let go.
  const semanticOverrides: BrandConfig['color']['semanticOverrides'] = [];
  const roles = seeded.typography.roles.map((r) => {
    const delta = edits.type[r.role];
    return delta ? { ...r, ...delta } : r;
  });
  const spacing = edits.spacingBasePx != null ? regrid(seeded.spacing, edits.spacingBasePx) : seeded.spacing;
  const radius =
    edits.radiusBasePx != null
      ? { ...seeded.radius, basePx: edits.radiusBasePx, concentric: edits.radiusBasePx > 0 }
      : seeded.radius;
  return {
    ...seeded,
    color: { ...seeded.color, scales, semanticOverrides },
    typography: { ...seeded.typography, roles },
    spacing,
    radius,
  };
}
