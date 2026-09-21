/**
 * The edit card's values: which of an element's properties it shows, and
 * how a number typed into it becomes a length.
 */

import type { ElementProps } from '@/shared/types';
import { paddingShorthand } from '@/studio/boxModel';

/** `8` typed into a length field means `8px`; anything with units is kept. */
export const asPx = (v: string) => (/^-?\d*\.?\d+$/.test(v.trim()) ? `${v.trim()}px` : v.trim());

/** A shorthand typed as "8 16" means pixels; anything with units is kept. */
export const asLengths = (v: string) => v.trim().split(/\s+/).map(asPx).join(' ');

/** The most-reached-for values of a selection, keyed by the property each edits. */
export function editValues(props: ElementProps): Record<string, string> {
  const padding = paddingShorthand(props.box);
  return {
    ...(props.text !== null ? { text: props.text } : {}),
    color: props.color.text,
    'background-color': props.color.background,
    'font-size': props.type.fontSize,
    'font-weight': props.type.fontWeight,
    padding,
    'border-radius': props.radius,
  };
}
