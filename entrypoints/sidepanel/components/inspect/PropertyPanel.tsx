import { useEffect, useState, type ReactNode } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { suggestTokens, type TokenSuggestion } from '@/studio/tokenMatch';
import { ColorField } from './ColorField';
import { NumberField } from './NumberField';
import { ShadowField } from './ShadowField';

type Scan = Pick<ScanResult, 'customProps' | 'rootFontSize'>;
type Change = (property: string, to: string, token?: string) => void;

const ALIGNS = ['left', 'center', 'right', 'justify'] as const;
const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted'] as const;

export function PropertyPanel({
  element,
  scan,
  resolved,
  mode,
  onChange,
  onText,
}: {
  element: ElementProps;
  scan: Scan;
  resolved: ResolvedTokens | null;
  mode: Mode;
  onChange: Change;
  onText: (text: string) => void;
}) {
  const colour = (v: string) => suggestTokens('color', v, scan, resolved ?? undefined, mode);
  const length = (v: string) => suggestTokens('length', v, scan, resolved ?? undefined, mode);
  const { box, type, color, border } = element;
  const flexOrGrid = /flex|grid/.test(box.display);

  const len = (prop: string, value: string, label: string, aria: string, compact = false) => (
    <LengthField key={prop} prop={prop} value={value} label={label} aria={aria} compact={compact} suggest={length} onChange={onChange} />
  );

  return (
    <div className="flex flex-col gap-3">
      <Group title="Spacing">
        <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1.5">
          <SideLabel>margin</SideLabel>
          <div className="grid grid-cols-4 gap-1">
            {len('margin-top', box.marginTop, 'T', 'Margin top', true)}
            {len('margin-right', box.marginRight, 'R', 'Margin right', true)}
            {len('margin-bottom', box.marginBottom, 'B', 'Margin bottom', true)}
            {len('margin-left', box.marginLeft, 'L', 'Margin left', true)}
          </div>
          <SideLabel>padding</SideLabel>
          <div className="grid grid-cols-4 gap-1">
            {len('padding-top', box.paddingTop, 'T', 'Padding top', true)}
            {len('padding-right', box.paddingRight, 'R', 'Padding right', true)}
            {len('padding-bottom', box.paddingBottom, 'B', 'Padding bottom', true)}
            {len('padding-left', box.paddingLeft, 'L', 'Padding left', true)}
          </div>
          {flexOrGrid && (
            <>
              <SideLabel>gap</SideLabel>
              <div className="grid grid-cols-2 gap-1">{len('gap', box.gap, '⋮', 'Gap')}</div>
            </>
          )}
        </div>
      </Group>

      <Group title="Size">
        <div className="grid grid-cols-2 gap-2">
          {len('width', box.width, 'W', 'Width')}
          {len('height', box.height, 'H', 'Height')}
        </div>
      </Group>

      <Group title="Type">
        <TextInput
          value={type.fontFamily}
          ariaLabel="Font family"
          valid={(v) => CSS.supports('font-family', v)}
          onCommit={(v) => onChange('font-family', v)}
        />
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {len('font-size', type.fontSize, 'Aa', 'Font size')}
          {len('font-weight', type.fontWeight, 'B', 'Font weight')}
          {len('line-height', type.lineHeight, '↕', 'Line height')}
          {len('letter-spacing', type.letterSpacing, '↔', 'Letter spacing')}
        </div>
        <Segmented
          value={type.textAlign}
          options={ALIGNS}
          ariaLabel="Text align"
          onChange={(v) => onChange('text-align', v)}
        />
      </Group>

      <Group title="Colour">
        <Labelled label="text">
          <ColorField value={color.text} suggestions={colour(color.text)} ariaLabel="Text colour" onChange={(v, t) => onChange('color', v, t)} />
        </Labelled>
        <Labelled label="bg">
          <ColorField value={color.background} suggestions={colour(color.background)} ariaLabel="Background colour" onChange={(v, t) => onChange('background-color', v, t)} />
        </Labelled>
        <Labelled label="border">
          <ColorField value={color.border} suggestions={colour(color.border)} ariaLabel="Border colour" onChange={(v, t) => onChange('border-color', v, t)} />
        </Labelled>
      </Group>

      <Group title="Radius & border">
        <div className="grid grid-cols-2 gap-2">
          {len('border-radius', element.radius, '◜', 'Border radius')}
          {len('border-width', border.width, '▭', 'Border width')}
        </div>
        <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1.5">
          <SideLabel>style</SideLabel>
          <select
            value={BORDER_STYLES.includes(border.style as (typeof BORDER_STYLES)[number]) ? border.style : 'none'}
            onChange={(e) => onChange('border-style', e.target.value)}
            aria-label="Border style"
            className="rounded-control border border-line bg-surface-recessed px-1 py-0.5 text-xs"
          >
            {BORDER_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <SideLabel>colour</SideLabel>
          <ColorField value={border.color} suggestions={colour(border.color)} ariaLabel="Border colour" onChange={(v, t) => onChange('border-color', v, t)} />
        </div>
      </Group>

      <Group title="Shadow">
        <ShadowField
          value={element.shadow}
          suggestions={suggestTokens('shadow', element.shadow, scan, resolved ?? undefined, mode)}
          onChange={(v, t) => onChange('box-shadow', v, t)}
        />
      </Group>

      {element.text !== null && (
        <Group title="Text">
          <TextArea value={element.text} onCommit={onText} />
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-t border-dashed border-line-subtle pt-2.5">
      <h3 className="text-2xs uppercase tracking-wide text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function SideLabel({ children }: { children: ReactNode }) {
  return <span className="w-11 pt-1 text-2xs text-ink-muted">{children}</span>;
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-2">
      <SideLabel>{label}</SideLabel>
      {children}
    </div>
  );
}

/** A NumberField plus, when the page has a variable for this length, one chip. */
function LengthField({
  prop,
  value,
  label,
  aria,
  compact,
  suggest,
  onChange,
}: {
  prop: string;
  value: string;
  label: string;
  aria: string;
  compact: boolean;
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

function TextInput({
  value,
  ariaLabel,
  valid,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  valid: (v: string) => boolean;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const ok = valid(draft);
  const commit = () => {
    if (ok && draft !== value) onCommit(draft);
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      spellCheck={false}
      aria-label={ariaLabel}
      className={`w-full min-w-0 rounded-control border bg-surface-recessed px-1 py-0.5 font-mono text-xs ${
        ok ? 'border-line' : 'border-warn bg-warn-soft'
      }`}
    />
  );
}

function TextArea({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
      }}
      rows={3}
      aria-label="Element text"
      className="w-full resize-y rounded-control border border-line bg-surface-recessed px-1.5 py-1 text-sm"
    />
  );
}

function Segmented<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: string;
  options: readonly T[];
  ariaLabel: string;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex overflow-hidden rounded-control border border-line">
      {options.map((o) => {
        const on = value === o || (o === 'left' && value === 'start');
        return (
          <button
            key={o}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={`flex-1 py-0.5 text-2xs capitalize ${
              on ? 'bg-accent text-accent-ink' : 'text-ink-secondary hover:bg-surface-recessed'
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
