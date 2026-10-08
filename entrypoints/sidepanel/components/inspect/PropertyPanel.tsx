import { useEffect, useMemo, useState } from 'react';
import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconArrowDown,
  IconArrowRight,
  IconArrowsMaximize,
  IconBackground,
  IconBorderCorners,
  IconBorderSides,
  IconLetterH,
  IconLetterSpacing,
  IconLetterW,
  IconLineHeight,
  IconRadiusBottomLeft,
  IconRadiusBottomRight,
  IconRadiusTopLeft,
  IconRadiusTopRight,
  IconSpacingHorizontal,
  IconSpacingVertical,
  IconStack2,
  IconTextSize,
} from '@tabler/icons-react';
import type { CustomPropInfo, ElementProps, ScanResult } from '@/shared/types';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { suggestTokens } from '@/studio/tokenMatch';
import { modeOf, SIZE_MODES, writeMode, type Axis, type SizeEvidence, type SizeMode } from '@/studio/sizeMode';
import { ColorField } from './ColorField';
import { NumberField } from './NumberField';
import { ShadowField } from './ShadowField';
import { MotionFields } from './MotionFields';
import { blurToCss, parseBlur } from '@/studio/effects';
import { namedEasings } from '@/studio/motion';
import { presence, removals, STARTS, type Optional } from '@/studio/inspect/presence';
import { FontFamilyField } from './FontFamilyField';
import { TransformFields } from './TransformFields';
import { AnimationFields } from './AnimationFields';
import { TypeStyleRow } from './TypeStyleRow';
import { AddRemove, AlignGrid, Field, IconButton, LengthField, Section, Segmented, Select, SubHead, type Change } from './fields';

type Scan = Pick<ScanResult, 'customProps' | 'rootFontSize'> & { fontUsage?: ScanResult['fontUsage']; typeStyles?: ScanResult['typeStyles'] };

const ALIGNS = ['left', 'center', 'right', 'justify'] as const;
const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted'] as const;
const DISPLAYS = ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'inline-grid', 'contents', 'none'] as const;
const DISPLAY_LABELS = {
  block: 'Block', flex: 'Stack', grid: 'Grid', inline: 'Inline', 'inline-block': 'Inline block',
  'inline-flex': 'Inline stack', 'inline-grid': 'Inline grid', contents: 'Contents', none: 'Hidden',
} as const;
const POSITION_LABELS = { static: 'Static', relative: 'Relative', absolute: 'Absolute', fixed: 'Fixed', sticky: 'Sticky' } as const;
const DIRECTIONS = ['row', 'column'] as const;
const WRAPS = ['nowrap', 'wrap'] as const;
const WRAP_LABELS = { nowrap: 'No wrap', wrap: 'Wrap' } as const;
const DISTRIBUTE = ['packed', 'space-between', 'space-around', 'space-evenly'] as const;
const DISTRIBUTE_LABELS = { packed: 'Keep grouped', 'space-between': 'Spread between', 'space-around': 'Spread around', 'space-evenly': 'Spread evenly' } as const;
const OVERFLOW_LABELS = { visible: 'Visible', hidden: 'Clip', scroll: 'Scroll', auto: 'Auto' } as const;
const BORDER_STYLE_LABELS = { none: 'None', solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' } as const;
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

/**
 * The sections, in Nudge's order (W54): the box (layout and size), its
 * spacing, how it looks (opacity, corners), its type and colour, then the
 * properties an element may not have at all, each folded to a + until it
 * does: background, border, shadow, effects, motion. Content last.
 */
export const SECTIONS = ['Layout', 'Spacing', 'Appearance', 'Text', 'Colour', 'Background', 'Border', 'Box shadow', 'Effects', 'Motion', 'Content'] as const;

const px = (v: string) => (v === '0px' ? '0' : v.replace(/px$/, ''));
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
  onEditToken,
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
  /** Edit a variable the selection is on, for every place that uses it. */
  onEditToken?: (token: CustomPropInfo) => void;
}) {
  const { corners, box, type, color, border, layout, position, child } = element;
  const uneven = new Set([corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]).size > 1;
  // Four fields when the corners differ, or once you ask for them; the same
  // for padding and margin sides, and for min and max (Nudge's ⛶ toggles).
  const [perCorner, setPerCorner] = useState(false);
  const [moreSize, setMoreSize] = useState(false);
  const [fourSides, setFourSides] = useState<{ padding: boolean; margin: boolean }>({ padding: false, margin: false });
  // Sections opened with + that have nothing written yet: open until the selection moves.
  const [opened, setOpened] = useState<Set<Optional>>(new Set());
  useEffect(() => {
    setMoreSize(false);
    setPerCorner(false);
    setFourSides({ padding: false, margin: false });
    setOpened(new Set());
  }, [element.selector]);

  const has = presence(element, written);
  const shown = (k: Optional) => has[k] || opened.has(k);
  const add = (k: Optional) => {
    setOpened((prev) => new Set(prev).add(k));
    for (const [p, v] of STARTS[k] ?? []) onChange(p, v);
  };
  const remove = (k: Optional) => {
    setOpened((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
    for (const [p, v] of removals(element, k)) onChange(p, v);
  };
  const addRemove = (k: Optional, what: string) => (
    <AddRemove what={what} present={shown(k)} onAdd={() => add(k)} onRemove={() => remove(k)} />
  );

  // The curves this project already has names for, its own first: an edit
  // should land in source as the token a stylesheet uses, not as the literal.
  const easings = useMemo(
    () => namedEasings(scan.customProps ?? [], resolved?.config.motion.easings ?? {}),
    [scan.customProps, resolved],
  );
  const colour = (v: string, prop: string) => suggestTokens('color', v, scan, resolved ?? undefined, mode, element.authored?.[prop]);
  const length = (v: string, prop: string) => suggestTokens('length', v, scan, resolved ?? undefined, mode, element.authored?.[prop]);
  const flexOrGrid = /flex|grid/.test(box.display);
  const flex = /flex/.test(box.display);
  const positioned = position.type !== 'static';

  const len = (prop: string, value: string, label: string, aria: string, icon?: React.ReactNode) => (
    <LengthField key={prop} prop={prop} value={value} label={label} icon={icon} aria={aria} compact suggest={length} onChange={onChange} />
  );
  const colourField = (prop: string, value: string, aria: string) => (
    <ColorField
      value={value}
      suggestions={colour(value, prop)}
      ariaLabel={aria}
      authored={element.authored?.[prop]}
      tokens={scan.customProps}
      rootFontSize={scan.rootFontSize}
      onEditGlobally={onEditToken}
      onChange={(v, t, o) => onChange(prop, v, t, o)}
    />
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
  const sizeMode = (axis: Axis, m: SizeMode) => {
    const rendered = axis === 'width' ? element.rect.width : element.rect.height;
    const parent = axis === 'width' ? child.parentWidth : child.parentHeight;
    for (const d of writeMode(m, evidence(axis), rendered, parent)) onChange(d.property, d.value);
  };
  const sizeRow = (axis: Axis, aria: string, icon: React.ReactNode) => (
    <Field label={aria}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        {len(axis, box[axis], '', aria, icon)}
        <Segmented
          value={modeOf(evidence(axis))}
          options={SIZE_MODES}
          labels={SIZE_LABELS}
          titles={SIZE_TITLES}
          ariaLabel={`${aria} mode`}
          className="w-40"
          onChange={(m) => sizeMode(axis, m)}
        />
      </div>
    </Field>
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
  const weightLabels = Object.fromEntries(WEIGHTS.map((w) => [w, `${WEIGHT_NAMES[w]} · ${w}`])) as Record<(typeof WEIGHTS)[number], string>;
  const weightNotes = Object.fromEntries(
    WEIGHTS.filter((w) => loadedWeights.size > 0 && !loadedWeights.has(w)).map((w) => [w, 'not loaded']),
  ) as Partial<Record<(typeof WEIGHTS)[number], string>>;
  const distributing = /^space-/.test(layout.justifyContent);

  /** Padding or margin: two paired fields (across, down), or four with the toggle. */
  const sides = (kind: 'padding' | 'margin', label: string) => {
    const v = {
      top: box[`${kind}Top`],
      right: box[`${kind}Right`],
      bottom: box[`${kind}Bottom`],
      left: box[`${kind}Left`],
    };
    const cap = `${kind[0]!.toUpperCase()}${kind.slice(1)}`;
    const four = fourSides[kind] || v.left !== v.right || v.top !== v.bottom;
    const pair = (a: 'left' | 'top', b: 'right' | 'bottom', aria: string, icon: React.ReactNode) => (
      <NumberField
        value={v[a] === v[b] ? v[a] : 'Mixed'}
        icon={icon}
        property={`${kind}-${a}`}
        ariaLabel={aria}
        onChange={(next) => {
          onChange(`${kind}-${a}`, next);
          onChange(`${kind}-${b}`, next);
        }}
      />
    );
    const one = (side: 'top' | 'right' | 'bottom' | 'left', letter: string) => (
      <NumberField
        key={side}
        value={v[side]}
        label={letter}
        property={`${kind}-${side}`}
        ariaLabel={`${cap} ${side}`}
        onChange={(next) => onChange(`${kind}-${side}`, next)}
      />
    );
    return (
      <div className="flex flex-col gap-2">
        <SubHead
          label={label}
          action={
            shown(kind) ? (
              <>
                <IconButton
                  label={four ? `${cap}: across and down` : `${cap}: each side`}
                  pressed={four}
                  onClick={() => setFourSides((s) => ({ ...s, [kind]: !four }))}
                >
                  <IconBorderSides stroke={1.5} />
                </IconButton>
                {addRemove(kind, kind)}
              </>
            ) : (
              addRemove(kind, kind)
            )
          }
        />
        {shown(kind) &&
          (four ? (
            <div className="grid grid-cols-2 gap-2">
              {one('top', 'T')}
              {one('right', 'R')}
              {one('bottom', 'B')}
              {one('left', 'L')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {pair('left', 'right', `${cap} across`, <IconSpacingHorizontal stroke={1.5} />)}
              {pair('top', 'bottom', `${cap} down`, <IconSpacingVertical stroke={1.5} />)}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      <Section
        title="Layout"
        action={
          <IconButton label={moreSize || bounded ? 'Hide min and max' : 'Min and max'} pressed={moreSize || bounded} onClick={() => setMoreSize((v) => !v)}>
            <IconArrowsMaximize stroke={1.5} />
          </IconButton>
        }
      >
        {sizeRow('width', 'Width', <IconLetterW stroke={1.5} />)}
        {sizeRow('height', 'Height', <IconLetterH stroke={1.5} />)}
        {(bounded || moreSize) && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min width">{len('min-width', box.minWidth, 'W', 'Min width')}</Field>
            <Field label="Min height">{len('min-height', box.minHeight, 'H', 'Min height')}</Field>
            <Field label="Max width">{len('max-width', box.maxWidth, 'W', 'Max width')}</Field>
            <Field label="Max height">{len('max-height', box.maxHeight, 'H', 'Max height')}</Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Display">
            <Select value={box.display} options={DISPLAYS} labels={DISPLAY_LABELS} ariaLabel="Display" onChange={(v) => onChange('display', v)} />
          </Field>
          <Field label="Position">
            <Select value={position.type} options={POSITIONS} labels={POSITION_LABELS} ariaLabel="Position" onChange={(v) => onChange('position', v)} />
          </Field>
        </div>
        {positioned && (
          <div className="grid grid-cols-2 gap-2">
            {len('top', position.top, 'T', 'Top')}
            {len('right', position.right, 'R', 'Right')}
            {len('bottom', position.bottom, 'B', 'Bottom')}
            {len('left', position.left, 'L', 'Left')}
            <NumberField value={position.zIndex} icon={<IconStack2 stroke={1.5} />} property="z-index" ariaLabel="Z-index" onChange={(v) => onChange('z-index', v)} />
          </div>
        )}
        <Field label="Overflow">
          <Select value={overflow ?? `${box.overflowX} / ${box.overflowY}`} options={OVERFLOWS} labels={OVERFLOW_LABELS} ariaLabel="Overflow" onChange={(v) => onChange('overflow', v)} />
        </Field>

        {flexOrGrid && (
          <div className="mt-1 flex flex-col gap-2 border-t border-line pt-2.5">
            <SubHead label={flex ? 'Stack' : 'Grid'} />
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
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {flex && (
                  <div className="flex gap-2">
                    <Segmented
                      value={layout.flexDirection}
                      options={DIRECTIONS}
                      labels={{ row: <IconArrowRight stroke={1.5} />, column: <IconArrowDown stroke={1.5} /> }}
                      titles={{ row: 'Across', column: 'Down' }}
                      ariaLabel="Flex direction"
                      className="flex-1"
                      onChange={(v) => onChange('flex-direction', v)}
                    />
                    <Select value={layout.flexWrap} options={WRAPS} labels={WRAP_LABELS} ariaLabel="Flex wrap" className="flex-1" onChange={(v) => onChange('flex-wrap', v)} />
                  </div>
                )}
                <Select
                  value={distributing ? layout.justifyContent : 'packed'}
                  options={DISTRIBUTE}
                  labels={DISTRIBUTE_LABELS}
                  ariaLabel="Distribute"
                  onChange={(v) => onChange('justify-content', v === 'packed' ? 'flex-start' : v)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {len('column-gap', box.columnGap, '', 'Column gap', <IconSpacingHorizontal stroke={1.5} />)}
              {len('row-gap', box.rowGap, '', 'Row gap', <IconSpacingVertical stroke={1.5} />)}
            </div>
            {distributing && <span className="text-2xs text-ink-muted">Spread: the grid sets the cross axis only.</span>}
          </div>
        )}

        {child.inFlex && (
          <div className="mt-1 flex flex-col gap-2 border-t border-line pt-2.5">
            <SubHead label="In its stack" />
            <div className="grid grid-cols-3 gap-2">
              <Field label="Grow">
                <NumberField value={child.flexGrow} ariaLabel="Flex grow" property="flex-grow" label="G" onChange={(v) => onChange('flex-grow', v)} />
              </Field>
              <Field label="Shrink">
                <NumberField value={child.flexShrink} ariaLabel="Flex shrink" property="flex-shrink" label="S" onChange={(v) => onChange('flex-shrink', v)} />
              </Field>
              <Field label="Basis">{len('flex-basis', child.flexBasis, 'B', 'Flex basis')}</Field>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
              <Field label="Align self">
                <Select value={child.alignSelf} options={ALIGN_SELF} ariaLabel="Align self" onChange={(v) => onChange('align-self', v)} />
              </Field>
              <Field label="Order">
                <NumberField value={child.order} ariaLabel="Order" property="order" label="#" onChange={(v) => onChange('order', v)} />
              </Field>
            </div>
          </div>
        )}
      </Section>

      <Section title="Spacing">
        {sides('padding', 'Padding')}
        {sides('margin', 'Margin')}
      </Section>

      <Section
        title="Appearance"
        action={
          <IconButton label={perCorner || uneven ? 'One radius' : 'Each corner'} pressed={perCorner || uneven} onClick={() => setPerCorner((v) => !v)}>
            <IconBorderCorners stroke={1.5} />
          </IconButton>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Opacity">
            <NumberField
              value={`${Math.round(parseFloat(element.opacity) * 1000) / 10}%`}
              icon={<IconBackground stroke={1.5} />}
              property="opacity"
              ariaLabel="Opacity"
              onChange={(v) => {
                const n = parseFloat(v);
                if (Number.isFinite(n)) onChange('opacity', String(Math.min(1, Math.max(0, v.trim().endsWith('%') ? n / 100 : n))));
              }}
            />
          </Field>
          <Field label="Corner radius">
            {perCorner || uneven ? (
              <span className="flex min-h-control items-center text-xs text-ink-muted">Each corner below</span>
            ) : (
              len('border-radius', element.radius, '', 'Border radius', <IconBorderCorners stroke={1.5} />)
            )}
          </Field>
        </div>
        {(perCorner || uneven) && (
          <div className="grid grid-cols-2 gap-2">
            {len('border-top-left-radius', corners.topLeft, '', 'Top-left radius', <IconRadiusTopLeft stroke={1.5} />)}
            {len('border-top-right-radius', corners.topRight, '', 'Top-right radius', <IconRadiusTopRight stroke={1.5} />)}
            {len('border-bottom-left-radius', corners.bottomLeft, '', 'Bottom-left radius', <IconRadiusBottomLeft stroke={1.5} />)}
            {len('border-bottom-right-radius', corners.bottomRight, '', 'Bottom-right radius', <IconRadiusBottomRight stroke={1.5} />)}
          </div>
        )}
      </Section>

      <Section title="Text">
        {scan.typeStyles?.length ? (
          <TypeStyleRow element={element} styles={scan.typeStyles} props={scan.customProps} rootFontSize={scan.rootFontSize} onChange={onChange} />
        ) : null}
        <FontFamilyField value={type.fontFamily} families={families} onCommit={(v) => onChange('font-family', v)} />
        <Select value={type.fontWeight} options={WEIGHTS} labels={weightLabels} notes={weightNotes} ariaLabel="Font weight" onChange={(v) => onChange('font-weight', v)} />
        <div className="grid grid-cols-3 gap-2">
          {len('font-size', type.fontSize, '', 'Font size', <IconTextSize stroke={1.5} />)}
          {len('line-height', type.lineHeight, '', 'Line height', <IconLineHeight stroke={1.5} />)}
          {len('letter-spacing', type.letterSpacing, '', 'Letter spacing', <IconLetterSpacing stroke={1.5} />)}
        </div>
        <Segmented
          value={type.textAlign}
          options={ALIGNS}
          labels={{
            left: <IconAlignLeft stroke={1.5} />,
            center: <IconAlignCenter stroke={1.5} />,
            right: <IconAlignRight stroke={1.5} />,
            justify: <IconAlignJustified stroke={1.5} />,
          }}
          titles={{ left: 'Left', center: 'Centre', right: 'Right', justify: 'Justify' }}
          ariaLabel="Text align"
          onChange={(v) => onChange('text-align', v)}
        />
      </Section>

      <Section title="Colour">{colourField('color', color.text, 'Text colour')}</Section>

      <Section title="Background" action={addRemove('background', 'background')}>
        {shown('background') && colourField('background-color', color.background, 'Background colour')}
      </Section>

      <Section title="Border" action={addRemove('border', 'border')}>
        {shown('border') && (
          <>
            <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)] gap-2">
              {colourField('border-color', border.color, 'Border colour')}
              {len('border-width', border.width, '', 'Border width', <IconBorderSides stroke={1.5} />)}
            </div>
            <Select
              value={BORDER_STYLES.includes(border.style as (typeof BORDER_STYLES)[number]) ? border.style : 'none'}
              options={BORDER_STYLES}
              labels={BORDER_STYLE_LABELS}
              ariaLabel="Border style"
              onChange={(v) => onChange('border-style', v)}
            />
          </>
        )}
      </Section>

      <Section title="Box shadow" action={addRemove('shadow', 'shadow')}>
        {shown('shadow') && (
          <ShadowField
            value={element.shadow}
            suggestions={suggestTokens('shadow', element.shadow, scan, resolved ?? undefined, mode)}
            onChange={(v, t) => onChange('box-shadow', v, t)}
          />
        )}
      </Section>

      <Section title="Effects" action={addRemove('effects', 'effects')}>
        {shown('effects') && (
          <>
            <Field label="Transform">
              <TransformFields value={element.transform} onChange={(v) => onChange('transform', v)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <BlurRow label="Blur" value={element.filter} onChange={(v) => onChange('filter', v)} />
              {/* Behind the element rather than on it: the frosted-glass one. */}
              <BlurRow label="Backdrop blur" value={element.backdropFilter} onChange={(v) => onChange('backdrop-filter', v)} />
            </div>
          </>
        )}
      </Section>

      <Section title="Motion" action={addRemove('motion', 'motion')}>
        {shown('motion') && (
          <>
            <Field label="Transition">
              <MotionFields value={element.transition} easings={easings} onChange={(v) => onChange('transition', v)} onPlay={onPlay} playable={playable} />
            </Field>
            <Field label="Animation">
              <AnimationFields value={element.animation} timeline={element.animationTimeline} keyframes={element.keyframes} easings={easings} onChange={onChange} />
            </Field>
          </>
        )}
      </Section>

      {element.text !== null && (
        <Section title="Content">
          <TextArea value={element.text} onCommit={onText} />
        </Section>
      )}
    </div>
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
    <Field label={label}>
      {radius === null ? (
        <span className="truncate text-2xs text-ink-muted" title={value}>
          {value} — more than a blur, so it is left as it is
        </span>
      ) : (
        <NumberField value={radius} ariaLabel={`${label} radius`} property="filter-blur" label="B" onChange={(v) => onChange(blurToCss(v))} />
      )}
    </Field>
  );
}
