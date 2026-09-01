import { useState } from 'react';
import type { Mode, ResolvedTokens, SemanticGroup, SemanticRef } from '@/studio/engine/types';

/**
 * The semantics table, both modes as columns (one row per token) — a light value
 * and a dark value are two halves of one decision, and reading them apart is how
 * dark-mode contrast bugs get shipped.
 */
export function SemanticsPanel({
  resolved,
  onApplyFix,
  onReset,
}: {
  resolved: ResolvedTokens;
  onApplyFix: (name: string, mode: Mode, ref: SemanticRef) => void;
  onReset: (name: string) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Set<SemanticGroup>>(
    new Set<SemanticGroup>(['surface', 'text', 'brand']),
  );

  const groups = resolved.semantics.reduce((acc, token) => {
    const list = acc.get(token.group) ?? [];
    list.push(token);
    acc.set(token.group, list);
    return acc;
  }, new Map<SemanticGroup, ResolvedTokens['semantics']>());

  // A warning names the tokens it involves; index by the foreground so a row can show its own failure.
  const warningByToken = new Map<string, ResolvedTokens['warnings'][number]>();
  for (const warning of resolved.warnings) {
    const target = warning.fix?.token ?? warning.tokens?.[0];
    if (target && !warningByToken.has(target)) warningByToken.set(target, warning);
  }

  return (
    <div className="p-4">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="font-medium">Semantics</h2>
        <span className="text-xs text-gray-400">how everything — including AI — refers to colour</span>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-2 border-b border-gray-800 px-2 pb-1 text-[11px] text-gray-400">
        <span>token</span>
        <span>light</span>
        <span>dark</span>
        <span className="w-16 text-right">contrast</span>
      </div>

      {Array.from(groups, ([group, tokens]) => {
        const open = openGroups.has(group);
        return (
          <div key={group}>
            <button
              onClick={() =>
                setOpenGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(group)) next.delete(group);
                  else next.add(group);
                  return next;
                })
              }
              className="flex w-full items-center gap-1.5 px-2 pb-1 pt-3 text-[11px] uppercase tracking-wide text-gray-400 hover:text-gray-600"
            >
              <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
              {group}
              <span className="text-gray-300">{tokens.length}</span>
            </button>

            {open &&
              tokens.map((token) => {
                const warning = warningByToken.get(token.name);
                const isFail = warning?.level === 'fail';
                return (
                  <div
                    key={token.name}
                    className={`grid grid-cols-[1.6fr_1fr_1fr_auto] items-center gap-2 border-b border-dotted border-gray-100 px-2 py-1 text-[13px] ${
                      isFail ? 'bg-amber-50' : ''
                    }`}
                    title={token.description}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <code className="truncate font-mono text-[11px]">--{token.name}</code>
                      {(token.overridden.light || token.overridden.dark) && (
                        <button
                          onClick={() => onReset(token.name)}
                          title="Reset to generated"
                          className="shrink-0 text-[9px] text-blue-600 hover:underline"
                        >
                          reset
                        </button>
                      )}
                    </span>
                    <ValueCell token={token} mode="light" />
                    <ValueCell token={token} mode="dark" />
                    <span className="flex w-16 items-center justify-end gap-1">
                      {warning?.apcaLc != null ? (
                        <>
                          <span className={`text-[10px] ${isFail ? 'text-amber-700' : 'text-gray-400'}`}>
                            {Math.round(Math.abs(warning.apcaLc))}
                          </span>
                          {warning.fix && (
                            <button
                              onClick={() => onApplyFix(warning.fix!.token, warning.fix!.mode, warning.fix!.ref)}
                              className="rounded-full border border-amber-600 px-1.5 text-[9px] text-amber-700 hover:bg-amber-100"
                              title={warning.message}
                            >
                              fix
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

function ValueCell({
  token,
  mode,
}: {
  token: ResolvedTokens['semantics'][number];
  mode: Mode;
}) {
  const ref = token[mode];
  const swatch = token.values[mode];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-sm border border-gray-300"
        style={{ background: swatch.css }}
      />
      <span className="truncate text-[11px] text-gray-500">
        {ref.scale}.{ref.step}
        {ref.alpha !== undefined && ` @${Math.round(ref.alpha * 100)}%`}
      </span>
    </span>
  );
}
