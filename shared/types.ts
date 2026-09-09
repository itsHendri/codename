import type { CommentTarget, Pin } from '@/studio/annotations';
import type { OverlayTheme } from './theme';
import type { Mode } from '@/studio/engine/types';

export interface FontFaceInfo {
  family: string;
  weights: string[];
  styles: string[];
  srcUrls: string[];
  service: 'google' | 'adobe' | 'monotype' | 'hoefler' | 'self-hosted' | 'system';
}

export interface FontUsage {
  family: string;
  /** Distinct size/weight/lineHeight combos with element counts */
  variants: { size: string; weight: string; lineHeight: string; count: number }[];
  elementCount: number;
  roles: string[]; // e.g. ['headings', 'body', 'code']
}

export interface ColorInfo {
  hex: string;
  /** Where it was seen */
  usage: ('text' | 'background' | 'border')[];
  count: number;
  /** Custom property names that resolve to this color, if any */
  varNames: string[];
}

export interface GradientInfo {
  css: string;
  count: number;
}

export interface ContrastPair {
  fg: string;
  bg: string;
  ratio: number;
  count: number;
}

export interface SvgAsset {
  id: string;
  source: 'inline' | 'img' | 'css' | 'sprite' | 'favicon';
  /** Standalone SVG markup when resolvable in-page */
  markup?: string;
  /** URL to fetch when markup is not available in-page */
  url?: string;
  bytes?: number;
}

export interface CustomPropInfo {
  name: string;
  value: string;
  /**
   * Where the browser loaded the stylesheet that defines this. On a dev server
   * it maps to a repo path, which is a useful hint when handing a change to an
   * agent — but it is where the *browser* got the CSS, not proof of where the
   * source lives. Absent for inline `<style>` blocks.
   */
  source?: string;
  /** How many declarations reference it, as a measure of blast radius. */
  uses?: number;
}

/** A CSS value observed on the page, with how often it was seen. */
export interface ValueTally {
  value: string;
  count: number;
}

/**
 * Shape and rhythm as the page actually renders them. Colour and type were
 * always sampled; these were not, which is why a scanned system used to inherit
 * its radii, spacing and elevation from whatever preset happened to be default.
 */
export interface ShapeUsage {
  /** border-radius values, e.g. "4px", "9999px". Excludes "0px". */
  radii: ValueTally[];
  /** box-shadow values verbatim, ordered by frequency. Excludes "none". */
  shadows: ValueTally[];
  /** padding/margin/gap lengths in px, deduped and counted. */
  spacing: ValueTally[];
}

export interface ScanResult {
  url: string;
  title: string;
  scannedAt: number;
  viewport: { width: number; height: number; dpr: number };
  fontFaces: FontFaceInfo[];
  fontUsage: FontUsage[];
  colors: ColorInfo[];
  gradients: GradientInfo[];
  contrastPairs: ContrastPair[];
  svgs: SvgAsset[];
  customProps: CustomPropInfo[];
  shape: ShapeUsage;
  /** Full CSS text gathered from same-origin sheets and <style> tags */
  cssText: string;
  /** The root font size in px, so rem values can be compared honestly. */
  rootFontSize?: number;
  /** hrefs of cross-origin sheets that could not be read in-page */
  unreadableSheets: string[];
  stats: { elementsSampled: number; styleSheets: number };
}

/** One element, read from the page: enough to show, edit and describe it. */
export interface ElementProps {
  /** Matches exactly this element; see `stable`. */
  selector: string;
  matches: number;
  /** false when :nth-of-type was needed, so a reorder breaks it. */
  stable: boolean;
  /** The class-level selector a designer means ("all buttons like this"). */
  intent: { selector: string; matches: number };
  tag: string;
  /** From body down to the element itself. */
  breadcrumb: { tag: string; selector: string }[];
  rect: { x: number; y: number; width: number; height: number };
  box: {
    marginTop: string;
    marginRight: string;
    marginBottom: string;
    marginLeft: string;
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
    width: string;
    height: string;
    boxSizing: string;
    display: string;
    gap: string;
  };
  /** How the box lays its children out; only meaningful when display is flex or grid. */
  layout: {
    flexDirection: string;
    justifyContent: string;
    alignItems: string;
    flexWrap: string;
  };
  opacity: string;
  type: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    letterSpacing: string;
    textAlign: string;
  };
  color: { text: string; background: string; border: string };
  radius: string;
  /** Each corner on its own, for the shapes one radius cannot say. */
  corners: { topLeft: string; topRight: string; bottomRight: string; bottomLeft: string };
  border: { width: string; style: string; color: string };
  shadow: string;
  /** Present only when the element's own children are text. */
  text: string | null;
  contrastRatio: number | null;
}

/** Kept for the pinned card until it is rebuilt on ElementProps. */
export type PinnedElement = ElementProps;

/** Panel → inspector. */
export type InspectorCommand =
  | { cmd: 'hover'; on: boolean }
  /** Flip a mode, from a keyboard shortcut. */
  | { cmd: 'toggle'; what: 'select' | 'comment' }
  /** The page's own names for its colours (upper-case hex → variable), so the readout can say them. */
  | { cmd: 'tokens'; colors: Record<string, string> }
  | { cmd: 'select'; selector: string }
  | { cmd: 'deselect' }
  | { cmd: 'walk'; dir: 'parent' | 'child' | 'next' | 'prev' }
  | { cmd: 'ancestor'; depth: number }
  | { cmd: 'read' }
  /** The page as a flat list of layers. */
  | { cmd: 'layers' }
  /** Light an element up from the panel, without selecting it. */
  | { cmd: 'peek'; selector: string }
  | { cmd: 'unpeek' }
  | { cmd: 'text'; selector: string; text: string }
  | { cmd: 'pins'; pins: Pin[] }
  /** Draw-a-box / click / shift-click to say what a note is about. */
  | { cmd: 'note'; on: boolean }
  | { cmd: 'measure'; on: boolean }
  /** Show the bar. `theme` is the panel's palette; `mode` is which way the Light/Dark switch sits. */
  | { cmd: 'bar'; on: boolean; theme?: OverlayTheme; mode?: Mode; resettable?: number }
  /** Put the window and zoom back where they were before the first preset. */
  | { cmd: 'reset-viewport' }
  | { cmd: 'off' };

export type RuntimeMessage =
  | { type: 'scan-result'; data: ScanResult }
  | { type: 'element-selected'; data: ElementProps | null }
  | { type: 'inspector-shortcut'; action: 'undo' | 'redo' }
  | { type: 'pin-clicked'; id: string }
  | { type: 'note-created'; target: CommentTarget; text: string }
  | { type: 'note-toggled'; active: boolean }
  /** The bar picked a preset. The page sends what it knows; the background works out the window. */
  | {
      type: 'resize-window';
      preset: { name: string; width: number; height: number };
      inner: { width: number; height: number };
      outer: { width: number; height: number };
    }
  | { type: 'reset-viewport' }
  | { type: 'viewport-state' }
  /** The bar's Light/Dark switch. */
  | { type: 'mode-changed'; mode: Mode }
  /** A value changed on the edit card that sits on the selected element. */
  | { type: 'element-edit'; property: string; to: string }
  /** "More in panel" on that card. */
  | { type: 'panel-focus' }
  /** Reset on the bar: every override goes, the page reads as itself. */
  | { type: 'reset-all' }
  | { type: 'fetch-text'; url: string };

export const DEVICE_PRESETS = [
  { name: 'Mobile S', width: 375, height: 667, kind: 'phone' },
  { name: 'Mobile L', width: 430, height: 932, kind: 'phone' },
  { name: 'Tablet', width: 768, height: 1024, kind: 'tablet' },
  { name: 'Laptop', width: 1280, height: 800, kind: 'laptop' },
  { name: 'Laptop L', width: 1440, height: 900, kind: 'laptop' },
  { name: 'Desktop', width: 1920, height: 1080, kind: 'desktop' },
] as const;
