/**
 * Viewport presets, worked out without a browser.
 *
 * A preset is a CSS viewport, but a window can only be resized in device
 * pixels, and the side panel takes a slice of it that Chrome will not give
 * back. So a request is planned in two steps: ask the window for the size that
 * would give the preset, then — when the display is too small for that — zoom
 * the page out until its CSS viewport is the preset width anyway. The label
 * says which happened, so a breakpoint check is never a guess.
 */

import { DEVICE_PRESETS } from './types';

export interface Size {
  width: number;
  height: number;
}

export interface ViewportState {
  /** CSS pixels, as the page sees them. */
  innerWidth: number;
  innerHeight: number;
  /** 1 = 100%. */
  zoom: number;
}

export interface Preset extends Size {
  name: string;
}

/** Below this an outer window is not usable; Chrome would clamp it anyway. */
export const MIN_OUTER: Size = { width: 500, height: 200 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The preset whose width this viewport is, if it is one. Width only: a zoomed page keeps the display's height. */
export function presetFor(width: number, presets: readonly Preset[] = DEVICE_PRESETS): Preset | null {
  return presets.find((p) => Math.abs(p.width - width) <= 2) ?? null;
}

/** "Tablet · 768 × 1024", "Custom · 1103 × 812", "Laptop · 1280 × 800 · 86%". */
export function viewportLabel(state: ViewportState, presets: readonly Preset[] = DEVICE_PRESETS): string {
  const name = presetFor(state.innerWidth, presets)?.name ?? 'Custom';
  const pct = Math.round(state.zoom * 100);
  const size = `${Math.round(state.innerWidth)} × ${Math.round(state.innerHeight)}`;
  return pct === 100 ? `${name} · ${size}` : `${name} · ${size} · ${pct}%`;
}

/**
 * The window's chrome — tabs, toolbar, side panel — in device pixels.
 * `innerWidth` is CSS pixels, so it has to be scaled by the zoom first.
 */
export function chromeDelta(inner: Size, outer: Size, zoom: number): Size {
  return {
    width: Math.max(0, outer.width - inner.width * zoom),
    height: Math.max(0, outer.height - inner.height * zoom),
  };
}

/** The outer size to ask the window for, so the page's viewport becomes the preset at 100%. */
export function requestedBounds(preset: Size, inner: Size, outer: Size, zoom: number): Size {
  const delta = chromeDelta(inner, outer, zoom);
  return {
    width: Math.max(MIN_OUTER.width, Math.round(preset.width + delta.width)),
    height: Math.max(MIN_OUTER.height, Math.round(preset.height + delta.height)),
  };
}

/**
 * Given what the window actually became, the zoom that makes the CSS viewport
 * the preset width, and the viewport that results.
 */
export function planResize(args: {
  preset: Size;
  inner: Size;
  outer: Size;
  zoom: number;
  /** The outer size the window ended up with, which may be clamped. */
  achieved: Size;
}): { zoom: number; viewport: Size } {
  const delta = chromeDelta(args.inner, args.outer, args.zoom);
  const innerDip = {
    width: Math.max(1, args.achieved.width - delta.width),
    height: Math.max(1, args.achieved.height - delta.height),
  };
  const zoom = innerDip.width >= args.preset.width ? 1 : round2(innerDip.width / args.preset.width);
  return {
    zoom,
    viewport: { width: Math.round(innerDip.width / zoom), height: Math.round(innerDip.height / zoom) },
  };
}
