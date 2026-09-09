import { useState } from 'react';
import type { CustomPropInfo, ScanResult } from '@/shared/types';
import type { Override } from '@/studio/reskin';
import { groupCustomProps, type VarKind } from '@/studio/varGroups';
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
  varOverrides,
  onVar,
}: {
  scan: Pick<ScanResult, 'customProps'>;
  /** What the engine would set each variable to, by name. */
  engine: Override[];
  varOverrides: Record<string, string>;
  onVar: (name: string, value: string | null) => void;
}) {
  const [showAll, setShowAll] = useState<Set<VarKind>>(new Set());
  const groups = groupCustomProps(scan.customProps);
  const byEngine = new Map(engine.filter((o) => o.reason !== 'manual').map((o) => [o.name, o]));

  if (!groups.length) {
    return (
      <p className="text-xs text-ink-muted">
        This page defines no CSS variables. Its colours are below; a scale change reaches it
        through the rules that hold the literal.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ kind, props }) => {
        const open = showAll.has(kind);
        const shown = open ? props : props.slice(0, FOLD);
        return (
          <div key={kind} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 text-2xs tracking-wide text-ink-muted">
              <span className="uppercase">{KIND_LABEL[kind]}</span>
              <span className="ml-auto font-mono">{props.length}</span>
            </div>
            <div className="divide-y divide-line-subtle overflow-hidden rounded-control border border-line-subtle">
              {shown.map((prop) => (
                <VarRow
                  key={prop.name}
                  kind={kind}
                  prop={prop}
                  engine={byEngine.get(prop.name)}
                  manual={varOverrides[prop.name]}
                  onChange={(v) => onVar(prop.name, v)}
                />
              ))}
            </div>
            {props.length > FOLD && (
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
  engine,
  manual,
  onChange,
}: {
  kind: VarKind;
  prop: CustomPropInfo;
  engine: Override | undefined;
  manual: string | undefined;
  onChange: (value: string | null) => void;
}) {
  // A typed value, else what a seed or scale made of it, else what the page says.
  const value = manual ?? engine?.to ?? prop.value.trim();
  const changed = value !== prop.value.trim();
  const source = prop.source?.split('/').pop();

  return (
    <div className={`flex flex-col gap-1 px-2 py-1.5 ${manual ? 'bg-surface-selected/40' : ''}`}>
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate text-xs" title={`${prop.name}: ${prop.value}${source ? ` — ${source}` : ''}`}>
          {prop.name}
        </code>
        {prop.uses != null && prop.uses > 0 && (
          <span className="shrink-0 font-mono text-2xs text-ink-muted" title={`${prop.uses} declarations use it`}>
            ×{prop.uses}
          </span>
        )}
        {manual ? (
          <button
            onClick={() => onChange(null)}
            className="shrink-0 rounded-full border border-accent px-1.5 text-2xs text-accent hover:bg-accent-soft"
            title={`Set by hand; was ${prop.value}. Click to take it back.`}
          >
            by hand ↺
          </button>
        ) : engine ? (
          <span
            className="shrink-0 rounded-full border border-line-subtle px-1.5 text-2xs text-ink-muted"
            title={`Moved by the ${engine.reason === 'grid' || engine.reason === 'scale' ? 'scale' : 'seed'}; was ${prop.value}`}
          >
            {engine.reason === 'grid' || engine.reason === 'scale' ? 'scale' : 'seed'}
          </span>
        ) : null}
      </div>
      <Editor kind={kind} value={value} changed={changed} name={prop.name} onChange={onChange} />
    </div>
  );
}

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
