# Codename

A designer's toolkit in your browser's side panel. One extension instead of five:

- **Inspect** — hover any element on a page to see its font, colors, box model, and WCAG contrast; click to pin the details and copy clean CSS.
- **Fonts** — every font family the page actually renders (not just the CSS stack), with live specimens, weights, serving source (Google Fonts / Adobe / self-hosted), and the type scale in use.
- **Colors** — the page's palette grouped by usage, gradients, live contrast-pair checks, plus a screen-wide eyedropper (native EyeDropper API) with history.
- **SVGs** — every SVG on the page (inline, `<img>`, CSS backgrounds, sprite `<use>`, favicons), previewed on a grid with copy, per-file download, and bulk ZIP export.
- **Resize** — snap the window to device presets or your own custom sizes, sized to the viewport.
- **Export** — one click to a `brand.md` (AI-ready style guide for Claude/Cursor context) and `tokens.json` (W3C design tokens, Style Dictionary compatible), plus a consistency report.

## Development

Requires Node 20+.

```sh
npm install
npm run dev        # dev build with hot reload
npm run build      # production build → dist/chrome-mv3
npm run compile    # type check
npm run zip        # store-ready zip
```

To load in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/chrome-mv3`.

Tip: click the Codename toolbar icon *while on the page you want to scan* — that grants the per-tab permission the scanner uses.

## Architecture

- **WXT + React + TypeScript + Tailwind**, Manifest V3.
- Side panel UI (`entrypoints/sidepanel/`), on-demand content scripts (`scanner.content.ts`, `inspector.content.ts` — runtime-registered, injected via `chrome.scripting` with `activeTab`), minimal background worker for cross-origin fetches.
- Token extraction via [`@projectwallace/css-design-tokens`](https://github.com/projectwallace/css-design-tokens); colors via `culori`; zipping via `fflate`.
- Permissions stay minimal: `activeTab` + `scripting` + `sidePanel` + `storage`; broad host access is requested only when needed (fetching cross-origin SVGs/stylesheets).

## License

MIT
