// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SELECTED_EVENT } from '@/shared/inpage';
import { DsmColumn, isOn } from './DsmColumn';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const outline = {
  sections: [
    { key: 'type', title: 'Type', count: '2 styles', items: [{ key: 'h1', label: 'h1' }, { key: '.lede', label: 'lede' }] },
    { key: 'colour', title: 'Colour', count: '3 variables' },
  ],
};

let host: HTMLDivElement;
let root: Root;
const sent: unknown[] = [];
const handled: unknown[] = [];
beforeEach(() => {
  sent.length = 0;
  handled.length = 0;
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage: (m: unknown) => void sent.push(m) } };
  (window as unknown as { __codenameInspector: unknown }).__codenameInspector = { handle: async (c: unknown) => void handled.push(c) };
  document.body.innerHTML = `<codename-specimen><section data-codename-section="components"><div><div class="card" data-codename-for="div.card" data-codename-matches="2"></div></div></section></codename-specimen>`;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const tick = (ms = 30) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

describe('the DSM column', () => {
  it('lists the sections with counts, the type samples under Type, and the page\'s components counted off the page', async () => {
    await act(async () => root.render(<DsmColumn outline={outline} />));
    await tick(450);
    const text = host.textContent ?? '';
    expect(text).toContain('Type2 styles');
    expect(text).toContain('Colour3 variables');
    expect(text).toContain('Components1 pattern');
    expect(text).toContain('div.card×2');
  });

  it('lights the sample the page has selected, and selects one when picked', async () => {
    await act(async () => root.render(<DsmColumn outline={outline} />));
    await act(async () => void document.dispatchEvent(new CustomEvent(SELECTED_EVENT, { detail: '.lede' })));
    const lit = host.querySelector('[aria-current="true"]');
    expect(lit?.textContent).toContain('lede');
    // Something inside a cloned component reads relative to it, and lights the component.
    expect(isOn('div.card button.btn', 'div.card')).toBe(true);
    expect(isOn('div.cards', 'div.card')).toBe(false);
    const h1 = Array.from(host.querySelectorAll('button')).find((b) => b.title === 'Select the h1 sample')!;
    await act(async () => h1.click());
    expect(handled.at(-1)).toEqual({ cmd: 'select', selector: 'codename-specimen [data-codename-for="h1"]' });
  });

  it('asks the panel for Generate, Export and the way back', async () => {
    await act(async () => root.render(<DsmColumn outline={outline} />));
    const by = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent === label)!;
    await act(async () => by('Generate a system').click());
    await act(async () => by('Export').click());
    await act(async () => by('Back to the page').click());
    expect(sent).toEqual([
      { type: 'dsm-action', action: 'generate' },
      { type: 'dsm-action', action: 'export' },
      { type: 'dsm-toggled', on: false },
    ]);
  });
});
