import { useMemo, useState } from 'react';
import type { ColorInfo, CustomPropInfo, PropDefinition, ScanResult } from '@/shared/types';
import type { Mode } from '@/studio/engine/types';
import type { Override } from '@/studio/reskin';
import { widthLabel } from '@/studio/siteMode';
import { groupCustomProps, type VarKind } from '@/studio/varGroups';
import { SearchIcon, UndoIcon } from '../icons';
import { ColorField } from '../inspect/ColorField';
import { NumberField } from '../inspect/NumberField';
import { TextInput } from '../inspect/TextInput';
import { ObservedColoursSection } from './ObservedColoursSection';

type Scope = PropDefinition['scope'];
const SCOPES: { key: Scope; label: string; title: string }[] = [
  { key: 'root', label: 'root', title: 'Defined at the root of the cascade: :root, html' },
  { key: 'dark', label: 'dark', title: "Defined on the page's dark side: a dark media query or a hook like .dark" },
  { key: 'width', label: 'width', title: 'Defined under a width media query' },
  { key: 'scoped', label: 'scoped', title: 'Defined on a component selector' },
];

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
 * The page's own tokens, editable, and live: its variables under the names
 * it gave them — `--ink`, `--paper`, `--mark` — read off its stylesheets,
 * not a vocabulary invented for it, and below them the literals it paints
 * with that no variable holds.
 *
 * Typing a value sets that variable on the page's root and queues one line
 * for the bridge or the agent: the name, what it was, what it should be.
 * Where a seed or a scale already moved a variable, the row says so, and a
 * value typed here wins over it. The scope chips narrow the list to the
 * side of the page a variable is defined on; a variable defined on several
 * sides shows under each.
 */
export function TokensSection({
  scan,
  engine,
  colorMap,
  mode,
  varOverrides,
  colorEdits,
  locks = [],
  onVar,
  onColor,
  onLock,
}: {
  scan: Pick<ScanResult, 'customProps' | 'colors'>;
  /** What the engine would set each variable to, by name. */
  engine: Override[];
  /** old hex → new hex, as the engine would paint the literals. */
  colorMap: Record<string, string>;
  /** In dark, the engine's colour moves are the preview, and the chip says so. */
  mode: Mode;
  varOverrides: Record<string, string>;
  colorEdits: Record<string, string>;
  /** Variables to keep as they are: nothing moves them, and the brief says so. */
  locks?: string[];
  onVar: (name: string, value: string | null) => void;
  onColor: (hex: string, value: string | null) => void;
  onLock?: (name: string, locked: boolean) => void;
}) {
  const [showAll, setShowAll] = useState<Set<VarKind>>(new Set());
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope | null>(null);
  const needle = query.trim().toLowerCase();
  const scoped = scan.customProps.some((p) => p.definitions?.length);
  // Hundreds of rows on a Tailwind page; classify them once per scan or query, not per keystroke.
  const groups = useMemo(
    () =>
      groupCustomProps(
        scan.customProps.filter(
          (p) =>
            (!needle || p.name.toLowerCase().includes(needle) || p.value.toLowerCase().includes(needle)) &&
            (!scope || p.definitions?.some((d) => d.scope === scope)),
        ),
      ),
    [scan.customProps, needle, scope],
  );
  const byEngine = useMemo(() => new Map(engine.filter((o) => o.reason !== 'manual').map((o) => [o.name, o])), [engine]);
  const literals = scan.colors.filter((c) => !c.varNames.length);

  if (!scan.customProps.length) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-ink-muted">
          This page defines no CSS variables. Its colours are below; setting one rewrites the rules that hold the literal,
          and Generate can give it a system to run on.
        </p>
        {scan.colors.length > 0 && (
          <ObservedColoursSection colors={scan.colors} engine={colorMap} mode={mode} colorEdits={colorEdits} onColor={onColor} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {scoped && (
        <div role="radiogroup" aria-label="Scope" className="flex flex-wrap gap-1">
          {[{ key: null as Scope | null, label: 'all', title: 'Every variable the page defines' }, ...SCOPES].map((s) => (
            <button
              key={s.label}
              role="radio"
              aria-checked={scope === s.key}
              onClick={() => setScope(s.key)}
              title={s.title}
              className={`h-5 rounded-control px-2 font-mono text-2xs ${scope === s.key ? 'bg-surface-thumb text-ink' : 'bg-surface-field text-ink-secondary hover:bg-surface-field-hover hover:text-ink'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {/* A Tailwind page defines hundreds; the one you want is a name away. */}
      {scan.customProps.length > FOLD && (
        <label className="field flex w-full items-center gap-1.5 px-2 text-ink-muted">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find a variable… (${scan.customProps.length})`}
            aria-label="Find a variable"
            spellCheck={false}
            className="h-6 min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted focus-visible:outline-none"
          />
        </label>
      )}
      {(needle || scope) && !groups.length && <p className="text-xs text-ink-muted">Nothing named or valued like that{scope ? ` on the ${scope} side` : ''}.</p>}
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
                className="btn btn-sm btn-ghost -ml-2 self-start"
              >
                {open ? 'Show fewer' : `Show all ${props.length}`}
              </button>
            )}
          </div>
        );
      })}
      {/* Colours the page paints that no variable holds: the only handle on
          them is the rules that hold the literal, and Generate's adoption plan. */}
      {literals.length > 0 && !needle && !scope && (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 text-2xs text-ink-muted">
            <span className="font-medium">Literals</span>
            <span className="truncate">colours no variable holds</span>
            <span className="ml-auto font-mono">{literals.length}</span>
          </div>
          <ObservedColoursSection colors={literals} engine={colorMap} mode={mode} colorEdits={colorEdits} onColor={onColor} />
        </div>
      )}
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
      className={`inline-block shrink-0 rounded-[3px] swatch ${size === 'md' ? 'h-4 w-4' : 'h-3 w-3'}`}
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
