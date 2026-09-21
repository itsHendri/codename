import type { ReactNode } from 'react';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { cellOf, valuesFor, type Cell } from '@/studio/alignGrid';
import { NumberField } from './NumberField';

export type Change = (property: string, to: string, token?: string) => void;

/**
 * A group of properties with a head that stays put while the column scrolls,
 * and a summary of what it holds when folded.
 */
export function Group({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-dashed border-line-subtle first:border-t-0">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="sticky top-0 z-10 flex w-full items-center gap-1.5 bg-surface-app py-1.5 text-left"
      >
        <span className={`text-2xs text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-2xs tracking-wide text-ink-muted uppercase">{title}</span>
        {!open && (
          <span className="ml-auto min-w-0 truncate font-mono text-2xs text-ink-muted">{summary}</span>
        )}
      </button>
      {open && <div className="flex flex-col gap-1.5 pb-2">{children}</div>}
    </section>
  );
}

export function Chip({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-sm border border-line"
      style={{ background: color }}
      title={color}
    />
  );
}

export function SideLabel({ children }: { children: ReactNode }) {
  return <span className="w-11 shrink-0 pt-1 text-2xs text-ink-muted">{children}</span>;
}

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-2">
      <SideLabel>{label}</SideLabel>
      {children}
    </div>
  );
}

/** A NumberField plus, when the page has a variable for this length, one chip. */
export function LengthField({
  prop,
  value,
  label,
  aria,
  compact = false,
  suggest,
  onChange,
}: {
  prop: string;
  value: string;
  label: string;
  aria: string;
  compact?: boolean;
  suggest: (v: string) => TokenSuggestion[];
  onChange: Change;
}) {
  const match = suggest(value).find((s) => s.source === 'page' && s.exact);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <NumberField value={value} label={label} ariaLabel={aria} onChange={(v) => onChange(prop, v)} />
      {match && (
        <button
          onClick={() => onChange(prop, `var(${match.name})`, match.name)}
          title={`matches ${match.name}: ${match.value}`}
          className="max-w-full truncate self-start rounded-full border border-line bg-surface-control px-1.5 font-mono text-2xs text-ink-secondary hover:border-line-strong"
        >
          {!compact && <span className="font-sans text-ink-muted">matches </span>}
          {match.name}
        </button>
      )}
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
  labels,
  className = '',
}: {
  value: string;
  options: readonly T[];
  ariaLabel: string;
  onChange: (v: T) => void;
  /** How an option reads, when the CSS word is not the designer's word. */
  labels?: Partial<Record<T, string>>;
  className?: string;
}) {
  const known = options.includes(value as T);
  return (
    <select
      value={known ? value : ''}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={ariaLabel}
      className={`min-w-0 rounded-control border border-line bg-surface-recessed px-1 py-0.5 text-xs ${className}`}
    >
      {!known && <option value="">{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}

/**
 * One of a few, side by side. `labels` says how an option reads when the
 * CSS word is not the designer's word (`flex` reads as Stack); `value`
 * matching nothing lights nothing, which is how a mode that cannot be read
 * off the page stays honest.
 */
export function Segmented<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
  labels,
  titles,
  className = '',
}: {
  value: string | null;
  options: readonly T[];
  ariaLabel: string;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
  titles?: Partial<Record<T, string>>;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex overflow-hidden rounded-control border border-line ${className}`}
    >
      {options.map((o) => {
        const on = value === o || (o === 'left' && value === 'start');
        return (
          <button
            key={o}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            title={titles?.[o]}
            className={`min-w-0 flex-1 truncate px-1 py-0.5 text-2xs capitalize ${
              on ? 'bg-accent text-accent-ink' : 'text-ink-secondary hover:bg-surface-recessed'
            }`}
          >
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The 3×3 grid: where the children sit in the box. Columns are left to
 * right on the page and rows top to bottom, whichever way the stack runs;
 * `studio/alignGrid.ts` turns a cell into the two properties.
 */
export function AlignGrid({
  justifyContent,
  alignItems,
  direction,
  onChange,
}: {
  justifyContent: string;
  alignItems: string;
  direction: string;
  onChange: (values: { justifyContent: string; alignItems: string }) => void;
}) {
  const lit = cellOf(justifyContent, alignItems, direction);
  const cells: Cell[] = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) cells.push({ row, col });
  const name = (c: Cell) => `${['top', 'middle', 'bottom'][c.row]} ${['left', 'centre', 'right'][c.col]}`;
  return (
    <div role="radiogroup" aria-label="Align children" className="grid w-fit grid-cols-3 gap-0.5 rounded-control border border-line p-0.5">
      {cells.map((c) => {
        const on = lit?.row === c.row && lit.col === c.col;
        return (
          <button
            key={`${c.row}${c.col}`}
            role="radio"
            aria-checked={on}
            aria-label={name(c)}
            title={name(c)}
            onClick={() => onChange(valuesFor(c, direction))}
            className={`flex h-4 w-5 items-center justify-center rounded-sm ${on ? 'bg-accent' : 'hover:bg-surface-control'}`}
          >
            <span className={`block h-1.5 w-1.5 rounded-full ${on ? 'bg-accent-ink' : 'bg-ink-faint'}`} />
          </button>
        );
      })}
    </div>
  );
}
