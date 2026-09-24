/**
 * A type scale as a base and a ratio, read off the sizes a page uses and
 * written back to them.
 *
 * Every scale tool (Utopia, Typescale, Modular Scale) takes a base size and
 * a ratio and gives size_n = base · r^n. This goes the other way too: given
 * the sizes a page renders, which ratio comes closest — so the controls
 * open on what the page already does rather than on a default, and moving
 * the ratio moves every style by its own step from the body size.
 */

export interface NamedRatio {
  name: string;
  ratio: number;
}

export const NAMED_RATIOS: NamedRatio[] = [
  { name: 'minor second', ratio: 1.067 },
  { name: 'major second', ratio: 1.125 },
  { name: 'minor third', ratio: 1.2 },
  { name: 'major third', ratio: 1.25 },
  { name: 'perfect fourth', ratio: 1.333 },
  { name: 'augmented fourth', ratio: 1.414 },
  { name: 'perfect fifth', ratio: 1.5 },
  { name: 'golden', ratio: 1.618 },
];

/** The name a ratio goes by, when it is within a hair of one of the classic ones. */
export function ratioName(ratio: number): string | null {
  const hit = NAMED_RATIOS.find((n) => Math.abs(n.ratio - ratio) < 0.006);
  return hit ? hit.name : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Each size's step from the body size: the next size up is +1, the next
 * down −1, whatever the numbers are. A page that skips a step keeps
 * skipping it; the ladder is the page's, not a scale's.
 */
export function stepsOf(sizes: number[], bodyPx: number): Map<number, number> {
  const distinct = [...new Set(sizes.map(round1))].filter((s) => s > 0);
  const above = distinct.filter((s) => s > bodyPx).sort((a, b) => a - b);
  const below = distinct.filter((s) => s < bodyPx).sort((a, b) => b - a);
  const steps = new Map<number, number>();
  steps.set(round1(bodyPx), 0);
  above.forEach((s, i) => steps.set(s, i + 1));
  below.forEach((s, i) => steps.set(s, -(i + 1)));
  return steps;
}

/**
 * The ratio that best explains the sizes as steps from the body: the mean
 * of size/body along the ladder, in log space, weighted by how many steps
 * each size sits from the body. Clamped to what a type scale could be.
 */
export function nearestRatio(sizes: number[], bodyPx: number): number {
  const steps = stepsOf(sizes, bodyPx);
  let num = 0;
  let den = 0;
  for (const [size, step] of steps) {
    if (step === 0) continue;
    num += Math.log(size / bodyPx) * step;
    den += step * step;
  }
  if (!den) return 1.25;
  const ratio = Math.exp(num / den);
  return Math.min(1.8, Math.max(1.05, Math.round(ratio * 1000) / 1000));
}

/** size_n = base · r^n, to a tenth of a pixel. */
export const scaleSize = (base: number, ratio: number, step: number): number => round1(base * Math.pow(ratio, step));

/**
 * A line-height for a size: 1.5 for body sizes, tightening to 1.1 at
 * display sizes, and landing on a 4px rhythm so the ladder stacks.
 */
export function lineHeightFor(sizePx: number, snapPx = 4): number {
  const t = Math.min(1, Math.max(0, (sizePx - 16) / (48 - 16)));
  const ratio = 1.5 - t * (1.5 - 1.1);
  const raw = sizePx * ratio;
  return Math.max(sizePx, Math.round(raw / snapPx) * snapPx);
}

/**
 * Tracking for a size: a touch open at small sizes, closing as type gets
 * large, in em so it travels with the size.
 */
export function trackingFor(sizePx: number): number {
  if (sizePx <= 12) return 0.01;
  if (sizePx >= 32) return -0.02;
  return Math.round(((0.01 - 0.03 * ((sizePx - 12) / 20)) * 1000)) / 1000;
}
