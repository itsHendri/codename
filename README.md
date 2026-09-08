# Codename

A designer's toolkit in the browser side panel: read the design system a page is
actually running, edit it, and take it with you.

## The four tabs

- **Inspect** — the live probes. Hover any element for its font, colours, box
  model and contrast; click to pin it and copy clean CSS. Plus a screen-wide
  eyedropper with history. Both work without scanning anything.
- **Design** — the system this page runs, editable.
  - **Colour** — seed colours with their OKLCH readouts, the generated 11-step
    ramps, and 88 semantic tokens with light/dark values and an APCA audit.
  - **Type** — the families the page really renders (measured, not read off the
    CSS stack) and the size/weight/line-height ladder it renders them at.
  - **Space & shape** — the spacing grid, corner radius and elevation, taken
    from the page and with off-grid strays named rather than rounded in.
- **Assets** — every SVG on the page (inline, `<img>`, CSS backgrounds, sprite
  `<use>`, favicons), previewed with copy, per-file download and ZIP export.
- **Export** — `brand.md` for agent context and `tokens.json` in W3C DTCG
  format, plus a consistency report.

Viewport presets live in the header, next to the site name.

## The rule the extraction obeys

Everything in a scanned system comes from the page, or from neutral engine
defaults — never from a preset brand. Ramps are named after the site's own CSS
variables where it has them (`--brand-primary` → "Brand Primary"); the type
scale is built from what the page renders, with "body" being the size it uses
most; radius, spacing and elevation are observed. Voice is left empty, because a
scan cannot see a brand's tone. The export says all of this in its own header:
the values are observations, not decisions anyone made.

Where the page gives no usable answer, a neutral default is used and the fact is
visible — a wrong answer dressed up as an observation is worse than no answer.

## Development

Requires Node 20+.

```sh
npm install
npm run dev        # dev build with hot reload
npm run build      # production build → dist/chrome-mv3
npm run compile    # type check
npx vitest run     # engine + extraction tests
npm run zip        # store-ready zip
```

To load in Chrome/Brave: `chrome://extensions` (or `brave://extensions`) →
enable Developer mode → **Load unpacked** → select `dist/chrome-mv3`.

Click **Scan this page** and allow site access when asked — the permission is
requested per-site, on the click, and nothing is read until you do.

### Looking at the panel without installing it

`.harness/` mounts the real side panel in a normal page with a stubbed
`chrome.*` API and a captured scan, so layout work doesn't need an
install-and-reload loop:

```sh
node node_modules/vite/bin/vite.js --config .harness/vite.config.ts
```

## Architecture

- **WXT + React + TypeScript + Tailwind**, Manifest V3. Side panel only — there
  is no options page and no full-tab UI, because the live site is the canvas.
- `entrypoints/sidepanel/` — the panel. `components/design/` holds the Design
  tab's sections.
- `entrypoints/scanner.content.ts` and `inspector.content.ts` — runtime
  registered, injected via `chrome.scripting` on demand. The scanner does one
  element walk and samples fonts, colours, contrast pairs, gradients, radii,
  shadows and spacing from it.
- `studio/engine/` — pure functions, no DOM, no React: OKLCH scale generation,
  the semantic layer solved by measuring APCA against real fills, and
  `resolveTokens()`. `studio/export/` turns that one serialization into
  `tokens.css`, DTCG JSON, a style guide page and an agent skill.
  Salvaged from Brand Forge and covered by its test suite.
- `studio/seedFromScan.ts` — the bridge: a `ScanResult` becomes a `BrandConfig`.
- Permissions stay minimal: `activeTab`, `tabs`, `scripting`, `sidePanel`,
  `storage`. Broad host access is optional and requested per-site at the moment
  it is needed.

## Status

Working: extraction, the four-tab panel, the Design tab, asset export, file
export. Not built yet: applying edits to the live page, and the agent link that
turns those edits into a commit in your own repo. See `PLAN.md`.

## License

MIT
