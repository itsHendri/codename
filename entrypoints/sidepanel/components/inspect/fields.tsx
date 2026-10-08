import type { TypeStyle } from '@/shared/types';
import type { ReactNode } from 'react';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { cellOf, valuesFor, type Cell } from '@/studio/alignGrid';
import { NumberField } from './NumberField';
import { Listbox } from './Listbox';
import { IconMinus, IconPlus } from '@tabler/icons-react';

/**
 * One edit from the panel: a property, its new value, the token it was
 * chosen from — and, when it matters, that the person detached a variable
 * on purpose, or chose a whole type style, or what the value was before
 * where the element cannot say (a style has no computed value).
 */
export interface ChangeOptions {
  detached?: string;
  typeStyle?: TypeStyle;
  from?: string;
}
export type Change = (property: string, to: string, token?: string, opts?: ChangeOptions) => void;

/**
 * A section of the Style column, Nudge's: a 12px semibold title with its
 * action on the right (a + to add the property, a − to take it away, a
 * toggle), the fields under it, a hairline under the lot. A section with
 * nothing under it is the folded form: the title and its +.
 */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className="section" aria-label={title}>
      <div className="section-title">
        <h3 className="m-0 text-xs font-semibold">{title}</h3>
        {action && <div className="-mr-2 flex items-center">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A quiet 32px icon button in a section's head or at the end of a row. */
export function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`flex h-control w-control shrink-0 items-center justify-center rounded-control [&>svg]:h-4 [&>svg]:w-4 ${
        pressed ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface-field hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** + to add a property the element does not have, − to take it away. */
export function AddRemove({ what, present, onAdd, onRemove }: { what: string; present: boolean; onAdd: () => void; onRemove: () => void }) {
  return present ? (
    <IconButton label={`Remove ${what}`} onClick={onRemove}>
      <IconMinus stroke={1.5} />
    </IconButton>
  ) : (
    <IconButton label={`Add ${what}`} onClick={onAdd}>
      <IconPlus stroke={1.5} />
    </IconButton>
  );
}

/** A label over its field, Nudge's: 12px secondary ink, 4px above. */
export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

/** A sub-head inside a section ("Padding", "Flex child"), with an optional action. */
export function SubHead({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-control items-center justify-between text-xs text-ink-secondary">
      <span>{label}</span>
      {action && <div className="-mr-2 flex items-center">{action}</div>}
    </div>
  );
}

/** A NumberField plus, when the page has a variable for this length, one chip. */
export function LengthField({
  prop,
  value,
  label,
  icon,
  aria,
  compact = false,
  suggest,
  onChange,
}: {
  prop: string;
  value: string;
  label: string;
  icon?: ReactNode;
  aria: string;
  compact?: boolean;
  suggest: (v: string, prop: string) => TokenSuggestion[];
  onChange: Change;
}) {
  const match = suggest(value, prop).find((s) => s.source === 'page' && s.exact);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <NumberField value={value} label={label || undefined} icon={icon} property={prop} ariaLabel={aria} onChange={(v) => onChange(prop, v)} />
      {match && (
        <button
          onClick={() => onChange(prop, `var(${match.name})`, match.name)}
          title={`${match.authored ? 'is' : 'matches'} ${match.name}: ${match.value}`}
          className="h-6 max-w-full truncate self-start rounded-segment bg-surface-field px-2 text-2xs text-ink-secondary hover:bg-surface-field-hover hover:text-ink"
        >
          {!compact && <span className="font-sans text-ink-muted">{match.authored ? 'is ' : 'matches '}</span>}
          {match.name}
        </button>
      )}
    </div>
  );
}

/** One of many: the Listbox (a popup, Nudge's), under the name the panel has always used. */
export function Select<T extends string>(props: {
  value: string;
  options: readonly T[];
  ariaLabel: string;
  onChange: (v: T) => void;
  /** How an option reads, when the CSS word is not the designer's word. */
  labels?: Partial<Record<T, string>>;
  notes?: Partial<Record<T, string>>;
  icon?: ReactNode;
  className?: string;
}) {
  return <Listbox {...props} />;
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
  /** A word, or an icon (then the title, or the option, is its name). */
  labels?: Partial<Record<T, ReactNode>>;
  titles?: Partial<Record<T, string>>;
  className?: string;
}) {
  // Five or more across a 270px row read at 10px, so no word is cut short.
  const dense = options.length >= 5;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`segmented ${className}`}
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
            aria-label={typeof labels?.[o] === 'object' ? (titles?.[o] ?? o) : undefined}
            className={`segment truncate px-1 capitalize ${dense ? 'text-2xs' : ''} [&>svg]:h-4 [&>svg]:w-4`}
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
  // Nudge's grid: a well of dots, the chosen cell drawn as three bars lined
  // up the way the children sit.
  const bars = (col: number) => (col === 0 ? 'items-start' : col === 1 ? 'items-center' : 'items-end');
  return (
    <div role="radiogroup" aria-label="Align children" className="grid h-[88px] w-[88px] shrink-0 grid-cols-3 grid-rows-3 rounded-control bg-surface-field p-1">
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
            className="group flex items-center justify-center rounded-[4px] hover:bg-surface-field-hover"
          >
            {on ? (
              <span className={`flex w-[14px] flex-col gap-[2px] ${bars(c.col)}`}>
                <span className="block h-[2px] w-[10px] rounded-full bg-accent" />
                <span className="block h-[2px] w-[14px] rounded-full bg-accent" />
                <span className="block h-[2px] w-[8px] rounded-full bg-accent" />
              </span>
            ) : (
              <span className="block h-[3px] w-[3px] rounded-full bg-ink-faint group-hover:bg-ink-muted" />
            )}
          </button>
        );
      })}
    </div>
  );
}
