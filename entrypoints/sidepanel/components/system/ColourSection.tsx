import { useState } from 'react';
import type { CustomPropInfo } from '@/shared/types';
import type { BrandConfig, Mode, ResolvedTokens, ScaleRole, Step } from '@/studio/engine/types';
import { SCALE_ROLES, STEPS } from '@/studio/engine/types';
import { apca } from '@/studio/engine/contrast';
import { hexOf } from '@/studio/reskin';
import { linkedBy, type ColourLinks } from '@/studio/systemMap';
import { ColorField } from '../inspect/ColorField';
import { TokenGlyph } from '../inspect/TokenPill';

/** Roles whose ramp belongs on the page: a page variable is on it, or its seed is one of the page's colours. */
export function rampsOnPage(brand: BrandConfig, links: ColourLinks, props: CustomPropInfo[]): ScaleRole[] {
  const linked = new Set(Object.values(links).filter(Boolean).map((l) => l!.role));
  const pageHexes = new Set(props.map((p) => hexOf(p.resolved ?? p.value)?.toUpperCase()).filter(Boolean));
  // The page's one red seeds both primary and danger: the same ramp twice
  // is one ramp, and the brand role shows it.
  const seen = new Set<string>();
  return SCALE_ROLES.filter((role) => {
    const scale = brand.color.scales.find((s) => s.role === role);
    if (!scale) return false;
    const seed = hexOf(scale.seed)?.toUpperCase() ?? scale.seed;
    if (linked.has(role)) {
      seen.add(seed);
      return true;
    }
    if (!pageHexes.has(seed) || seen.has(seed)) return false;
    seen.add(seed);
    return true;
  });
}

/**
 * The ramps the page's colours are on, one strip each: the seed, eleven
 * steps in the mode being shown, a mark on every step a page variable sits
 * on, and a pin for a step held to an exact colour.
 *
 * Only ramps with a page variable on them, or seeded from a colour the
 * page paints, appear; the engine has seven, and the rest are not this
 * page's business. Moving a seed moves every variable linked to that ramp,
 * step for step, and the tokens queue for a write. A pinned step keeps its
 * exact colour whatever the seed does — Radix and tints.dev's "the seed
 * lands exactly", extended to any step.
 */
export function ColourSection({
  brand,
  resolved,
  mode,
  links,
  props,
  onSeed,
  onPin,
}: {
  brand: BrandConfig;
  resolved: ResolvedTokens;
  mode: Mode;
  links: ColourLinks;
  props: CustomPropInfo[];
  onSeed: (role: ScaleRole, seed: string) => void;
  onPin: (role: ScaleRole, step: Step, hex: string | null) => void;
}) {
  const roles = rampsOnPage(brand, links, props);
  const marks = linkedBy(links);
  const [pinning, setPinning] = useState<string | null>(null);
  if (!roles.length) {
    return <p className="text-xs text-ink-muted">No page variable sits on a ramp yet. Link one from its row under Tokens, or Generate a system for the page.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {roles.map((role) => {
        const scale = brand.color.scales.find((s) => s.role === role)!;
        const steps = resolved.scales[role].steps[mode];
        const pins = scale.overrides?.light ?? {};
        return (
          <div key={role} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="subhead">{scale.name}</span>
              <span className="text-2xs text-ink-muted">{role}</span>
              <span className="ml-auto w-[9rem]">
                <ColorField value={scale.seed} ariaLabel={`${role} seed`} onChange={(v) => onSeed(role, v)} />
              </span>
            </div>
            <div className="flex gap-0.5" role="list" aria-label={`${role} ramp`}>
              {STEPS.map((step) => {
                const sw = steps[step];
                const on = marks.get(`${role}:${step}`) ?? [];
                const pinned = pins[step];
                const key = `${role}:${step}`;
                const lcWhite = apca('#ffffff', sw.hex);
                const lcBlack = apca('#000000', sw.hex);
                return (
                  <div key={step} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                    <button
                      onClick={() => setPinning(pinning === key ? null : key)}
                      aria-label={`${role} ${step}`}
                      aria-pressed={pinning === key}
                      title={`${role}-${step} · ${sw.hex}${pinned ? ' · pinned' : ''}${on.length ? ` · ${on.join(', ')}` : ''}\nAPCA Lc ${Math.abs(lcWhite)} with white text, ${Math.abs(lcBlack)} with black`}
                      className={`swatch h-6 w-full rounded-[3px] ${pinning === key ? 'ring-2 ring-accent' : ''}`}
                      style={{ background: sw.hex }}
                    >
                      {pinned && <span className="block h-1 w-1 rounded-full bg-white mix-blend-difference" aria-hidden />}
                    </button>
                    <span className="flex h-2 items-center gap-px" aria-hidden>
                      {on.slice(0, 3).map((name) => (
                        <TokenGlyph key={name} className="h-1.5 w-1.5 text-accent" />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
            {pinning?.startsWith(`${role}:`) && (
              <PinEditor
                label={pinning}
                value={pins[Number(pinning.split(':')[1]) as Step] ?? steps[Number(pinning.split(':')[1]) as Step].hex}
                pinned={pinning.split(':')[1]! in pins}
                onChange={(hex) => onPin(role, Number(pinning.split(':')[1]) as Step, hex)}
                onClose={() => setPinning(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PinEditor({ label, value, pinned, onChange, onClose }: { label: string; value: string; pinned: boolean; onChange: (hex: string | null) => void; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-control bg-surface-panel p-1.5 shadow-[inset_0_0_0_1px_var(--line-subtle)]">
      <span className="font-mono text-2xs text-ink-muted">{label.replace(':', ' ')}</span>
      <span className="min-w-0 flex-1">
        <ColorField value={value} ariaLabel={`Pin ${label.replace(':', ' ')}`} onChange={(v) => onChange(v)} />
      </span>
      {pinned && (
        <button onClick={() => onChange(null)} className="btn btn-sm btn-ghost" title="Let the seed decide this step again">
          Unpin
        </button>
      )}
      <button onClick={onClose} className="btn btn-sm btn-ghost" aria-label="Close pin editor">
        Done
      </button>
    </div>
  );
}
