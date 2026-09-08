import type { ScanResult } from '@/shared/types';
import type { BrandConfig, TypeRole, TypeRoleName } from '@/studio/engine/types';
import { NumberField } from '../inspect/NumberField';

const SERVICE_LABELS: Record<string, string> = {
  google: 'Google Fonts',
  adobe: 'Adobe Fonts',
  monotype: 'Monotype',
  hoefler: 'Hoefler & Co',
  'self-hosted': 'self-hosted',
  system: 'system',
};

/**
 * The families the page renders and the scale it renders them at. Both start
 * as observations — `fontUsage[].variants` carries every size/weight/line-height
 * with a frequency count, so "body" is the size used most, not an assumption —
 * and the ladder is editable from there. Drag a size and the page follows,
 * wherever it holds that size in a variable.
 */
export function TypeSection({
  scan,
  config,
  onRoleChange,
}: {
  scan: ScanResult;
  config: BrandConfig;
  onRoleChange: (role: TypeRoleName, patch: Partial<TypeRole>) => void;
}) {
  const { families } = config.typography;
  const stacks = [
    { key: 'sans', label: 'sans', stack: families.sans },
    ...(families.display ? [{ key: 'display', label: 'display', stack: families.display }] : []),
    { key: 'mono', label: 'mono', stack: families.mono },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <div className="text-2xs tracking-wide text-ink-muted">FAMILIES — read off the page</div>
        {stacks.map(({ key, label, stack }) => {
          const first = stack.split(',')[0]!.replace(/["']/g, '').trim();
          const fromPage = scan.fontUsage.some((f) => f.family === first);
          const face = scan.fontFaces.find((f) => f.family === first);
          return (
            <div
              key={key}
              className={`flex items-center gap-2.5 rounded-card border px-2.5 py-1.5 ${
                fromPage ? 'border-line' : 'border-dashed border-line'
              }`}
            >
              <span className="text-lg leading-none" style={{ fontFamily: stack }}>
                Aa
              </span>
              <div className="min-w-0">
                <div className="truncate text-base">{fromPage ? first : `${label} — not set here`}</div>
                <div className="text-2xs text-ink-muted">
                  {fromPage
                    ? `${label} · ${scan.fontUsage.find((f) => f.family === first)?.elementCount ?? 0} elements`
                    : 'falls back to a generic stack'}
                </div>
              </div>
              {fromPage && (
                <span
                  className={`ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-2xs ${
                    face && face.service !== 'self-hosted' && face.service !== 'system'
                      ? 'border-accent text-accent'
                      : 'border-line text-ink-muted'
                  }`}
                >
                  {SERVICE_LABELS[face?.service ?? 'system']}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1 border-t border-dashed border-line-subtle pt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base">Scale</span>
          <span className="ml-auto text-2xs text-ink-muted">px · weight · line-height</span>
        </div>
        {config.typography.roles.map((role) => (
          <div
            key={role.role}
            className="flex items-center gap-1 border-b border-dotted border-line-subtle py-1"
          >
            <span className="w-16 shrink-0 truncate text-2xs" title={role.role}>
              {role.role}
            </span>
            <NumberField
              value={`${Math.round(role.sizeRem * 16)}px`}
              ariaLabel={`${role.role} size`}
              className="w-14 shrink-0"
              onChange={(v) => {
                const px = parseFloat(v);
                if (Number.isFinite(px) && px > 0) onRoleChange(role.role, { sizeRem: px / 16 });
              }}
            />
            <NumberField
              value={String(role.weight)}
              ariaLabel={`${role.role} weight`}
              className="w-12 shrink-0"
              step={100}
              onChange={(v) => {
                const w = parseFloat(v);
                if (Number.isFinite(w)) onRoleChange(role.role, { weight: Math.min(1000, Math.max(100, w)) });
              }}
            />
            <NumberField
              value={String(role.lineHeight)}
              ariaLabel={`${role.role} line height`}
              className="w-12 shrink-0"
              step={0.1}
              onChange={(v) => {
                const lh = parseFloat(v);
                if (Number.isFinite(lh) && lh > 0) onRoleChange(role.role, { lineHeight: lh });
              }}
            />
            <span
              className="ml-auto min-w-0 shrink truncate text-right"
              style={{
                fontFamily:
                  role.family === 'mono'
                    ? config.typography.families.mono
                    : role.family === 'display'
                      ? (config.typography.families.display ?? config.typography.families.sans)
                      : config.typography.families.sans,
                fontWeight: role.weight,
                fontSize: Math.min(role.sizeRem * 16, 20),
              }}
            >
              Ag
            </span>
          </div>
        ))}
        <div className="pt-1 text-2xs text-ink-muted">
          body = the size this page uses most · drag a number to change it
        </div>
      </div>
    </div>
  );
}
