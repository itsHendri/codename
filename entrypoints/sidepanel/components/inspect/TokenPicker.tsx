import { useMemo, useState } from 'react';
import type { CustomPropInfo } from '@/shared/types';
import { filterTokens, paintedValue, rankTokens } from '@/studio/tokenPicker';
import type { MatchKind } from '@/studio/tokenMatch';
import { hexOf } from '@/studio/reskin';

/** How many ramp steps show before the rest fold away. */
const PRIMITIVES_FIRST = 12;

/**
 * The page's variables, to put an element on one of them.
 *
 * Figma's variable picker, Penpot's token list: a search, the tokens that
 * name a role first, plain names next, the ramp's steps last — because when
 * a person swaps what an element is on, `--ink-muted` is the decision and
 * `--gray-600` is where a decision leaks. Each row is a swatch, the name
 * and how many declarations lean on it. Picking one is a swap for this
 * element only; the token itself is edited elsewhere.
 */
export function TokenPicker({
  tokens,
  kind,
  current,
  rootFontSize = 16,
  onPick,
}: {
  tokens: CustomPropInfo[];
  kind: MatchKind;
  /** The token the element is on, lit in the list. */
  current?: string;
  rootFontSize?: number;
  onPick: (token: CustomPropInfo) => void;
}) {
  const [query, setQuery] = useState('');
  const [allPrimitives, setAllPrimitives] = useState(false);
  const ranked = useMemo(() => filterTokens(rankTokens(tokens, kind, rootFontSize), query), [tokens, kind, rootFontSize, query]);
  const primitives = allPrimitives ? ranked.primitive : ranked.primitive.slice(0, PRIMITIVES_FIRST);
  const empty = !ranked.semantic.length && !ranked.other.length && !ranked.primitive.length;

  const row = (p: CustomPropInfo) => {
    const value = paintedValue(p);
    const hex = hexOf(value);
    const chosen = p.name === current;
    return (
      <li key={p.name}>
        <button
          onClick={() => onPick(p)}
          aria-label={`Use ${p.name}`}
          aria-pressed={chosen}
          title={`${p.name}: ${p.value}${p.resolved && p.resolved !== p.value ? ` → ${p.resolved}` : ''}`}
          className={`flex h-6 w-full items-center gap-2 rounded-control px-1 text-left text-xs ${chosen ? 'bg-accent-soft text-accent' : 'hover:bg-surface-field'}`}
        >
          {hex ? (
            <span className="swatch h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: hex }} />
          ) : (
            <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] bg-surface-field font-mono text-[9px] leading-[14px] text-ink-muted" aria-hidden>
              {value.replace(/[^\d.]/g, '').slice(0, 3)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-mono">{p.name}</span>
          {p.uses != null && <span className="shrink-0 text-2xs text-ink-muted">×{p.uses}</span>}
        </button>
      </li>
    );
  };
  const group = (title: string, list: CustomPropInfo[], after?: React.ReactNode) =>
    list.length > 0 && (
      <div className="flex flex-col gap-0.5">
        <div className="px-1 text-2xs text-ink-muted">{title}</div>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">{list.map(row)}</ul>
        {after}
      </div>
    );

  return (
    <div className="flex flex-col gap-1.5 rounded-control bg-surface-panel p-1.5 shadow-[inset_0_0_0_1px_var(--line-subtle)]" role="listbox" aria-label="Page variables">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search variables"
        aria-label="Search variables"
        className="field h-6 w-full px-1.5 text-xs"
      />
      {empty && <div className="px-1 py-1 text-2xs text-ink-muted">No variable of this kind{query ? ' matches' : ' on this page'}.</div>}
      {group('Semantic', ranked.semantic)}
      {group('Other', ranked.other)}
      {group(
        'Primitives',
        primitives,
        ranked.primitive.length > PRIMITIVES_FIRST && (
          <button onClick={() => setAllPrimitives((v) => !v)} className="btn btn-sm btn-ghost self-start">
            {allPrimitives ? 'Fewer' : `All ${ranked.primitive.length}`}
          </button>
        ),
      )}
    </div>
  );
}
