import { useMemo, useState } from 'react';
import type { CustomPropInfo, ScanResult, TypeField, TypeStyle } from '@/shared/types';
import type { ChangeLog } from '@/studio/changes';
import { toRules } from '@/studio/changes';
import { fieldPx, sizeLabel } from '@/studio/typeStyleMatch';
import { NAMED_RATIOS, nearestRatio, ratioName, scaleSize, stepsOf } from '@/studio/typeScale';
import type { ManyEdit } from '../../lib/inspect';
import { NumberField } from '../inspect/NumberField';
import { Select } from '../inspect/fields';
import { TokenGlyph } from '../inspect/TokenPill';

const FIELDS: { field: keyof TypeStyle['fields']; property: string; label: string; step?: number }[] = [
  { field: 'size', property: 'font-size', label: 'size' },
  { field: 'lineHeight', property: 'line-height', label: 'line' },
  { field: 'tracking', property: 'letter-spacing', label: 'track' },
  { field: 'weight', property: 'font-weight', label: 'weight', step: 100 },
];

const SERVICE_LABELS: Record<string, string> = {
  google: 'Google Fonts',
  adobe: 'Adobe Fonts',
  monotype: 'Monotype',
  hoefler: 'Hoefler & Co',
  'self-hosted': 'self-hosted',
  system: 'system',
};

export const styleKey = (s: TypeStyle) => `${s.form}:${s.selectorOrUtility}`;

/** What a style's field reads right now: a hand value on its token, a rule the log wrote, or what the page says. */
function currentValue(style: TypeStyle, field: TypeField | undefined, property: string, props: Map<string, CustomPropInfo>, varOverrides: Record<string, string>, written: Map<string, string>): string {
  if (!field) return '';
  if (field.token) return varOverrides[field.token] ?? props.get(field.token)?.value ?? '';
  return written.get(`${style.selectorOrUtility}\u0000${property}`) ?? field.literal ?? '';
}

/**
 * The page's type styles as one table, and the scale behind them.
 *
 * AirOps' "Edit Type Scale" and Figma's text styles, over the styles the
 * page's own stylesheets define in whatever form the project writes them:
 * one row each, its name in its own face, its tag, and its size, line,
 * tracking and weight. A field that reads a variable edits that variable
 * (the page repaints; the bridge can write it); a field that holds a
 * literal edits the rule itself, as one element edit on the style's
 * selector that the brief carries. The scale controls open on the ratio
 * the page's sizes already come closest to; moving the base or the ratio
 * moves every unlocked style by its own step from the body size.
 */
export function TypeStyles({
  scan,
  styles,
  varOverrides,
  locks,
  styleLocks,
  log,
  onVar,
  onStyleLock,
  changeMany,
}: {
  scan: Pick<ScanResult, 'customProps' | 'fontUsage' | 'fontFaces' | 'rootFontSize'>;
  styles: TypeStyle[];
  varOverrides: Record<string, string>;
  locks: string[];
  styleLocks: string[];
  log: ChangeLog;
  onVar: (name: string, value: string | null) => void;
  onStyleLock: (key: string, locked: boolean) => void;
  changeMany: (edits: ManyEdit[]) => void;
}) {
  const rootFontSize = scan.rootFontSize ?? 16;
  const props = useMemo(() => new Map(scan.customProps.map((p) => [p.name, p])), [scan.customProps]);
  const written = useMemo(() => new Map(toRules(log).filter((r) => !r.condition).map((r) => [`${r.selector}\u0000${r.property}`, r.value])), [log]);
  const value = (s: TypeStyle, f: (typeof FIELDS)[number]) => currentValue(s, s.fields[f.field], f.property, props, varOverrides, written);

  // The body size: the tag that is the body, or the size the page uses most.
  const bodyPx = useMemo(() => {
    const body = styles.find((s) => s.tag === 'body' || s.tag === 'p');
    const fromStyle = body ? fieldPx(body.fields.size, scan.customProps, rootFontSize) : null;
    if (fromStyle) return fromStyle;
    const variants = scan.fontUsage.flatMap((f) => f.variants);
    const most = [...variants].sort((a, b) => b.count - a.count)[0];
    return most ? parseFloat(most.size) || 16 : 16;
  }, [styles, scan.customProps, scan.fontUsage, rootFontSize]);
  const sizes = useMemo(() => styles.map((s) => fieldPx(s.fields.size, scan.customProps, rootFontSize) ?? 0).filter(Boolean), [styles, scan.customProps, rootFontSize]);
  const currentRatio = useMemo(() => nearestRatio(sizes, bodyPx), [sizes, bodyPx]);
  const [base, setBase] = useState<number | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const shownBase = base ?? bodyPx;
  const shownRatio = ratio ?? currentRatio;
  const named = ratioName(shownRatio);

  const isLocked = (s: TypeStyle) => styleLocks.includes(styleKey(s)) || (!!s.fields.size.token && locks.includes(s.fields.size.token));

  /** One field of one style, written the way the style is written. */
  const edit = (s: TypeStyle, f: (typeof FIELDS)[number], to: string) => {
    const field = s.fields[f.field];
    if (field?.token) {
      onVar(field.token, to);
      return;
    }
    const from = value(s, f);
    if (from === to) return;
    changeMany([{ target: { selector: s.selectorOrUtility, matches: 1, stable: true }, property: f.property, from, to }]);
  };

  /** Every unlocked style moved by its own step from the body, at the new base and ratio. */
  const rescale = (nextBase: number, nextRatio: number) => {
    const steps = stepsOf(sizes, bodyPx);
    for (const s of styles) {
      if (isLocked(s)) continue;
      const px = fieldPx(s.fields.size, scan.customProps, rootFontSize);
      if (!px) continue;
      const step = steps.get(Math.round(px * 10) / 10);
      if (step === undefined) continue;
      const next = scaleSize(nextBase, nextRatio, step);
      if (Math.abs(next - px) < 0.05) continue;
      const current = value(s, FIELDS[0]!);
      // In the unit the page wrote it in, so a rem stays a rem.
      const to = /rem$/.test(current) ? `${Math.round((next / rootFontSize) * 1000) / 1000}rem` : `${next}px`;
      edit(s, FIELDS[0]!, to);
    }
  };

  const families = scan.fontUsage.slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      {families.length > 0 && (
        <div className="flex flex-col gap-1">
          {families.map((f) => {
            const face = scan.fontFaces.find((x) => x.family === f.family);
            return (
              <div key={f.family} className="flex items-center gap-2.5 rounded-control bg-surface-field px-2.5 py-1">
                <span className="text-base leading-none" style={{ fontFamily: f.family }}>
                  Aa
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{f.family}</span>
                <span className="text-2xs text-ink-muted">{f.roles.join(' · ')}</span>
                <span className="h-4 shrink-0 rounded-[4px] bg-surface-thumb px-1.5 text-2xs leading-4 text-ink-muted">{SERVICE_LABELS[face?.service ?? 'system']}</span>
              </div>
            );
          })}
        </div>
      )}

      {styles.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="subhead">Scale</span>
          <span className="ml-auto text-2xs text-ink-muted">base</span>
          <NumberField
            value={`${Math.round(shownBase * 10) / 10}px`}
            ariaLabel="Type scale base"
            className="w-14 shrink-0"
            onChange={(v) => {
              const px = parseFloat(v);
              if (!Number.isFinite(px) || px < 8 || px > 40) return;
              setBase(px);
              rescale(px, shownRatio);
            }}
          />
          <span className="text-2xs text-ink-muted">ratio</span>
          <Select
            value={named ? String(NAMED_RATIOS.find((n) => n.name === named)!.ratio) : 'custom'}
            options={[...NAMED_RATIOS.map((n) => String(n.ratio)), 'custom'] as const}
            labels={{ ...Object.fromEntries(NAMED_RATIOS.map((n) => [String(n.ratio), `${n.ratio} · ${n.name}`])), custom: `${shownRatio} · custom` } as Record<string, string>}
            ariaLabel="Type scale ratio"
            onChange={(v) => {
              if (v === 'custom') return;
              const r = parseFloat(v);
              setRatio(r);
              rescale(shownBase, r);
            }}
          />
        </div>
      )}

      {styles.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <div className="grid grid-cols-[minmax(3.5rem,1fr)_2.5rem_3.25rem_3.25rem_2.5rem_3rem_1.5rem] items-center gap-x-1 px-1 text-2xs text-ink-muted">
            <span>style</span>
            <span>tag</span>
            {FIELDS.map((f) => (
              <span key={f.field}>{f.label}</span>
            ))}
            <span />
          </div>
          {styles.map((s) => {
            const locked = isLocked(s);
            const px = fieldPx(s.fields.size, scan.customProps, rootFontSize);
            return (
              <div
                key={styleKey(s)}
                className="grid grid-cols-[minmax(3.5rem,1fr)_2.5rem_3.25rem_3.25rem_2.5rem_3rem_1.5rem] items-center gap-x-1 rounded-control px-1 py-0.5 hover:bg-surface-field/60"
                title={`${s.selectorOrUtility} · ${s.form} · ${sizeLabel(s, scan.customProps, rootFontSize)}`}
              >
                <span
                  className="min-w-0 truncate leading-none"
                  style={{ fontSize: px ? `${Math.max(11, Math.min(18, px * 0.55))}px` : undefined, fontWeight: s.fields.weight?.literal, fontFamily: s.fields.family?.literal }}
                >
                  {s.name}
                </span>
                <span className="truncate font-mono text-2xs text-ink-muted">{s.tag ?? (s.form === 'tailwind-theme' ? 'util' : s.form)}</span>
                {FIELDS.map((f) => {
                  const field = s.fields[f.field];
                  if (!field) return <span key={f.field} className="text-center text-2xs text-ink-faint">—</span>;
                  const v = value(s, f);
                  return (
                    <span key={f.field} className="relative flex items-center">
                      {locked ? (
                        <span className="h-control truncate px-1 font-mono text-2xs leading-6 text-ink-muted">{v}</span>
                      ) : (
                        <NumberField
                          value={v}
                          ariaLabel={`${s.name} ${f.label}`}
                          className="w-full"
                          step={f.step}
                          onChange={(next) => edit(s, f, next)}
                        />
                      )}
                      {field.token && (
                        <span className="pointer-events-none absolute -top-0.5 right-0 text-accent" title={`reads ${field.token}`}>
                          <TokenGlyph className="h-1.5 w-1.5" />
                        </span>
                      )}
                    </span>
                  );
                })}
                <button
                  onClick={() => onStyleLock(styleKey(s), !locked)}
                  aria-pressed={locked}
                  aria-label={locked ? `Unlock style ${s.name}` : `Lock style ${s.name}`}
                  className={`h-4 rounded-[4px] px-1 text-2xs leading-4 ${locked ? 'bg-accent-soft text-accent' : 'text-ink-faint hover:bg-surface-field hover:text-ink'}`}
                  title={locked ? 'Locked: a scale change leaves this style alone. Click to unlock.' : 'Lock this style so a scale change leaves it alone.'}
                >
                  {locked ? 'locked' : 'lock'}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          This page's stylesheets define no type style — no tag rule, class, per-field variable or Tailwind token sets a font size on its
          own. The Style tab still edits any element; Generate can give the page a scale.
        </p>
      )}
    </div>
  );
}
