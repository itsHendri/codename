/**
 * The styles page, as DOM in the page's own document.
 *
 * Every sample is light DOM — an `<h1>`, a `<div class="h1">`, a card cloned
 * from the page — so the page's own rules style it, its variables reach it,
 * and the re-skin repaints it with the rest. Only the labels are ours: each
 * a custom element with a closed shadow root, so no page rule can touch
 * them and no scan reads them. For a file to save, the same page renders
 * with inline labels instead.
 *
 * Each sample carries the selector or utility it stands for, so selecting
 * it in the specimen files an edit against the page's own rule.
 */

import { SPECIMEN_FOR, SPECIMEN_LABEL_TAG, SPECIMEN_MATCHES } from '@/shared/inpage';
import { OVERLAY, type OverlayTheme } from '@/shared/theme';
import type { SpecimenSpec, SpecimenType } from './spec';

export interface SpecimenComponent {
  selector: string;
  matches: number;
  node: Element;
}

export interface RenderOptions {
  /** `shadow` for the page (labels no rule can touch); `inline` for a file. */
  labels: 'shadow' | 'inline';
  theme: OverlayTheme;
  /** The page's own components, cloned; only the page can supply them. */
  components?: SpecimenComponent[];
}

const SAMPLE = 'The quick brown fox jumps over the lazy dog';
const INLINE_LABEL_CLASS = 'cn-specimen-label';

/** The label stylesheet, for a saved file where there is no shadow root. */
export function inlineLabelCss(): string {
  return `.${INLINE_LABEL_CLASS}{all:initial;display:block;font:11px/1.4 system-ui,sans-serif;color:inherit;margin:0 0 6px}.${INLINE_LABEL_CLASS} b{font-weight:600}.${INLINE_LABEL_CLASS} span{opacity:.6}`;
}

// A label takes the page's own ink, at strength for the name and faded for
// the rest: on a dark page it reads, on a light one it reads, and it never
// carries the panel's palette into the page.
const LABEL_CSS = `:host{all:initial;display:block;font:11px/1.4 system-ui,sans-serif;color:inherit;margin:0 0 6px}b{font-weight:600}span{opacity:.6}`;

export function renderSpecimen(spec: SpecimenSpec, doc: Document, opts: RenderOptions): HTMLElement {
  const t = OVERLAY[opts.theme];
  const root = doc.createElement('div');
  root.setAttribute('data-codename-specimen-root', '');
  root.style.cssText = 'display:flex;flex-direction:column;gap:40px;max-width:1120px;margin:0 auto';

  const label = (head: string, sub?: string): Element => {
    const b = doc.createElement('b');
    b.textContent = head;
    const rest = doc.createElement('span');
    if (sub) rest.textContent = ` · ${sub}`;
    if (opts.labels === 'inline') {
      const el = doc.createElement('div');
      el.className = INLINE_LABEL_CLASS;
      el.append(b, rest);
      return el;
    }
    const el = doc.createElement(SPECIMEN_LABEL_TAG);
    const shadow = el.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = LABEL_CSS;
    shadow.append(style, b, rest);
    return el;
  };
  const section = (title: string, count: string): HTMLElement => {
    const s = doc.createElement('section');
    s.setAttribute('data-codename-section', title.toLowerCase());
    s.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    s.append(label(title, count));
    return s;
  };
  const row = (): HTMLElement => {
    const r = doc.createElement('div');
    r.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end';
    return r;
  };

  // Type: each style in its own form, on a real element the page's rules reach.
  if (spec.type.length) {
    const s = section('Type', `${spec.type.length} ${spec.type.length === 1 ? 'style' : 'styles'}`);
    for (const style of spec.type) {
      const block = doc.createElement('div');
      block.style.cssText = 'display:flex;flex-direction:column;gap:4px';
      const sample = sampleFor(style, doc);
      sample.textContent = SAMPLE;
      sample.setAttribute(SPECIMEN_FOR, style.selectorOrUtility);
      block.append(label(style.name, describe(style)), sample);
      s.append(block);
    }
    root.append(s);
  }

  // Colours: the page's variables as swatches painted through the variable itself.
  if (spec.colours.length) {
    const s = section('Colour', `${spec.colours.length} ${spec.colours.length === 1 ? 'variable' : 'variables'}`);
    const r = row();
    for (const c of spec.colours) {
      const cell = doc.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:88px';
      const sw = doc.createElement('div');
      sw.style.cssText = `height:44px;border-radius:6px;background:var(${c.name});box-shadow:inset 0 0 0 1px rgba(0,0,0,0.08)`;
      sw.title = `${c.name}: ${c.value}${c.dark ? ` · dark ${c.dark}` : ''}`;
      cell.append(sw, label(c.name.replace(/^--/, ''), c.link ?? c.scope));
      r.append(cell);
    }
    s.append(r);
    root.append(s);
  }

  if (spec.pairs.length) {
    const s = section('Pairs', 'text on surface, as painted');
    const r = row();
    for (const p of spec.pairs) {
      const tile = doc.createElement('div');
      tile.style.cssText = `display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:6px;background:${p.bg};color:${p.fg};min-width:120px;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.08)`;
      const big = doc.createElement('div');
      big.style.cssText = 'font-size:20px;line-height:1.2';
      big.textContent = 'Aa';
      const small = doc.createElement('div');
      small.style.cssText = 'font-size:11px;opacity:.85';
      small.textContent = `${p.ratio.toFixed(2)}:1 · ×${p.count}`;
      tile.append(big, small);
      r.append(tile);
    }
    s.append(r);
    root.append(s);
  }

  if (spec.literals.length) {
    const s = section('Literals', 'colours no variable holds');
    const r = row();
    for (const c of spec.literals) {
      const cell = doc.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:88px';
      const sw = doc.createElement('div');
      sw.style.cssText = `height:32px;border-radius:6px;background:${c.hex};box-shadow:inset 0 0 0 1px rgba(0,0,0,0.08)`;
      cell.append(sw, label(c.hex, `${c.usage.join(' · ')} ×${c.count}`));
      r.append(cell);
    }
    s.append(r);
    root.append(s);
  }

  if (spec.space.length) {
    const s = section('Space', `${spec.space.length} steps`);
    const r = row();
    for (const step of spec.space) {
      const cell = doc.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:4px;align-items:center';
      const bar = doc.createElement('div');
      bar.style.cssText = `width:${step.name ? `var(${step.name})` : step.value};height:${step.name ? `var(${step.name})` : step.value};max-width:96px;max-height:96px;background:${t.accent};opacity:.6;border-radius:2px`;
      cell.append(bar, label(step.name ? step.name.replace(/^--/, '') : step.value, step.name ? step.value : step.count ? `×${step.count}` : undefined));
      r.append(cell);
    }
    s.append(r);
    root.append(s);
  }

  if (spec.radii.length) {
    const s = section('Radius', `${spec.radii.length} ${spec.radii.length === 1 ? 'value' : 'values'}`);
    const r = row();
    for (const rad of spec.radii) {
      const cell = doc.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:4px;align-items:center';
      const tile = doc.createElement('div');
      tile.style.cssText = `width:56px;height:40px;border-radius:${rad.name ? `var(${rad.name})` : rad.value};box-shadow:inset 0 0 0 1.5px ${t.cardMuted}`;
      cell.append(tile, label(rad.name ? rad.name.replace(/^--/, '') : rad.value, rad.name ? rad.value : undefined));
      r.append(cell);
    }
    s.append(r);
    root.append(s);
  }

  if (spec.shadows.length) {
    const s = section('Elevation', `${spec.shadows.length} ${spec.shadows.length === 1 ? 'shadow' : 'shadows'}`);
    const r = row();
    // On a light plate whatever the page's theme: a shadow on a dark ground is a shadow nobody sees.
    r.style.cssText += ';padding:16px;border-radius:8px;background:#f1f1f1';
    for (const sh of spec.shadows) {
      const cell = doc.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center';
      const tile = doc.createElement('div');
      tile.style.cssText = `width:72px;height:48px;border-radius:6px;background:#fff;box-shadow:${sh.name ? `var(${sh.name})` : sh.value}`;
      cell.append(tile, label(sh.name ? sh.name.replace(/^--/, '') : 'shadow', sh.name ? undefined : sh.value.slice(0, 32)));
      r.append(cell);
    }
    s.append(r);
    root.append(s);
  }

  // The page's own components, as they stand, one of each pattern.
  const components = opts.components ?? [];
  if (components.length) {
    const s = section('Components', `${components.length} ${components.length === 1 ? 'pattern' : 'patterns'} on this page`);
    for (const c of components) {
      const block = doc.createElement('div');
      block.style.cssText = 'display:flex;flex-direction:column;gap:4px';
      const clone = c.node;
      clone.setAttribute(SPECIMEN_FOR, c.selector);
      clone.setAttribute(SPECIMEN_MATCHES, String(c.matches));
      block.append(label(c.selector, `×${c.matches}`), clone);
      s.append(block);
    }
    root.append(s);
  }

  return root;
}

/** An element the page's own rules will style as that type style. */
function sampleFor(style: SpecimenType, doc: Document): HTMLElement {
  switch (style.form) {
    case 'tag':
      return doc.createElement(style.tag ?? 'p');
    case 'class': {
      const el = doc.createElement('div');
      el.className = style.selectorOrUtility.replace(/^\./, '').replace(/\\/g, '');
      return el;
    }
    case 'tailwind-theme': {
      const el = doc.createElement('div');
      el.className = style.selectorOrUtility;
      return el;
    }
    case 'vars': {
      const el = doc.createElement('div');
      el.style.cssText = style.declarations.map(([p, v]) => `${p}:${v}`).join(';');
      return el;
    }
  }
}

function describe(style: SpecimenType): string {
  const decl = style.declarations.map(([p, v]) => `${p.replace('font-', '').replace('letter-spacing', 'tracking').replace('line-height', 'line')} ${v}`).join(' · ');
  const how = style.form === 'tag' ? `${style.tag} {}` : style.form === 'tailwind-theme' ? `.${style.selectorOrUtility}` : style.form === 'vars' ? 'variables' : style.selectorOrUtility;
  return decl ? `${how} · ${decl}` : how;
}

/**
 * A copy of a page element for the specimen: ids and our own attributes
 * stripped, so a rule keyed on an id does not double up and a clone cannot
 * be mistaken for the page.
 */
export function cloneForSpecimen(el: Element): Element {
  const clone = el.cloneNode(true) as Element;
  for (const node of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    node.removeAttribute('id');
    for (const attr of Array.from(node.attributes)) if (attr.name.startsWith('data-codename')) node.removeAttribute(attr.name);
  }
  return clone;
}

/** The rule the specimen hides the page with: everything in the body but our own hosts. */
export const HIDE_PAGE_CSS = (specimenTag: string, ours: string[]) =>
  `body > :not(${[specimenTag, ...ours].join('):not(')}) { display: none !important; }\n${specimenTag} { display: block; box-sizing: border-box; padding: 32px 24px 64px; min-height: 100vh; }`;
