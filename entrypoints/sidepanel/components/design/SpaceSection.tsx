import type { ScanResult } from '@/shared/types';
import type { BrandConfig, ResolvedTokens } from '@/studio/engine/types';

/**
 * Spacing, radius and elevation as the page renders them. The off-grid note is
 * deliberate: a page with a 4px grid and a stray 6px is normal, and saying which
 * values were dropped is more useful than silently rounding them in.
 */
export function SpaceSection({
  scan,
  config,
  resolved,
}: {
  scan: ScanResult;
  config: BrandConfig;
  resolved: ResolvedTokens;
}) {
  const { basePx, blessed } = config.spacing;
  const offGrid = scan.shape.spacing
    .map((s) => parseFloat(s.value))
    .filter((n) => Number.isFinite(n) && n > 0 && n % basePx !== 0)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] tracking-wide text-gray-400">SPACING</span>
          <span className="ml-auto text-[10px] text-gray-400">{basePx}px grid</span>
        </div>
        <div className="flex items-end gap-1.5">
          {blessed.slice(0, 8).map((px) => (
            <div key={px} className="flex flex-col items-center gap-1">
              <span
                className="bg-blue-600"
                style={{ width: Math.min(px, 44), height: Math.min(px, 44) }}
              />
              <span className="text-[9px] tabular-nums text-gray-400">{px}</span>
            </div>
          ))}
        </div>
        {offGrid.length > 0 && (
          <div className="text-[10px] text-gray-400">
            {offGrid.join('px, ')}px seen on the page but off-grid — not kept
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-dashed border-gray-200 pt-3">
        <div className="flex items-center gap-2">
          <span className="w-[70px] shrink-0 text-[10px] tracking-wide text-gray-400">RADIUS</span>
          <span className="text-[11px] tabular-nums">{config.radius.basePx}px</span>
          <span className="ml-auto flex items-center gap-1.5">
            {(['sm', 'md', 'lg'] as const).map((step) => (
              <span
                key={step}
                title={`--radius-${step} · ${resolved.radius[step]}px`}
                className="h-5 w-8 border border-gray-400 bg-gray-50"
                style={{ borderRadius: resolved.radius[step] }}
              />
            ))}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-[70px] shrink-0 text-[10px] tracking-wide text-gray-400">ELEVATION</span>
          <span className="text-[10px] text-gray-400">
            {scan.shape.shadows.length ? `${config.shadows.levels.length} from the page` : 'defaults'}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {config.shadows.levels.map((level) => (
              <span
                key={level.name}
                title={`--shadow-${level.name}`}
                className="h-5 w-7 rounded border border-gray-200 bg-white"
                style={{ boxShadow: level.layers.join(', ') }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
