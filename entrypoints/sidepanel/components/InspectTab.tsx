import type { PinnedElement } from '@/shared/types';
import { contrastBadge } from '../lib/color';
import { InspectIcon } from './icons';
import { EyeDropperButton } from './EyeDropperButton';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-18 shrink-0 text-sm text-ink-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-2">{children}</span>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-line" style={{ background: color }} />;
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
          className={`flex items-center justify-center gap-2 rounded-card border px-3 py-2.5 font-medium ${
            inspecting
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line-strong text-ink hover:bg-surface-recessed'
          }`}
        >
          <InspectIcon />
          Hover inspect: {inspecting ? 'ON' : 'OFF'}
        </button>
        <p className="text-center text-sm text-ink-muted">
          {inspecting ? 'Hover any element on the page · click to pin it here · Esc to exit' : 'Turn on, then hover the page'}
        </p>
        {error && <p className="text-center text-xs text-warn-ink">{error}</p>}
      </div>

      <div className="border-t border-dashed border-line-subtle pt-3">
        <EyeDropperButton />
      </div>

      {pinned ? (
        <div className="flex flex-col gap-2.5 rounded-card border border-line p-3">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold tracking-wide text-ink-muted">PINNED</span>
            <code className="truncate rounded border border-line bg-surface-recessed px-2 text-sm">{pinned.selector}</code>
            <button onClick={onClear} className="ml-auto text-ink-muted hover:text-ink-secondary" aria-label="Clear pinned element">
              ✕
            </button>
          </div>

          <div className="flex justify-center py-1">
            <div className="relative border border-dashed border-line px-6 py-3.5">
              <span className="absolute left-1 top-0 text-2xs text-ink-muted">margin {pinned.margin}</span>
              <div className="relative border border-line-strong bg-surface-control px-4 py-2.5">
                <span className="absolute left-1 top-0 text-2xs text-ink-muted">pad {pinned.padding}</span>
                <div className="border border-accent px-3 py-1 text-sm text-accent">
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
              <button onClick={() => copy(pinned.color)} className="hover:text-accent" title="Copy">
                {pinned.color}
              </button>
            </Row>
            <Row label="Background">
              <Swatch color={pinned.backgroundColor} />
              <button onClick={() => copy(pinned.backgroundColor)} className="hover:text-accent" title="Copy">
                {pinned.backgroundColor}
              </button>
            </Row>
            <Row label="Radius">{pinned.borderRadius}</Row>
            {pinned.contrastRatio && badge && (
              <Row label="Contrast">
                {pinned.contrastRatio} : 1
                <span
                  className={`rounded-full border px-2 text-2xs ${
                    badge.pass ? 'border-line-strong bg-surface-control text-ink-secondary' : 'border-warn text-warn-ink'
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
              className="flex-1 rounded-control border border-line-strong bg-surface-control py-1.5 text-sm font-medium hover:bg-surface-control"
            >
              Copy CSS
            </button>
            <button
              onClick={() => copy(pinned.selector)}
              className="flex-1 rounded-control border border-line py-1.5 text-sm hover:bg-surface-recessed"
            >
              Copy selector
            </button>
          </div>
        </div>
      ) : (
        <p className="border-t border-dashed border-line-subtle pt-3 text-sm text-ink-muted">
          Pin an element to see its font, colors, box model and contrast here.
        </p>
      )}
    </div>
  );
}
