// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SideStrip, STRIP_WIDTH } from './SideStrip';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Icon = ({ className }: { className?: string }) => <i className={className} />;
const items = [
  { key: 'pages', label: 'Pages', Icon },
  { key: 'layers', label: 'Layers', Icon },
  { key: 'assets', label: 'Assets', Icon },
] as const;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('the rail strip', () => {
  it('is a vertical tablist the width of the strip, the open section lit', async () => {
    const onSelect = vi.fn();
    await act(async () => root.render(<SideStrip items={items} active="layers" open onSelect={onSelect} ariaLabel="Rail" idPrefix="s" />));
    const nav = host.querySelector('[role=tablist]')!;
    expect(nav.getAttribute('aria-orientation')).toBe('vertical');
    expect((nav as HTMLElement).style.width).toBe(`${STRIP_WIDTH}px`);
    const tabs = Array.from(host.querySelectorAll('[role=tab]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Pages', 'Layers', 'Assets']);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.getAttribute('aria-expanded')).toBe('true');
    expect(tabs[1]?.className).toContain('bg-surface-control');
  });

  it('is not lit when the column is folded, and still names the section', async () => {
    await act(async () => root.render(<SideStrip items={items} active="layers" open={false} onSelect={() => {}} ariaLabel="Rail" idPrefix="s" />));
    const tab = host.querySelectorAll('[role=tab]')[1]!;
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.getAttribute('aria-expanded')).toBe('false');
    expect(tab.className).not.toMatch(/(^|\s)bg-surface-control(\s|$)/);
  });

  it('moves the selection with the arrow keys, wrapping', async () => {
    const onSelect = vi.fn();
    await act(async () => root.render(<SideStrip items={items} active="assets" open onSelect={onSelect} ariaLabel="Rail" idPrefix="s" />));
    const nav = host.querySelector('[role=tablist]')!;
    await act(async () => nav.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(onSelect).toHaveBeenLastCalledWith('pages');
    await act(async () => nav.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(onSelect).toHaveBeenLastCalledWith('layers');
  });
});
