import { useCallback, useEffect, useRef, useState } from 'react';
import type { ElementProps } from '@/shared/types';
import type { LayerNode } from '@/studio/layers';
import { callInspector, SELECTED_EVENT } from '@/shared/inpage';

/** How long the page is left alone after a mutation before the tree is read again. */
const SETTLE_MS = 600;

/**
 * The tree, read from the inspector in the same page.
 *
 * Read when the rail shows, and again once the page has stopped changing:
 * a reorder the inspector applied, a framework re-render, a hot reload. The
 * selection follows the inspector's own announcement, so a click on the page
 * and an arrow walk light the row up the same as a pick here.
 */
export function useRailLayers(on: boolean) {
  const [layers, setLayers] = useState<LayerNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const reading = useRef(0);

  const refresh = useCallback(async () => {
    const turn = ++reading.current;
    setLoading(true);
    const list = await callInspector<LayerNode[]>({ cmd: 'layers' });
    // A later read is the newer word.
    if (turn !== reading.current) return;
    setLayers(list ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!on) return;
    void refresh();
    let timer = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), SETTLE_MS);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [on, refresh]);

  useEffect(() => {
    const onSelected = (e: Event) => setSelected((e as CustomEvent<string | null>).detail ?? null);
    document.addEventListener(SELECTED_EVENT, onSelected);
    // Whatever was picked before the rail came up.
    void callInspector<ElementProps | null>({ cmd: 'read' }).then((props) => {
      if (props) setSelected(props.selector);
    });
    return () => document.removeEventListener(SELECTED_EVENT, onSelected);
  }, []);

  return {
    layers,
    loading,
    selected,
    refresh: () => void refresh(),
    select: (node: LayerNode) => void callInspector({ cmd: 'select', selector: node.selector }),
    peek: (node: LayerNode | null) =>
      void callInspector(node ? { cmd: 'peek', selector: node.selector } : { cmd: 'unpeek' }),
  };
}
