import { useMemo, useState } from 'react';
import type { ResolvedTokens } from '@/studio/engine/types';
import { buildExport, DOC_BUDGET, exportBudget, type ExportFile } from '@/studio/export/bundle';
import { download, downloadBundle } from '@/studio/download';

type Audience = 'agent' | 'codebase' | 'humans';

const AUDIENCES: { key: Audience; title: string; blurb: string; match: (path: string) => boolean }[] = [
  {
    key: 'agent',
    title: 'AI agent',
    blurb: 'A skill folder your agent can follow: rules, tokens, and the reference behind them.',
    match: (p) => p.startsWith('skill/') || p === 'tokens.css' || p === 'brand.json',
  },
  {
    key: 'codebase',
    title: 'Codebase',
    blurb: 'tokens.css with a Tailwind v4 @theme block, plus DTCG JSON.',
    match: (p) => p === 'tokens.css' || p === 'tokens.json' || p === 'brand.json',
  },
  {
    key: 'humans',
    title: 'Everything',
    blurb: 'The full tree — skill, tokens, reference docs and the source brand.',
    match: () => true,
  },
];

export function ExportDialog({
  resolved,
  onClose,
}: {
  resolved: ResolvedTokens;
  onClose: () => void;
}) {
  const [audience, setAudience] = useState<Audience>('agent');
  const [selected, setSelected] = useState<string>('skill/SKILL.md');
  const [copied, setCopied] = useState(false);

  const all = useMemo(() => buildExport(resolved), [resolved]);
  const preset = AUDIENCES.find((a) => a.key === audience)!;
  const files = all.filter((f) => preset.match(f.path));
  const active: ExportFile = files.find((f) => f.path === selected) ?? files[0]!;

  const budget = useMemo(() => exportBudget(all), [all]);

  const failing = resolved.warnings.filter((w) => w.level === 'fail').length;
  const slug = resolved.config.meta.slug;

  const copyAll = async () => {
    const text = files
      .map((f) => `===== ${f.path} =====\n${f.content}`)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/30 p-10" onClick={onClose}>
      <div
        className="flex max-h-full w-[820px] flex-col overflow-hidden rounded-xl border border-gray-300 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-gray-300 px-5 py-3.5">
          <h2 className="text-lg font-medium">Export the system</h2>
          <div className="ml-auto flex items-center gap-3">
            {failing > 0 && (
              <span className="rounded-full border border-amber-600 px-2.5 py-0.5 text-xs text-amber-700">
                {failing} contrast failure{failing === 1 ? '' : 's'} will ship
              </span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="border-b border-dashed border-gray-200 px-5 py-3.5">
          <div className="mb-2 text-xs text-gray-500">WHO IS THIS FOR</div>
          <div className="grid grid-cols-3 gap-2.5">
            {AUDIENCES.map((a) => (
              <button
                key={a.key}
                onClick={() => setAudience(a.key)}
                className={`rounded-lg border p-2.5 text-left ${
                  audience === a.key ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className={`text-sm font-medium ${audience === a.key ? 'text-blue-700' : ''}`}>
                  {a.title}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500">{a.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-64 shrink-0 overflow-y-auto border-r border-dashed border-gray-200 p-4">
            <div className="mb-2 text-xs text-gray-500">FILES · {files.length}</div>
            <div className="flex flex-col gap-1">
              {files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setSelected(f.path)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] ${
                    active.path === f.path ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate font-mono text-[11px]">{f.path}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-gray-400">
                    {(f.content.length / 1024).toFixed(1)} KB
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-dashed border-gray-200 pt-3 text-[11px] text-gray-500">
              Docs ≈ {Math.round(budget.tokens).toLocaleString()} LLM tokens
              {budget.overBudget && (
                <span className="text-amber-700"> · over the {DOC_BUDGET.toLocaleString()} budget</span>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[13px]">{active.path}</span>
              <button
                onClick={() => navigator.clipboard.writeText(active.content)}
                className="ml-auto rounded-md border border-gray-300 px-2.5 py-0.5 text-xs hover:bg-gray-50"
              >
                Copy file
              </button>
            </div>
            <p className="mb-2 text-[11px] text-gray-500">{active.note}</p>
            <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed">
              {active.content.slice(0, 6000)}
              {active.content.length > 6000 ? '\n…' : ''}
            </pre>

            <div className="mt-3 flex items-center gap-2.5">
              <span className="text-[11px] text-gray-500">Saves to Downloads as one folder</span>
              <button
                onClick={copyAll}
                className="ml-auto rounded-lg border border-gray-800 px-4 py-1.5 text-sm hover:bg-gray-50"
              >
                {copied ? 'Copied ✓' : 'Copy all for AI'}
              </button>
              <button
                onClick={() => downloadBundle(files, slug)}
                className="flex items-center gap-2 rounded-lg border border-blue-600 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2 V10 M5 7 L8 10 L11 7 M3 13 H13" />
                </svg>
                Download ZIP
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { download };
