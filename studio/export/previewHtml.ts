/**
 * A standalone style-guide page: the system as something a person can read,
 * open in a browser and send to someone who will never run a build.
 *
 * Brand Forge wanted this and could not ship it — its preview contexts were
 * inline style objects rather than CSS, so there was nothing to serialize into
 * a static page. Here the page embeds `previewCss()` verbatim, so it is the
 * same declarations the editor previews and every other exporter prints. No
 * second serialization; nothing to drift.
 */

import type { ResolvedTokens, SemanticGroup } from "../engine/types"
import { STEPS } from "../engine/types"
import { previewCss } from "./css"

const escape = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const GROUP_TITLES: Partial<Record<SemanticGroup, string>> = {
    surface: "Surfaces",
    text: "Text",
    link: "Links",
    brand: "Brand",
    state: "States",
    border: "Borders",
    status: "Status",
    inverse: "Inverse",
    code: "Code",
    chart: "Charts",
    scale: "Sequential scale",
}

function ramps(resolved: ResolvedTokens): string {
    return Object.values(resolved.scales)
        .map((scale) => {
            const swatches = STEPS.map((step) => {
                const light = scale.steps.light[step]
                const anchor = step === scale.anchorStep
                return `<div class="sw">
          <span class="chip${anchor ? " anchor" : ""}" style="background:${light.hex}"></span>
          <span class="cap">${step}${anchor ? " ·" : ""}</span>
          <span class="hex">${light.hex}</span>
        </div>`
            }).join("")
            return `<section class="ramp">
        <h3>${escape(scale.name)} <span class="role">${scale.role}</span></h3>
        <div class="ramp-row">${swatches}</div>
      </section>`
        })
        .join("")
}

function semantics(resolved: ResolvedTokens): string {
    const groups = new Map<SemanticGroup, ResolvedTokens["semantics"]>()
    for (const token of resolved.semantics) {
        const list = groups.get(token.group) ?? []
        list.push(token)
        groups.set(token.group, list)
    }
    return Array.from(groups, ([group, tokens]) => {
        const rows = tokens
            .map(
                (token) => `<tr>
          <td><code>--${token.name}</code></td>
          <td class="val"><span class="dot" style="background:${token.values.light.css}"></span>${token.light.scale}.${token.light.step}</td>
          <td class="val"><span class="dot" style="background:${token.values.dark.css}"></span>${token.dark.scale}.${token.dark.step}</td>
          <td class="desc">${escape(token.description)}</td>
        </tr>`,
            )
            .join("")
        return `<section>
      <h3>${escape(GROUP_TITLES[group] ?? group)}</h3>
      <table>
        <thead><tr><th>Token</th><th>Light</th><th>Dark</th><th>Use it for</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
    }).join("")
}

function typeSpecimens(resolved: ResolvedTokens): string {
    return resolved.config.typography.roles
        .map((role) => {
            const fluid = role.minSizeRem ? ` · fluid from ${role.minSizeRem}rem` : ""
            return `<div class="spec">
        <div class="spec-meta">
          <code>--text-${role.role}</code>
          <span>${role.sizeRem}rem · ${role.weight} · ${role.lineHeight}${fluid}</span>
        </div>
        <div style="font: var(--text-${role.role}); font-family: var(--font-${role.family}); line-height: var(--text-${role.role}--line-height); font-weight: var(--text-${role.role}--font-weight); letter-spacing: var(--text-${role.role}--letter-spacing);">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>`
        })
        .join("")
}

function scalesAndShape(resolved: ResolvedTokens): string {
    const spacing = resolved.config.spacing.blessed
        .map(
            (px) =>
                `<div class="bar"><span style="width:${px}px"></span><code>${px}px</code></div>`,
        )
        .join("")
    const radii = Object.entries(resolved.radius)
        .map(
            ([name, px]) =>
                `<div class="shape"><span style="border-radius:${px}px"></span><code>--radius-${name}</code><em>${px}px</em></div>`,
        )
        .join("")
    const shadows = resolved.config.shadows.levels
        .map(
            (level) =>
                `<div class="shape"><span style="box-shadow:var(--shadow-${level.name})"></span><code>--shadow-${level.name}</code></div>`,
        )
        .join("")
    return `<section><h3>Spacing</h3><div class="bars">${spacing}</div></section>
    <section><h3>Radius</h3><div class="shapes">${radii}</div></section>
    <section><h3>Elevation</h3><div class="shapes">${shadows}</div></section>`
}

function contrastSummary(resolved: ResolvedTokens): string {
    const fails = resolved.warnings.filter((w) => w.level === "fail")
    const warns = resolved.warnings.filter((w) => w.level === "warn")
    if (!fails.length && !warns.length) {
        return `<p class="ok">Every measured pair clears its bar.</p>`
    }
    const item = (w: (typeof resolved.warnings)[number]) =>
        `<li><strong>${w.level === "fail" ? "Fails" : "Review"}</strong> · ${escape(w.message)}</li>`
    return `<ul class="warnings">${[...fails, ...warns].map(item).join("")}</ul>`
}

export function toPreviewHtml(resolved: ResolvedTokens): string {
    const { config } = resolved
    const name = escape(config.meta.name)
    return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — design system</title>
<style>
${previewCss(resolved, ":root")}

/* The page's own chrome is painted by the system it documents, so a broken
   token is visible here first. */
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: var(--text-body--line-height);
}
header {
  display: flex; align-items: baseline; gap: var(--space-4);
  padding: var(--space-6);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--background); z-index: 10;
}
h1 { font-size: var(--text-heading-lg); line-height: 1.1; margin: 0; }
h2 { font-size: var(--text-heading); margin: var(--space-8) 0 var(--space-3); }
h3 { font-size: var(--text-heading-sm); margin: var(--space-5) 0 var(--space-2); }
h3 .role { color: var(--muted-foreground); font-weight: 400; font-size: var(--text-body-sm); }
main { padding: 0 var(--space-6) var(--space-10); max-width: 1100px; }
code { font-family: var(--font-mono); font-size: var(--text-code); }
button {
  font: inherit; cursor: pointer; border-radius: var(--radius-md);
  border: 1px solid var(--border-strong); background: transparent;
  color: var(--foreground); padding: var(--space-2) var(--space-3);
}
button:hover { background: var(--state-hover); }
.sub { color: var(--muted-foreground); font-size: var(--text-body-sm); }
.ramp-row { display: grid; grid-template-columns: repeat(11, 1fr); gap: var(--space-1); }
.sw { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.chip { height: 44px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); }
.chip.anchor { outline: 2px solid var(--ring); outline-offset: 1px; }
.cap { font-size: var(--text-label); color: var(--muted-foreground); }
.hex { font-family: var(--font-mono); font-size: 10px; color: var(--foreground-tertiary); overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: var(--text-body-sm); }
th { text-align: left; padding: var(--space-2); background: var(--muted); color: var(--foreground-secondary); font-size: var(--text-label); }
td { padding: var(--space-2); border-top: 1px solid var(--border-subtle); vertical-align: top; }
.val { white-space: nowrap; color: var(--foreground-secondary); }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--border); margin-right: var(--space-2); vertical-align: -2px; }
.desc { color: var(--muted-foreground); }
.spec { padding: var(--space-3) 0; border-bottom: 1px solid var(--border-subtle); }
.spec-meta { display: flex; gap: var(--space-3); color: var(--muted-foreground); font-size: var(--text-label); margin-bottom: var(--space-2); }
.bars { display: flex; flex-direction: column; gap: var(--space-2); }
.bar { display: flex; align-items: center; gap: var(--space-3); }
.bar span { height: 14px; background: var(--primary); border-radius: var(--radius-sm); }
.shapes { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.shape { display: flex; flex-direction: column; gap: var(--space-2); align-items: center; font-size: var(--text-label); color: var(--muted-foreground); }
.shape span { width: 72px; height: 56px; background: var(--surface); border: 1px solid var(--border); display: block; }
.warnings { padding-left: var(--space-4); color: var(--foreground-secondary); font-size: var(--text-body-sm); }
.ok { color: var(--success); }
</style>
</head>
<body>
<header>
  <h1>${name}</h1>
  <span class="sub">${escape(config.meta.domain ?? "")} · design system</span>
  <span style="flex:1"></span>
  <button id="theme">Dark</button>
</header>
<main>
  <p class="sub">
    ${resolved.semantics.length} semantic tokens over ${Object.keys(resolved.scales).length} colour ramps.
    Colour is referred to by semantic name — the ramps below are what those names resolve to, not what you write in code.
  </p>

  <h2>Colour ramps</h2>
  <p class="sub">Primitives. The marked step is where the seed colour landed.</p>
  ${ramps(resolved)}

  <h2>Semantic tokens</h2>
  <p class="sub">This is the API. Every value is an alias to a ramp step, so a theme change moves the alias, not the component.</p>
  ${semantics(resolved)}

  <h2>Type</h2>
  ${typeSpecimens(resolved)}

  <h2>Space &amp; shape</h2>
  ${scalesAndShape(resolved)}

  <h2>Contrast</h2>
  ${contrastSummary(resolved)}
</main>
<script>
  // The only script on the page: flip the attribute the stylesheet is scoped to.
  var b = document.getElementById('theme');
  b.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    b.textContent = dark ? 'Dark' : 'Light';
  });
</script>
</body>
</html>
`
}
