/**
 * The four ways a design tool sizes a box — Fixed, Fill, Fit, Relative — as
 * CSS, in both directions.
 *
 * Writing is exact: each mode is one or two declarations. Reading fails
 * closed: a computed width is always a pixel count, and a pixel count does
 * not say whether the author wrote `240px`, `auto` or `fit-content`. So a
 * mode is claimed only where the evidence is unambiguous — this log wrote
 * it, or the element is a flex child that grows — and otherwise nothing is
 * lit and the raw value stands. Nothing here reads a stylesheet to guess.
 */

export type SizeMode = 'fixed' | 'fill' | 'fit' | 'relative';
export type Axis = 'width' | 'height';

export const SIZE_MODES: readonly SizeMode[] = ['fixed', 'fill', 'fit', 'relative'];

export interface SizeEvidence {
  axis: Axis;
  /** Whether the parent lays this element out with flex. */
  inFlex: boolean;
  /** The parent's `flex-direction`, when it is flex. */
  parentDirection: string;
  /** Computed `flex-grow`. */
  flexGrow: string;
  /** What this panel's own log last wrote for the axis, if anything. */
  written?: string;
  /** What it last wrote for `flex`, if anything. */
  writtenFlex?: string;
}

/** Whether the axis runs along the parent's flex main axis. */
export function onMainAxis(ev: Pick<SizeEvidence, 'axis' | 'inFlex' | 'parentDirection'>): boolean {
  if (!ev.inFlex) return false;
  const column = ev.parentDirection.startsWith('column');
  return ev.axis === (column ? 'height' : 'width');
}

const FIT = /^(fit-content|max-content|min-content)$/;

/** The mode the evidence proves, or null when it proves nothing. */
export function modeOf(ev: SizeEvidence): SizeMode | null {
  // Fill along a flex main axis is written as `flex: 1 1 0%` with the axis
  // set to auto, so the flex word is the one that speaks for that pair.
  if (onMainAxis(ev) && ev.writtenFlex?.trim().startsWith('1')) return 'fill';
  const written = ev.written?.trim();
  if (written) {
    if (written.endsWith('%')) return 'relative';
    if (FIT.test(written)) return 'fit';
    if (/^-?\d*\.?\d+(px|rem|em|ch|vw|vh|svw|svh|dvw|dvh)$/.test(written)) return 'fixed';
    if (written === 'auto') return onMainAxis(ev) ? null : ev.axis === 'width' ? 'fill' : 'fit';
    return null;
  }
  if (onMainAxis(ev) && parseFloat(ev.flexGrow) >= 1) return 'fill';
  return null;
}

export interface Declaration {
  property: string;
  value: string;
}

/**
 * The declarations that put the axis into a mode.
 *
 * `rendered` is the element's box in px and `parent` its parent's content
 * box, both as laid out right now; Fixed pins the first, Relative is the
 * first as a share of the second.
 */
export function writeMode(mode: SizeMode, ev: SizeEvidence, rendered: number, parent: number): Declaration[] {
  const axis = ev.axis;
  switch (mode) {
    case 'fixed':
      return [{ property: axis, value: `${Math.round(rendered)}px` }];
    case 'fit':
      return [{ property: axis, value: 'fit-content' }];
    case 'relative': {
      const share = parent > 0 ? Math.round((rendered / parent) * 1000) / 10 : 100;
      return [{ property: axis, value: `${Math.min(100, Math.max(0, share))}%` }];
    }
    case 'fill':
      // One declaration: a basis of 0% is what the axis sizes from, whatever
      // `width` says, so the brief carries one line rather than two.
      if (onMainAxis(ev)) return [{ property: 'flex', value: '1 1 0%' }];
      if (ev.inFlex) return [{ property: 'align-self', value: 'stretch' }, { property: axis, value: 'auto' }];
      return [{ property: axis, value: axis === 'width' ? 'auto' : '100%' }];
  }
}
