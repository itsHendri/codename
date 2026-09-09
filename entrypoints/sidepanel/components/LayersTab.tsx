import { useEffect, useState } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { contrastBadge } from '../lib/color';
import type { InspectController, Scope } from '../lib/inspect';
import type { CommentTarget } from '@/studio/annotations';
import { CopyIcon } from './icons';
import { Breadcrumb } from './inspect/Breadcrumb';
import { PropertyPanel } from './inspect/PropertyPanel';
import { CommentComposer } from './inspect/Comments';
import { LayersTree } from './inspect/LayersTree';
import { ComponentsStrip } from './inspect/ComponentsStrip';
import { SplitPane } from './SplitPane';

/** Where the Layers split remembers itself; Reset puts it back. */
export const LAYERS_SPLIT_KEY = 'codename:layersSplit';

/** Selection works before a scan; without one there are simply no token chips. */
const NO_SCAN = { customProps: [], rootFontSize: 16 };

/**
 * The page as layers, and the one you picked.
 *
 * Changes and notes used to live here too, which put the colour of a heading
 * a thousand pixels down the scroll. They belong to the page rather than to
 * the selection, so they moved to their own tab and this one starts with what
 * you came to change. Select mode lives on the bar across the page, and only
 * there: one switch, one place to look for it.
 */
export function LayersTab({
  error,
  ctl,
  scan,
  resolved,
  mode,
}: {
  error: string | null;
  ctl: InspectController;
  scan: ScanResult | null;
  resolved: ResolvedTokens | null;
  mode: Mode;
}) {
  const el = ctl.element;

  // The tree is read when this tab is showing, and again when the page under
  // it changes. `refreshLayers` keeps its identity until the tab id does, so
  // this asks once per page rather than on every render — and it asks again
  // once the tab id arrives, which an empty dependency list would have missed.
  useEffect(() => {
    ctl.refreshLayers();
  }, [ctl.refreshLayers]);

  const layers = (
    <>
      <ComponentsStrip
        nodes={ctl.layers}
        onPick={(component) => {
          ctl.selectLayer(component.nodes[0]!);
          ctl.setScope('all');
        }}
      />
      <LayersTree
      nodes={ctl.layers}
      selectedSelector={el?.selector ?? null}
      onSelect={ctl.selectLayer}
      onPeek={ctl.peekLayer}
      onToggleHidden={ctl.toggleHidden}
      onMove={ctl.move}
      onRefresh={ctl.refreshLayers}
      loading={ctl.layersLoading}
    />
    </>
  );

  if (!el) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <p className="shrink-0 text-xs text-ink-muted">
          Pick a layer below, or turn on <b className="font-medium text-ink-secondary">Select</b> on
          the bar and click the page.
        </p>
        {error && <p className="shrink-0 text-xs text-warn-ink">{error}</p>}
        {layers}
      </div>
    );
  }

  // The tree stays in view above the selection, so the next pick is one
  // click away rather than behind a disclosure. The handle remembers where
  // you left it.
  return (
    <SplitPane
      storageKey={LAYERS_SPLIT_KEY}
      top={<div className="flex min-h-0 flex-1 flex-col px-3 pt-3 pb-2">{layers}</div>}
      bottom={
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
          <Breadcrumb items={el.breadcrumb} onSelect={ctl.ancestor} />
          <Header element={el} ctl={ctl} />
          <Contrast element={el} />
          <PropertyPanel
            element={el}
            scan={scan ?? NO_SCAN}
            resolved={resolved}
            mode={mode}
            onChange={ctl.change}
            onText={ctl.setText}
          />
          <Note element={el} scope={ctl.scope} onAdd={ctl.addComment} />
        </div>
      }
    />
  );
}

/** Folded away until you want it: most selections are edits, not notes. */
function Note({
  element,
  scope,
  onAdd,
}: {
  element: ElementProps;
  scope: Scope;
  onAdd: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wide = scope === 'all' && element.intent.matches > 1;
  const target: CommentTarget = wide
    ? { kind: 'element', selector: element.intent.selector, matches: element.intent.matches }
    : { kind: 'element', selector: element.selector, matches: element.matches };
  return (
    <div className="border-t border-dashed border-line-subtle pt-2.5">
      {open ? (
        <CommentComposer
          target={target}
          onCancel={() => setOpen(false)}
          onAdd={(text) => {
            onAdd(text);
            setOpen(false);
          }}
        />
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-control border border-dashed border-line py-1 text-xs text-ink-muted hover:border-line-strong hover:text-ink-secondary"
        >
          + Note for the agent
        </button>
      )}
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
        <code
          className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface-recessed px-1.5 font-mono text-xs"
          title={selector}
        >
          {selector}
        </code>
        {many && (
          <span className="shrink-0 rounded-full border border-line-strong bg-surface-control px-1.5 font-mono text-2xs text-ink-secondary">
            ×{el.intent.matches}
          </span>
        )}
        {!el.stable && (
          <span
            className="shrink-0 rounded-full border border-warn px-1.5 text-2xs text-warn-ink"
            title="Uses :nth-of-type — a reorder breaks it"
          >
            positional
          </span>
        )}
        <button
          onClick={copy}
          className="shrink-0 text-ink-muted hover:text-accent"
          aria-label="Copy selector"
          title={copied ? 'Copied' : 'Copy selector'}
        >
          {copied ? <span className="text-2xs text-accent">✓</span> : <CopyIcon />}
        </button>
        <button
          onClick={ctl.clear}
          className="shrink-0 text-ink-muted hover:text-ink-secondary"
          aria-label="Deselect element"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {many && (
          <div
            role="radiogroup"
            aria-label="Edit scope"
            className="flex overflow-hidden rounded-control border border-line text-2xs"
          >
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
                  ctl.scope === scope
                    ? 'bg-accent text-accent-ink'
                    : 'text-ink-secondary hover:bg-surface-recessed'
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
            ctl.measuring
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line text-ink-secondary hover:bg-surface-recessed'
          }`}
        >
          measure
        </button>
      </div>
    </div>
  );
}

function Contrast({ element }: { element: ElementProps }) {
  if (element.contrastRatio === null) return null;
  const badge = contrastBadge(element.contrastRatio);
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-ink-muted">contrast</span>
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
