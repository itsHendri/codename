import type { ReactNode } from 'react';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { cellOf, valuesFor, type Cell } from '@/studio/alignGrid';
import { NumberField } from './NumberField';
import { ChevronIcon } from '../icons';

export type Change = (property: string, to: string, token?: string) => void;

/**
 * A group of properties with a head that stays put while the column scrolls,
 * and a summary of what it holds when folded. The head and its hairline run
 * the full width of the column, gutters included, as Framer's do; the head
 * sticks under whatever the column keeps above it (`--style-top`).
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
    <section className="-mx-3 border-t border-line-subtle first:border-t-0">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="group sticky top-[var(--style-top,0px)] z-10 flex h-[30px] w-full items-center gap-2 bg-surface-app px-3 text-left text-xs font-medium text-ink"
      >
        {title}
        {!open && (
          <span className="min-w-0 flex-1 truncate text-right font-mono text-2xs font-normal text-ink-muted">{summary}</span>
        )}
        <ChevronIcon
          className={`ml-auto h-3 w-3 shrink-0 text-ink-muted transition-transform group-hover:text-ink ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>}
    </section>
  );
}

export function Chip({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
      style={{ background: color }}
      title={color}
    />
  );
}

export function SideLabel({ children }: { children: ReactNode }) {
  return <span className="w-14 shrink-0 truncate text-xs leading-6 text-ink-muted first-letter:uppercase">{children}</span>;
}

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2">
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
      <NumberField value={value} label={label || undefined} ariaLabel={aria} onChange={(v) => onChange(prop, v)} />
      {match && (
        <button
          onClick={() => onChange(prop, `var(${match.name})`, match.name)}
          title={`matches ${match.name}: ${match.value}`}
          className="h-5 max-w-full truncate self-start rounded-control bg-surface-field px-1.5 font-mono text-2xs text-ink-secondary hover:bg-surface-field-hover hover:text-ink"
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
      className={`field field-select min-w-0 ${className}`}
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
  // Five or more across a 270px row read at 10px, so no word is cut short.
  const dense = options.length >= 5;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex h-control gap-0.5 rounded-control bg-surface-field p-0.5 ${className}`}
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
            className={`min-w-0 flex-auto truncate rounded-[4px] px-1 capitalize ${dense ? 'text-2xs' : 'text-xs'} ${
              on
                ? 'bg-surface-thumb text-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]'
                : 'text-ink-muted hover:text-ink'
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
    <div role="radiogroup" aria-label="Align children" className="grid w-fit grid-cols-3 gap-0.5 rounded-control bg-surface-field p-1">
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
            className={`flex h-5 w-6 items-center justify-center rounded-[4px] ${
              on ? 'bg-surface-thumb shadow-[0_1px_2px_rgb(0_0_0/0.2)]' : 'hover:bg-surface-field-hover'
            }`}
          >
            <span className={`block rounded-full ${on ? 'h-2 w-2 bg-accent' : 'h-1 w-1 bg-ink-faint'}`} />
          </button>
        );
      })}
    </div>
  );
}
