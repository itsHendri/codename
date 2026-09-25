import type { CommentTarget, Pin } from '@/studio/annotations';
import type { ComponentOrigin } from '@/studio/framework';
import type { SpecimenSpec } from '@/studio/specimen/spec';
import type { OverlayTheme } from './theme';
import type { Mode } from '@/studio/engine/types';
import type { LayerNode } from '@/studio/layers';

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
  variants: {
    size: string;
    weight: string;
    lineHeight: string;
    count: number;
    /** Which tags wear this variant, and how many of each: `{ h1: 3, p: 40 }`. Absent in an older scan. */
    tags?: Record<string, number>;
  }[];
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
  /**
   * Its value under the page's own dark mode — a `prefers-color-scheme: dark`
   * block or a theme hook like `html.dark` — when the page defines one.
   */
  dark?: string;
  /**
   * Its value inside width media queries, keyed by the condition written one
   * way (`(max-width: 700px)`), where it differs from the value above. A token
   * change that ignores these misses an override the page will still apply.
   */
  atWidth?: Record<string, string>;
  /**
   * Set when every definition of this variable sits under a width media
   * query, so `value` is really the value at this condition and the page has
   * no base value for it. The chip and the brief say so instead of hiding it.
   */
  onlyAt?: string;
  /**
   * Every place the page defines it, read from the object model, each with
   * the scope it sits in. The token graph: what a write has to know, and
   * what the panel shows by scope. Absent in a scan from before this was read.
   */
  definitions?: PropDefinition[];
  /**
   * For a value that is a `var()` of another variable: the chain to a
   * literal, nearest first — `['--mark']` for `--button-bg: var(--mark)`.
   */
  alias?: string[];
  /** The literal at the end of the chain in light, when it resolves. */
  resolved?: string;
}

/** Where a variable is defined, as the page's object model says. */
export interface PropDefinition {
  value: string;
  /** The selector, nesting folded: `:root`, `.dark`, `.card`. */
  selector: string;
  /** The conditions open around it, as the page wrote them. */
  media: string[];
  /** The cascade layer, when it is in a named one. */
  layer?: string;
  /** The stylesheet URL, when the browser could say. */
  source?: string;
  /**
   * Which side of the page reads it: the root of the cascade, its dark side
   * (a dark media query or a hook like `.dark`), a width query, or a
   * component scope. Classified once, so nothing re-derives it.
   */
  scope: 'root' | 'dark' | 'width' | 'scoped';
}

/**
 * How a project writes a type style, detected and never invented: a Tailwind
 * v4 `--text-*` token with its sub-variables, a class, one variable per
 * field, or a bare tag rule.
 */
export type TypeStyleForm = 'tailwind-theme' | 'class' | 'vars' | 'tag';

/** One field of a type style: the variable it reads, or the literal it holds. */
export interface TypeField {
  token?: string;
  literal?: string;
}

export interface TypeStyle {
  /** The page's own word for it: `display`, `h1`, `xl`. */
  name: string;
  form: TypeStyleForm;
  /** `h1`, `.text-display`, `.h1`, or the utility `text-xl`. */
  selectorOrUtility: string;
  /** When the form is a tag. */
  tag?: string;
  fields: { size: TypeField; lineHeight?: TypeField; tracking?: TypeField; weight?: TypeField; family?: TypeField };
  source?: string;
}

/**
 * The declaration that paints one property of an element, as the author
 * wrote it — not the computed value, which cannot say where it came from.
 */
export interface AuthoredDecl {
  /** The declaration text as written: `var(--ink)`, `#15171b`, `1.25rem`. */
  value: string;
  /** The variable named at the top of the value, when it is a `var()`. */
  token?: string;
  /** The rule that won: its selector, sheet and the conditions around it. `inline` for a style attribute. */
  rule: { selector: string; source?: string; groups: string[] };
  important: boolean;
  /** Set when nothing on the element itself sets this and the nearest ancestor's declaration is what it takes. */
  inherited?: boolean;
  /**
   * False when the answer could be wrong: a stylesheet could not be read,
   * the element is in a shadow root, two rules in different cascade layers
   * competed, or the read ran out of time. The panel then says "matches",
   * never "is".
   */
  certain: boolean;
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

/**
 * Accessibility facts the same walk can count. Each is a number with the
 * total it is out of, so the critique can say "3 of 40" rather than "some".
 */
export interface A11yUsage {
  images: number;
  /** `<img>` with no alt attribute at all; an empty alt is a decision and is not counted. */
  imagesWithoutAlt: number;
  /** A heading level more than one below the heading before it, in document order. */
  headingSkips: { from: number; to: number; count: number }[];
  /** Buttons, inputs, selects and block-level links: the controls a target size applies to. */
  targets: number;
  /** Those under 24×24 CSS px. Inline text links are exempt and not counted. */
  smallTargets: number;
  /** Rules that set `outline: none` or `outline: 0` on a `:focus` selector, in the readable CSS. */
  focusOutlineRemoved: number;
}

export interface ScanResult {
  url: string;
  title: string;
  scannedAt: number;
  viewport: { width: number; height: number; dpr: number };
  /**
   * The width queries this page's own stylesheets are written against, e.g.
   * `(max-width: 700px)`. The widths it was actually designed at, which are
   * not the same list as a browser's device presets.
   */
  breakpoints?: string[];
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
  /** Absent in a scan from before these were counted. */
  a11y?: A11yUsage;
  /** The type styles the page's stylesheets define, in whatever form they take. Absent in an older scan. */
  typeStyles?: TypeStyle[];
  /** Which side the page was showing when it was read: its own dark hook or media, or light. Absent in an older scan. */
  scheme?: 'light' | 'dark';
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
    minWidth: string;
    minHeight: string;
    maxWidth: string;
    maxHeight: string;
    boxSizing: string;
    display: string;
    gap: string;
    rowGap: string;
    columnGap: string;
    overflowX: string;
    overflowY: string;
  };
  /** How the box lays its children out; only meaningful when display is flex or grid. */
  layout: {
    flexDirection: string;
    justifyContent: string;
    alignItems: string;
    flexWrap: string;
  };
  /** Where the box sits: its `position`, the four insets and the stacking order. */
  position: { type: string; top: string; right: string; bottom: string; left: string; zIndex: string };
  /**
   * How the box sits in its parent. `inFlex` when the parent is a flex
   * container; the parent's content box is what a relative size is a share of.
   */
  child: {
    inFlex: boolean;
    parentDirection: string;
    flexGrow: string;
    flexShrink: string;
    flexBasis: string;
    alignSelf: string;
    order: string;
    parentWidth: number;
    parentHeight: number;
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
  /** `filter` and `backdrop-filter`, for the blur fields; verbatim. */
  filter: string;
  backdropFilter: string;
  /** The `transition` shorthand, which is how this element gets between states. */
  transition: string;
  /** The computed `transform`: a matrix, or none. */
  transform: string;
  /** The `animation` shorthand, and the timeline it runs on (`auto`, or `view()` for a scroll trigger). */
  animation: string;
  animationTimeline: string;
  /** The `@keyframes` names this page defines, so an animation can pick one. */
  keyframes: string[];
  /** Present only when the element's own children are text. */
  text: string | null;
  contrastRatio: number | null;
  /**
   * The component that rendered this, where the framework's dev build says
   * so. Absent on a production build, and never inferred from class names.
   */
  component?: ComponentOrigin;
  /**
   * The declarations that paint it, by property, as their authors wrote
   * them — what lets the panel say "is `--ink`" rather than "matches".
   * Absent when the inspector did not read them.
   */
  authored?: Record<string, AuthoredDecl>;
}

/** Kept for the pinned card until it is rebuilt on ElementProps. */
export type PinnedElement = ElementProps;

/** Panel → inspector. */
export type InspectorCommand =
  | { cmd: 'hover'; on: boolean }
  /** Flip a mode, from a keyboard shortcut. */
  | { cmd: 'toggle'; what: 'preview' | 'comment' | 'layers' }
  /**
   * The page's own names for its values, so the readout and the edit card can
   * say them: colours by upper-case hex; lengths by px, and only for variables
   * whose names say what they are, since a bare `8px` could be a gap or a radius.
   */
  | {
      cmd: 'tokens';
      colors: Record<string, string>;
      lengths?: TokenLengths;
      /** The spacing the page actually uses, in px, for the handles to snap to where no variable holds it. */
      scale?: number[];
    }
  | { cmd: 'select'; selector: string }
  | { cmd: 'deselect' }
  /** Escape from the rail: let go of one thing, as Escape on the page does. */
  | { cmd: 'escape' }
  /** Hold the selection in a state by class, so its hover rules paint. Null lets go. */
  | { cmd: 'state'; state: 'hover' | 'focus' | 'active' | null }
  | { cmd: 'walk'; dir: 'parent' | 'child' | 'next' | 'prev' }
  | { cmd: 'ancestor'; depth: number }
  | { cmd: 'read' }
  /** The elements shift-clicked beside the selection, read again. */
  | { cmd: 'read-also' }
  /** Every colour painted inside the selection, with the elements that paint it. */
  | { cmd: 'colours' }
  /** Every wrap in force, oldest first; the page takes its wrappers out and puts these in afresh. */
  | { cmd: 'wraps'; wraps: WrapSpec[] }
  /** The page as a flat list of layers. */
  | { cmd: 'layers' }
  /** Light an element up from the panel, without selecting it. */
  | { cmd: 'peek'; selector: string }
  | { cmd: 'unpeek' }
  | { cmd: 'text'; selector: string; text: string }
  /** Every reorder in force, oldest first; the page restores what it moved and applies these afresh. */
  | { cmd: 'moves'; moves: { selector: string; parent: string; before: string | null }[] }
  | { cmd: 'pins'; pins: Pin[] }
  /** Draw-a-box / click / shift-click to say what a note is about. */
  | { cmd: 'note'; on: boolean }
  | { cmd: 'measure'; on: boolean }
  /** Show the bar. `theme` is the panel's palette; `mode` is which way the Light/Dark switch sits. */
  | {
      cmd: 'bar';
      on: boolean;
      theme?: OverlayTheme;
      mode?: Mode;
      resettable?: number;
      darkVia?: 'site' | 'mirror' | null;
      /** What the connected agent is previewing on the page right now, for the chip. */
      agent?: AgentPresence | null;
      /** Whether the layers rail is showing, so the bar's toggle sits right. */
      rail?: boolean;
      /** Whether the specimen is showing over the page, so the bar's Styles switch sits right. */
      specimen?: boolean;
      /** Which side of the page's theme is forced, or neither: how the Light/Dark switch sits. */
      scheme?: 'light' | 'dark';
    }
  /** The agent says "look here": scroll to it, light it up for a moment, show the note. */
  | { cmd: 'point'; selector: string; note?: string }
  /**
   * Show the page as a frame, answering once the frame is on. `preset` names
   * one of the bar's devices, or `reset`. `width` asks for a bare CSS width
   * instead — the page's own breakpoints are not devices and have no height of
   * their own, so the frame keeps the height already in play.
   */
  | { cmd: 'set-viewport'; preset: string; width?: number }
  /**
   * Scroll the first match into view and answer with its box, so a capture
   * can be cropped to it; with no selector, answer with the frame's box only.
   */
  | { cmd: 'locate'; selector?: string }
  /** Take the frame off, so the page is at the window's own size again. */
  | { cmd: 'reset-viewport' }
  | { cmd: 'off' };

/**
 * A stack Codename put around some elements: a new box with an id of its own,
 * standing where the first of them stood, holding them in their order.
 */
export interface WrapSpec {
  id: string;
  /** The elements it holds, by selector, in document order. */
  members: string[];
}

/** One colour inside a selection: where it is painted, and on which property. */
export interface SelectionColour {
  hex: string;
  uses: {
    selector: string;
    matches: number;
    stable: boolean;
    property: 'color' | 'background-color' | 'border-color' | 'fill' | 'stroke';
    /** What the property reads now, as the element paints it. */
    value: string;
  }[];
}

/** The agent's preview sheet, counted: how many rules it holds and how many elements they reach. */
export interface AgentPresence {
  rules: number;
  matched: number;
}

/**
 * Panel → rail. The rail is the page's tree and assets, drawn in the page on
 * the left; it talks to the inspector in the page directly, and to the panel
 * only for what belongs in the change log.
 */
/** Panel → specimen script. */
export type SpecimenCommand =
  /** Show the styles page over the page (or take it away), built from this spec, in the panel's palette. */
  | { cmd: 'specimen'; on: boolean; spec?: SpecimenSpec; theme?: OverlayTheme }
  /** The specimen as a standalone page, for saving. */
  | { cmd: 'html' }
  | { cmd: 'off' };

export type RailCommand =
  /** Show or hide the rail. `theme` is the panel's palette. */
  | { cmd: 'rail'; on: boolean; theme?: OverlayTheme }
  /** The page's SVGs, from the scan, for the Assets tab. */
  | { cmd: 'assets'; svgs: SvgAsset[] }
  | { cmd: 'off' };

export type RuntimeMessage =
  | { type: 'scan-result'; data: ScanResult }
  /** The chip on the bar: take the agent's preview off the page. */
  | { type: 'agent-clear' }
  | { type: 'element-selected'; data: ElementProps | null }
  | { type: 'inspector-shortcut'; action: 'undo' | 'redo' }
  | { type: 'pin-clicked'; id: string }
  | { type: 'note-created'; target: CommentTarget; text: string }
  | { type: 'note-toggled'; active: boolean }
  /** Remember the frame this tab is shown in, so a reload comes back in it. */
  | { type: 'frame-set'; width: number; height: number }
  /** Forget it: the page is at the window's own size again. */
  | { type: 'frame-clear' }
  /** The frame this tab was left in, if any. */
  | { type: 'frame-state' }
  /** The bar's Light/Dark switch: a side forced, or `system` for neither. */
  | { type: 'mode-changed'; mode: Mode }
  /** A value changed on the edit card that sits on the selected element. */
  | { type: 'element-edit'; property: string; to: string }
  /** "More in panel" on that card. */
  | { type: 'panel-focus' }
  /** Reset on the bar: every override goes, the page reads as itself. */
  | { type: 'reset-all' }
  /** Layers on the bar, or Alt+L: show or hide the rail. */
  | { type: 'rail-toggled'; on: boolean }
  /** Styles on the bar: show the specimen over the page, or the page again. */
  | { type: 'specimen-toggled'; on: boolean }
  /** A row dragged in the rail: an element edit, so it lands in the log like any other. */
  | {
      type: 'rail-move';
      node: LayerNode;
      parent: LayerNode;
      before: LayerNode | null;
      wasIn: LayerNode;
      wasBefore: LayerNode | null;
    }
  /** The eye on a rail row: hidden, or shown again. */
  | { type: 'rail-hide'; node: LayerNode }
  /** A component picked in the rail: the next edits are for every match. */
  | { type: 'rail-scope'; scope: 'element' | 'all' }
  | { type: 'fetch-text'; url: string };

export interface TokenLengths {
  space: Record<string, string>;
  radius: Record<string, string>;
  type: Record<string, string>;
}

/**
 * The stylesheets this extension puts on a page.
 *
 * Anything reading the page has to leave them out, or it reads its own
 * output back: a width edit written into `codename-elements` would otherwise
 * show up in the next scan as a breakpoint the page owns, and the page would
 * appear to have been designed at a width the person had just invented.
 */
export const MANAGED_SHEET_IDS = [
  'codename-reskin',
  'codename-agent-preview',
  'codename-elements',
  'codename-site-dark',
  'codename-agent-marks',
  'codename-state',
  'codename-frame',
  'codename-specimen',
  'codename-proposal',
] as const;

/** Whether a stylesheet is one of ours. */
export const isManagedSheet = (sheet: { ownerNode?: unknown }): boolean => {
  const node = sheet.ownerNode as Element | null | undefined;
  return Boolean(node && 'id' in node && (MANAGED_SHEET_IDS as readonly string[]).includes(node.id));
};

export const DEVICE_PRESETS = [
  { name: 'Mobile S', width: 375, height: 667, kind: 'phone' },
  { name: 'Mobile L', width: 430, height: 932, kind: 'phone' },
  { name: 'Tablet', width: 768, height: 1024, kind: 'tablet' },
  { name: 'Laptop', width: 1280, height: 800, kind: 'laptop' },
  { name: 'Laptop L', width: 1440, height: 900, kind: 'laptop' },
  { name: 'Desktop', width: 1920, height: 1080, kind: 'desktop' },
] as const;
