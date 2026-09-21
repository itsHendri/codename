/**
 * One element, read from the page: everything the panel shows, edits and
 * describes about it, from its computed style. All values are computed,
 * never authored; lengths are rounded the way a design tool shows them.
 */

import type { ElementProps } from '@/shared/types';
import { roundPx } from '@/studio/boxModel';
import { componentOf } from '@/studio/framework';
import { buildSelector } from '@/studio/selector';
import { contrast, opaqueBackground, toHex } from './colour';
import { ownText, rectOf } from './dom';

/**
 * A computed style whose lengths read to two decimals: `96.6641px` reads
 * and scrubs as `96.66px`. Methods still run on the real declaration.
 */
export function roundedStyle(el: Element): CSSStyleDeclaration {
  return new Proxy(getComputedStyle(el), {
    get: (target, prop) => {
      const v = Reflect.get(target, prop);
      if (typeof v === 'string') return roundPx(v);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

export function readProps(el: Element): ElementProps {
  const cs = roundedStyle(el);
  const sel = buildSelector(el);
  const fg = toHex(cs.color);
  const bg = opaqueBackground(el);
  const breadcrumb: ElementProps['breadcrumb'] = [];
  for (let node: Element | null = el; node && node !== el.ownerDocument.documentElement; node = node.parentElement) {
    breadcrumb.unshift({ tag: node.tagName.toLowerCase(), selector: buildSelector(node).selector });
  }
  // What rendered it, if the dev build still knows. A built site answers nothing.
  const component = componentOf(el);
  const parent = el.parentElement;
  const ps = parent ? getComputedStyle(parent) : null;
  const pr = parent?.getBoundingClientRect();
  const inner = (px: string) => parseFloat(px) || 0;
  return {
    ...(component ? { component } : {}),
    selector: sel.selector,
    matches: sel.matches,
    stable: sel.stable,
    intent: sel.intent,
    tag: el.tagName.toLowerCase(),
    breadcrumb,
    rect: rectOf(el),
    box: {
      marginTop: cs.marginTop,
      marginRight: cs.marginRight,
      marginBottom: cs.marginBottom,
      marginLeft: cs.marginLeft,
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      width: cs.width,
      height: cs.height,
      minWidth: cs.minWidth,
      minHeight: cs.minHeight,
      maxWidth: cs.maxWidth,
      maxHeight: cs.maxHeight,
      boxSizing: cs.boxSizing,
      display: cs.display,
      gap: cs.gap,
      rowGap: cs.rowGap,
      columnGap: cs.columnGap,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
    },
    layout: {
      flexDirection: cs.flexDirection,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      flexWrap: cs.flexWrap,
    },
    position: { type: cs.position, top: cs.top, right: cs.right, bottom: cs.bottom, left: cs.left, zIndex: cs.zIndex },
    child: {
      inFlex: !!ps && /flex/.test(ps.display),
      parentDirection: ps?.flexDirection ?? 'row',
      flexGrow: cs.flexGrow,
      flexShrink: cs.flexShrink,
      flexBasis: cs.flexBasis,
      alignSelf: cs.alignSelf,
      order: cs.order,
      // The parent's content box: what a percentage is a share of.
      parentWidth: pr && ps ? Math.max(0, pr.width - inner(ps.paddingLeft) - inner(ps.paddingRight) - inner(ps.borderLeftWidth) - inner(ps.borderRightWidth)) : 0,
      parentHeight: pr && ps ? Math.max(0, pr.height - inner(ps.paddingTop) - inner(ps.paddingBottom) - inner(ps.borderTopWidth) - inner(ps.borderBottomWidth)) : 0,
    },
    opacity: cs.opacity,
    type: {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textAlign: cs.textAlign,
    },
    color: {
      text: fg ?? cs.color,
      background: bg,
      border: toHex(cs.borderTopColor) ?? cs.borderTopColor,
    },
    radius: cs.borderRadius,
    corners: {
      topLeft: cs.borderTopLeftRadius,
      topRight: cs.borderTopRightRadius,
      bottomRight: cs.borderBottomRightRadius,
      bottomLeft: cs.borderBottomLeftRadius,
    },
    border: {
      width: cs.borderTopWidth,
      style: cs.borderTopStyle,
      color: toHex(cs.borderTopColor) ?? cs.borderTopColor,
    },
    shadow: cs.boxShadow,
    filter: cs.filter,
    backdropFilter: cs.backdropFilter,
    transition: cs.transition,
    text: ownText(el),
    contrastRatio: contrast(fg, bg),
  };
}
