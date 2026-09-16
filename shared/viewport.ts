/**
 * The frame the page is shown in, worked out without a browser.
 *
 * A frame is the width and height the page is laid out at, which is what its
 * media queries are answered for. It is drawn inside the tab, centred, and
 * scaled down when the tab has less room; `studio/frame.ts` does that part.
 * This is the vocabulary around it: the presets, the kinds of device, and a
 * size typed by hand.
 */

import { DEVICE_PRESETS } from './types';

export interface Size {
  width: number;
  height: number;
}

export type DeviceKind = 'desktop' | 'laptop' | 'tablet' | 'phone';

export interface Preset extends Size {
  name: string;
  kind: DeviceKind;
}

/** A frame the page is being shown in. */
export interface Frame extends Size {
  kind: DeviceKind;
  /** The preset it matches, or null for a width and height typed by hand. */
  name: string | null;
}

/** The kinds, in the order the bar shows them: widest first. */
export const DEVICE_KINDS: DeviceKind[] = ['desktop', 'laptop', 'tablet', 'phone'];

/**
 * The widest and narrowest a frame may be. Past these no layout is a design
 * anyone ships, and the fit-to-tab scale would make the page unreadable.
 */
export const FRAME_LIMITS = { minWidth: 200, maxWidth: 2560, minHeight: 200, maxHeight: 4000 };

/** The preset whose size this is, if it is one. */
export function presetFor(size: Size, presets: readonly Preset[] = DEVICE_PRESETS): Preset | null {
  return presets.find((p) => Math.abs(p.width - size.width) <= 2 && Math.abs(p.height - size.height) <= 2) ?? null;
}

/** The presets of one kind, for the Frame menu. */
export const presetsOf = (kind: DeviceKind, presets: readonly Preset[] = DEVICE_PRESETS): Preset[] =>
  presets.filter((p) => p.kind === kind);

/**
 * What kind of device a width is, for a size typed by hand. The same bands
 * the presets fall into, so a typed 390 lights up the phone.
 */
export function kindFor(width: number): DeviceKind {
  if (width < 600) return 'phone';
  if (width < 1024) return 'tablet';
  if (width < 1600) return 'laptop';
  return 'desktop';
}

/** A size brought inside the limits, rounded to whole CSS pixels. */
export function clampFrame(size: Size): Size {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
  return {
    width: clamp(size.width, FRAME_LIMITS.minWidth, FRAME_LIMITS.maxWidth),
    height: clamp(size.height, FRAME_LIMITS.minHeight, FRAME_LIMITS.maxHeight),
  };
}

/** A frame for a size, named after the preset it matches. */
export function frameFor(size: Size, presets: readonly Preset[] = DEVICE_PRESETS): Frame {
  const clamped = clampFrame(size);
  const preset = presetFor(clamped, presets);
  return { ...clamped, kind: preset?.kind ?? kindFor(clamped.width), name: preset?.name ?? null };
}

/** "Tablet · 768 × 1024", "Custom · 1103 × 812", "Laptop · 1280 × 800 · 76%". */
export function viewportLabel(frame: Frame | null, window: Size, scale = 1): string {
  if (!frame) return `Window · ${Math.round(window.width)} × ${Math.round(window.height)}`;
  const pct = Math.round(scale * 100);
  const size = `${frame.width} × ${frame.height}`;
  return `${frame.name ?? 'Custom'} · ${size}${pct === 100 ? '' : ` · ${pct}%`}`;
}
