import { useMemo, useState } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { contrastBadge } from '../lib/color';
import type { InspectController, Scope } from '../lib/inspect';
import { conditionKey, describe as describeCondition, STATES, type MaybeCondition } from '@/studio/conditions';
import { active } from '@/studio/changes';
import type { CommentTarget } from '@/studio/annotations';
import { CopyIcon } from './icons';
import { describeOrigin } from '@/studio/framework';
import { Breadcrumb } from './inspect/Breadcrumb';
import { PropertyPanel } from './inspect/PropertyPanel';
import { CommentComposer } from './inspect/Comments';

/** Selection works before a scan; without one there are simply no token chips. */
const NO_SCAN = { customProps: [], rootFontSize: 16 };

/**
 * The one you picked, and everything about it.
 *
 * The tree used to sit above this in a split; it lives in the rail now, in
 * the page on the left, where every design tool keeps it. This column is the
 * styles on the right: what the element is, the state being edited, and its
 * properties in the order a design tool lays them out.
 */
export function StyleTab({
  error,
  ctl,
  scan,
  resolved,
  mode,
  rail,
  onShowRail,
}: {
  error: string | null;
  ctl: InspectController;
  scan: ScanResult | null;
  resolved: ResolvedTokens | null;
  mode: Mode;
  /** Whether the rail is showing; when it is not, the empty state offers it. */
  rail: boolean;
  onShowRail: () => void;
}) {
  const el = ctl.element;

  // What this log has written for the selection in the state being edited,
  // so a size mode can be read back from the panel's own words rather than
  // guessed from a computed pixel count.
  const written = useMemo(() => {
    const out: Record<string, string> = {};
    if (!el) return out;
    const key = conditionKey(ctl.condition);
    for (const e of active(ctl.log)) {
      if (e.selector !== el.selector && e.selector !== el.intent.selector) continue;
      if (conditionKey(e.condition) !== key) continue;
      out[e.property] = e.to;
    }
    return out;
  }, [el, ctl.log, ctl.condition]);

  if (!el) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <p className="text-xs text-ink-muted">
          Nothing selected. Turn on <b className="font-medium text-ink-secondary">Select</b> on the bar and click the
          page, or pick a row in <b className="font-medium text-ink-secondary">Layers</b> beside it.
        </p>
        {!rail && (
          <button
            onClick={onShowRail}
            className="self-start rounded-control border border-line px-2.5 py-1 text-xs text-ink-secondary hover:bg-surface-recessed"
          >
            Show layers
          </button>
        )}
        {error && <p className="text-xs text-warn-ink">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
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
        onPlay={ctl.playCondition}
        playable={ctl.condition?.kind === 'state'}
        written={written}
      />
      <Note element={el} scope={ctl.scope} onAdd={ctl.addComment} />
    </div>
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
        {el.component && (
          <span
            className="shrink-0 rounded-full border border-line-strong bg-surface-control px-1.5 font-mono text-2xs text-ink-secondary"
            title={`${describeOrigin(el.component)}. Read from the page's dev build, not guessed from the markup.`}
          >
            {el.component.name}
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
      <ConditionBar ctl={ctl} />
    </div>
  );
}

/**
 * Which state the next edit is about.
 *
 * The states are held on the page by a class, so the element paints as it
 * would under the pointer and the values read back belong to that state.
 * Dark and the widths are shown by machinery that already exists — the bar's
 * own Light/Dark switch and its viewport presets — so picking one here asks
 * for that too, and the page follows.
 *
 * Not reorderable: the order is default, then width, then dark, then state,
 * and it is fixed because the page's own rules sit underneath ours. An order
 * someone chose here would be a promise this cannot keep.
 */
function ConditionBar({ ctl }: { ctl: InspectController }) {
  // Choosing is all that happens here. Turning the page into the state
  // follows the condition itself, so deselecting puts the page back too.
  const pick = (condition: MaybeCondition) => ctl.setCondition(condition);
  const current = ctl.condition;
  const key = conditionKey(current);
  const widths = ctl.widths;
  // A device name means the page told us nothing and these are a guess; its
  // own breakpoints are named by the width itself.
  const guessed = !widths.some((w) => w.kind === 'width' && w.preset.endsWith('px'));
  const ancestors = ctl.cascade.filter((c) => c.onAncestor);
  const own = ctl.cascade.filter((c) => !c.onAncestor);

  const chip = (label: string, active: boolean, onClick: () => void, title?: string) => (
    <button
      key={label}
      role="radio"
      aria-checked={active}
      onClick={onClick}
      title={title}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs ${
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-secondary hover:bg-surface-recessed'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-1">
      <div role="radiogroup" aria-label="State to edit" className="flex flex-wrap items-center gap-1">
        {chip('default', !current, () => pick(undefined))}
        {STATES.map((state) => chip(state, key === `state:${state}`, () => pick({ kind: 'state', state })))}
        {chip('dark', key === 'scheme:dark', () => pick({ kind: 'scheme', scheme: 'dark' }), "Edits the page under its own dark mode")}
        {/* One control rather than five chips: a 360px panel has better uses
            for the room, and the widths are a list of one kind of thing. */}
        <select
          value={current?.kind === 'width' ? conditionKey(current) : ''}
          onChange={(e) => pick(widths.find((w) => conditionKey(w) === e.target.value))}
          aria-label="Width to edit at"
          title={
            guessed
              ? 'This page declares no width queries, so these are the bar\'s device presets'
              : "The widths this page's own stylesheets are written against"
          }
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-2xs ${
            current?.kind === 'width'
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line bg-transparent text-ink-secondary hover:bg-surface-recessed'
          }`}
        >
          <option value="">width…</option>
          {widths.map((w) =>
            w.kind === 'width' ? (
              <option key={conditionKey(w)} value={conditionKey(w)}>
                {describeCondition(w)}
                {guessed ? ` · ${w.preset}` : ''}
              </option>
            ) : null,
          )}
        </select>
      </div>
      {current && (
        <div className="rounded-control border border-line-subtle px-2 py-1">
          {/* What the person is doing, before what the page already does:
              every value below this line belongs to the state, not to the
              element as it ordinarily sits there. */}
          <div className="text-2xs text-ink-secondary">
            Editing <span className="text-accent">{describeCondition(current)}</span> — the values below are what this
            element paints{' '}
            {current.kind === 'state'
              ? `on ${current.state}`
              : current.kind === 'scheme'
                ? 'in dark mode'
                : `at ${current.px}px and ${current.dir === 'max' ? 'under' : 'over'}`}
            .
          </div>
          {current.kind === 'state' && (
            <>
              <div className="mt-1 text-2xs text-ink-muted">
                {own.length ? "This page's own rules for it:" : `This page adds nothing on ${current.state}.`}
              </div>
              {own.map((rule, i) => (
                <div key={`${rule.selector}-${i}`} className="mt-0.5 truncate font-mono text-2xs text-ink-secondary" title={rule.cssText}>
                  {rule.cssText}
                </div>
              ))}
              {ancestors.length > 0 && (
                <div className="mt-1 text-2xs text-ink-muted">
                  {ancestors.length} rule{ancestors.length === 1 ? '' : 's'} here style this element when an ancestor is{' '}
                  {current.state}ed. That cannot be previewed by holding this one.
                </div>
              )}
            </>
          )}
        </div>
      )}
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
