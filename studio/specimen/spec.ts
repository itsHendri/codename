/**
 * What the styles page shows, decided from the scan: the page's type styles
 * in their own forms, its colour variables by scope, the literals no
 * variable holds, the text-on-surface pairs it really paints, and its
 * spacing, radius and shadow values. Nothing here is invented — a page with
 * no shadows gets no shadow row — and the page's own components are cloned
 * in by the script, since only the page has them.
 */

import type { ColorInfo, CustomPropInfo, DsmOutline, ScanResult, TypeStyle } from '@/shared/types';
import { typeStyleDeclarations } from '../changes';
import { hexOf, lengthKind } from '../reskin';
import type { ColourLinks } from '../systemMap';
import { classifyProp } from '../varGroups';

export interface SpecimenType {
  name: string;
  form: TypeStyle['form'];
  selectorOrUtility: string;
  tag?: string;
  /** The declarations to paint it with when the form is not a selector the page styles on its own. */
  declarations: [property: string, value: string][];
}

export interface SpecimenColour {
  name: string;
  value: string;
  dark?: string;
  /** "primary 700" when linked. */
  link?: string;
  scope: 'root' | 'dark' | 'width' | 'scoped';
}

export interface SpecimenSpec {
  site: string;
  type: SpecimenType[];
  colours: SpecimenColour[];
  literals: Pick<ColorInfo, 'hex' | 'usage' | 'count'>[];
  /** Text on a surface, as painted: the most frequent pairs, with the WCAG ratio the scan measured. */
  pairs: { fg: string; bg: string; ratio: number; count: number }[];
  space: { name?: string; value: string; count?: number }[];
  radii: { name?: string; value: string }[];
  shadows: { name?: string; value: string }[];
}

const MAX_PAIRS = 8;
const MAX_LITERALS = 12;

export function buildSpecimenSpec(scan: ScanResult, links: ColourLinks = {}): SpecimenSpec {
  const props = scan.customProps;
  const type: SpecimenType[] = (scan.typeStyles ?? []).map((s) => ({
    name: s.name,
    form: s.form,
    selectorOrUtility: s.selectorOrUtility,
    ...(s.tag ? { tag: s.tag } : {}),
    declarations: typeStyleDeclarations(s),
  }));

  const colours: SpecimenColour[] = props
    .filter((p) => classifyProp(p.value) === 'colour' || (p.resolved && hexOf(p.resolved)))
    .map((p) => {
      const link = links[p.name];
      const scope = p.definitions?.[0]?.scope ?? 'root';
      return {
        name: p.name,
        value: p.value,
        ...(p.dark ? { dark: p.dark } : {}),
        ...(link ? { link: `${link.role} ${link.step}` } : {}),
        scope,
      };
    });

  const literals = scan.colors.filter((c) => !c.varNames.length).slice(0, MAX_LITERALS).map(({ hex, usage, count }) => ({ hex, usage, count }));
  const pairs = [...scan.contrastPairs].sort((a, b) => b.count - a.count).slice(0, MAX_PAIRS);

  const lengthVars = (kind: 'space' | 'radius' | 'type') => props.filter((p) => classifyProp(p.value) === 'length' && lengthKind(p.name) === kind);
  const px = (v: string) => parseFloat(v) || 0;
  const space = [
    ...lengthVars('space').map((p) => ({ name: p.name, value: p.value })),
    ...scan.shape.spacing.map((s) => ({ value: s.value, count: s.count })),
  ]
    .filter((s, i, all) => all.findIndex((x) => x.value === s.value) === i)
    .sort((a, b) => px(a.value) - px(b.value))
    .slice(0, 12);
  const radii = [
    ...lengthVars('radius').map((p) => ({ name: p.name, value: p.value })),
    ...scan.shape.radii.map((r) => ({ value: r.value })),
  ]
    .filter((s, i, all) => all.findIndex((x) => x.value === s.value) === i)
    .sort((a, b) => px(a.value) - px(b.value))
    .slice(0, 8);
  const shadows = [
    ...props.filter((p) => classifyProp(p.value) === 'shadow').map((p) => ({ name: p.name, value: p.value })),
    ...scan.shape.shadows.map((s) => ({ value: s.value })),
  ]
    .filter((s, i, all) => all.findIndex((x) => x.value === s.value) === i)
    .slice(0, 6);

  return { site: scan.url, type, colours, literals, pairs, space, radii, shadows };
}

/** The sections the styles page will draw, with their counts, for the rail's outline of it. */
export function outlineOf(spec: SpecimenSpec): DsmOutline['sections'] {
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  const out: DsmOutline['sections'] = [];
  if (spec.type.length) {
    out.push({ key: 'type', title: 'Type', count: n(spec.type.length, 'style'), items: spec.type.map((t) => ({ key: t.selectorOrUtility, label: t.name })) });
  }
  if (spec.colours.length) out.push({ key: 'colour', title: 'Colour', count: n(spec.colours.length, 'variable') });
  if (spec.pairs.length) out.push({ key: 'pairs', title: 'Pairs', count: n(spec.pairs.length, 'pair') });
  if (spec.literals.length) out.push({ key: 'literals', title: 'Literals', count: n(spec.literals.length, 'colour') });
  if (spec.space.length) out.push({ key: 'space', title: 'Space', count: n(spec.space.length, 'step') });
  if (spec.radii.length) out.push({ key: 'radius', title: 'Radius', count: n(spec.radii.length, 'value') });
  if (spec.shadows.length) out.push({ key: 'elevation', title: 'Elevation', count: n(spec.shadows.length, 'shadow') });
  return out;
}
