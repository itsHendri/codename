import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig, Mode, ScaleRole } from '@/studio/engine/types';
import { resolveTokens } from '@/studio/engine/resolve';
import { seedBrandFromScan } from '@/studio/seedFromScan';
import { buildColorMap, buildReskin } from '@/studio/reskin';
import { applyReskin, clearReskin } from '../lib/messaging';
import { Section } from './design/Section';
import { ColourSection } from './design/ColourSection';
import { TypeSection } from './design/TypeSection';
import { SpaceSection } from './design/SpaceSection';

type SectionKey = 'colour' | 'type' | 'space';

/**
 * The system this page is running, editable.
 *
 * Fonts and Colors used to be separate tabs, which meant holding the system in
 * your head across two of them; they are one thing seen from two angles, and
 * this is that thing. It also absorbs what the full-tab Studio did, minus the
 * synthetic preview — in an extension the live site is the preview.
 */
export function DesignTab({ scan, tabId }: { scan: ScanResult; tabId: number | null }) {
  // The brand is derived from the scan and then edited in place. A fresh scan
  // discards edits, which is correct: it is a different reading of the page.
  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [mode, setMode] = useState<Mode>('light');
  const [open, setOpen] = useState<Set<SectionKey>>(new Set<SectionKey>(['colour']));
  // On by default: the page is the canvas, so an edit you cannot see is not an
  // edit. Overrides last the session and die with the document.
  const [live, setLive] = useState(true);
  const [result, setResult] = useState<{ vars: number; rules: number } | null>(null);

  // Both hooks run unconditionally — `config ?? useMemo(...)` short-circuits and
  // would make the hook call conditional.
  const seeded = useMemo(() => seedBrandFromScan(scan), [scan]);
  const brand = config ?? seeded;
  const resolved = useMemo(() => resolveTokens(brand), [brand]);
  const baseline = useMemo(() => resolveTokens(seeded), [seeded]);

  // What the page's own variables become under the edited system.
  const overrides = useMemo(
    () => (config ? buildReskin(scan.customProps, baseline, resolved, mode) : []),
    [config, scan.customProps, baseline, resolved, mode],
  );
  // For pages with no variables to override, the colours themselves are the
  // handle: the page's own rules get re-emitted with the new values.
  const colorMap = useMemo(
    () => (config ? buildColorMap(scan.colors, baseline, resolved, mode) : {}),
    [config, scan.colors, baseline, resolved, mode],
  );

  // Push to the page whenever the result changes. Cleared on unmount so leaving
  // the tab does not leave the site repainted behind you.
  const lastSent = useRef<string>('');
  useEffect(() => {
    if (!tabId) return;
    if (!live) {
      if (lastSent.current !== '') {
        lastSent.current = '';
        void clearReskin(tabId).then(() => setResult(null));
      }
      return;
    }
    const key = JSON.stringify([overrides, colorMap]);
    if (key === lastSent.current) return;
    lastSent.current = key;
    void applyReskin(tabId, overrides, colorMap).then(setResult);
  }, [tabId, live, overrides, colorMap]);

  useEffect(() => {
    return () => {
      if (tabId) void clearReskin(tabId);
    };
  }, [tabId]);

  const toggle = (key: SectionKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setSeed = useCallback(
    (role: ScaleRole, seed: string) => {
      setConfig({
        ...brand,
        color: {
          ...brand.color,
          scales: brand.color.scales.map((s) => (s.role === role ? { ...s, seed } : s)),
        },
      });
    },
    [brand],
  );

  const edited = config !== null;
  const failing = resolved.warnings.filter((w) => w.level === 'fail').length;

  return (
    <div className="flex flex-col">
      {/* Where this came from, and the mode the swatches are showing. */}
      <div
        className={`flex items-center gap-2 border-b px-3.5 py-2 text-[11px] ${
          live && edited ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
        }`}
      >
        <button
          onClick={() => setLive((v) => !v)}
          className={`flex h-4 w-7 shrink-0 items-center rounded-full border px-0.5 ${
            live ? 'justify-end border-blue-600 bg-blue-600' : 'justify-start border-gray-400 bg-gray-200'
          }`}
          title={live ? 'Stop applying changes to the page' : 'Apply changes to the page'}
          aria-pressed={live}
        >
          <span className="h-3 w-3 rounded-full bg-white" />
        </button>
        <span className={live && edited ? 'text-blue-700' : 'text-gray-500'}>
          {!edited
            ? 'read from this page'
            : !live
              ? 'edited · page untouched'
              : result === null
              ? 'edited'
              : result.vars + result.rules === 0
                ? "this page's colours can't be reached"
                : result.vars > 0
                  ? `${result.vars} ${result.vars === 1 ? 'variable' : 'variables'} live on the page`
                  : `${result.rules} ${result.rules === 1 ? 'rule' : 'rules'} live on the page`}
        </span>
        {edited && (
          <button
            onClick={() => setConfig(null)}
            className="text-blue-600 hover:underline"
            title="Go back to what the page actually uses"
          >
            revert
          </button>
        )}
        <span className="ml-auto flex items-center gap-1 rounded-md border border-gray-300 p-0.5">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-2 py-0.5 text-[10px] capitalize ${
                mode === m ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {m}
            </button>
          ))}
        </span>
      </div>

      <Section
        title="Colour"
        summary={`${brand.color.scales.length} ramps · ${resolved.semantics.length} tokens${
          failing ? ` · ${failing} to fix` : ''
        }`}
        open={open.has('colour')}
        onToggle={() => toggle('colour')}
      >
        <ColourSection config={brand} resolved={resolved} mode={mode} onSeedChange={setSeed} />
      </Section>

      <Section
        title="Type"
        summary={`${scan.fontUsage[0]?.family ?? 'none'} · ${brand.typography.roles.length} steps`}
        open={open.has('type')}
        onToggle={() => toggle('type')}
      >
        <TypeSection scan={scan} config={brand} />
      </Section>

      <Section
        title="Space & shape"
        summary={`${brand.spacing.basePx}px grid · r${brand.radius.basePx} · ${brand.shadows.levels.length} shadows`}
        open={open.has('space')}
        onToggle={() => toggle('space')}
      >
        <SpaceSection scan={scan} config={brand} resolved={resolved} />
      </Section>
    </div>
  );
}
