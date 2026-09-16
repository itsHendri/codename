/**
 * The frame the page is shown in, worked out without a browser.
 *
 * A frame is a CSS viewport — the width and height the page believes it has,
 * which is what its media queries answer to. It used to be reached by
 * resizing the window and zooming when the display could not fit it; now it
 * is emulated, the way DevTools' device toolbar does it, so the window stays
 * where the person put it.
 *
 * Emulation draws the frame in the top-left of the tab. When the frame is
 * bigger than the tab it is scaled down to fit rather than cut off, and the
 * scale is part of what the bar says, so a breakpoint check is never a guess
 * about what is being looked at.
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
  /**
   * Shown as a phone or tablet browser would show it, honouring the page's
   * viewport meta tag. Only a named phone or tablet is: a width typed by hand,
   * or a breakpoint the page is being checked at, is a desktop browser at that
   * width — otherwise a page with no viewport meta tag lays out at 980px, its
   * `max-width: 700px` query never matches, and the check checks nothing.
   */
  mobile: boolean;
}

/** The kinds, in the order the bar shows them: widest first. */
export const DEVICE_KINDS: DeviceKind[] = ['desktop', 'laptop', 'tablet', 'phone'];

/**
 * The widest and narrowest a frame may be. Past these no layout is a design
 * anyone ships, and the fit-to-tab scale would make the page unreadable.
 */
export const FRAME_LIMITS = { minWidth: 200, maxWidth: 2560, minHeight: 200, maxHeight: 4000 };

/**
 * Below this the frame is scaled no further. Small, because a floor that
 * readability would ask for means a frame bigger than the tab is cut off,
 * and a cut-off frame is a worse lie than a small one.
 */
export const MIN_SCALE = 0.1;

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
  const kind = preset?.kind ?? kindFor(clamped.width);
  return { ...clamped, kind, name: preset?.name ?? null, mobile: !!preset && (kind === 'phone' || kind === 'tablet') };
}

/**
 * How far the frame has to be scaled to fit the tab, 1 when it already fits.
 *
 * Both sides count: a phone is narrow but tall, and cutting off the bottom
 * of it would be as wrong as cutting off the side of a desktop.
 */
export function fitScale(frame: Size, tab: Size): number {
  if (tab.width <= 0 || tab.height <= 0) return 1;
  const s = Math.min(1, tab.width / frame.width, tab.height / frame.height);
  // Rounded down, so a frame that nearly fits is not a pixel too big.
  return Math.max(MIN_SCALE, Math.floor(s * 100) / 100);
}

/** The override Chrome is asked for, as the DevTools protocol spells it. */
export interface MetricsOverride {
  width: number;
  height: number;
  /** 0 keeps the display's own pixel density. */
  deviceScaleFactor: number;
  /** A phone or a tablet: honours the page's viewport meta tag and overlay scrollbars. */
  mobile: boolean;
  scale: number;
}

/**
 * What to ask Chrome for, to show a frame in a tab of a given size.
 *
 * Touch is deliberately not emulated. It makes `(hover: none)` match, and a
 * page written for that hides its hover styles — the very states the panel
 * holds and edits.
 */
export function planEmulation(frame: Size & { mobile: boolean }, tab: Size): MetricsOverride {
  const size = clampFrame(frame);
  return {
    width: size.width,
    height: size.height,
    deviceScaleFactor: 0,
    mobile: frame.mobile,
    scale: fitScale(size, tab),
  };
}

/** "Tablet · 768 × 1024", "Custom · 1103 × 812", "Laptop · 1280 × 800 · 76%". */
export function viewportLabel(frame: Frame | null, window: Size, scale = 1): string {
  if (!frame) return `Window · ${Math.round(window.width)} × ${Math.round(window.height)}`;
  const pct = Math.round(scale * 100);
  const size = `${frame.width} × ${frame.height}`;
  return `${frame.name ?? 'Custom'} · ${size}${pct === 100 ? '' : ` · ${pct}%`}`;
}
