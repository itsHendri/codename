// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerNode } from '@/studio/layers';
import { LayersTree } from './LayersTree';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW = 24;
const node = (id: number, depth: number, label: string, descendants: number): LayerNode => ({
  id,
  depth,
  label,
  descendants,
  tag: label.split(/[.#]/)[0]!,
  selector: label,
  stable: true,
  matches: 1,
  hidden: false,
  display: 'block',
});
// body > main > (h1, p.lede, div.card > span, h4)
const tree = () => [
  node(0, 0, 'body', 5),
  node(1, 1, 'main', 4),
  node(2, 2, 'h1#title', 0),
  node(3, 2, 'p.lede', 0),
  node(4, 2, 'div.card', 1),
  node(5, 3, 'span.tag', 0),
  node(6, 2, 'h4', 0),
];

let host: HTMLDivElement;
let root: Root;
const rows = () => Array.from(host.querySelectorAll<HTMLElement>('[role=treeitem]'));
const row = (label: string) => rows().find((r) => r.querySelector('button:nth-of-type(2)')?.textContent?.startsWith(label))!;

// happy-dom lays nothing out: each row is 24px tall, stacked in order.
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const i = rows().indexOf(this);
    if (i >= 0) return { top: i * ROW, bottom: (i + 1) * ROW, left: 0, right: 200, width: 200, height: ROW, x: 0, y: i * ROW, toJSON() {} } as DOMRect;
    return { top: 0, bottom: 1000, left: 0, right: 200, width: 200, height: 1000, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  await act(async () => root.unmount());
  host.remove();
});

const render = async (nodes: LayerNode[], onMove = vi.fn()) => {
  await act(async () =>
    root.render(
      <LayersTree
        nodes={nodes}
        selectedSelector={null}
        onSelect={() => {}}
        onPeek={() => {}}
        onToggleHidden={() => {}}
        onMove={onMove}
        onRefresh={() => {}}
        loading={false}
      />,
    ),
  );
  return onMove;
};

const pointer = (type: string, el: Element, y: number) =>
  act(async () => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: 60, clientY: y, pointerId: 1, button: 0, buttons: 1 }));
  });
/** Press on a row's name and carry it to `y`. */
const carry = async (label: string, y: number) => {
  const from = row(label);
  const start = rows().indexOf(from) * ROW + 12;
  await pointer('pointerdown', from.querySelectorAll('button')[1]!, start);
  for (const step of [start + 6, (start + y) / 2, y]) await pointer('pointermove', from, step);
  return from;
};

describe('carrying a layer', () => {
  it('shows the row in hand and a line where it lands, and moves it there on release', async () => {
    const onMove = await render(tree());
    // h4 carried up to the top edge of p.lede: before it, inside main.
    const from = await carry('h4', 3 * ROW + 3);
    const ghost = host.querySelector('.fixed');
    expect(ghost?.textContent).toContain('h4');
    expect(from.className).toContain('opacity-35');
    expect(host.querySelector('[role=tree] .bg-accent')).not.toBeNull();

    await pointer('pointerup', from, 3 * ROW + 3);
    expect(onMove).toHaveBeenCalledTimes(1);
    const [moved, parent, before, wasIn] = onMove.mock.calls[0]!;
    expect([moved.label, parent.label, before?.label, wasIn.label]).toEqual(['h4', 'main', 'p.lede', 'main']);
    expect(host.querySelector('.fixed')).toBeNull();
  });

  it('lights a group up when the drop is into it', async () => {
    const onMove = await render(tree());
    const from = await carry('h1#title', 4 * ROW + 12);
    expect(row('div.card').className).toContain('bg-accent-soft');
    await pointer('pointerup', from, 4 * ROW + 12);
    const [moved, parent, before] = onMove.mock.calls[0]!;
    expect([moved.label, parent.label, before]).toEqual(['h1#title', 'div.card', null]);
  });

  it('puts it back on Escape', async () => {
    const onMove = await render(tree());
    const from = await carry('h4', 3 * ROW + 3);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(host.querySelector('.fixed')).toBeNull();
    await pointer('pointerup', from, 3 * ROW + 3);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('is not also a pick when the press became a drag', async () => {
    const onSelect = vi.fn();
    await act(async () =>
      root.render(
        <LayersTree nodes={tree()} selectedSelector={null} onSelect={onSelect} onPeek={() => {}} onToggleHidden={() => {}} onMove={() => {}} onRefresh={() => {}} loading={false} />,
      ),
    );
    const from = await carry('h4', 3 * ROW + 3);
    await pointer('pointerup', from, 3 * ROW + 3);
    await act(async () => (from.querySelectorAll('button')[1] as HTMLButtonElement).click());
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => (row('h4').querySelectorAll('button')[1] as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('holds the tree still while a row is in hand, whatever the page does', async () => {
    const onMove = await render(tree());
    const from = await carry('h4', 3 * ROW + 3);
    // The page re-renders mid-drag: a new reading with different numbers.
    await render(tree().map((n) => ({ ...n, id: n.id + 100 })), onMove);
    expect(rows()).toHaveLength(7);
    await pointer('pointerup', from, 3 * ROW + 3);
    const [moved, , before] = onMove.mock.calls[0]!;
    // The move names the rows from the reading it was picked up in.
    expect([moved.id, before?.id]).toEqual([6, 3]);
  });
});

describe('folding', () => {
  it('keeps what the person folded when the page is read again', async () => {
    await render(tree());
    expect(rows()).toHaveLength(7);
    await act(async () => (row('div.card').querySelector('button') as HTMLButtonElement).click());
    expect(rows()).toHaveLength(6);
    // A fresh reading: same elements, new row numbers.
    await render(tree().map((n) => ({ ...n, id: n.id + 50 })));
    expect(rows()).toHaveLength(6);
  });
});
