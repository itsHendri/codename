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

type Oklch = NonNullable<ReturnType<typeof toOklch>>;

interface SeedShift {
  role: (typeof SCALE_ROLES)[number];
  from: Oklch;
  to: Oklch;
}

/** How each seed moved, for the family pass. Empty when nothing was edited. */
function seedShifts(before: ResolvedTokens, after: ResolvedTokens): SeedShift[] {
  return SCALE_ROLES.map((role) => {
    const from = parse(before.config.color.scales.find((s) => s.role === role)!.seed);
    const to = parse(after.config.color.scales.find((s) => s.role === role)!.seed);
    if (!from || !to) return null;
    const a = toOklch(from);
    const b = toOklch(to);
    if (!a || !b) return null;
    const moved = Math.abs((a.h ?? 0) - (b.h ?? 0)) > 0.5 || Math.abs((a.c ?? 0) - (b.c ?? 0)) > 0.005;
    return moved ? { role, from: a, to: b } : null;
  }).filter((x): x is SeedShift => x !== null);
}

/**
 * What one colour on the page becomes under the edited system, or null to leave
 * it alone. The single decision both paths ask — a variable definition and a
 * hardcoded declaration should never disagree about the same colour.
 */
export function remapColor(
  hex: string,
  before: ResolvedTokens,
  after: ResolvedTokens,
  shifts: SeedShift[],
  mode: Mode = 'light',
): { to: string; reason: Override['reason'] } | null {
  // 1. Sitting on a ramp — move it to the same step after the edit.
  const at = findStep(hex, before, mode);
  if (at) {
    // Compare the step to itself across the edit, not to the colour. A colour
    // sitting *near* a step would otherwise be dragged onto the ramp even when
    // nothing changed — repainting the page for no reason.
    const fromStep = before.scales[at.role].steps[mode][at.step].hex.toUpperCase();
    const toStep = after.scales[at.role].steps[mode][at.step].hex.toUpperCase();
    return fromStep === toStep ? null : { to: toStep, reason: 'exact' };
  }

  // 2. Same hue family as a seed that moved — carry it along.
  const parsed = parse(hex);
  const own = parsed ? toOklch(parsed) : null;
  if (!own || (own.c ?? 0) < MIN_CHROMA) return null;
  const family = shifts.find((s) => {
    const delta = Math.abs(((((s.from.h ?? 0) - (own.h ?? 0) + 540) % 360) - 180));
    return delta < FAMILY_HUE;
  });
  if (!family) return null;

  const hueDelta = (family.to.h ?? 0) - (family.from.h ?? 0);
  const chromaRatio = (family.from.c ?? 0) > 0.001 ? (family.to.c ?? 0) / (family.from.c ?? 0) : 1;
  // Lightness is the colour's own: a tint must stay a tint.
  const shifted = formatHex({
    mode: 'oklch',
    l: own.l,
    c: Math.min((own.c ?? 0) * chromaRatio, 0.4),
    h: ((((own.h ?? 0) + hueDelta) % 360) + 360) % 360,
  });
  if (!shifted || shifted.toUpperCase() === hex) return null;
  return { to: shifted.toUpperCase(), reason: 'family' };
}

export function buildReskin(
  customProps: CustomPropInfo[],
  before: ResolvedTokens,
  after: ResolvedTokens,
  mode: Mode = 'light',
): Override[] {
  const shifts = seedShifts(before, after);
  const overrides: Override[] = [];
  const seen = new Set<string>();

  for (const prop of customProps) {
    if (seen.has(prop.name)) continue;
    const hex = hexOf(prop.value);
    if (!hex) continue;
    const mapped = remapColor(hex, before, after, shifts, mode);
    if (!mapped) continue;
    overrides.push({ name: prop.name, from: hex, to: mapped.to, reason: mapped.reason });
    seen.add(prop.name);
  }
  return overrides;
}

/**
 * old hex → new hex for every colour the scan actually saw on the page.
 *
 * This is what the rule-rewriting path needs: a site that hardcodes `#be3a22`
 * in forty declarations has no variable to override, so the colours themselves
 * are the handle. Keyed on colours observed in the DOM rather than on every
 * ramp step, so the map stays small and only claims colours that are really there.
 */
export function buildColorMap(
  observed: { hex: string }[],
  before: ResolvedTokens,
  after: ResolvedTokens,
  mode: Mode = 'light',
): Record<string, string> {
  const shifts = seedShifts(before, after);
  const map: Record<string, string> = {};
  for (const { hex } of observed) {
    const key = hex.toUpperCase();
    if (map[key]) continue;
    const mapped = remapColor(key, before, after, shifts, mode);
    if (mapped) map[key] = mapped.to;
  }
  return map;
}
