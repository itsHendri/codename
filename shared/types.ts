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

export interface PinnedElement {
  selector: string;
  tag: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  backgroundColor: string;
  borderRadius: string;
  padding: string;
  margin: string;
  width: number;
  height: number;
  contrastRatio: number | null;
}

export type RuntimeMessage =
  | { type: 'scan-result'; data: ScanResult }
  | { type: 'pinned-element'; data: PinnedElement }
  | { type: 'hover-toggled'; active: boolean }
  | { type: 'fetch-text'; url: string };

export const DEVICE_PRESETS = [
  { name: 'Mobile S', width: 375, height: 667, kind: 'phone' },
  { name: 'Mobile L', width: 430, height: 932, kind: 'phone' },
  { name: 'Tablet', width: 768, height: 1024, kind: 'tablet' },
  { name: 'Laptop', width: 1280, height: 800, kind: 'laptop' },
  { name: 'Laptop L', width: 1440, height: 900, kind: 'laptop' },
  { name: 'Desktop', width: 1920, height: 1080, kind: 'desktop' },
] as const;
