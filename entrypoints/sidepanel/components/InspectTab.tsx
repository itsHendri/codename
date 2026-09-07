import type { PinnedElement } from '@/shared/types';
import { contrastBadge } from '../lib/color';
import { InspectIcon } from './icons';
import { EyeDropperButton } from './EyeDropperButton';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[74px] shrink-0 text-xs text-gray-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2">{children}</span>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-gray-400" style={{ background: color }} />;
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

export function InspectTab({
  inspecting,
  onToggle,
  pinned,
  onClear,
  error,
}: {
  inspecting: boolean;
  onToggle: () => void;
  pinned: PinnedElement | null;
  onClear: () => void;
  error: string | null;
}) {
  const badge = pinned?.contrastRatio ? contrastBadge(pinned.contrastRatio) : null;
  const cssSnippet = pinned
    ? [
        `${pinned.selector} {`,
        `  font: ${pinned.fontWeight} ${pinned.fontSize}/${pinned.lineHeight} ${pinned.fontFamily};`,
        `  color: ${pinned.color};`,
        `  background-color: ${pinned.backgroundColor};`,
        `  padding: ${pinned.padding};`,
        `  border-radius: ${pinned.borderRadius};`,
        `}`,
      ].join('\n')
    : '';

  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      <div className="flex flex-col gap-1.5">
        <button
          onClick={onToggle}
          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 font-medium ${
            inspecting
              ? 'border-blue-600 bg-blue-50 text-blue-600'
              : 'border-gray-800 text-gray-800 hover:bg-gray-50'
          }`}
        >
          <InspectIcon />
          Hover inspect: {inspecting ? 'ON' : 'OFF'}
        </button>
        <p className="text-center text-xs text-gray-500">
          {inspecting ? 'Hover any element on the page · click to pin it here · Esc to exit' : 'Turn on, then hover the page'}
        </p>
        {error && <p className="text-center text-[11px] text-amber-700">{error}</p>}
      </div>

      <div className="border-t border-dashed border-gray-200 pt-3">
        <EyeDropperButton />
      </div>

      {pinned ? (
        <div className="flex flex-col gap-2.5 rounded-lg border border-gray-300 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400">PINNED</span>
            <code className="truncate rounded border border-gray-300 bg-gray-50 px-2 text-xs">{pinned.selector}</code>
            <button onClick={onClear} className="ml-auto text-gray-400 hover:text-gray-700" aria-label="Clear pinned element">
              ✕
            </button>
          </div>

          <div className="flex justify-center py-1">
            <div className="relative border border-dashed border-gray-400 px-6 py-3.5">
              <span className="absolute left-1 top-0 text-[9px] text-gray-400">margin {pinned.margin}</span>
              <div className="relative border border-gray-700 bg-gray-100 px-4 py-2.5">
                <span className="absolute left-1 top-0 text-[9px] text-gray-400">pad {pinned.padding}</span>
                <div className="border border-blue-600 px-3 py-1 text-xs text-blue-600">
                  {pinned.width} × {pinned.height}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Row label="Font">
              <span className="truncate">
                {(pinned.fontFamily.split(',')[0] ?? '').replace(/["']/g, '')} · {pinned.fontWeight} · {pinned.fontSize}/
                {pinned.lineHeight}
              </span>
            </Row>
            <Row label="Text">
              <Swatch color={pinned.color} />
              <button onClick={() => copy(pinned.color)} className="hover:text-blue-600" title="Copy">
                {pinned.color}
              </button>
            </Row>
            <Row label="Background">
              <Swatch color={pinned.backgroundColor} />
              <button onClick={() => copy(pinned.backgroundColor)} className="hover:text-blue-600" title="Copy">
                {pinned.backgroundColor}
              </button>
            </Row>
            <Row label="Radius">{pinned.borderRadius}</Row>
            {pinned.contrastRatio && badge && (
              <Row label="Contrast">
                {pinned.contrastRatio} : 1
                <span
                  className={`rounded-full border px-2 text-[10px] ${
                    badge.pass ? 'border-gray-700 bg-gray-100 text-gray-700' : 'border-amber-600 text-amber-700'
                  }`}
                >
                  {badge.label}
                </span>
              </Row>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => copy(cssSnippet)}
              className="flex-1 rounded-md border border-gray-800 bg-gray-100 py-1.5 text-xs font-medium hover:bg-gray-200"
            >
              Copy CSS
            </button>
            <button
              onClick={() => copy(pinned.selector)}
              className="flex-1 rounded-md border border-gray-400 py-1.5 text-xs hover:bg-gray-50"
            >
              Copy selector
            </button>
          </div>
        </div>
      ) : (
        <p className="border-t border-dashed border-gray-200 pt-3 text-xs text-gray-400">
          Pin an element to see its font, colors, box model and contrast here.
        </p>
      )}
    </div>
  );
}
