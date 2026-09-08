import { useState } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { contrastBadge } from '../lib/color';
import type { InspectController } from '../lib/inspect';
import { CopyIcon } from './icons';
import { EyeDropperButton } from './EyeDropperButton';
import { Breadcrumb } from './inspect/Breadcrumb';
import { ChangesList } from './inspect/ChangesList';
import { PropertyPanel } from './inspect/PropertyPanel';
import { CommentComposer, CommentList } from './inspect/Comments';

/** Inspect works before a scan; without one there are simply no token chips. */
const NO_SCAN = { customProps: [], rootFontSize: 16 };

export function InspectTab({
  inspecting,
  onToggle,
  error,
  ctl,
  scan,
  resolved,
  mode,
}: {
  inspecting: boolean;
  onToggle: () => void;
  error: string | null;
  ctl: InspectController;
  scan: ScanResult | null;
  resolved: ResolvedTokens | null;
  mode: Mode;
}) {
  const el = ctl.element;
  const caption = el
    ? '↑↓←→ walk the tree · Esc to deselect'
    : inspecting
      ? 'Hover the page · click to pin an element here · Esc to exit'
      : 'The switch is on the bar across the page';

  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${inspecting ? 'bg-accent' : 'bg-ink-faint'}`} />
          <span className="text-ink-secondary">Inspect {inspecting ? 'on' : 'off'}</span>
          <button onClick={onToggle} className="ml-auto text-xs text-accent hover:underline">
            {inspecting ? 'turn off' : 'turn on'}
          </button>
        </div>
        <p className="text-xs text-ink-muted">{caption}</p>
        {error && <p className="text-xs text-warn-ink">{error}</p>}
      </div>

      <div className="border-t border-dashed border-line-subtle pt-3">
        <EyeDropperButton />
      </div>

      {el ? (
        <div className="flex flex-col gap-2.5 rounded-card border border-line p-3">
          <Breadcrumb items={el.breadcrumb} onSelect={ctl.ancestor} />
          <Header element={el} ctl={ctl} />
          <BoxModel element={el} />
          <Contrast element={el} />
          <PropertyPanel
            element={el}
            scan={scan ?? NO_SCAN}
            resolved={resolved}
            mode={mode}
            onChange={ctl.change}
            onText={ctl.setText}
          />
          <div className="border-t border-dashed border-line-subtle pt-2.5">
            <CommentComposer element={el} onAdd={ctl.addComment} />
          </div>
          {ctl.log.entries.length > 0 && (
            <div className="border-t border-dashed border-line-subtle pt-2.5">
              <ChangesList
                log={ctl.log}
                onUndo={ctl.undo}
                onRedo={ctl.redo}
                onRevert={ctl.revert}
                onViewOriginal={ctl.viewOriginal}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="border-t border-dashed border-line-subtle pt-3 text-sm text-ink-muted">
          Pin an element to see its font, colors, box model and contrast here.
        </p>
      )}

      <CommentList
        comments={ctl.comments}
        focusId={ctl.focusedComment}
        onSelect={ctl.selectComment}
        onStatus={ctl.setCommentStatus}
        onRemove={ctl.removeComment}
      />
    </div>
  );
}

function Header({ element: el, ctl }: { element: ElementProps; ctl: InspectController }) {
  const [copied, setCopied] = useState(false);
  const many = el.intent.matches > 1;
  // What the edits will target: this one element, or everything its class selector matches.
  const selector = ctl.scope === 'all' && many ? el.intent.selector : el.selector;

  const copy = async () => {
    await navigator.clipboard.writeText(selector);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface-recessed px-1.5 font-mono text-xs" title={selector}>
          {selector}
        </code>
        {many && (
          <span className="shrink-0 rounded-full border border-line-strong bg-surface-control px-1.5 font-mono text-2xs text-ink-secondary">
            ×{el.intent.matches}
          </span>
        )}
        {!el.stable && (
          <span className="shrink-0 rounded-full border border-warn px-1.5 text-2xs text-warn-ink" title="Uses :nth-of-type — a reorder breaks it">
            positional
          </span>
        )}
        <button onClick={copy} className="shrink-0 text-ink-muted hover:text-accent" aria-label="Copy selector" title={copied ? 'Copied' : 'Copy selector'}>
          {copied ? <span className="text-2xs text-accent">✓</span> : <CopyIcon />}
        </button>
        <button onClick={ctl.clear} className="shrink-0 text-ink-muted hover:text-ink-secondary" aria-label="Deselect element">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {many && (
          <div role="radiogroup" aria-label="Edit scope" className="flex overflow-hidden rounded-control border border-line text-2xs">
            {(
              [
                ['element', 'this element'],
                ['all', `all ${el.intent.matches}`],
              ] as const
            ).map(([scope, label]) => (
              <button
                key={scope}
                role="radio"
                aria-checked={ctl.scope === scope}
                onClick={() => ctl.setScope(scope)}
                className={`px-2 py-0.5 ${
                  ctl.scope === scope ? 'bg-accent text-accent-ink' : 'text-ink-secondary hover:bg-surface-recessed'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => ctl.measure(!ctl.measuring)}
          aria-pressed={ctl.measuring}
          className={`ml-auto rounded-control border px-2 py-0.5 text-2xs ${
            ctl.measuring ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-secondary hover:bg-surface-recessed'
          }`}
        >
          measure
        </button>
      </div>
    </div>
  );
}

const px = (v: string) => (v === '0px' ? '0' : v.replace(/px$/, ''));

function BoxModel({ element: { box } }: { element: ElementProps }) {
  const edge = 'absolute font-mono text-2xs text-ink-muted';
  return (
    <div className="relative border border-dashed border-line px-8 py-4 text-2xs">
      <span className="absolute left-1 top-0 text-2xs text-ink-faint">margin</span>
      <span className={`${edge} left-1/2 top-0 -translate-x-1/2`}>{px(box.marginTop)}</span>
      <span className={`${edge} bottom-0 left-1/2 -translate-x-1/2`}>{px(box.marginBottom)}</span>
      <span className={`${edge} left-1 top-1/2 -translate-y-1/2`}>{px(box.marginLeft)}</span>
      <span className={`${edge} right-1 top-1/2 -translate-y-1/2`}>{px(box.marginRight)}</span>
      <div className="relative border border-line-strong bg-surface-control px-8 py-4">
        <span className="absolute left-1 top-0 text-2xs text-ink-faint">padding</span>
        <span className={`${edge} left-1/2 top-0 -translate-x-1/2`}>{px(box.paddingTop)}</span>
        <span className={`${edge} bottom-0 left-1/2 -translate-x-1/2`}>{px(box.paddingBottom)}</span>
        <span className={`${edge} left-1 top-1/2 -translate-y-1/2`}>{px(box.paddingLeft)}</span>
        <span className={`${edge} right-1 top-1/2 -translate-y-1/2`}>{px(box.paddingRight)}</span>
        <div className="border border-accent px-2 py-1 text-center font-mono text-sm text-accent" title={`${box.boxSizing} · ${box.display}`}>
          {px(box.width)} × {px(box.height)}
        </div>
      </div>
    </div>
  );
}

function Contrast({ element }: { element: ElementProps }) {
  if (element.contrastRatio === null) return null;
  const badge = contrastBadge(element.contrastRatio);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-14 shrink-0 text-2xs text-ink-muted">contrast</span>
      <span className="font-mono text-xs">{element.contrastRatio.toFixed(2)} : 1</span>
      <span
        className={`rounded-full border px-2 text-2xs ${
          badge.pass ? 'border-line-strong bg-surface-control text-ink-secondary' : 'border-warn text-warn-ink'
        }`}
      >
        {badge.label}
      </span>
    </div>
  );
}
