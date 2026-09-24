import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ElementProps, ScanResult } from '@/shared/types';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { suggestTokens } from '@/studio/tokenMatch';
import { modeOf, SIZE_MODES, writeMode, type Axis, type SizeEvidence, type SizeMode } from '@/studio/sizeMode';
import { ColorField } from './ColorField';
import { NumberField } from './NumberField';
import { ShadowField } from './ShadowField';
import { MotionFields } from './MotionFields';
import { blurToCss, parseBlur } from '@/studio/effects';
import { namedEasings, parseTransition, transitionRoundTrips } from '@/studio/motion';
import { TextInput } from './TextInput';
import { TransformFields } from './TransformFields';
import { AnimationFields } from './AnimationFields';
import { parseAnimation } from '@/studio/animation';
import { AlignGrid, Chip, Group, Labelled, LengthField, Segmented, Select, SideLabel, type Change } from './fields';
import { PlusIcon } from '../icons';

type Scan = Pick<ScanResult, 'customProps' | 'rootFontSize'> & { fontUsage?: ScanResult['fontUsage'] };

const ALIGNS = ['left', 'center', 'right', 'justify'] as const;
const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted'] as const;
const DISPLAYS = ['block', 'flex', 'grid', 'inline'] as const;
const DISPLAY_LABELS = { flex: 'stack' } as const;
const OTHER_DISPLAYS = ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'none'] as const;
const DIRECTIONS = ['row', 'column'] as const;
const DIRECTION_LABELS = { row: '→', column: '↓' } as const;
const WRAPS = ['nowrap', 'wrap'] as const;
const WRAP_LABELS = { nowrap: 'no', wrap: 'yes' } as const;
const DISTRIBUTE = ['packed', 'space-between', 'space-around', 'space-evenly'] as const;
const ALIGN_SELF = ['auto', 'flex-start', 'center', 'flex-end', 'stretch', 'baseline'] as const;
const POSITIONS = ['static', 'relative', 'absolute', 'fixed', 'sticky'] as const;
const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;
const WEIGHT_NAMES: Record<(typeof WEIGHTS)[number], string> = {
  '100': 'Thin', '200': 'Extra light', '300': 'Light', '400': 'Regular', '500': 'Medium',
  '600': 'Semibold', '700': 'Bold', '800': 'Extra bold', '900': 'Black',
};
/** A min or max that says nothing: the box is free on that side. */
const FREE = new Set(['0px', '0', 'auto', 'none']);
const OVERFLOWS = ['visible', 'hidden', 'scroll', 'auto'] as const;
const SIZE_LABELS = { fixed: 'fixed', fill: 'fill', fit: 'fit', relative: 'rel' } as const;
const SIZE_TITLES = {
  fixed: 'Fixed: the size it has now, in px',
  fill: 'Fill: take the room the parent gives',
  fit: 'Fit: as big as what is inside',
  relative: 'Relative: a share of the parent, in %',
} as const;

/** Computed values spell the keywords the long way; the controls use the short ones. */
const normalise = (v: string) => (v === 'start' || v === 'normal' ? 'flex-start' : v === 'end' ? 'flex-end' : v);

/**
 * The groups, in the order a design tool lays them out — where the box is,
 * how big, how it lays its children out, its spacing — and then what it
 * looks like. All open: this column holds nothing but the selection now, so
 * there is no long scroll for the colour of a heading to sit at the bottom
 * of, and a folded group is a choice rather than a default.
 */
const GROUPS = ['Position', 'Size', 'Layout', 'Spacing', 'Colour', 'Type', 'Border', 'Effects', 'Motion', 'Text'] as const;

const px = (v: string) => (v === '0px' ? '0' : v.replace(/px$/, ''));
const shorthand = (t: string, r: string, b: string, l: string) =>
  [t, r, b, l].map(px).every((v) => v === px(t)) ? px(t) : [t, r, b, l].map(px).join(' ');

export function PropertyPanel({
  element,
  scan,
  resolved,
  mode,
  onChange,
  onText,
  onPlay,
  playable = false,
  written = {},
}: {
  element: ElementProps;
  scan: Scan;
  resolved: ResolvedTokens | null;
  mode: Mode;
  onChange: Change;
  onText: (text: string) => void;
  /** Run the transition, where a state is being held to run it into. */
  onPlay?: () => void;
  playable?: boolean;
  /** What this panel's own log has written for this element: property → value. */
  written?: Record<string, string>;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(GROUPS));
  const { corners } = element;
  const uneven = new Set([corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]).size > 1;
  // Four fields when the corners differ, or once you ask for them.
  const [perCorner, setPerCorner] = useState(false);
  // Min and max only once one is set, or asked for: Framer keeps them
  // behind "Add", and four fields of nothing are noise.
  const [moreSize, setMoreSize] = useState(false);
  useEffect(() => setMoreSize(false), [element.selector]);
  const toggle = (title: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  // The curves this project already has names for, its own first: an edit
  // should land in source as the token a stylesheet uses, not as the literal.
  const easings = useMemo(
    () => namedEasings(scan.customProps ?? [], resolved?.config.motion.easings ?? {}),
    [scan.customProps, resolved],
  );
  const colour = (v: string, prop: string) => suggestTokens('color', v, scan, resolved ?? undefined, mode, element.authored?.[prop]);
  const length = (v: string, prop: string) => suggestTokens('length', v, scan, resolved ?? undefined, mode, element.authored?.[prop]);
  const { box, type, color, border, layout, position, child } = element;
  const flexOrGrid = /flex|grid/.test(box.display);
  const flex = /flex/.test(box.display);
  const positioned = position.type !== 'static';

  const len = (prop: string, value: string, label: string, aria: string, compact = false) => (
    <LengthField
      key={prop}
      prop={prop}
      value={value}
      label={label}
      aria={aria}
      compact={compact}
      suggest={length}
      onChange={onChange}
    />
  );

  const group = (title: (typeof GROUPS)[number], summary: ReactNode, children: ReactNode) => (
    <Group title={title} summary={summary} open={open.has(title)} onToggle={() => toggle(title)}>
      {children}
    </Group>
  );

  const family = (type.fontFamily.split(',')[0] ?? '').replace(/["']/g, '');

  /** The evidence a size mode is read from, and written against. */
  const evidence = (axis: Axis): SizeEvidence => ({
    axis,
    inFlex: child.inFlex,
    parentDirection: child.parentDirection,
    flexGrow: child.flexGrow,
    written: written[axis],
    writtenFlex: written.flex,
  });
  const sizeMode = (axis: Axis, mode: SizeMode) => {
    const rendered = axis === 'width' ? element.rect.width : element.rect.height;
    const parent = axis === 'width' ? child.parentWidth : child.parentHeight;
    for (const d of writeMode(mode, evidence(axis), rendered, parent)) onChange(d.property, d.value);
  };
  const sizeRow = (axis: Axis, aria: string) => (
    <Labelled label={aria}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
        {len(axis, box[axis], '', aria)}
        <Segmented
          value={modeOf(evidence(axis))}
          options={SIZE_MODES}
          labels={SIZE_LABELS}
          titles={SIZE_TITLES}
          ariaLabel={`${aria} mode`}
          className="w-36"
          onChange={(m) => sizeMode(axis, m)}
        />
      </div>
    </Labelled>
  );

  const overflow = box.overflowX === box.overflowY ? box.overflowX : null;
  const bounded = ![box.minWidth, box.minHeight, box.maxWidth, box.maxHeight].every((v) => FREE.has(v));
  // The fonts this page loads, and the weights each is loaded in: what the
  // family field offers, and how the weight list says which are real here.
  const families = useMemo(() => (scan.fontUsage ?? []).map((f) => f.family), [scan.fontUsage]);
  const loadedWeights = useMemo(() => {
    const usage = (scan.fontUsage ?? []).find((f) => f.family.toLowerCase() === family.toLowerCase());
    return new Set(usage?.variants.map((v) => v.weight) ?? []);
  }, [scan.fontUsage, family]);
  const weightLabels = Object.fromEntries(
    WEIGHTS.map((w) => [w, `${w} · ${WEIGHT_NAMES[w]}${loadedWeights.has(w) ? '' : loadedWeights.size ? ' (not loaded)' : ''}`]),
  ) as Record<(typeof WEIGHTS)[number], string>;
  const distributing = /^space-/.test(layout.justifyContent);
  const gapSplit = box.rowGap !== box.columnGap;

  return (
    <div className="flex flex-col">
      {group(
        'Position',
        `${position.type}${positioned ? ` · ${[position.top, position.right, position.bottom, position.left].map(px).join(' ')}` : ''}${position.zIndex !== 'auto' ? ` · z ${position.zIndex}` : ''}`,
        <>
          <Labelled label="type">
            <Segmented
              value={position.type}
              options={POSITIONS}
              ariaLabel="Position"
              onChange={(v) => onChange('position', v)}
            />
          </Labelled>
          {positioned && (
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5">
              <SideLabel>inset</SideLabel>
              <div className="grid grid-cols-4 gap-1">
                {len('top', position.top, 'T', 'Top', true)}
                {len('right', position.right, 'R', 'Right', true)}
                {len('bottom', position.bottom, 'B', 'Bottom', true)}
                {len('left', position.left, 'L', 'Left', true)}
              </div>
              <SideLabel>z-index</SideLabel>
              <NumberField
                value={position.zIndex}
                ariaLabel="Z-index"
                className="w-24"
                onChange={(v) => onChange('z-index', v)}
              />
            </div>
          )}
        </>,
      )}

      {group(
        'Size',
        `${px(box.width)} × ${px(box.height)}${overflow && overflow !== 'visible' ? ` · ${overflow}` : ''}`,
        <>
          {sizeRow('width', 'Width')}
          {sizeRow('height', 'Height')}
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5">
            {bounded || moreSize ? (
              <>
                <SideLabel>min</SideLabel>
                <div className="grid grid-cols-2 gap-1">
                  {len('min-width', box.minWidth, 'W', 'Min width', true)}
                  {len('min-height', box.minHeight, 'H', 'Min height', true)}
                </div>
                <SideLabel>max</SideLabel>
                <div className="grid grid-cols-2 gap-1">
                  {len('max-width', box.maxWidth, 'W', 'Max width', true)}
                  {len('max-height', box.maxHeight, 'H', 'Max height', true)}
                </div>
              </>
            ) : (
              <>
                <SideLabel>min/max</SideLabel>
                <button
                  onClick={() => setMoreSize(true)}
                  className="flex h-control items-center gap-1 self-start rounded-control px-2 text-xs text-ink-muted hover:bg-surface-field hover:text-ink"
                >
                  <PlusIcon />
                  Add
                </button>
              </>
            )}
            <SideLabel>overflow</SideLabel>
            <Segmented
              value={overflow}
              options={OVERFLOWS}
              ariaLabel="Overflow"
              onChange={(v) => onChange('overflow', v)}
            />
            {overflow === null && (
              <>
                <span />
                <span className="font-mono text-2xs text-ink-muted">
                  {box.overflowX} across, {box.overflowY} down — pick one to set both
                </span>
              </>
            )}
          </div>
        </>,
      )}

      {group(
        'Layout',
        `${box.display}${flex ? ` · ${layout.flexDirection} · ${normalise(layout.justifyContent)} / ${normalise(layout.alignItems)}` : ''}`,
        <>
          <Labelled label="type">
            <Segmented
              value={box.display}
              options={DISPLAYS}
              labels={DISPLAY_LABELS}
              titles={{ flex: 'display: flex' }}
              ariaLabel="Display"
              onChange={(v) => onChange('display', v)}
            />
          </Labelled>
          {!DISPLAYS.includes(box.display as (typeof DISPLAYS)[number]) && (
            <Labelled label="display">
              <Select value={box.display} options={OTHER_DISPLAYS} ariaLabel="Display, all values" onChange={(v) => onChange('display', v)} />
            </Labelled>
          )}
          {flexOrGrid && (
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5">
              {flex && (
                <>
                  <SideLabel>direction</SideLabel>
                  <Segmented
                    value={layout.flexDirection}
                    options={DIRECTIONS}
                    labels={DIRECTION_LABELS}
                    titles={{ row: 'Across', column: 'Down' }}
                    ariaLabel="Flex direction"
                    onChange={(v) => onChange('flex-direction', v)}
                  />
                  <SideLabel>wrap</SideLabel>
                  <Segmented
                    value={layout.flexWrap}
                    options={WRAPS}
                    labels={WRAP_LABELS}
                    ariaLabel="Flex wrap"
                    onChange={(v) => onChange('flex-wrap', v)}
                  />
                </>
              )}
              <SideLabel>align</SideLabel>
              <div className="flex items-start gap-2">
                <AlignGrid
                  justifyContent={layout.justifyContent}
                  alignItems={layout.alignItems}
                  direction={flex ? layout.flexDirection : 'row'}
                  onChange={(v) => {
                    onChange('justify-content', v.justifyContent);
                    onChange('align-items', v.alignItems);
                  }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Select
                    value={distributing ? layout.justifyContent : 'packed'}
                    options={DISTRIBUTE}
                    ariaLabel="Distribute"
                    onChange={(v) => onChange('justify-content', v === 'packed' ? 'flex-start' : v)}
                  />
                  {distributing && (
                    <span className="text-2xs text-ink-muted">Distributed: the grid sets the cross axis only.</span>
                  )}
                </div>
              </div>
              <SideLabel>gap</SideLabel>
              <div className="grid grid-cols-2 gap-1">
                {len('row-gap', box.rowGap, '↕', 'Row gap', true)}
                {len('column-gap', box.columnGap, '↔', 'Column gap', true)}
              </div>
              {gapSplit && (
                <>
                  <span />
                  <span className="font-mono text-2xs text-ink-muted">rows and columns differ</span>
                </>
              )}
            </div>
          )}
          {child.inFlex && (
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 pt-1">
              <SideLabel>in parent</SideLabel>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ['grow', child.flexGrow, 'flex-grow', 'Flex grow'],
                    ['shrink', child.flexShrink, 'flex-shrink', 'Flex shrink'],
                    ['order', child.order, 'order', 'Order'],
                  ] as const
                ).map(([caption, value, prop, aria]) => (
                  <NumberField
                    key={prop}
                    value={value}
                    label={caption}
                    ariaLabel={aria}
                    onChange={(v) => onChange(prop, v)}
                  />
                ))}
              </div>
              <SideLabel>basis</SideLabel>
              <div className="grid grid-cols-2 gap-1">
                {len('flex-basis', child.flexBasis, '', 'Flex basis', true)}
                <Select
                  value={child.alignSelf}
                  options={ALIGN_SELF}
                  ariaLabel="Align self"
                  onChange={(v) => onChange('align-self', v)}
                />
              </div>
            </div>
          )}
        </>,
      )}

      {group(
        'Spacing',
        `pad ${shorthand(box.paddingTop, box.paddingRight, box.paddingBottom, box.paddingLeft)} · margin ${shorthand(box.marginTop, box.marginRight, box.marginBottom, box.marginLeft)}`,
        <BoxModel box={box} onChange={onChange} />,
      )}

      {group(
        'Colour',
        <span className="flex items-center gap-1">
          <Chip color={color.text} />
          <Chip color={color.background} />
          <Chip color={color.border} />
        </span>,
        <>
          <Labelled label="text">
            <ColorField
              value={color.text}
              suggestions={colour(color.text, 'color')}
              ariaLabel="Text colour"
              onChange={(v, t) => onChange('color', v, t)}
            />
          </Labelled>
          <Labelled label="fill">
            <ColorField
              value={color.background}
              suggestions={colour(color.background, 'background-color')}
              ariaLabel="Background colour"
              onChange={(v, t) => onChange('background-color', v, t)}
            />
          </Labelled>
          <Labelled label="border">
            <ColorField
              value={color.border}
              suggestions={colour(color.border, 'border-color')}
              ariaLabel="Border colour"
              onChange={(v, t) => onChange('border-color', v, t)}
            />
          </Labelled>
        </>,
      )}

      {group(
        'Type',
        `${family} · ${px(type.fontSize)}/${px(type.lineHeight)} · ${type.fontWeight}`,
        <>
          <Labelled label="font">
            <TextInput
              value={type.fontFamily}
              ariaLabel="Font family"
              valid={(v) => CSS.supports('font-family', v)}
              onCommit={(v) => onChange('font-family', v)}
              suggestions={families}
            />
          </Labelled>
          <Labelled label="weight">
            <Select
              value={type.fontWeight}
              options={WEIGHTS}
              labels={weightLabels}
              ariaLabel="Font weight"
              onChange={(v) => onChange('font-weight', v)}
            />
          </Labelled>
          <Labelled label="size">
            <div className="grid grid-cols-3 items-start gap-1">
              {len('font-size', type.fontSize, 'Aa', 'Font size', true)}
              {len('line-height', type.lineHeight, '↕', 'Line height', true)}
              {len('letter-spacing', type.letterSpacing, '↔', 'Letter spacing', true)}
            </div>
          </Labelled>
          <Labelled label="align">
            <Segmented
              value={type.textAlign}
              options={ALIGNS}
              ariaLabel="Text align"
              onChange={(v) => onChange('text-align', v)}
            />
          </Labelled>
        </>,
      )}

      {group(
        'Border',
        `r${px(element.radius)} · ${border.style === 'none' ? 'no border' : `${px(border.width)} ${border.style}`}`,
        <>
          <Labelled label="radius">
          <div className="flex items-start gap-1">
            {perCorner || uneven ? (
              <div className="grid flex-1 grid-cols-2 gap-1">
                {len('border-top-left-radius', corners.topLeft, '◜', 'Top-left radius', true)}
                {len('border-top-right-radius', corners.topRight, '◝', 'Top-right radius', true)}
                {len('border-bottom-left-radius', corners.bottomLeft, '◟', 'Bottom-left radius', true)}
                {len('border-bottom-right-radius', corners.bottomRight, '◞', 'Bottom-right radius', true)}
              </div>
            ) : (
              <div className="min-w-0 flex-1">{len('border-radius', element.radius, '◜', 'Border radius')}</div>
            )}
            <button
              onClick={() => setPerCorner((v) => !v)}
              aria-pressed={perCorner || uneven}
              className={`h-control shrink-0 rounded-control px-2 text-xs ${
                perCorner || uneven ? 'bg-surface-field text-ink' : 'text-ink-muted hover:bg-surface-field hover:text-ink'
              }`}
              title={uneven ? 'The corners differ, so they are shown one by one' : undefined}
            >
              {perCorner || uneven ? 'one radius' : 'each corner'}
            </button>
          </div>
          </Labelled>
          <Labelled label="width">
            <div className="w-1/2 pr-0.5">{len('border-width', border.width, '▭', 'Border width')}</div>
          </Labelled>
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5">
            <SideLabel>style</SideLabel>
            <select
              value={
                BORDER_STYLES.includes(border.style as (typeof BORDER_STYLES)[number]) ? border.style : 'none'
              }
              onChange={(e) => onChange('border-style', e.target.value)}
              aria-label="Border style"
              className="field field-select min-w-0"
            >
              {BORDER_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <SideLabel>colour</SideLabel>
            <ColorField
              value={border.color}
              suggestions={colour(border.color, 'border-color')}
              ariaLabel="Border colour"
              onChange={(v, t) => onChange('border-color', v, t)}
            />
          </div>
        </>,
      )}

      {group(
        'Effects',
        `${element.opacity === '1' ? '' : `opacity ${element.opacity} · `}${element.shadow === 'none' ? 'no shadow' : 'shadow'}${
          parseBlur(element.filter) && parseBlur(element.filter) !== '0px' ? ` · blur ${parseBlur(element.filter)}` : ''
        }`,
        <>
          <Labelled label="opacity">
            <div className="flex items-center gap-2">
              <NumberField
                value={element.opacity}
                ariaLabel="Opacity"
                step={0.1}
                className="w-20"
                onChange={(v) => {
                  const n = parseFloat(v);
                  if (Number.isFinite(n)) onChange('opacity', String(Math.min(1, Math.max(0, n))));
                }}
              />
              <OpacitySlider value={element.opacity} onChange={(v) => onChange('opacity', v)} />
            </div>
          </Labelled>
          <Labelled label="shadow">
            <ShadowField
              value={element.shadow}
              suggestions={suggestTokens('shadow', element.shadow, scan, resolved ?? undefined, mode)}
              onChange={(v, t) => onChange('box-shadow', v, t)}
            />
          </Labelled>
          <Labelled label="transform">
            <TransformFields value={element.transform} onChange={(v) => onChange('transform', v)} />
          </Labelled>
          <BlurRow label="blur" value={element.filter} onChange={(v) => onChange('filter', v)} />
          {/* Behind the element rather than on it: the frosted-glass one. */}
          <BlurRow label="backdrop" value={element.backdropFilter} onChange={(v) => onChange('backdrop-filter', v)} />
        </>,
      )}

      {group(
        'Motion',
        `${describeMotion(element.transition)}${(parseAnimation(element.animation) ?? []).length ? ` · ${(parseAnimation(element.animation) ?? [])[0]!.name}` : ''}`,
        <>
          <Labelled label="transition">
            <MotionFields
              value={element.transition}
              easings={easings}
              onChange={(v) => onChange('transition', v)}
              onPlay={onPlay}
              playable={playable}
            />
          </Labelled>
          <Labelled label="animate">
            <AnimationFields
              value={element.animation}
              timeline={element.animationTimeline}
              keyframes={element.keyframes}
              easings={easings}
              onChange={onChange}
            />
          </Labelled>
        </>,
      )}

      {element.text !== null &&
        group(
          'Text',
          <span className="truncate">{element.text.trim().slice(0, 24) || 'empty'}</span>,
          <TextArea value={element.text} onCommit={onText} />,
        )}
    </div>
  );
}

type Link = 'each' | 'pairs' | 'all';
const LINKS: readonly Link[] = ['each', 'pairs', 'all'];
const LINK_TITLES = {
  each: 'Each side on its own',
  pairs: 'Top with bottom, left with right',
  all: 'All four sides together',
} as const;

/**
 * The box model, as a diagram you type into. Every number is a field:
 * click it, type, nudge with the arrows (⇧ ×10, ⌥ ×0.1). The link beside it
 * says how far an edit reaches — one side, its opposite too, or all four —
 * which is the control Framer and Figma keep next to their padding.
 */
function BoxModel({ box, onChange }: { box: ElementProps['box']; onChange: Change }) {
  const [link, setLink] = useState<Link>('each');
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const;
  const set = (kind: 'margin' | 'padding', side: (typeof sides)[number], value: string) => {
    const reach = link === 'all' ? sides : link === 'pairs' ? [side, opposite[side]] : [side];
    for (const s of reach) onChange(`${kind}-${s}`, value);
  };
  const field = (kind: 'margin' | 'padding', side: (typeof sides)[number], value: string, className: string) => (
    <NumberField
      bare
      value={value}
      ariaLabel={`${kind[0]!.toUpperCase()}${kind.slice(1)} ${side}`}
      className={`absolute ${className}`}
      onChange={(v) => set(kind, side, v)}
    />
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative rounded-control border border-dashed border-line-strong px-10 py-5 text-2xs">
        <span className="absolute left-1.5 top-1 text-2xs text-ink-muted">Margin</span>
        {field('margin', 'top', box.marginTop, 'left-1/2 top-0.5 -translate-x-1/2')}
        {field('margin', 'bottom', box.marginBottom, 'bottom-0.5 left-1/2 -translate-x-1/2')}
        {field('margin', 'left', box.marginLeft, 'left-1 top-1/2 -translate-y-1/2')}
        {field('margin', 'right', box.marginRight, 'right-1 top-1/2 -translate-y-1/2')}
        <div className="relative rounded-[5px] bg-surface-field px-10 py-5">
          <span className="absolute left-1.5 top-1 text-2xs text-ink-muted">Padding</span>
          {field('padding', 'top', box.paddingTop, 'left-1/2 top-0.5 -translate-x-1/2')}
          {field('padding', 'bottom', box.paddingBottom, 'bottom-0.5 left-1/2 -translate-x-1/2')}
          {field('padding', 'left', box.paddingLeft, 'left-1 top-1/2 -translate-y-1/2')}
          {field('padding', 'right', box.paddingRight, 'right-1 top-1/2 -translate-y-1/2')}
          <div
            className="rounded-[4px] bg-surface-thumb px-2 py-1 text-center font-mono text-xs text-ink"
            title={`${box.boxSizing} · ${box.display}`}
          >
            {px(box.width)} × {px(box.height)}
          </div>
        </div>
      </div>
      <Labelled label="edit">
        <Segmented value={link} options={LINKS} titles={LINK_TITLES} ariaLabel="Sides an edit reaches" onChange={setLink} />
      </Labelled>
    </div>
  );
}

/**
 * Framer's slider beside the number. It keeps its own draft while it is
 * dragged: the value it is given comes back only once the page has
 * repainted and been read again, and a controlled range fed that late
 * snaps back between ticks.
 */
function OpacitySlider({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const n = parseFloat(draft);
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={Number.isFinite(n) ? n : 1}
      aria-label="Opacity slider"
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      className="min-w-0 flex-1 accent-accent"
    />
  );
}

function TextArea({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
      }}
      rows={3}
      aria-label="Element text"
      className="field w-full resize-y px-2 py-1.5 text-xs"
    />
  );
}

/**
 * A blur radius, with the text left alone when the filter is a pipeline.
 *
 * A `filter` can hold a chain of functions, and rewriting one station of it
 * from a single number would drop the rest — so where this cannot read the
 * value as one blur it says so and changes nothing.
 */
function BlurRow({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  const radius = parseBlur(value);
  return (
    <Labelled label={label}>
      {radius === null ? (
        <span className="truncate font-mono text-2xs text-ink-muted" title={value}>
          {value} — more than a blur, so it is left as it is
        </span>
      ) : (
        <NumberField
          value={radius}
          ariaLabel={`${label} radius`}
          className="w-20"
          onChange={(v) => onChange(blurToCss(v))}
        />
      )}
    </Labelled>
  );
}

/** What the Motion summary says when the group is folded. */
function describeMotion(transition: string): string {
  if (!transitionRoundTrips(transition)) return 'set in this page\'s own words';
  const entries = parseTransition(transition) ?? [];
  if (!entries.length) return 'nothing moves';
  const first = entries[0]!;
  const more = entries.length > 1 ? ` +${entries.length - 1}` : '';
  return `${first.property} ${first.durationMs}ms${more}`;
}
