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
import type { Mode, ResolvedTokens, Step } from './engine/types';
import { SCALE_ROLES, STEPS } from './engine/types';
import type { LengthMap } from './reskinRules';

const toOklch = converter('oklch');
const distance = differenceEuclidean('oklab');

/**
 * A ramp step is "the same colour" this close. Tight on purpose: at 0.02 a pale
 * wash landed on a neutral step and got snapped onto the ramp, losing the
 * lightness that made it a wash.
 */
export const EXACT_DISTANCE = 0.008;
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
  /**
   * How the value was matched. `exact` and `family` are colour; `grid` is a
   * spacing or radius step; `scale` is a size on the type ladder; `manual` is
   * a value a person typed for this very variable.
   */
  reason: 'exact' | 'family' | 'grid' | 'scale' | 'manual';
}

/**
 * Page variables set by hand. Only names the scan knows are honoured: an
 * override for a variable the page does not define would paint nothing and
 * still reach the brief as a change, which is a lie in both directions.
 */
export function manualOverrides(vars: Record<string, string>, customProps: CustomPropInfo[]): Override[] {
  const known = new Map(customProps.map((p) => [p.name, p.value.trim()]));
  const out: Override[] = [];
  for (const [name, to] of Object.entries(vars)) {
    const from = known.get(name);
    if (from === undefined || from === to.trim()) continue;
    out.push({ name, from, to: to.trim(), reason: 'manual' });
  }
  return out;
}

/** The engine's overrides with a person's laid on top: a typed value beats a derived one. */
export function mergeOverrides(engine: Override[], manual: Override[]): Override[] {
  const byName = new Map(engine.map((o) => [o.name, o]));
  for (const m of manual) byName.set(m.name, m);
  return Array.from(byName.values());
}

/* ---------------- lengths ---------------- */

export type LengthKind = 'space' | 'type' | 'radius';

/**
 * What a variable's own name says it holds. Only consulted for variables whose
 * value is already a length, so `--text-primary: #15171B` never reaches here
 * and cannot be mistaken for a font size.
 */
export function lengthKind(name: string): LengthKind | null {
  if (/radius|rounded|corner/i.test(name)) return 'radius';
  if (/font-?size|text-(xs|sm|base|lg|xl|\d)|leading|line-height|type-scale/i.test(name)) return 'type';
  if (/spac|gap|gutter|inset|pad|margin|size-\d/i.test(name)) return 'space';
  return null;
}

/** A length in px, with rem resolved against the page's own root size. */
export function lengthPx(value: string, rootFontSize = 16): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return m[2] === 'rem' ? n * rootFontSize : n;
}

/** Round-trips a new px value back into whatever unit the page was written in. */
export function inOriginalUnit(value: string, px: number, rootFontSize: number): string {
  const rem = /rem$/.test(value.trim());
  const n = rem ? px / rootFontSize : px;
  return `${Math.round(n * 1000) / 1000}${rem ? 'rem' : 'px'}`;
}

/** before px → after px, per family, for every length the system names. */
function lengthMaps(before: ResolvedTokens, after: ResolvedTokens): Record<LengthKind, Map<number, number>> {
  const space = new Map<number, number>();
  const bBlessed = before.config.spacing.blessed;
  const aBlessed = after.config.spacing.blessed;
  bBlessed.forEach((from, i) => {
    const to = aBlessed[i];
    if (to != null && to !== from) space.set(from, to);
  });

  const radius = new Map<number, number>();
  // `full` is a pill, a shape decision rather than a step, so it is left alone.
  for (const step of ['sm', 'md', 'lg', 'xl'] as const) {
    const from = before.radius[step];
    const to = after.radius[step];
    if (from != null && to != null && to !== from) radius.set(from, to);
  }

  const type = new Map<number, number>();
  const afterRoles = new Map(after.config.typography.roles.map((r) => [r.role, r]));
  for (const role of before.config.typography.roles) {
    const to = afterRoles.get(role.role);
    if (!to) continue;
    const fromPx = Math.round(role.sizeRem * 16 * 100) / 100;
    const toPx = Math.round(to.sizeRem * 16 * 100) / 100;
    if (fromPx !== toPx) type.set(fromPx, toPx);
  }

  return { space, radius, type };
}

/**
 * The same moves, keyed the way a stylesheet rule needs them: by property.
 * A rule's `font-size` names the role it renders, which is what lets its
 * weight and line-height follow the role — a bare `600` in a stylesheet says
 * nothing about which role it belongs to on its own.
 */
export function buildLengthMap(before: ResolvedTokens, after: ResolvedTokens): LengthMap {
  const maps = lengthMaps(before, after);
  const map: LengthMap = { type: {}, space: {}, radius: {} };
  for (const [from, to] of maps.space) map.space[String(from)] = to;
  for (const [from, to] of maps.radius) map.radius[String(from)] = to;

  const afterRoles = new Map(after.config.typography.roles.map((r) => [r.role, r]));
  const seen = new Map<string, number>();
  for (const role of before.config.typography.roles) {
    const to = afterRoles.get(role.role);
    if (!to) continue;
    const key = String(Math.round(role.sizeRem * 16 * 100) / 100);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const entry: LengthMap['type'][string] = {};
    const fromPx = Math.round(role.sizeRem * 16 * 100) / 100;
    const toPx = Math.round(to.sizeRem * 16 * 100) / 100;
    if (fromPx !== toPx) entry.size = { from: fromPx, to: toPx };
    if (role.weight !== to.weight) entry.weight = { from: role.weight, to: to.weight };
    if (role.lineHeight !== to.lineHeight) entry.lineHeight = { from: role.lineHeight, to: to.lineHeight };
    if (Object.keys(entry).length) map.type[key] = entry;
  }
  // Two roles at one size is an ambiguity the stylesheet cannot resolve.
  for (const [key, n] of seen) if (n > 1) delete map.type[key];
  return map;
}

/**
 * Page variables holding a length the system moved.
 *
 * Only variables, never hardcoded declarations: a hex says what it is, but a
 * bare `16px` in a stylesheet could be a gap, a width or a font size, and
 * rewriting every one of them would break layouts to fix a grid. A page that
 * hardcodes its spacing gets the change in the brief and no live repaint,
 * which is the honest answer rather than a confident wrong one.
 */
export function buildLengthReskin(
  customProps: CustomPropInfo[],
  before: ResolvedTokens,
  after: ResolvedTokens,
  rootFontSize = 16,
): Override[] {
  const maps = lengthMaps(before, after);
  const overrides: Override[] = [];
  const seen = new Set<string>();

  for (const prop of customProps) {
    if (seen.has(prop.name)) continue;
    const px = lengthPx(prop.value, rootFontSize);
    if (px === null) continue;

    const kind = lengthKind(prop.name);
    const consulted: LengthKind[] = kind ? [kind] : ['space', 'radius', 'type'];
    // With no hint in the name, every family has to agree: a 16 that is both a
    // spacing step and a body size, moving to two different values, is left
    // alone rather than guessed at.
    const proposals = new Set(
      consulted.map((k) => maps[k].get(px)).filter((v): v is number => v != null),
    );
    if (proposals.size !== 1) continue;

    const to = [...proposals][0]!;
    overrides.push({
      name: prop.name,
      from: prop.value.trim(),
      to: inOriginalUnit(prop.value, to, rootFontSize),
      reason: kind === 'type' ? 'scale' : 'grid',
    });
    seen.add(prop.name);
  }
  return overrides;
}

export function hexOf(value: string): string | null {
  const v = value.trim();
  // Only literal colours: a `var()` reference resolves to something else we
  // will meet on its own terms, and rewriting it would flatten the indirection.
  if (v.startsWith('var(') || !/^(#|rgb|hsl|oklch|oklab|color\()/i.test(v)) return null;
  const parsed = parse(v);
  if (!parsed) return null;
  const hex = formatHex(parsed);
  return hex ? hex.toUpperCase() : null;
}

/**
 * Where this colour sits on a ramp, if it sits on one. The page is always read
 * as a light page: that is what its stylesheet paints, whatever the panel is
 * previewing.
 */
function findStep(
  hex: string,
  tokens: ResolvedTokens,
): { role: (typeof SCALE_ROLES)[number]; step: Step } | null {
  let best: { role: (typeof SCALE_ROLES)[number]; step: Step; d: number } | null = null;
  for (const role of SCALE_ROLES) {
    const scale = tokens.scales[role];
    for (const step of STEPS) {
      const d = distance(hex, scale.steps.light[step].hex);
      if (d < EXACT_DISTANCE && (!best || d < best.d)) best = { role, step, d };
    }
  }
  return best ? { role: best.role, step: best.step } : null;
}

/** The step across the ramp: 50 ↔ 950, 100 ↔ 900 … 500 stays. What light becomes in dark. */
export const mirrorStep = (step: Step): Step => STEPS[STEPS.length - 1 - STEPS.indexOf(step)]!;

/**
 * The neutral step whose light lightness is nearest this colour's. For the
 * dark preview only: a page's greys — paper, rule, muted — rarely sit within
 * `EXACT_DISTANCE` of a generated step, yet they are the colours a dark mode
 * is mostly made of. Lightness is the honest handle for a colour with no hue.
 */
function nearestNeutralByLightness(l: number, tokens: ResolvedTokens): Step {
  let best: { step: Step; d: number } | null = null;
  for (const step of STEPS) {
    const d = Math.abs(tokens.scales.neutral.steps.light[step].oklch.l - l);
    if (!best || d < best.d) best = { step, d };
  }
  return best!.step;
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
 *
 * `mode` is what the page should look like. In light it is the edit alone. In
 * dark, a colour on a light step moves to the mirrored step of the dark ramp
 * — 100 becomes 900 — which is the engine's own idea of what a surface or an
 * ink becomes at night, applied to the colours the page names itself.
 */
export function remapColor(
  hex: string,
  before: ResolvedTokens,
  after: ResolvedTokens,
  shifts: SeedShift[],
  mode: Mode = 'light',
): { to: string; reason: Override['reason'] } | null {
  // 1. Sitting on a ramp — move it to the same step after the edit.
  const at = findStep(hex, before);
  if (at) {
    // Compare the step to itself across the edit, not to the colour. A colour
    // sitting *near* a step would otherwise be dragged onto the ramp even when
    // nothing changed — repainting the page for no reason.
    const fromStep = before.scales[at.role].steps.light[at.step].hex.toUpperCase();
    const step = mode === 'dark' ? mirrorStep(at.step) : at.step;
    const toStep = after.scales[at.role].steps[mode][step].hex.toUpperCase();
    return fromStep === toStep ? null : { to: toStep, reason: 'exact' };
  }

  const parsed = parse(hex);
  const own = parsed ? toOklch(parsed) : null;
  if (!own) return null;

  // 1b. In dark, a neutral off the ramp still inverts, by lightness alone.
  if (mode === 'dark' && (own.c ?? 0) < MIN_CHROMA) {
    const step = mirrorStep(nearestNeutralByLightness(own.l, before));
    const to = after.scales.neutral.steps.dark[step].hex.toUpperCase();
    return to === hex.toUpperCase() ? null : { to, reason: 'exact' };
  }

  // 2. Same hue family as a seed that moved — carry it along.
  if ((own.c ?? 0) < MIN_CHROMA) return null;
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
