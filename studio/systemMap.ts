/**
 * The link between a page's own variables and the engine's ramps.
 *
 * The re-skin used to match by value alone: a variable within a hair of a
 * ramp step moved with that step, and one a little further off did not,
 * with nothing to see or change. A link makes the decision explicit and
 * keeps it: `--mark` is primary 600, so it follows the primary seed
 * wherever the seed goes, and the chip on its row says so. Inference
 * fills in the obvious ones once; a variable that could sit on two ramps is
 * left unlinked and named, rather than guessed; a stored link wins over
 * anything inferred. Value matching stays as the fallback for variables
 * with no link, so nothing repaints less than it did.
 */

import { differenceEuclidean } from 'culori';
import type { CustomPropInfo } from '@/shared/types';
import type { Mode, ResolvedTokens, ScaleRole, Step } from './engine/types';
import { SCALE_ROLES, STEPS } from './engine/types';
import { EXACT_DISTANCE, hexOf, mirrorStep, type Override } from './reskin';

const distance = differenceEuclidean('oklab');

export interface ColourLink {
  role: ScaleRole;
  step: Step;
}

/** A variable's link, or null for "on no ramp, on purpose". Absent means undecided. */
export type ColourLinks = Record<string, ColourLink | null>;

export const linkKey = (l: ColourLink) => `${l.role}:${l.step}`;

const PRIORITY: ScaleRole[] = ['primary', 'secondary', 'neutral', 'success', 'warning', 'danger', 'info'];
const stepHex = (r: ResolvedTokens, l: ColourLink) => r.scales[l.role].steps.light[l.step].hex.toLowerCase();

/**
 * The obvious links: a variable whose light value sits on exactly one
 * ramp step. Two steps within reach is an ambiguity, listed so the panel
 * can ask rather than choose.
 */
export function inferColourLinks(props: CustomPropInfo[], resolved: ResolvedTokens): { links: ColourLinks; ambiguous: string[] } {
  const links: ColourLinks = {};
  const ambiguous: string[] = [];
  for (const p of props) {
    const hex = p.resolved ? hexOf(p.resolved) : hexOf(p.value);
    if (!hex) continue;
    const hits: (ColourLink & { d: number })[] = [];
    for (const role of SCALE_ROLES) {
      const scale = resolved.scales[role];
      for (const step of STEPS) {
        const d = distance(hex, scale.steps.light[step].hex);
        if (d < EXACT_DISTANCE) hits.push({ role, step, d });
      }
    }
    if (!hits.length) continue;
    // Nearest first; on a tie the brand ramps before the status ramps, since
    // a page's one red seeds both primary and danger and is primary first.
    hits.sort((a, b) => a.d - b.d || PRIORITY.indexOf(a.role) - PRIORITY.indexOf(b.role));
    // Two ramps claiming it with different colours — a neutral near a status
    // step, say — is a question, not an answer. The same colour on two ramps
    // is one decision, and the priority picks.
    const first = hits[0]!;
    const rival = hits.find((h) => h.role !== first.role);
    if (rival && rival.d - first.d < EXACT_DISTANCE / 2 && stepHex(resolved, rival) !== stepHex(resolved, first)) {
      ambiguous.push(p.name);
      continue;
    }
    links[p.name] = { role: first.role, step: first.step };
  }
  return { links, ambiguous };
}

/** Stored decisions over inferred ones; a stored null means "unlinked, on purpose". */
export function mergeLinks(inferred: ColourLinks, stored: ColourLinks | undefined): ColourLinks {
  return { ...inferred, ...(stored ?? {}) };
}

/** Variables by the step they sit on, for a ramp strip's marks. */
export function linkedBy(links: ColourLinks): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [name, link] of Object.entries(links)) {
    if (!link) continue;
    const key = linkKey(link);
    (out.get(key) ?? out.set(key, []).get(key)!).push(name);
  }
  return out;
}

/**
 * What each linked variable becomes under the edited system: the same step
 * of the same ramp, after the edit — and in dark, the mirrored step of the
 * dark ramp, which is the engine's own idea of what a surface or an ink
 * becomes at night.
 */
export function linkedOverrides(links: ColourLinks, props: CustomPropInfo[], before: ResolvedTokens, after: ResolvedTokens, mode: Mode): Override[] {
  const out: Override[] = [];
  for (const p of props) {
    const link = links[p.name];
    if (!link) continue;
    const from = hexOf(p.value);
    if (!from) continue;
    const step = mode === 'dark' ? mirrorStep(link.step) : link.step;
    const was = before.scales[link.role].steps.light[link.step].hex.toUpperCase();
    const to = after.scales[link.role].steps[mode][step].hex.toUpperCase();
    // The step itself moved, or the page is being shown dark: either way the
    // variable goes where its step is now. A link on a step that did not
    // move, in light, paints nothing.
    if (to === was && mode === 'light') continue;
    if (to === from) continue;
    out.push({ name: p.name, from, to, reason: 'link' });
  }
  return out;
}
