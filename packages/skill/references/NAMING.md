# The naming scheme

Every colour in a project on this scheme has a name that says what it is for,
how much weight it carries, and when it applies — and nothing else. No hue
words, no numbers, no prefix.

```
--{role}[-{level}][-{state}]      a colour
--{role}-foreground               what sits on that colour
```

`role` is what the colour is for. `level` is its weight within the role, and
the primary level is the bare name, so the common case is short and the name
grows as the thing gets quieter. `state` is when it applies.

## Three layers

| Name | What it is | Sits on |
|---|---|---|
| `--background` | The page: flat content, empty space | nothing |
| `--card` | Contained content: panels, tables, dialogs, inputs | background |
| `--foreground` | Text, icons, strokes | background or card |

Foreground never has a fill of its own. Strokes are foreground at their own
level (`--stroke`), so a card border and a divider read as the quiet end of
one ladder rather than as a fourth layer.

## Hierarchy

```
--foreground   --foreground-secondary   --foreground-tertiary
--stroke       --stroke-secondary
--card         --card-secondary                   a quieter well inside a card
```

## States

A colour something can act on owns two states, hover and pressed. Focus is a
ring rather than a colour, so it is `--focus` alone.

```
--brand    --brand-hover    --brand-pressed    --brand-foreground
--card     --card-hover     --card-pressed
--danger   --danger-hover   --danger-pressed   --danger-foreground
```

## One inactive set

Inactive is a style applied to anything, not a state every colour repeats.
A disabled button, a disabled input's border and greyed text all use these
two names.

```
--inactive               a fill or stroke that is switched off
--inactive-foreground    text or an icon that is switched off
```

## Brand and status

Brand has three levels, which map one to one onto a primary, secondary and
tertiary button: a solid fill, a tinted fill, a text-only treatment.

```
--brand             --brand-hover             --brand-pressed             --brand-foreground
--brand-secondary   --brand-secondary-hover   --brand-secondary-pressed   --brand-secondary-foreground
--brand-tertiary    --brand-tertiary-hover    --brand-tertiary-pressed    --brand-tertiary-foreground
```

Status roles carry states because a danger button exists, and a foreground
because text sits on them.

```
--success  --warning  --danger  --info      each with -hover, -pressed, -foreground
```

## Everything that is not a colour

```
--space-1 … --space-8                     the grid, in steps
--radius-sm  --radius  --radius-lg  --radius-full
--text-sm  --text-base  --text-lg  --text-xl  --text-2xl
--font-sans  --font-mono
--shadow-card  --shadow-overlay
```

The words matter to the plugin: Codename reads `space`, `radius` and `text-`
in a name to know what kind of length a variable holds, so a grid change in
Variables moves them and the edit card offers `var(--space-2)` beside an 8px
padding.

## Dark mode

Light values on `:root`. Dark values under both hooks a project might set —
`:root.dark` is what next-themes, shadcn/ui and Tailwind's manual variant
use; `:root[data-theme="dark"]` is what Bootstrap, Pico and most vendor
design systems use — with the system preference as the fallback when neither
is set. Codename's Dark switch finds either hook and shows the real dark mode
without any browser permission.

```css
:root { /* light */ }
:root.dark, :root[data-theme="dark"] { /* dark */ }
@media (prefers-color-scheme: dark) {
  :root:not(.light):not([data-theme="light"]) { /* dark */ }
}
```

## What the scheme deliberately leaves out

- No hue in a name. `--brand` can be any colour; `--blue-500` is a primitive,
  and primitives belong to the palette that generates these, not to the code
  that uses them.
- No component names. A button uses `--brand`; there is no `--button-bg`.
  When a component needs its own decision, that decision is a level or a
  state, not a new role.
- No elevation ladder beyond card. Raised and overlay surfaces are cards with
  a shadow: `--card` plus `--shadow-overlay`.
