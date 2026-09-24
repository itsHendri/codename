/**
 * DESIGN.md — the system for an agent to read, in the open format Google
 * Labs published (github.com/google-labs-code/design.md): YAML frontmatter
 * with the tokens, then eight sections of prose in a fixed order. The one
 * agent-facing file Codename writes; tokens.css and tokens.json are the
 * same system for a stylesheet and a design tool.
 *
 * Everything in it is the resolved system plus what the page said: the
 * type styles it really has, which of its variables sit on which ramp
 * step, and what the critique measured. Nothing is a brand adjective; the
 * Overview says where the values came from.
 */

import type { TypeStyle } from '@/shared/types';
import { POLISH_RULES } from '../engine/defaults';
import { spaceName } from '../engine/defaults';
import { SCALE_ROLES, STEPS, type ResolvedTokens, type TypeRole } from '../engine/types';
import type { Critique } from '../critique';
import type { ColourLinks } from '../systemMap';
import { describeForm } from '../typeStyleMatch';
import { primaryFamily } from './css';
import { toYaml, type YamlValue } from './yaml';

export interface PageContext {
  /** The page the system was read from. */
  site?: string;
  scannedAt?: number;
  /** The page's own type styles, in the form the project writes them. */
  typeStyles?: TypeStyle[];
  /** Page variables linked to ramp steps. */
  links?: ColourLinks;
  critique?: Critique;
}

export const DESIGN_MD_SECTIONS = ['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components', "Do's and Don'ts"] as const;

const REF = /\{([a-z]+)\.([^}]+)\}/g;

/** Components as references into the frontmatter; a property whose reference resolves to nothing is left out. */
function components(colors: Record<string, string>, typography: Record<string, unknown>, rounded: Record<string, string>): Record<string, Record<string, string>> {
  const want: Record<string, Record<string, string>> = {
    'button-primary': { backgroundColor: '{colors.primary}', textColor: '{colors.primary-foreground}', typography: '{typography.label}', rounded: '{rounded.md}' },
    'button-primary-hover': { backgroundColor: '{colors.primary-hover}' },
    'button-secondary': { backgroundColor: '{colors.surface}', textColor: '{colors.foreground}', typography: '{typography.label}', rounded: '{rounded.md}' },
    card: { backgroundColor: '{colors.surface-raised}', textColor: '{colors.foreground}', rounded: '{rounded.lg}' },
    input: { backgroundColor: '{colors.input}', textColor: '{colors.foreground}', typography: '{typography.body}', rounded: '{rounded.md}' },
    link: { textColor: '{colors.link}' },
    code: { backgroundColor: '{colors.surface-sunken}', textColor: '{colors.foreground}', typography: '{typography.code}', rounded: '{rounded.sm}' },
  };
  const resolves = (value: string) =>
    Array.from(value.matchAll(REF)).every(([, group, name]) => (group === 'colors' ? name! in colors : group === 'typography' ? name! in typography : group === 'rounded' ? name! in rounded : false));
  const out: Record<string, Record<string, string>> = {};
  for (const [name, props] of Object.entries(want)) {
    const kept = Object.fromEntries(Object.entries(props).filter(([, v]) => resolves(v)));
    if (Object.keys(kept).length) out[name] = kept;
  }
  return out;
}

const roleLabel: Record<TypeRole['role'], string> = {
  display: 'the one line a page leads with',
  'heading-lg': 'section heads',
  heading: 'card and block titles',
  'heading-sm': 'sub-heads and dense titles',
  'body-lg': 'lead paragraphs',
  body: 'running text',
  'body-sm': 'captions and secondary text',
  label: 'buttons, tabs, form labels',
  code: 'code and identifiers',
};

export function toDesignMd(resolved: ResolvedTokens, page: PageContext = {}, now = new Date()): string {
  const { config } = resolved;
  const light = resolved.declarations.light;
  const date = (page.scannedAt ? new Date(page.scannedAt) : now).toISOString().slice(0, 10);
  const site = page.site ?? config.meta.domain ?? config.meta.name;

  // Colours: every semantic by name in light, then the ramps step by step.
  const colors: Record<string, string> = {};
  for (const s of resolved.semantics) colors[s.name] = s.values.light.hex;
  for (const role of SCALE_ROLES) {
    const scale = resolved.scales[role];
    if (!scale) continue;
    for (const step of STEPS) colors[`${role}-${step}`] = scale.steps.light[step]!.hex;
  }

  const families = config.typography.families;
  const typography: Record<string, YamlValue> = {};
  for (const role of config.typography.roles) {
    const stack = role.family === 'display' ? (families.display ?? families.sans) : role.family === 'mono' ? families.mono : role.family === 'serif' ? (families.serif ?? families.sans) : families.sans;
    typography[role.role] = {
      fontFamily: primaryFamily(stack),
      fontSize: `${role.sizeRem}rem`,
      fontWeight: role.weight,
      lineHeight: role.lineHeight,
      ...(role.tracking ? { letterSpacing: role.tracking } : {}),
    };
  }

  const rounded: Record<string, string> = {};
  for (const [step, px] of Object.entries(resolved.radius)) rounded[step] = step === 'full' ? '9999px' : `${px}px`;

  // Steps named as multiples of the base ("4x"), which is what `--space-4`
  // means in tokens.css; a bare number would sort ahead of `base`.
  const spacing: Record<string, string> = { base: `${config.spacing.basePx}px` };
  for (const px of config.spacing.blessed) spacing[`${spaceName(px, config.spacing.basePx)}x`] = `${px}px`;

  const comps = components(colors, typography, rounded);

  const front: Record<string, YamlValue> = {
    name: config.meta.name,
    description: `The design system ${site} runs on, read from the page on ${date} by Codename: its colours as ramps and semantic roles, its type as a scale, its spacing, radius and elevation. Tokens are normative; the prose says where each came from.`,
    colors,
    typography,
    rounded,
    spacing,
    ...(Object.keys(comps).length ? { components: comps } : {}),
  };

  const lines: string[] = ['---', toYaml(front), '---', ''];
  const h = (title: (typeof DESIGN_MD_SECTIONS)[number]) => lines.push(`## ${title}`, '');
  const p = (...text: string[]) => lines.push(...text, '');

  h('Overview');
  p(
    `This is the system behind ${site}, as Codename read it off the running page${page.scannedAt ? ` on ${date}` : ''}. Every value is an observation of that page or the engine's neutral derivation from one — a seed pinned to its ramp step, a ratio the page's sizes are nearest — not a decision anyone made about the brand. Treat the tokens as the vocabulary to build in, and the page as the reference for how it is used.`,
  );
  if (config.meta.deviations.length) p(...config.meta.deviations.map((d) => `- ${d}`));
  p(
    `The same system ships as \`tokens.css\` (custom properties, light and dark, with a Tailwind v4 \`@theme\` block) and \`tokens.json\` (W3C DTCG). Use the semantic names in code — \`var(--foreground)\`, \`var(--primary)\` — and reach for a ramp step only where no semantic fits.`,
  );

  h('Colors');
  const seeds = SCALE_ROLES.filter((r) => resolved.scales[r]).map((r) => `- **${r}** — seeded from \`${resolved.scales[r].seed}\`, eleven steps 50–950`);
  p('Seven OKLCH ramps, each seeded from a colour the page paints (or the engine default where the page had none), with the seed landing exactly on its step:', ...seeds);
  const linked = Object.entries(page.links ?? {}).filter((e): e is [string, NonNullable<ColourLinks[string]>] => !!e[1]);
  if (linked.length) p("The page's own variables on those ramps:", ...linked.map(([name, l]) => `- \`${name}\` is ${l.role} ${l.step}`));
  const groups = new Map<string, string[]>();
  for (const s of resolved.semantics) groups.set(s.group, [...(groups.get(s.group) ?? []), `\`${s.name}\``]);
  p(
    'Semantic roles alias the ramps, so a colour value appears once per mode and a swap of seed moves everything on it. When to use each is the `$description` in `tokens.json`:',
    ...Array.from(groups, ([g, names]) => `- **${g}**: ${names.join(', ')}`),
  );
  p(
    `Dark mode is the same roles re-pointed, under \`[data-theme="dark"]\`; the frontmatter carries the light values, \`tokens.css\` carries both. Every text-on-surface pairing was measured (APCA) when the roles were solved, so a \`*-foreground\` on its surface reads.`,
  );

  h('Typography');
  const fam = [`- sans: \`${families.sans}\``, `- mono: \`${families.mono}\``, ...(families.display ? [`- display: \`${families.display}\``] : []), ...(families.serif ? [`- serif: \`${families.serif}\``] : [])];
  p('Families:', ...fam);
  p(
    'Roles, largest first; sizes are rem, line-heights unitless:',
    ...config.typography.roles.map(
      (r) => `- **${r.role}** — ${r.sizeRem}rem / ${r.lineHeight}, weight ${r.weight}${r.tracking ? `, tracking ${r.tracking}` : ''}${r.minSizeRem ? `, fluid from ${r.minSizeRem}rem` : ''}: ${roleLabel[r.role]}`,
    ),
  );
  if (page.typeStyles?.length) {
    p(
      'The page writes its type styles in these forms; keep to them rather than inventing a new one:',
      ...page.typeStyles.map((s) => {
        const size = s.fields.size?.token ? `\`var(${s.fields.size.token})\`` : s.fields.size?.literal ? `\`${s.fields.size.literal}\`` : 'size unread';
        return `- **${s.name}** — ${describeForm(s)}, ${size}${s.fields.family?.literal ? `, ${s.fields.family.literal}` : ''}`;
      }),
    );
  }
  p('`text-wrap: balance` on headings, `pretty` on body copy; tabular numerals for anything counted or compared.');

  h('Layout');
  p(
    `A ${config.spacing.basePx}px grid. The blessed steps are ${config.spacing.blessed.map((px) => `${px}`).join(', ')}px; anything else is off-grid and the critique flags it. Padding, gaps and margins come from this ladder, and an optical nudge of a pixel or two is a nudge, not a new step.`,
  );
  if (config.layout.breakpoints.length) p('Breakpoints:', ...config.layout.breakpoints.map((b) => `- ${b.name}: ${b.minPx}px`));
  if (config.layout.containers.length) p('Containers:', ...config.layout.containers.map((c) => `- ${c.name}: ${c.maxRem}rem`));

  h('Elevation & Depth');
  p(
    'Shadows elevate; borders structure. Three levels, each named for the surface it pairs with:',
    ...config.shadows.levels.map((l) => `- **${l.name}** — \`${l.layers.join(', ')}\``),
    'In dark mode elevation is a hairline ring on a lighter surface, not a drop shadow; `tokens.css` carries the dark values.',
  );

  h('Shapes');
  p(
    config.radius.basePx > 0
      ? `Radii derive from a ${config.radius.basePx}px base: ${Object.entries(rounded)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}. ${config.radius.concentric ? 'Nested corners are concentric: inner = outer − padding, squared off at zero.' : ''}`
      : 'Corners are square; the radius scale is present for controls that need one.',
  );

  h('Components');
  p(
    Object.keys(comps).length
      ? 'The frontmatter names the atoms as references into the tokens; build the rest from them. Every property is a token, never a literal, so a seed change moves the whole set:'
      : 'No atom is named yet; build from the tokens above.',
    ...Object.entries(comps).map(([name, props]) => `- **${name}** — ${Object.entries(props).map(([k, v]) => `${k} ${v}`).join(', ')}`),
  );

  h("Do's and Don'ts");
  const polish = POLISH_RULES.filter((r) => config.rules.polish[r.id] !== false);
  p(...polish.map((r) => `- **${r.title}.** ${r.rule}`));
  const findings = (page.critique?.findings ?? []).filter((f) => f.level !== 'note');
  if (findings.length) p('What the page does today that this system would not, measured by the critique:', ...findings.map((f) => `- ${f.message}`));

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
