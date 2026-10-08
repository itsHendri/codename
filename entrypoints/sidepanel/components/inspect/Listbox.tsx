import type { ReactNode } from 'react';
import { Select } from '@base-ui/react/select';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { usePopupLayer } from './popupLayer';

/**
 * One of many, in a popup, Nudge's way: a 32px well with the value and a
 * chevron; the popup is a white card (`popup`) under the field, at least as
 * wide as it, rows 34px tall with the chosen one ticked on the right.
 *
 * Built on Base UI's Select (as Nudge's is) for the keyboard and the ARIA:
 * the trigger is a combobox button, the list a listbox, type-ahead and
 * arrows work, Escape closes. A value that is none of the options (a
 * computed `inline-block` where the options are the common ones) still
 * shows as itself and lights nothing, so the field never claims a value the
 * element does not have.
 */
export function Listbox<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
  labels,
  notes,
  icon,
  className = '',
}: {
  value: string;
  options: readonly T[];
  ariaLabel: string;
  onChange: (v: T) => void;
  /** How an option reads, when the CSS word is not the designer's word. */
  labels?: Partial<Record<T, string>>;
  /** A quiet word after an option's label: "not loaded". */
  notes?: Partial<Record<T, string>>;
  icon?: ReactNode;
  className?: string;
}) {
  const layer = usePopupLayer();
  const known = options.includes(value as T);
  const label = (v: string) => labels?.[v as T] ?? v;
  return (
    <Select.Root<T>
      value={known ? (value as T) : null}
      onValueChange={(v) => {
        if (v !== null && v !== value) onChange(v);
      }}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={`field flex min-w-0 cursor-pointer items-center gap-2 px-2 text-left ${className}`}
      >
        {icon && <span className="flex shrink-0 text-ink-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{label(value)}</span>
        <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" stroke={1.5} aria-hidden />
      </Select.Trigger>
      <Select.Portal container={layer}>
        <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-50 outline-none">
          <Select.Popup className="popup min-w-[max(var(--anchor-width),160px)] max-w-[420px] outline-none">
            <Select.List className="max-h-[min(320px,var(--available-height))] overflow-y-auto p-1">
              {options.map((o) => (
                <Select.Item
                  key={o}
                  value={o}
                  className="flex min-h-[34px] cursor-default select-none items-center gap-2 rounded-[4px] px-2 text-xs text-ink outline-none data-[highlighted]:bg-surface-field"
                >
                  <Select.ItemText className="min-w-0 flex-1 truncate">
                    {label(o)}
                    {notes?.[o] && <span className="text-ink-muted"> · {notes[o]}</span>}
                  </Select.ItemText>
                  <Select.ItemIndicator className="flex shrink-0 text-ink">
                    <IconCheck className="h-4 w-4" stroke={1.5} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
