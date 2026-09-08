/**
 * What moved in the system itself, as opposed to what moved on the page.
 *
 * A colour edit almost always has a variable behind it, so the token list is
 * the whole story. A type or spacing edit often does not: plenty of sites
 * write `font-size: 15px` in a component and hold no `--font-size-body` at
 * all. The page cannot be repainted for those, and rewriting every `15px` in
 * a stylesheet would break layouts to fix a scale — so the change lives here
 * instead, as an instruction the agent can act on in source.
 */

import type { BrandConfig } from './engine/types';

export interface SystemChange {
  area: 'type' | 'spacing' | 'radius';
  /** What moved, in the system's own words: "body size", "grid step". */
  label: string;
  from: string;
  to: string;
}

// One decimal: a size read off the page arrives as 15.0096px, and the panel
// shows it as 15px. The brief must not disagree with what you were looking at.
const px = (rem: number) => `${Math.round(rem * 16 * 10) / 10}px`;

/** The decisions in `after` that `before` did not make, ignoring colour. */
export function diffSystem(before: BrandConfig, after: BrandConfig): SystemChange[] {
  const out: SystemChange[] = [];

  const beforeRoles = new Map(before.typography.roles.map((r) => [r.role, r]));
  for (const role of after.typography.roles) {
    const was = beforeRoles.get(role.role);
    if (!was) continue;
    if (was.sizeRem !== role.sizeRem) {
      out.push({ area: 'type', label: `${role.role} size`, from: px(was.sizeRem), to: px(role.sizeRem) });
    }
    if (was.weight !== role.weight) {
      out.push({
        area: 'type',
        label: `${role.role} weight`,
        from: String(was.weight),
        to: String(role.weight),
      });
    }
    if (was.lineHeight !== role.lineHeight) {
      out.push({
        area: 'type',
        label: `${role.role} line-height`,
        from: String(was.lineHeight),
        to: String(role.lineHeight),
      });
    }
  }

  if (before.spacing.basePx !== after.spacing.basePx) {
    out.push({
      area: 'spacing',
      label: 'grid step',
      from: `${before.spacing.basePx}px`,
      to: `${after.spacing.basePx}px`,
    });
  }

  if (before.radius.basePx !== after.radius.basePx) {
    out.push({
      area: 'radius',
      label: 'base radius',
      from: `${before.radius.basePx}px`,
      to: `${after.radius.basePx}px`,
    });
  }

  return out;
}
