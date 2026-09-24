import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { contrastBadge } from '../lib/color';
import type { InspectController, Scope } from '../lib/inspect';
import { conditionKey, describe as describeCondition, STATES, type MaybeCondition } from '@/studio/conditions';
import { active } from '@/studio/changes';
import type { CommentTarget } from '@/studio/annotations';
import { CheckIcon, CloseIcon, CopyIcon, PlusIcon, RulerIcon } from './icons';
import { describeOrigin } from '@/studio/framework';
import { Breadcrumb } from './inspect/Breadcrumb';
import { PropertyPanel } from './inspect/PropertyPanel';
import { SelectionColours } from './inspect/SelectionColours';
import { CommentComposer } from './inspect/Comments';
import { PageStyles } from './inspect/PageStyles';
import { LayerIcon } from './inspect/LayerIcon';
import { Empty } from './States';
import { setVarOverride } from '../lib/session';
import { ColorField } from './inspect/ColorField';
import type { CustomPropInfo } from '@/shared/types';

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
  onOpenSystem,
}: {
  error: string | null;
  ctl: InspectController;
  scan: ScanResult | null;
  resolved: ResolvedTokens | null;
  mode: Mode;
  /** Whether the rail is showing; when it is not, the empty state offers it. */
  rail: boolean;
  onShowRail: () => void;
  /** The page's own styles, shown when nothing is picked, are edited there. */
  onOpenSystem: () => void;
}) {
  const el = ctl.element;
  // A variable the person chose to edit from a pill: its own field, above
  // the properties, until it is closed. The edit is the same one Variables
  // makes — the page repaints, the token queues for a write.
  const [editing, setEditing] = useState<CustomPropInfo | null>(null);
  useEffect(() => setEditing(null), [el?.selector]);

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

  // The strip holding the selection and its state stays at the top while the
  // column scrolls; the group heads stick just under it, so its height is
  // handed to them as --style-top.
  const top = useRef<HTMLDivElement>(null);
  const [topHeight, setTopHeight] = useState(0);
  useLayoutEffect(() => {
    const node = top.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setTopHeight(node.offsetHeight));
    observer.observe(node);
    setTopHeight(node.offsetHeight);
    return () => observer.disconnect();
  }, [el !== null]);

  if (!el) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <Empty size="inline" title="Nothing selected">
          Click anything on the page, or pick a row in <b className="font-medium text-ink-secondary">Layers</b> beside it.
          <b className="font-medium text-ink-secondary">Preview</b> on the bar lets you use the page instead.
        </Empty>
        {!rail && (
          <button
            onClick={onShowRail}
            className="btn btn-secondary self-start"
          >
            Show layers
          </button>
        )}
        {error && <p className="text-xs text-warn-ink">{error}</p>}
        {scan && <PageStyles scan={scan} onOpenSystem={onOpenSystem} />}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" style={{ '--style-top': `${topHeight}px` } as CSSProperties}>
      <Breadcrumb items={el.breadcrumb} onSelect={ctl.ancestor} />
      <div ref={top} className="sticky top-0 z-20 -mx-3 flex flex-col gap-1.5 bg-surface-app px-3 py-1.5">
        <Selection element={el} ctl={ctl} />
        <ConditionChips ctl={ctl} />
      </div>
      <Scope element={el} ctl={ctl} />
      <ConditionDetail ctl={ctl} />
      <Contrast element={el} />
      {editing && (
        <div className="flex flex-col gap-1 rounded-control bg-surface-panel p-2 shadow-[inset_0_0_0_1px_var(--line-subtle)]" aria-label={`Edit ${editing.name} globally`}>
          <div className="flex items-center gap-2 text-2xs text-ink-muted">
            <code className="min-w-0 flex-1 truncate text-xs text-ink">{editing.name}</code>
            {editing.uses != null && <span>{editing.uses} uses</span>}
            <button onClick={() => setEditing(null)} className="btn btn-sm btn-ghost" aria-label={`Done editing ${editing.name}`}>
              Done
            </button>
          </div>
          <ColorField
            value={(scan?.customProps.find((p) => p.name === editing.name) ?? editing).value}
            ariaLabel={`${editing.name} value`}
            onChange={(v) => setVarOverride(editing.name, v)}
          />
        </div>
      )}
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
        onEditToken={setEditing}
      />
      <SelectionColours ctl={ctl} scan={scan ?? NO_SCAN} resolved={resolved} mode={mode} />
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
    <div className="-mx-3 border-t border-line-subtle px-3 pt-3">
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
          className="flex h-control w-full items-center justify-center gap-1 rounded-control bg-surface-field text-xs text-ink-secondary hover:bg-surface-field-hover hover:text-ink"
        >
          <PlusIcon />
          Note for the agent
        </button>
      )}
    </div>
  );
}

const pill = 'h-5 shrink-0 rounded-control px-1.5 font-mono text-2xs leading-5';
const iconButton =
  'flex h-control w-6 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-field hover:text-ink';

/** What is picked: its kind, the selector edits will target, and the two actions on it. */
function Selection({ element: el, ctl }: { element: ElementProps; ctl: InspectController }) {
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
    <div className="flex items-center gap-1">
      <span className="flex h-control w-5 shrink-0 items-center justify-center">
        <LayerIcon tag={el.tag} className="text-accent" />
      </span>
      <code
        className="h-control min-w-0 flex-1 truncate rounded-control bg-surface-field px-2 font-mono text-xs leading-6 text-ink"
        title={selector}
      >
        {selector}
      </code>
      {many && <span className={`${pill} bg-surface-field text-ink-secondary`}>×{el.intent.matches}</span>}
      {el.component && (
        <span
          className={`${pill} bg-surface-field text-ink-secondary`}
          title={`${describeOrigin(el.component)}. Read from the page's dev build, not guessed from the markup.`}
        >
          {el.component.name}
        </span>
      )}
      {!el.stable && (
        <span className={`${pill} bg-warn-soft font-sans text-warn-ink`} title="Uses :nth-of-type — a reorder breaks it">
          positional
        </span>
      )}
      <button onClick={copy} className={iconButton} aria-label="Copy selector" title={copied ? 'Copied' : 'Copy selector'}>
        {copied ? <CheckIcon className="h-3 w-3 text-accent" /> : <CopyIcon className="h-3 w-3" />}
      </button>
      {/* Distances from the selection to whatever the pointer is over. */}
      <button
        onClick={() => ctl.measure(!ctl.measuring)}
        aria-pressed={ctl.measuring}
        aria-label="Measure"
        title="Measure — distances from this to what the pointer is over"
        className={`${iconButton} ${ctl.measuring ? 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent' : ''}`}
      >
        <RulerIcon />
      </button>
      <button onClick={ctl.clear} className={iconButton} aria-label="Deselect element" title="Deselect">
        <CloseIcon />
      </button>
    </div>
  );
}

/** How far an edit reaches, when there is more than one element it could. */
function Scope({ element: el, ctl }: { element: ElementProps; ctl: InspectController }) {
  const many = el.intent.matches > 1;
  if (!many) return null;
  return (
    <>
      <div className="flex items-center gap-1.5">
        {many && (
          <div role="radiogroup" aria-label="Edit scope" className="flex h-control gap-0.5 rounded-control bg-surface-field p-0.5">
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
                className={`rounded-[4px] px-2 text-xs ${
                  ctl.scope === scope
                    ? 'bg-surface-thumb text-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {many && ctl.scope === 'all' && (
        // Webflow says it as a banner on the canvas: an edit here is not to one thing.
        <p className="text-2xs text-ink-muted">
          Edits reach all {el.intent.matches} elements matching <code className="font-mono">{el.intent.selector}</code>.
        </p>
      )}
      {ctl.also.length > 0 && (
        // Shift-clicked on the page: the values shown are the first one's.
        <p className="text-2xs text-ink-muted">
          {ctl.also.length + 1} selected. Edits reach all of them; the values shown are this one's. Esc on the page lets go of the others.
        </p>
      )}
    </>
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
function ConditionChips({ ctl }: { ctl: InspectController }) {
  // Choosing is all that happens here. Turning the page into the state
  // follows the condition itself, so deselecting puts the page back too.
  const pick = (condition: MaybeCondition) => ctl.setCondition(condition);
  const current = ctl.condition;
  const key = conditionKey(current);
  const widths = ctl.widths;
  // A device name means the page told us nothing and these are a guess; its
  // own breakpoints are named by the width itself.
  const guessed = !widths.some((w) => w.kind === 'width' && w.preset.endsWith('px'));

  const chip = (label: string, active: boolean, onClick: () => void, title?: string) => (
    <button
      key={label}
      role="radio"
      aria-checked={active}
      onClick={onClick}
      title={title}
      className={`min-w-0 flex-1 truncate rounded-[4px] px-1 text-xs capitalize ${
        active
          ? label === 'default'
            ? 'bg-surface-thumb text-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]'
            : 'bg-accent-soft text-accent'
          : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div role="radiogroup" aria-label="State to edit" className="flex h-control items-stretch gap-0.5 rounded-control bg-surface-field p-0.5">
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
        className={`field-select min-w-0 flex-1 rounded-[4px] text-xs ${
          current?.kind === 'width' ? 'bg-accent-soft text-accent' : 'bg-transparent text-ink-muted hover:text-ink'
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
  );
}

/** What the state being edited means, and what the page already says for it. */
function ConditionDetail({ ctl }: { ctl: InspectController }) {
  const current = ctl.condition;
  const ancestors = ctl.cascade.filter((c) => c.onAncestor);
  const own = ctl.cascade.filter((c) => !c.onAncestor);
  return (
    <>
      {current && (
        <div className="rounded-control bg-surface-field px-2 py-1.5">
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
    </>
  );
}

function Contrast({ element }: { element: ElementProps }) {
  if (element.contrastRatio === null) return null;
  const badge = contrastBadge(element.contrastRatio);
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-2">
      <span className="text-xs leading-6 text-ink-muted">Contrast</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs">{element.contrastRatio.toFixed(2)} : 1</span>
        <span
          className={`h-5 rounded-control px-1.5 text-2xs leading-5 ${
            badge.pass ? 'bg-surface-field text-ink-secondary' : 'bg-warn-soft text-warn-ink'
          }`}
        >
          {badge.label}
        </span>
      </span>
    </div>
  );
}
