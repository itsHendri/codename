/**
 * A system for a page that has none.
 *
 * Every other section of the panel shows only what the page holds. A page
 * with three literals and no type styles holds nothing to show, and that
 * is where the engine's own vocabulary is allowed in: seeds, a ratio, a
 * grid, generated into ramps, roles and semantics the page can adopt. The
 * inputs are prefilled from the page — its most-used colours, its body
 * size, the ratio its sizes are nearest — never from anyone's preset, the
 * same rule `seedFromScan` keeps. The result is previewed on the live page
 * through the ordinary re-skin (literals remapped onto the ramps) plus a
 * proposal sheet that defines the new names, written into the project as
 * one file by the bridge, and adopted rule by rule by the agent from the
 * brief, which is the part that is a judgement.
 */

import { differenceEuclidean } from 'culori';
import type { ScanResult } from '@/shared/types';
import { DEFAULT_SHADOWS, DEFAULT_TYPE_ROLES } from './engine/defaults';
import { primitiveVar } from './engine/resolve';
import type { BrandConfig, Mode, ResolvedTokens, ScaleRole, Step, TypeRole, TypeRoleName } from './engine/types';
import { STEPS } from './engine/types';
import { regrid } from './edits';
import { toTokensCss } from './export/css';
import { EXACT_DISTANCE, hexOf } from './reskin';
import { SUGGEST_DISTANCE } from './tokenMatch';
import { lineHeightFor, nearestRatio, scaleSize, trackingFor } from './typeScale';

export interface GenerateInputs {
  /** The brand colour, seeding the primary ramp. */
  seed: string;
  /** The ink, seeding the neutral ramp. */
  neutral: string;
  sans: string;
  mono: string;
  baseSizePx: number;
  ratio: number;
  spacingBasePx: number;
  radiusBasePx: number;
  /** The engine's layered shadows, or the ones the page paints. */
  shadows: 'soft' | 'observed';
}

/** A page with too little of its own for the rest of the panel to show. */
export function isThin(scan: Pick<ScanResult, 'customProps' | 'typeStyles'>): boolean {
  const colourVars = scan.customProps.filter((p) => hexOf(p.resolved ?? p.value)).length;
  return colourVars < 3 && !(scan.typeStyles?.length ?? 0);
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** The inputs as the page suggests them: every one an observation, or the engine's neutral default. */
export function inputsFromScan(scan: ScanResult, seeded: BrandConfig): GenerateInputs {
  const scale = (role: ScaleRole) => seeded.color.scales.find((s) => s.role === role)?.seed ?? '#000000';
  const roles = seeded.typography.roles;
  const body = roles.find((r) => r.role === 'body');
  const baseSizePx = Math.round((body?.sizeRem ?? 1) * 16);
  const sizes = [...new Set(roles.map((r) => Math.round(r.sizeRem * 16)))];
  return {
    seed: scale('primary'),
    neutral: scale('neutral'),
    sans: seeded.typography.families.sans,
    mono: seeded.typography.families.mono,
    baseSizePx,
    ratio: sizes.length > 1 ? nearestRatio(sizes, baseSizePx) : 1.2,
    spacingBasePx: seeded.spacing.basePx,
    radiusBasePx: seeded.radius.basePx,
    shadows: scan.shape.shadows.length >= 2 ? 'observed' : 'soft',
  };
}

/** Which step of the scale each role sits on, the body being step 0. */
const STEP_OF: Record<TypeRoleName, number> = {
  display: 5,
  'heading-lg': 4,
  heading: 3,
  'heading-sm': 2,
  'body-lg': 1,
  body: 0,
  'body-sm': -1,
  label: -1,
  code: -1,
};

/** The roles on a modular scale: size = base · ratio^step, line-height and tracking following the size. */
export function rolesOnScale(baseSizePx: number, ratio: number, weights: Partial<Record<TypeRoleName, number>> = {}, hasDisplay = false): TypeRole[] {
  return DEFAULT_TYPE_ROLES.map((d) => {
    const step = STEP_OF[d.role];
    const px = scaleSize(baseSizePx, ratio, step);
    const tracking = trackingFor(px);
    const role: TypeRole = {
      role: d.role,
      family: d.role === 'code' ? 'mono' : d.role === 'display' && hasDisplay ? 'display' : 'sans',
      sizeRem: round(px / 16, 4),
      lineHeight: d.role === 'label' ? 1.3 : round(lineHeightFor(px) / px, 3),
      weight: weights[d.role] ?? d.weight,
      ...(tracking ? { tracking: `${tracking}em` } : {}),
      ...(d.transform ? { transform: d.transform } : {}),
    };
    // The two roles that hurt on a phone at a desktop size are fluid: one step down at the base viewport.
    if (step >= 4) role.minSizeRem = round(scaleSize(baseSizePx, ratio, step - 1) / 16, 4);
    return role;
  });
}

/** The seeded config with the inputs applied: what the page suggested, decided. */
export function generateConfig(seeded: BrandConfig, inputs: GenerateInputs, now = new Date()): BrandConfig {
  const scales = seeded.color.scales.map((s) => (s.role === 'primary' ? { ...s, seed: inputs.seed } : s.role === 'neutral' ? { ...s, seed: inputs.neutral } : s));
  const weights = Object.fromEntries(seeded.typography.roles.map((r) => [r.role, r.weight])) as Partial<Record<TypeRoleName, number>>;
  const families = { ...seeded.typography.families, sans: inputs.sans, mono: inputs.mono };
  return {
    ...seeded,
    meta: {
      ...seeded.meta,
      deviations: [
        ...seeded.meta.deviations,
        `Generated by Codename on ${now.toISOString().slice(0, 10)} from these inputs: seed ${inputs.seed}, neutral ${inputs.neutral}, ${inputs.baseSizePx}px body on a ${inputs.ratio} ratio, ${inputs.spacingBasePx}px grid, ${inputs.radiusBasePx}px radius.`,
      ],
    },
    color: { ...seeded.color, scales },
    typography: { ...seeded.typography, families, roles: rolesOnScale(inputs.baseSizePx, inputs.ratio, weights, !!families.display) },
    spacing: regrid(seeded.spacing, inputs.spacingBasePx),
    radius: { ...seeded.radius, basePx: inputs.radiusBasePx, concentric: inputs.radiusBasePx > 0 },
    shadows: inputs.shadows === 'soft' ? DEFAULT_SHADOWS : seeded.shadows,
  };
}

export interface Adoption {
  /** The literal the page paints, upper-case hex. */
  literal: string;
  /** `var(--primary-600)`. */
  token: string;
  /** Declarations painting the literal, across readable stylesheets. */
  uses: number;
  /** On the step exactly, or within a hair of it (a judgement for the agent). */
  exact: boolean;
}

const oklab = differenceEuclidean('oklab');

/**
 * Which token each literal on the page should become, once the system is in:
 * the nearest primitive step, exact or near, most-used first. A literal no
 * step comes near is not the system's business and is left out.
 */
export function adoptionPlan(scan: Pick<ScanResult, 'colors'>, resolved: ResolvedTokens, mode: Mode = 'light'): Adoption[] {
  const out: Adoption[] = [];
  for (const colour of scan.colors) {
    if (colour.varNames.length) continue;
    const hex = hexOf(colour.hex);
    if (!hex) continue;
    let best: { token: string; d: number } | null = null;
    for (const [role, scale] of Object.entries(resolved.scales) as [ScaleRole, ResolvedTokens['scales'][ScaleRole]][]) {
      for (const step of STEPS as readonly Step[]) {
        const d = oklab(hex, scale.steps[mode][step].hex);
        if (!best || d < best.d) best = { token: `var(${primitiveVar(role, step)})`, d };
      }
    }
    if (!best || best.d > SUGGEST_DISTANCE) continue;
    out.push({ literal: hex.toUpperCase(), token: best.token, uses: colour.count, exact: best.d < EXACT_DISTANCE });
  }
  return out.sort((a, b) => b.uses - a.uses || a.literal.localeCompare(b.literal));
}

/** The stylesheet the proposal defines its names in: the same file Export writes and the bridge adds. */
export const proposalCss = (resolved: ResolvedTokens): string => toTokensCss(resolved);

/** Where the tokens file goes: beside the entry stylesheet, or the conventional place. */
export const tokensPathFor = (entry: string | null | undefined): string => {
  const dir = entry?.includes('/') ? entry.slice(0, entry.lastIndexOf('/')) : entry ? '' : 'src';
  return dir ? `${dir}/tokens.css` : 'tokens.css';
};
