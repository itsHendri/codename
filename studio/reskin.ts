/**
 * Which of the page's own CSS variables should move when a seed changes.
 *
 * The page named its colours; we did not. So rather than inventing variables,
 * this works out where each of the site's existing ones sits in the system we
 * derived from it, and moves it to the same place in the edited system. Change
 * the brand seed and `--mark`, `--mark-hover` and friends follow, because they
 * were all on that ramp to begin with.
 *
 * Two ways a variable is matched, and nothing else is touched:
 *
 *   exact  — its value is a step on one of the ramps. Highest confidence: the
 *            new value is simply that step after the edit.
 *   family — its value shares a hue with a seed that changed. The seed's hue
 *            rotation and chroma ratio are applied, keeping the variable's own
 *            lightness, so a tint stays a tint and a shade stays a shade.
 *
 * A variable that matches neither is left alone. Re-skinning a page is a guess
 * either way; the point is to make a small number of confident guesses rather
 * than repaint everything and hope.
 */

import { converter, differenceEuclidean, formatHex, parse } from 'culori';
import type { CustomPropInfo } from '@/shared/types';
import type { Mode, ResolvedTokens } from './engine/types';
import { SCALE_ROLES, STEPS } from './engine/types';

const toOklch = converter('oklch');
const distance = differenceEuclidean('oklab');

/**
 * A ramp step is "the same colour" this close. Tight on purpose: at 0.02 a pale
 * wash landed on a neutral step and got snapped onto the ramp, losing the
 * lightness that made it a wash.
 */
const EXACT_DISTANCE = 0.008;
/** Degrees of hue within which a colour counts as part of a seed's family. */
const FAMILY_HUE = 22;
/**
 * Below this chroma a colour has no hue worth matching on.
 *
 * Placed from real data rather than taste: on forfontsake the brand wash
 * (#f6d9d3) sits at chroma 0.033 sharing the brand's hue, while the page's
 * actual neutrals — paper, rule, muted, plate — are all under 0.016. The gap
 * between them is where this belongs, so a wash follows the brand and a warm
 * grey stays a warm grey.
 */
const MIN_CHROMA = 0.025;

export interface Override {
  /** The site's variable, e.g. `--mark`. */
  name: string;
  from: string;
  to: string;
  reason: 'exact' | 'family';
}

function hexOf(value: string): string | null {
  const v = value.trim();
  // Only literal colours: a `var()` reference resolves to something else we
  // will meet on its own terms, and rewriting it would flatten the indirection.
  if (v.startsWith('var(') || !/^(#|rgb|hsl|oklch|oklab|color\()/i.test(v)) return null;
  const parsed = parse(v);
  if (!parsed) return null;
  const hex = formatHex(parsed);
  return hex ? hex.toUpperCase() : null;
}

/** Where this colour sits on a ramp, if it sits on one. */
function findStep(
  hex: string,
  tokens: ResolvedTokens,
  mode: Mode,
): { role: (typeof SCALE_ROLES)[number]; step: (typeof STEPS)[number] } | null {
  let best: { role: (typeof SCALE_ROLES)[number]; step: (typeof STEPS)[number]; d: number } | null =
    null;
  for (const role of SCALE_ROLES) {
    const scale = tokens.scales[role];
    for (const step of STEPS) {
      const d = distance(hex, scale.steps[mode][step].hex);
      if (d < EXACT_DISTANCE && (!best || d < best.d)) best = { role, step, d };
    }
  }
  return best ? { role: best.role, step: best.step } : null;
}

export function buildReskin(
  customProps: CustomPropInfo[],
  before: ResolvedTokens,
  after: ResolvedTokens,
  mode: Mode = 'light',
): Override[] {
  // How each seed moved, for the family pass.
  const seedShift = SCALE_ROLES.map((role) => {
    const from = parse(before.config.color.scales.find((s) => s.role === role)!.seed);
    const to = parse(after.config.color.scales.find((s) => s.role === role)!.seed);
    if (!from || !to) return null;
    const a = toOklch(from);
    const b = toOklch(to);
    if (!a || !b) return null;
    const moved = Math.abs((a.h ?? 0) - (b.h ?? 0)) > 0.5 || Math.abs((a.c ?? 0) - (b.c ?? 0)) > 0.005;
    return moved ? { role, from: a, to: b } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const overrides: Override[] = [];
  const seen = new Set<string>();

  for (const prop of customProps) {
    if (seen.has(prop.name)) continue;
    const hex = hexOf(prop.value);
    if (!hex) continue;

    // 1. Sitting on a ramp — move it to the same step after the edit.
    const at = findStep(hex, before, mode);
    if (at) {
      // Compare the step to itself across the edit, not to the variable. A
      // variable sitting *near* a step would otherwise be dragged onto the ramp
      // even when nothing changed — repainting the page for no reason.
      const fromStep = before.scales[at.role].steps[mode][at.step].hex.toUpperCase();
      const toStep = after.scales[at.role].steps[mode][at.step].hex.toUpperCase();
      if (fromStep !== toStep) {
        overrides.push({ name: prop.name, from: hex, to: toStep, reason: 'exact' });
        seen.add(prop.name);
      }
      continue;
    }

    // 2. Same hue family as a seed that moved — carry it along.
    const own = toOklch(parse(hex)!);
    if (!own || (own.c ?? 0) < MIN_CHROMA) continue;
    const family = seedShift.find((s) => {
      const delta = Math.abs(((s.from.h ?? 0) - (own.h ?? 0) + 540) % 360 - 180);
      return delta < FAMILY_HUE;
    });
    if (!family) continue;

    const hueDelta = (family.to.h ?? 0) - (family.from.h ?? 0);
    const chromaRatio = (family.from.c ?? 0) > 0.001 ? (family.to.c ?? 0) / (family.from.c ?? 0) : 1;
    // Lightness is the variable's own: a tint must stay a tint.
    const shifted = formatHex({
      mode: 'oklch',
      l: own.l,
      c: Math.min((own.c ?? 0) * chromaRatio, 0.4),
      h: (((own.h ?? 0) + hueDelta) % 360 + 360) % 360,
    });
    if (shifted && shifted.toUpperCase() !== hex) {
      overrides.push({ name: prop.name, from: hex, to: shifted.toUpperCase(), reason: 'family' });
      seen.add(prop.name);
    }
  }

  return overrides;
}
