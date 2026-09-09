/**
 * What the Layers tab can do to the page, behind one object.
 *
 * The components render `InspectController`; `useInspect` is the only
 * implementation and owns the change log, the messages to the inspector and
 * the managed stylesheet. Keeping the contract narrow is what lets the panel
 * be laid out in the harness with a stubbed page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementProps } from '@/shared/types';
import type { Comment, CommentStatus } from '@/shared/protocol';
import type { CommentTarget } from '@/studio/annotations';
import type { LayerNode } from '@/studio/layers';
import {
  active,
  canRedo,
  canUndo,
  commit,
  redo as redoLog,
  revert as revertLog,
  revertAll as revertAllLog,
  toMoves,
  toRules,
  toTextEdits,
  undo as undoLog,
  type ChangeLog,
} from '@/studio/changes';
import { applyElementRules, sendInspector } from './messaging';
import {
  addComment as addCommentToSession,
  removeComment as removeCommentFromSession,
  setCommentStatus as setStatusInSession,
  setPinned,
  updateSession,
  type TabSession,
} from './session';
import { firstSelector, pinsOf } from './comments';

export type Scope = 'element' | 'all';

export interface InspectController {
  element: ElementProps | null;
  log: ChangeLog;
  /** Write to this element only, or to every element the class selector matches. */
  scope: Scope;
  setScope(scope: Scope): void;
  /** Commit a CSS longhand. `from` is read from the element; `token` names a chosen variable. */
  change(property: string, to: string, token?: string): void;
  /** Replace the element's text content. */
  setText(text: string): void;
  undo(): void;
  redo(): void;
  revert(id: string): void;
  /** Take every element edit back, keeping the history. */
  revertAll(): void;
  /** While held, the page shows itself without any element edits. */
  viewOriginal(hold: boolean): void;
  walk(dir: 'parent' | 'child' | 'next' | 'prev'): void;
  /** Select an ancestor by its index in `element.breadcrumb`. */
  ancestor(index: number): void;
  measure(on: boolean): void;
  measuring: boolean;
  clear(): void;
  /** Notes pinned to elements on this page. */
  comments: Comment[];
  /** The note whose pin was last clicked on the page. */
  focusedComment: string | null;
  /** Pin a note. Without a target it is about the current selection. */
  addComment(text: string, target?: CommentTarget): void;
  removeComment(id: string): void;
  setCommentStatus(id: string, status: CommentStatus): void;
  /** Select the element a note is about. */
  selectComment(comment: Comment): void;
  /** Note mode: draw a box, click, shift-click, or select text on the page. */
  noting: boolean;
  setNoting(on: boolean): void;
  /** The page flipped its own switch; take the state without echoing it back. */
  setNotingFromPage(on: boolean): void;
  /** The page as a list to pick from. Read on demand, not kept in step. */
  layers: LayerNode[];
  layersLoading: boolean;
  refreshLayers(): void;
  selectLayer(node: LayerNode): void;
  /** Light a layer up on the page without selecting it. */
  peekLayer(node: LayerNode | null): void;
  /** Hide a layer, or take the hiding back. */
  toggleHidden(node: LayerNode): void;
  /** Put a layer somewhere else among its siblings: before `before`, or last. */
  move(node: LayerNode, parent: LayerNode, before: LayerNode | null, wasBefore: LayerNode | null): void;
}

/** How a row reads in a sentence: its label, and its text when it has some. */
const rowName = (n: LayerNode) => `\`${n.selector}\`${n.text ? ` ("${n.text.slice(0, 30)}")` : ''}`;

/**
 * Four sides as the shortest shorthand that says the same thing, units kept:
 * `8px` when all agree, `8px 16px` when the pairs do, all four otherwise.
 */
export function paddingShorthand(box: Pick<ElementProps['box'], 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'>): string {
  const z = (v: string) => (v === '0px' ? '0' : v);
  const [t, r, b, l] = [box.paddingTop, box.paddingRight, box.paddingBottom, box.paddingLeft].map(z);
  if (t === r && r === b && b === l) return t!;
  if (t === b && r === l) return `${t} ${r}`;
  return `${t} ${r} ${b} ${l}`;
}

/** The current value of a longhand, as the element reports it. */
export function readValue(el: ElementProps, property: string): string {
  const map: Record<string, string> = {
    padding: paddingShorthand(el.box),
    'margin-top': el.box.marginTop,
    'margin-right': el.box.marginRight,
    'margin-bottom': el.box.marginBottom,
    'margin-left': el.box.marginLeft,
    'padding-top': el.box.paddingTop,
    'padding-right': el.box.paddingRight,
    'padding-bottom': el.box.paddingBottom,
    'padding-left': el.box.paddingLeft,
    width: el.box.width,
    height: el.box.height,
    gap: el.box.gap,
    display: el.box.display,
    'flex-direction': el.layout.flexDirection,
    'justify-content': el.layout.justifyContent,
    'align-items': el.layout.alignItems,
    'flex-wrap': el.layout.flexWrap,
    opacity: el.opacity,
    'font-family': el.type.fontFamily,
    'font-size': el.type.fontSize,
    'font-weight': el.type.fontWeight,
    'line-height': el.type.lineHeight,
    'letter-spacing': el.type.letterSpacing,
    'text-align': el.type.textAlign,
    color: el.color.text,
    'background-color': el.color.background,
    'border-color': el.border.color,
    'border-radius': el.radius,
    'border-top-left-radius': el.corners.topLeft,
    'border-top-right-radius': el.corners.topRight,
    'border-bottom-right-radius': el.corners.bottomRight,
    'border-bottom-left-radius': el.corners.bottomLeft,
    'border-width': el.border.width,
    'border-style': el.border.style,
    'box-shadow': el.shadow,
    text: el.text ?? '',
  };
  return map[property] ?? '';
}

export function useInspect(
  tabId: number | null,
  tabUrl: string,
  session: Pick<TabSession, 'pinned' | 'log' | 'generation' | 'comments'>,
  focusedComment: string | null,
): InspectController {
  const { pinned: element, log, generation, comments } = session;
  const [scope, setScope] = useState<Scope>('element');
  const [measuring, setMeasuring] = useState(false);
  const [noting, setNoting] = useState(false);
  const [layers, setLayers] = useState<LayerNode[]>([]);
  const [layersLoading, setLayersLoading] = useState(false);
  const [holding, setHolding] = useState(false);

  // Pins follow the notes; pushed again after a reload, like the rules.
  const pinsKey = JSON.stringify(pinsOf(comments));
  useEffect(() => {
    if (tabId == null || (!comments.length && generation === 0)) return;
    void sendInspector(tabId, { cmd: 'pins', pins: pinsOf(comments) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, pinsKey, generation]);

  const setLog = useCallback((next: ChangeLog | ((l: ChangeLog) => ChangeLog)) => {
    updateSession((s) => ({ log: typeof next === 'function' ? next(s.log) : next }));
  }, []);

  // Push the rules whenever they change, and again after the page reloads
  // (the generation counter), when the managed sheet has to be rebuilt.
  const rules = useMemo(() => (holding ? [] : toRules(log)), [log, holding]);
  const rulesKey = JSON.stringify(rules);
  const sentText = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (tabId == null) return;
    if (!rules.length && !log.entries.length) return;
    void applyElementRules(tabId, rules).then(() => {
      // Computed values moved; show the element as it is now.
      void sendInspector<ElementProps | null>(tabId, { cmd: 'read' }).then((props) => {
        if (props) updateSession({ pinned: props });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, rulesKey, generation]);

  useEffect(() => {
    if (tabId == null) return;
    const edits = holding ? [] : toTextEdits(log);
    const wanted = new Map(edits.map((e) => [e.selector, e.text]));
    // Restore text for selectors that no longer have an edit in force.
    for (const [selector, text] of sentText.current) {
      if (!wanted.has(selector)) {
        const original = log.entries.find((e) => e.selector === selector && e.property === 'text')?.from;
        if (original !== undefined && text !== original) void sendInspector(tabId, { cmd: 'text', selector, text: original });
      }
    }
    for (const [selector, text] of wanted) {
      if (sentText.current.get(selector) !== text) void sendInspector(tabId, { cmd: 'text', selector, text });
    }
    sentText.current = wanted;
  }, [tabId, log, holding, generation]);

  // Reorders, pushed whole like the rules: the page restores what it moved
  // and applies the list afresh, so undo and revert need no special case.
  const moves = useMemo(() => (holding ? [] : toMoves(log)), [log, holding]);
  const movesKey = JSON.stringify(moves);
  const sentMoves = useRef('');
  useEffect(() => {
    if (tabId == null) return;
    if (sentMoves.current === movesKey && generation === 0) return;
    if (!moves.length && !sentMoves.current) return;
    sentMoves.current = movesKey;
    void sendInspector(tabId, { cmd: 'moves', moves });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, movesKey, generation]);

  const refreshLayers = useCallback(() => {
    if (tabId == null) return;
    setLayersLoading(true);
    void sendInspector<LayerNode[]>(tabId, { cmd: 'layers' })
      .then((list) => setLayers(list ?? []))
      .finally(() => setLayersLoading(false));
  }, [tabId]);

  // A new page is a new tree; the old one describes something that is gone.
  useEffect(() => {
    setLayers([]);
  }, [tabId, generation]);

  const change = useCallback(
    (property: string, to: string, token?: string) => {
      if (!element) return;
      const wide = scope === 'all' && element.intent.matches > 1;
      setLog((l) =>
        commit(l, {
          selector: wide ? element.intent.selector : element.selector,
          matches: wide ? element.intent.matches : element.matches,
          stable: wide ? true : element.stable,
          property,
          from: readValue(element, property),
          to,
          token,
        }),
      );
    },
    [element, scope, setLog],
  );

  const setText = useCallback(
    (text: string) => {
      if (!element || element.text === null || text === element.text) return;
      setLog((l) =>
        commit(l, {
          selector: element.selector,
          matches: element.matches,
          stable: element.stable,
          property: 'text',
          from: element.text ?? '',
          to: text,
        }),
      );
    },
    [element, setLog],
  );

  /** The selected element, as a note target, honouring the scope switch. */
  const targetForSelection = useCallback((): CommentTarget | null => {
    if (!element) return null;
    const wide = scope === 'all' && element.intent.matches > 1;
    return wide
      ? { kind: 'element', selector: element.intent.selector, matches: element.intent.matches }
      : { kind: 'element', selector: element.selector, matches: element.matches };
  }, [element, scope]);

  const send = useCallback(
    (cmd: Parameters<typeof sendInspector>[1]) => {
      if (tabId != null) void sendInspector(tabId, cmd);
    },
    [tabId],
  );

  return {
    element,
    log,
    scope,
    setScope,
    change,
    setText,
    undo: () => setLog((l) => (canUndo(l) ? undoLog(l) : l)),
    redo: () => setLog((l) => (canRedo(l) ? redoLog(l) : l)),
    revert: (id) => setLog((l) => revertLog(l, id)),
    revertAll: () => setLog((l) => revertAllLog(l)),
    viewOriginal: setHolding,
    walk: (dir) => send({ cmd: 'walk', dir }),
    ancestor: (index) => send({ cmd: 'ancestor', depth: index }),
    measure: (on) => {
      setMeasuring(on);
      send({ cmd: 'measure', on });
    },
    measuring,
    clear: () => {
      send({ cmd: 'deselect' });
      setPinned(null);
    },
    comments,
    focusedComment,
    addComment: (text, target) => {
      const about = target ?? targetForSelection();
      if (!about) return;
      addCommentToSession(about, tabUrl, text);
    },
    removeComment: removeCommentFromSession,
    setCommentStatus: setStatusInSession,
    selectComment: (c) => {
      const selector = firstSelector(c.target);
      if (selector) send({ cmd: 'select', selector });
    },
    noting,
    setNoting: (on) => {
      setNoting(on);
      send({ cmd: 'note', on });
    },
    setNotingFromPage: setNoting,
    layers,
    layersLoading,
    refreshLayers,
    selectLayer: (node) => send({ cmd: 'select', selector: node.selector }),
    peekLayer: (node) => (node ? send({ cmd: 'peek', selector: node.selector }) : send({ cmd: 'unpeek' })),
    move: (node, parent, before, wasBefore) => {
      if (before?.id === node.id || (before === null && wasBefore === null) || before?.id === wasBefore?.id) return;
      setLog((l) =>
        commit(l, {
          selector: node.selector,
          matches: 1,
          stable: node.stable,
          property: 'move',
          from: wasBefore ? `before ${rowName(wasBefore)}` : `last in \`${parent.selector}\``,
          to: before ? `before ${rowName(before)} in \`${parent.selector}\`` : `last in \`${parent.selector}\``,
          move: { parent: parent.selector, before: before?.selector ?? null },
        }),
      );
      window.setTimeout(refreshLayers, 160);
    },
    toggleHidden: (node) => {
      // Hiding is an element edit like any other, so it undoes, reverts and
      // reaches the agent through the same list. Showing again is that edit
      // taken back, which lets the page's own CSS decide what display means.
      const existing = active(log).find(
        (e) => e.selector === node.selector && e.property === 'display' && e.to === 'none',
      );
      setLog((l) => (existing ? revertLog(l, existing.id) : commit(l, {
        selector: node.selector,
        matches: 1,
        stable: node.stable,
        property: 'display',
        from: node.display,
        to: 'none',
      })));
      window.setTimeout(refreshLayers, 120);
    },
  };
}
