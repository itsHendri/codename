import { useMemo, useState } from 'react';
import type { CustomPropInfo, ScanResult } from '@/shared/types';
import type { Mode } from '@/studio/engine/types';
import type { Override } from '@/studio/reskin';
import { widthLabel } from '@/studio/siteMode';
import { groupCustomProps, type VarKind } from '@/studio/varGroups';
import { UndoIcon } from '../icons';
import { ColorField } from '../inspect/ColorField';
import { NumberField } from '../inspect/NumberField';
import { TextInput } from '../inspect/TextInput';

/** Rows past this fold behind "show all", per kind: a Tailwind page has hundreds. */
const FOLD = 12;

const KIND_LABEL: Record<VarKind, string> = {
  colour: 'Colour',
  length: 'Length',
  font: 'Font',
  shadow: 'Shadow',
  other: 'Other',
};

/**
 * The page's own variables, editable, and live.
 *
 * These are the site's real names — `--ink`, `--paper`, `--mark` — read off
 * its stylesheets, not a vocabulary invented for it. Typing a value sets that
 * variable on the page's root and hands the agent one line: the name, what it
 * was, what it should be. Where a seed or a scale already moved a variable,
 * the row says so, and a value typed here wins over it.
 */
export function PageVariablesSection({
  scan,
  engine,
  mode,
  varOverrides,
  locks = [],
  onVar,
  onLock,
}: {
  scan: Pick<ScanResult, 'customProps'>;
  /** What the engine would set each variable to, by name. */
  engine: Override[];
  /** In dark, the engine's colour moves are the preview, and the chip says so. */
  mode: Mode;
  varOverrides: Record<string, string>;
  /** Variables to keep as they are: nothing moves them, and the brief says so. */
  locks?: string[];
  onVar: (name: string, value: string | null) => void;
  onLock?: (name: string, locked: boolean) => void;
}) {
  const [showAll, setShowAll] = useState<Set<VarKind>>(new Set());
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  // Hundreds of rows on a Tailwind page; classify them once per scan or query, not per keystroke.
  const groups = useMemo(
    () =>
      groupCustomProps(
        needle
          ? scan.customProps.filter((p) => p.name.toLowerCase().includes(needle) || p.value.toLowerCase().includes(needle))
          : scan.customProps,
      ),
    [scan.customProps, needle],
  );
  const byEngine = useMemo(() => new Map(engine.filter((o) => o.reason !== 'manual').map((o) => [o.name, o])), [engine]);

  if (!scan.customProps.length) {
    return (
      <p className="text-xs text-ink-muted">
        This page defines no CSS variables. Its colours are below; a scale change reaches it
        through the rules that hold the literal.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* A Tailwind page defines hundreds; the one you want is a name away. */}
      {scan.customProps.length > FOLD && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Find a variable… (${scan.customProps.length})`}
          aria-label="Find a variable"
          spellCheck={false}
          className="field w-full px-2 placeholder:text-ink-muted"
        />
      )}
      {needle && !groups.length && <p className="text-xs text-ink-muted">Nothing named or valued like that.</p>}
      {groups.map(({ kind, props }) => {
        const open = showAll.has(kind) || !!needle;
        const shown = open ? props : props.slice(0, FOLD);
        return (
          <div key={kind} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 text-2xs text-ink-muted">
              <span className="font-medium">{KIND_LABEL[kind]}</span>
              <span className="ml-auto font-mono">{props.length}</span>
            </div>
            <div className="divide-y divide-line-subtle overflow-hidden rounded-control border border-line-subtle">
              {shown.map((prop) => (
                <VarRow
                  key={prop.name}
                  kind={kind}
                  prop={prop}
                  mode={mode}
                  engine={byEngine.get(prop.name)}
                  manual={varOverrides[prop.name]}
                  locked={locks.includes(prop.name)}
                  onChange={(v) => onVar(prop.name, v)}
                  onLock={onLock ? (v) => onLock(prop.name, v) : undefined}
                />
              ))}
            </div>
            {props.length > FOLD && !needle && (
              <button
                onClick={() =>
                  setShowAll((prev) => {
                    const next = new Set(prev);
                    if (next.has(kind)) next.delete(kind);
                    else next.add(kind);
                    return next;
                  })
                }
                className="self-start text-xs text-accent hover:underline"
              >
                {open ? 'show fewer' : `show all ${props.length}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VarRow({
  kind,
  prop,
  mode,
  engine,
  manual,
  locked,
  onChange,
  onLock,
}: {
  kind: VarKind;
  prop: CustomPropInfo;
  mode: Mode;
  engine: Override | undefined;
  manual: string | undefined;
  locked: boolean;
  onChange: (value: string | null) => void;
  onLock?: (locked: boolean) => void;
}) {
  // A typed value, else what a seed or scale made of it, else what the page says — unless it is locked.
  const value = locked ? prop.value.trim() : (manual ?? engine?.to ?? prop.value.trim());
  const changed = value !== prop.value.trim();
  const source = prop.source?.split('/').pop();

  // What else there is to know, shown under the name only when there is
  // something: most variables are a name and a value, one row, as Figma's
  // variables table and Webflow's are.
  const widths = Object.entries(prop.atWidth ?? {});
  const meta = !!prop.dark || !!prop.onlyAt || widths.length > 0 || (!locked && (!!manual || !!engine));

  return (
    <div
      className={`group grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-2 px-2 py-1 ${
        manual && !locked ? 'bg-accent-soft/40' : ''
      }`}
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-1.5">
          <code className="min-w-0 truncate text-xs text-ink" title={`${prop.name}: ${prop.value}${source ? ` — ${source}` : ''}`}>
            {prop.name}
          </code>
          {prop.uses != null && prop.uses > 0 && (
            <span className="shrink-0 font-mono text-2xs text-ink-faint" title={`${prop.uses} declarations use it`}>
              ×{prop.uses}
            </span>
          )}
          {onLock && (
            <button
              onClick={() => onLock(!locked)}
              aria-pressed={locked}
              aria-label={locked ? `Unlock ${prop.name}` : `Lock ${prop.name}`}
              className={`ml-auto h-4 shrink-0 rounded-[4px] px-1.5 text-2xs leading-4 focus-visible:opacity-100 ${
                locked
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-muted opacity-0 group-hover:opacity-100 hover:bg-surface-field hover:text-ink'
              }`}
              title={
                locked
                  ? 'Locked: nothing moves this, and the brief says to keep it as is. Click to unlock.'
                  : 'Lock this variable so no seed, scale or agent preview moves it; the brief says to keep it as is.'
              }
            >
              {locked ? 'locked' : 'lock'}
            </button>
          )}
        </div>
        {meta && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
            {prop.dark && (
              <span
                className="flex shrink-0 items-center gap-1 font-mono text-2xs text-ink-muted"
                title={`Under the page's dark mode: ${prop.dark}`}
              >
                {kind === 'colour' && <Swatch colour={prop.dark} />}
                dark
              </span>
            )}
            {prop.onlyAt && (
              <span
                className="shrink-0 font-mono text-2xs text-ink-muted"
                title={`Defined only at ${prop.onlyAt}: the page has no base value for it.`}
              >
                only {widthLabel(prop.onlyAt)}
              </span>
            )}
            {widths.map(([query, value]) => (
              <span
                key={query}
                className="flex shrink-0 items-center gap-1 font-mono text-2xs text-ink-muted"
                title={`At ${query}: ${value}. A token edit leaves this alone; the brief says so.`}
              >
                {kind === 'colour' && <Swatch colour={value} />}
                {widthLabel(query)}
              </span>
            ))}
            {locked ? null : manual ? (
              <button
                onClick={() => onChange(null)}
                className="flex h-4 shrink-0 items-center gap-1 rounded-[4px] bg-accent-soft px-1.5 text-2xs leading-4 text-accent hover:bg-accent-soft/70"
                title={`Set by hand; was ${prop.value}. Click to take it back.`}
              >
                by hand <UndoIcon className="h-2.5 w-2.5" />
              </button>
            ) : engine ? (
              <span
                className="h-4 shrink-0 rounded-[4px] bg-surface-field px-1.5 text-2xs leading-4 text-ink-muted"
                title={`Moved by the ${movedBy(engine, mode)}; was ${prop.value}`}
              >
                {movedBy(engine, mode)}
              </span>
            ) : null}
          </div>
        )}
      </div>
      {locked ? (
        // Locked shows the value it is held at, not a field that would not take an edit.
        <span className="flex h-control min-w-0 items-center gap-1.5 px-1.5 font-mono text-xs text-ink-muted" title="Locked">
          {kind === 'colour' && <Swatch colour={value} size="md" />}
          <span className="truncate">{value}</span>
        </span>
      ) : (
        <Editor kind={kind} value={value} changed={changed} name={prop.name} onChange={onChange} />
      )}
    </div>
  );
}

/** A colour, as a square the size of its line. */
function Swatch({ colour, size = 'sm' }: { colour: string; size?: 'sm' | 'md' }) {
  return (
    <i
      className={`inline-block shrink-0 rounded-[3px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] ${size === 'md' ? 'h-4 w-4' : 'h-3 w-3'}`}
      style={{ background: colour }}
    />
  );
}

/** What moved a variable the person did not touch: the scale, the dark preview, or a seed. */
const movedBy = (engine: Override, mode: Mode): string =>
  engine.reason === 'grid' || engine.reason === 'scale' ? 'scale' : mode === 'dark' ? 'dark' : 'seed';

function Editor({
  kind,
  value,
  changed,
  name,
  onChange,
}: {
  kind: VarKind;
  value: string;
  changed: boolean;
  name: string;
  onChange: (value: string) => void;
}) {
  if (kind === 'colour') {
    return <ColorField value={value} ariaLabel={`${name} value`} onChange={(v) => onChange(v)} />;
  }
  if (kind === 'length') {
    return (
      <NumberField value={value} ariaLabel={`${name} value`} className={changed ? 'text-accent' : ''} onChange={onChange} />
    );
  }
  return (
    <TextInput
      value={value}
      ariaLabel={`${name} value`}
      valid={(v) => v.trim().length > 0}
      onCommit={onChange}
      className={changed ? 'text-accent' : ''}
    />
  );
}
