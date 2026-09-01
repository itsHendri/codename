import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrandConfig, Mode, ResolvedTokens, ScaleRole, SemanticRef } from '@/studio/engine/types';
import { STEPS, SCALE_ROLES } from '@/studio/engine/types';
import { resolveTokens } from '@/studio/engine/resolve';
import { hendriPreset } from '@/studio/presets/hendri';
import { listBrands, loadBrand, saveBrand, type BrandSummary } from '@/studio/storage';
import { SeedsPanel } from './panels/SeedsPanel';
import { SemanticsPanel } from './panels/SemanticsPanel';
import { PreviewCanvas } from './PreviewCanvas';
import { ExportDialog } from './ExportDialog';

type Step = (typeof STEPS)[number];

export default function Studio() {
  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [mode, setMode] = useState<Mode>('light');
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [selectedRole, setSelectedRole] = useState<ScaleRole>('primary');
  const [exporting, setExporting] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const undoStack = useRef<BrandConfig[]>([]);
  const redoStack = useRef<BrandConfig[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);

  // Load: a brand handed over by the side panel wins, else the last edited, else the preset.
  useEffect(() => {
    void (async () => {
      const index = await listBrands();
      setBrands(index);
      const params = new URLSearchParams(location.search);
      const requested = params.get('brand');
      const slug = requested ?? index[0]?.slug;
      const loaded = slug ? await loadBrand(slug) : null;
      setConfig(loaded ?? hendriPreset);
    })();
  }, []);

  const resolved: ResolvedTokens | null = useMemo(
    () => (config ? resolveTokens(config) : null),
    [config],
  );

  const commit = useCallback((next: BrandConfig) => {
    setConfig((current) => {
      if (current) {
        undoStack.current = [...undoStack.current.slice(-99), current];
        redoStack.current = [];
      }
      return next;
    });
    setSaveState('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveBrand(next).then(async () => {
        setSaveState('saved');
        setBrands(await listBrands());
      });
    }, 600);
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setConfig((current) => {
      if (current) redoStack.current = [...redoStack.current, current];
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setConfig((current) => {
      if (current) undoStack.current = [...undoStack.current, current];
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const setSeed = useCallback(
    (role: ScaleRole, seed: string) => {
      if (!config) return;
      commit({
        ...config,
        color: {
          ...config.color,
          scales: config.color.scales.map((s) => (s.role === role ? { ...s, seed } : s)),
        },
      });
    },
    [config, commit],
  );

  const setSemanticRef = useCallback(
    (name: string, refMode: Mode, ref: SemanticRef) => {
      if (!config) return;
      const existing = config.color.semanticOverrides.find((o) => o.name === name);
      const updated = { ...(existing ?? { name }), [refMode]: ref };
      commit({
        ...config,
        color: {
          ...config.color,
          semanticOverrides: [
            ...config.color.semanticOverrides.filter((o) => o.name !== name),
            updated,
          ],
        },
      });
    },
    [config, commit],
  );

  const resetSemantic = useCallback(
    (name: string) => {
      if (!config) return;
      commit({
        ...config,
        color: {
          ...config.color,
          semanticOverrides: config.color.semanticOverrides.filter((o) => o.name !== name),
        },
      });
    },
    [config, commit],
  );

  if (!config || !resolved) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  const failing = resolved.warnings.filter((w) => w.level === 'fail').length;
  const cautions = resolved.warnings.filter((w) => w.level === 'warn').length;
  const tokenCount = resolved.semantics.length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-sm text-gray-800">
      {/* App bar */}
      <header className="flex items-center gap-3 border-b border-gray-300 px-4 py-2.5">
        <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1 L15 8 L8 15 L1 8 Z" />
          <path d="M8 5 L11 8 L8 11 L5 8 Z" fill="#2563eb" stroke="none" />
        </svg>
        <span className="text-base font-semibold">Codename Studio</span>
        <span className="h-5 w-px bg-gray-300" />
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          Brand
          <select
            value={config.meta.slug}
            onChange={async (e) => {
              const loaded = await loadBrand(e.target.value);
              if (loaded) {
                undoStack.current = [];
                redoStack.current = [];
                setConfig(loaded);
              }
            }}
            className="rounded border border-gray-300 px-1.5 py-0.5 text-sm text-gray-800"
          >
            {brands.every((b) => b.slug !== config.meta.slug) && (
              <option value={config.meta.slug}>{config.meta.name}</option>
            )}
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {config.meta.deviations[0]?.startsWith('Seeded from a scan') && (
          <span className="rounded-full border border-dashed border-blue-600 px-2.5 py-0.5 text-[11px] text-blue-600">
            seeded from scan
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={undo} title="Undo (⌘Z)" className="rounded p-1 text-gray-500 hover:bg-gray-100">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 4 L3 7 L6 10 M3 7 H10 a3 3 0 0 1 0 6 H8" />
              </svg>
            </button>
            <button onClick={redo} title="Redo (⇧⌘Z)" className="rounded p-1 text-gray-500 hover:bg-gray-100">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 4 L13 7 L10 10 M13 7 H6 a3 3 0 0 0 0 6 H8" />
              </svg>
            </button>
          </div>
          <div className="flex rounded-lg border border-gray-300 p-0.5">
            {(['light', 'dark'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-0.5 text-xs capitalize ${
                  mode === m ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
          </span>
          <button
            onClick={() => setExporting(true)}
            className="flex items-center gap-2 rounded-lg border border-blue-600 bg-blue-50 px-4 py-1.5 font-medium text-blue-600 hover:bg-blue-100"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2 V10 M5 7 L8 10 L11 7 M3 13 H13" />
            </svg>
            Export
          </button>
        </div>
      </header>

      {/* Status rail */}
      <div className="flex items-center gap-4 border-b border-gray-300 px-4 py-1.5 text-xs">
        <span className="text-gray-500">
          {tokenCount} semantic tokens · {SCALE_ROLES.length} ramps × {STEPS.length} steps
        </span>
        <span className="ml-auto flex items-center gap-3">
          {failing > 0 ? (
            <span className="flex items-center gap-1.5 text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-600" />
              {failing} failing
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              contrast clear
            </span>
          )}
          {cautions > 0 && <span className="text-gray-500">{cautions} to review</span>}
        </span>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[560px] shrink-0 flex-col overflow-y-auto border-r border-gray-300">
          <SeedsPanel
            config={config}
            resolved={resolved}
            mode={mode}
            selectedRole={selectedRole}
            onSelectRole={setSelectedRole}
            onSeedChange={setSeed}
          />
          <SemanticsPanel
            resolved={resolved}
            onApplyFix={(name, fixMode, ref) => setSemanticRef(name, fixMode, ref)}
            onReset={resetSemantic}
          />
        </div>
        <PreviewCanvas resolved={resolved} mode={mode} />
      </div>

      {exporting && (
        <ExportDialog resolved={resolved} onClose={() => setExporting(false)} />
      )}
    </div>
  );
}

export type { Step };
