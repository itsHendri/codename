/**
 * The preview document. Every colour, size, radius and shadow here is a token —
 * there is deliberately not one literal in this file, because the preview is the
 * first consumer of the system: if a recipe is wrong, it looks wrong here first.
 */

export const PREVIEW_HTML = /* html */ `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    font-size: var(--text-body);
    line-height: var(--text-body--line-height);
  }
  .wrap { padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-6); }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: var(--space-5);
  }
  .row { display: flex; align-items: center; gap: var(--space-3); }
  .btn {
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 0 var(--space-4);
    height: 40px;
    font: inherit;
    font-size: var(--text-label);
    font-weight: var(--text-label--font-weight);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .btn-primary { background: var(--primary); color: var(--primary-foreground); }
  .btn-primary:hover { background: var(--primary-hover); }
  .btn-primary:active { background: var(--primary-active); }
  .btn-secondary { background: transparent; color: var(--foreground); border-color: var(--border-strong); }
  .btn-secondary:hover { background: var(--state-hover); }
  .btn-ghost { background: transparent; color: var(--foreground-secondary); }
  .btn-ghost:hover { background: var(--state-hover); }
  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--ring-inset), 0 0 0 4px var(--ring);
  }
  .input {
    height: 40px;
    width: 100%;
    border-radius: var(--radius-md);
    border: 1px solid var(--input);
    background: var(--background);
    color: var(--foreground);
    padding: 0 var(--space-3);
    font: inherit;
    font-size: var(--text-body-sm);
  }
  .muted { color: var(--muted-foreground); font-size: var(--text-body-sm); }
  .h1 { font-family: var(--font-display, var(--font-sans)); font-size: var(--text-display); line-height: var(--text-display--line-height); letter-spacing: var(--text-display--letter-spacing); font-weight: var(--text-display--font-weight); margin: 0; }
  .h2 { font-size: var(--text-heading); line-height: var(--text-heading--line-height); font-weight: var(--text-heading--font-weight); margin: 0; }
  .h3 { font-size: var(--text-heading-sm); line-height: var(--text-heading-sm--line-height); font-weight: var(--text-heading-sm--font-weight); margin: 0; }
  .label { font-size: var(--text-label); font-weight: var(--text-label--font-weight); letter-spacing: var(--text-label--letter-spacing); }
  .badge { border-radius: var(--radius-full); padding: 0 var(--space-2); font-size: var(--text-label); display: inline-flex; align-items: center; height: 22px; }
  .badge-success { background: var(--success-subtle); color: var(--success-subtle-foreground); border: 1px solid var(--success-border); }
  .badge-warning { background: var(--warning-subtle); color: var(--warning-subtle-foreground); border: 1px solid var(--warning-border); }
  .badge-danger  { background: var(--danger-subtle);  color: var(--danger-subtle-foreground);  border: 1px solid var(--danger-border); }
  .badge-info    { background: var(--info-subtle);    color: var(--info-subtle-foreground);    border: 1px solid var(--info-border); }
  .sidebar { background: var(--surface-sunken); border-right: 1px solid var(--border); padding: var(--space-4); width: 180px; display: flex; flex-direction: column; gap: var(--space-1); }
  .nav-item { border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); font-size: var(--text-body-sm); color: var(--foreground-secondary); }
  .nav-item:hover { background: var(--state-hover); }
  .nav-item[aria-current] { background: var(--state-selected); color: var(--foreground); }
  .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-4); }
  .stat { font-size: var(--text-heading-lg); line-height: 1.1; font-weight: var(--text-heading-lg--font-weight); }
  table { width: 100%; border-collapse: collapse; font-size: var(--text-body-sm); }
  th { text-align: left; background: var(--muted); color: var(--foreground-secondary); font-size: var(--text-label); font-weight: var(--text-label--font-weight); padding: var(--space-2) var(--space-3); }
  td { padding: var(--space-2) var(--space-3); border-top: 1px solid var(--border-subtle); }
  tbody tr:hover { background: var(--state-hover); }
  code, pre { font-family: var(--font-mono); font-size: var(--text-code); }
  pre { background: var(--surface-sunken); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-4); overflow-x: auto; }
  .k { color: var(--code-keyword); } .s { color: var(--code-string); } .n { color: var(--code-number); } .c { color: var(--code-comment); }
  .chart { display: flex; align-items: flex-end; gap: var(--space-2); height: 96px; }
  .bar { flex: 1; border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
  .hero { background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: var(--space-8); box-shadow: var(--shadow-raised); }
  a { color: var(--link); }
  a:hover { color: var(--link-hover); }
</style>
</head>
<body>

<div data-context="app">
  <div style="display:flex; min-height:100vh;">
    <nav class="sidebar">
      <div class="row" style="margin-bottom: var(--space-3);">
        <span style="width:20px;height:20px;border-radius:var(--radius-sm);background:var(--primary);display:inline-block;"></span>
        <strong class="label">Acme</strong>
      </div>
      <span class="nav-item" aria-current="page">Dashboard</span>
      <span class="nav-item">Projects</span>
      <span class="nav-item">Team</span>
      <span class="nav-item">Settings</span>
    </nav>
    <main class="wrap" style="flex:1; min-width:0;">
      <div class="row">
        <h1 class="h2">Good afternoon</h1>
        <div style="flex:1"></div>
        <button class="btn btn-secondary">Filter</button>
        <button class="btn btn-primary">New project</button>
      </div>

      <div class="grid-3">
        <div class="card"><div class="muted label">Revenue</div><div class="stat">$48.2k</div><span class="badge badge-success">+12.4%</span></div>
        <div class="card"><div class="muted label">Active</div><div class="stat">1,284</div><span class="badge badge-info">+3.1%</span></div>
        <div class="card"><div class="muted label">Churn</div><div class="stat">0.8%</div><span class="badge badge-warning">−0.2%</span></div>
      </div>

      <div class="card" style="padding:0; overflow:hidden;">
        <table>
          <thead><tr><th>Project</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>Billing page</td><td>Ana</td><td><span class="badge badge-success">shipped</span></td></tr>
            <tr><td>Onboarding</td><td>Ben</td><td><span class="badge badge-warning">review</span></td></tr>
            <tr><td>Design system</td><td>Cara</td><td><span class="badge badge-info">draft</span></td></tr>
            <tr><td>Legacy import</td><td>Dev</td><td><span class="badge badge-danger">blocked</span></td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3 class="h3" style="margin-bottom: var(--space-4);">Weekly signups</h3>
        <div class="chart">
          <span class="bar" style="height:40%; background:var(--chart-1);"></span>
          <span class="bar" style="height:62%; background:var(--chart-1);"></span>
          <span class="bar" style="height:48%; background:var(--chart-2);"></span>
          <span class="bar" style="height:78%; background:var(--chart-2);"></span>
          <span class="bar" style="height:95%; background:var(--chart-3);"></span>
          <span class="bar" style="height:70%; background:var(--chart-3);"></span>
        </div>
      </div>
    </main>
  </div>
</div>

<div data-context="marketing" hidden>
  <div class="wrap">
    <section class="hero">
      <span class="badge badge-info" style="margin-bottom: var(--space-4);">New</span>
      <h1 class="h1">Design systems that survive contact with production.</h1>
      <p class="muted" style="max-width: 52ch; font-size: var(--text-body-lg); line-height: var(--text-body-lg--line-height);">
        Every colour measured against the surface it lands on, exported as something your agent can actually follow.
      </p>
      <div class="row" style="margin-top: var(--space-6);">
        <button class="btn btn-primary">Start free</button>
        <button class="btn btn-secondary">Read the docs</button>
      </div>
    </section>

    <div class="grid-3">
      <div class="card"><h3 class="h3">Measured</h3><p class="muted">APCA against the real fill, not a step number someone liked.</p><a href="#">Learn more</a></div>
      <div class="card"><h3 class="h3">Portable</h3><p class="muted">CSS, DTCG JSON and a skill folder from one serialization.</p><a href="#">Learn more</a></div>
      <div class="card"><h3 class="h3">Honest</h3><p class="muted">Where it fails, it says so — and suggests the smallest passing fix.</p><a href="#">Learn more</a></div>
    </div>
  </div>
</div>

<div data-context="components" hidden>
  <div class="wrap">
    <div class="card">
      <h3 class="h3" style="margin-bottom: var(--space-4);">Buttons</h3>
      <div class="row" style="flex-wrap:wrap;">
        <button class="btn btn-primary">Primary</button>
        <button class="btn btn-secondary">Secondary</button>
        <button class="btn btn-ghost">Ghost</button>
        <button class="btn btn-primary" disabled style="background:var(--state-disabled); color:var(--muted-foreground); cursor:not-allowed;">Disabled</button>
      </div>
    </div>

    <div class="card">
      <h3 class="h3" style="margin-bottom: var(--space-4);">Form</h3>
      <div style="display:flex; flex-direction:column; gap:var(--space-3); max-width:380px;">
        <label class="label" for="e">Email</label>
        <input class="input" id="e" placeholder="you@example.com">
        <span class="muted">We only use this to send the export link.</span>
      </div>
    </div>

    <div class="card">
      <h3 class="h3" style="margin-bottom: var(--space-4);">Status</h3>
      <div class="row" style="flex-wrap:wrap;">
        <span class="badge badge-success">Success</span>
        <span class="badge badge-warning">Warning</span>
        <span class="badge badge-danger">Danger</span>
        <span class="badge badge-info">Info</span>
      </div>
    </div>

    <div class="card">
      <h3 class="h3" style="margin-bottom: var(--space-4);">Code</h3>
<pre><span class="c">// tokens are the API</span>
<span class="k">const</span> button = {
  background: <span class="s">'var(--primary)'</span>,
  color: <span class="s">'var(--primary-foreground)'</span>,
  radius: <span class="n">10</span>,
}</pre>
    </div>

    <div class="card">
      <h3 class="h3" style="margin-bottom: var(--space-4);">Surfaces</h3>
      <div style="display:flex; gap:var(--space-3); flex-wrap:wrap;">
        <div style="background:var(--surface-sunken); border:1px solid var(--border); border-radius:var(--radius-md); padding:var(--space-4);">sunken</div>
        <div style="background:var(--background); border:1px solid var(--border); border-radius:var(--radius-md); padding:var(--space-4);">background</div>
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-md); padding:var(--space-4); box-shadow:var(--shadow-sm);">surface</div>
        <div style="background:var(--surface-raised); border:1px solid var(--border); border-radius:var(--radius-md); padding:var(--space-4); box-shadow:var(--shadow-raised);">raised</div>
        <div style="background:var(--surface-overlay); border:1px solid var(--border); border-radius:var(--radius-md); padding:var(--space-4); box-shadow:var(--shadow-overlay);">overlay</div>
      </div>
    </div>

    <div class="card" style="background:var(--inverse); color:var(--inverse-foreground); border-color:var(--inverse-border);">
      <h3 class="h3">Inverse</h3>
      <p style="color:var(--inverse-muted-foreground); margin:var(--space-2) 0 0;">A footer, a tooltip, a toast — opposite to the current mode, not a fixed dark.</p>
    </div>
  </div>
</div>

</body>
</html>`;
