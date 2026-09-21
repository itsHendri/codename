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
import { setStateHoist, applyElementRules, isElementProps, probeComponent, sendInspector } from './messaging';
import { conditionKey, widthConditions, type Condition, type MaybeCondition, type StateName } from '@/studio/conditions';
import type { HoistedRule } from '@/studio/conditionSheet';
import {
  addComment as addCommentToSession,
  getSession,
  removeComment as removeCommentFromSession,
  setCommentStatus as setStatusInSession,
  setPinned,
  updateSession,
  type TabSession,
} from './session';
import { firstSelector, pinsOf } from './comments';
import { paddingShorthand } from '@/studio/boxModel';

export type Scope = 'element' | 'all';

export interface InspectController {
  element: ElementProps | null;
  log: ChangeLog;
  /** Write to this element only, or to every element the class selector matches. */
  scope: Scope;
  setScope(scope: Scope): void;
  /** The state edits are being made in; undefined is the default one. */
  condition: MaybeCondition;
  setCondition(condition: MaybeCondition): void;
  /** What the page itself already does to this element in that state. Read-only. */
  cascade: HoistedRule[];
  /** The widths this page is written against, which is what may be chosen. */
  widths: Condition[];
  /**
   * Run the transition into the state being held: the element leaves the
   * state and comes back, which is what a pointer does and what a duration is
   * judged by.
   */
  playCondition(): void;
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
  /** Light a layer up on the page without selecting it. */
  /** Hide a layer, or take the hiding back. */
  toggleHidden(node: LayerNode): void;
  /** Put a layer somewhere else among its siblings: before `before`, or last. */
  move(node: LayerNode, parent: LayerNode, before: LayerNode | null, wasIn: LayerNode, wasBefore: LayerNode | null): void;
}

/** How a row reads in a sentence: its label, and its text when it has some. */
const rowName = (n: LayerNode) => `\`${n.selector}\`${n.text ? ` ("${n.text.slice(0, 30)}")` : ''}`;

export { paddingShorthand } from '@/studio/boxModel';

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
    'min-width': el.box.minWidth,
    'min-height': el.box.minHeight,
    'max-width': el.box.maxWidth,
    'max-height': el.box.maxHeight,
    gap: el.box.gap,
    'row-gap': el.box.rowGap,
    'column-gap': el.box.columnGap,
    overflow: el.box.overflowX === el.box.overflowY ? el.box.overflowX : `${el.box.overflowX} ${el.box.overflowY}`,
    display: el.box.display,
    position: el.position.type,
    top: el.position.top,
    right: el.position.right,
    bottom: el.position.bottom,
    left: el.position.left,
    'z-index': el.position.zIndex,
    flex: `${el.child.flexGrow} ${el.child.flexShrink} ${el.child.flexBasis}`,
    'flex-grow': el.child.flexGrow,
    'flex-shrink': el.child.flexShrink,
    'flex-basis': el.child.flexBasis,
    'align-self': el.child.alignSelf,
    order: el.child.order,
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
    filter: el.filter,
    'backdrop-filter': el.backdropFilter,
    transition: el.transition,
    text: el.text ?? '',
  };
  return map[property] ?? '';
}

/**
 * One rule for everything the page holds on the panel's behalf — rules,
 * moves, pins: send when the value changes, send again when the page comes
 * back (the generation counter), and never send an empty value to a page
 * that was never told anything, since it has nothing to take back.
 */
function usePush(tabId: number | null, generation: number, key: string, empty: boolean, send: () => void) {
  const sent = useRef<{ tabId: number | null; key: string; generation: number } | null>(null);
  useEffect(() => {
    if (tabId == null) return;
    const last = sent.current;
    if (last && last.tabId === tabId && last.key === key && last.generation === generation) return;
    const fresh = !last || last.tabId !== tabId || last.generation !== generation;
    // Nothing to say to a page that has heard nothing.
    if (empty && fresh && (!last || last.tabId !== tabId)) return;
    sent.current = { tabId, key, generation };
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, generation, key]);
}

export function useInspect(
  tabId: number | null,
  tabUrl: string,
  session: Pick<TabSession, 'pinned' | 'log' | 'generation' | 'comments' | 'mode' | 'varOverrides' | 'colorEdits' | 'scan'>,
  focusedComment: string | null,
): InspectController {
  const { pinned: element, log, generation, comments } = session;
  const [scope, setScope] = useState<Scope>('element');
  const [condition, setConditionState] = useState<MaybeCondition>(undefined);
  const [cascade, setCascade] = useState<HoistedRule[]>([]);
  const [measuring, setMeasuring] = useState(false);
  const [noting, setNoting] = useState(false);
  const [holding, setHolding] = useState(false);

  // Pins follow the notes; pushed again after a reload, like the rules.
  const pins = useMemo(() => pinsOf(comments), [comments]);
  usePush(tabId, generation, JSON.stringify(pins), pins.length === 0, () => {
    void sendInspector(tabId!, { cmd: 'pins', pins });
  });

  const setLog = useCallback((next: ChangeLog | ((l: ChangeLog) => ChangeLog)) => {
    updateSession((s) => ({ log: typeof next === 'function' ? next(s.log) : next }));
  }, []);

  // Push the rules whenever they change, and again after the page reloads
  // (the generation counter), when the managed sheet has to be rebuilt.
  const rules = useMemo(() => (holding ? [] : toRules(log)), [log, holding]);
  const darkPreview = session.mode === 'dark';
  usePush(tabId, generation, JSON.stringify([rules, darkPreview]), rules.length === 0, () => {
    void applyElementRules(tabId!, rules, darkPreview).then(() => {
      // Computed values moved; show the element as it is now.
      void sendInspector<ElementProps | null>(tabId!, { cmd: 'read' }).then((props) => {
        if (isElementProps(props)) updateSession({ pinned: props });
      });
    });
  });

  // What rendered the selection, from the page's own world. Keyed on the
  // selector, so it runs once per selection rather than on every re-read;
  // an element whose attributes already named it is not asked again.
  const probed = useRef<string | null>(null);
  useEffect(() => {
    const selector = element?.selector;
    if (tabId == null || !selector || element?.component) return;
    if (probed.current === selector) return;
    probed.current = selector;
    void probeComponent(tabId, selector).then((component) => {
      if (!component) return;
      // The selection may have moved on while the page was answering.
      const current = getSession().pinned;
      if (current?.selector !== selector || current.component) return;
      updateSession({ pinned: { ...current, component } });
    });
  }, [tabId, element?.selector, element?.component]);

  // Text is the one push that is not whole-state: an edit taken back has to
  // be restored to its original words, which only the log remembers.
  const sentText = useRef<Map<string, string>>(new Map());
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
  usePush(tabId, generation, JSON.stringify(moves), moves.length === 0, () => {
    void sendInspector(tabId!, { cmd: 'moves', moves });
  });

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
          // The page is being held in this state while it is chosen, so what
          // the element paints right now is the honest `from`.
          ...(condition ? { condition } : {}),
          from: readValue(element, property),
          to,
          token,
          // An edit widened to every match belongs to no one component, so
          // the name of the one that was clicked would be a wrong fact.
          ...(!wide && element.component ? { component: element.component } : {}),
        }),
      );
    },
    [element, scope, setLog, condition],
  );

  /**
   * Choose the state to edit in.
   *
   * Only the choice is made here. Turning the page into that state — the
   * class, the hoisted rules, re-reading the element — happens in one place
   * below, because doing it here as well meant every click walked the page's
   * stylesheets twice and left two `state-set` messages racing each other.
   */
  const setCondition = useCallback((next: MaybeCondition) => {
    setConditionState(next);
    setCascade([]);
  }, []);

  /**
   * A width is only a width this page has.
   *
   * The widths on offer come from the page's own stylesheets, so a scan — the
   * first one, or one after navigating — can change the list under a choice
   * already made. Left alone the control would quietly show nothing while
   * edits went on being filed at a width this page never mentions, which is
   * the exact thing reading the page's breakpoints was meant to prevent.
   */
  const offered = useMemo(() => widthConditions(session.scan?.breakpoints), [session.scan?.breakpoints]);
  useEffect(() => {
    if (condition?.kind !== 'width') return;
    if (offered.some((w) => conditionKey(w) === conditionKey(condition))) return;
    setConditionState(undefined);
    setCascade([]);
  }, [offered, condition]);

  /**
   * Put the page into the chosen state, and read the element back.
   *
   * Runs on a new state, a new selection, and a reload (the generation
   * counter), which is what the managed sheets already do — without it the
   * bar would go on claiming "hover" over a page that had forgotten.
   *
   * The element must be read again afterwards: the whole point is that the
   * values shown, and the `from` of the next edit, are that state's. An
   * out-of-order answer is dropped rather than shown, since the walk can take
   * a moment on a large page and a person can click faster than that.
   */
  const state = condition?.kind === 'state' ? condition.state : null;
  const selector = element?.selector ?? null;
  // The hoist copies the page's own rules as they stand, and a re-skin
  // changes what they say. Without this the element would go on previewing
  // the hover colour it had before the variable moved.
  const painted = JSON.stringify([session.varOverrides, session.colorEdits, session.mode]);
  const held = useRef(false);
  /** What the page is actually being held in, for the Play timeout to check. */
  const heldNow = useRef<StateName | null>(null);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (playTimer.current) clearTimeout(playTimer.current);
  }, []);
  useEffect(() => {
    if (tabId == null) return;
    // Nothing to say to a page that has never been put into a state.
    if (!state && !held.current) return;
    held.current = state !== null;
    heldNow.current = state;
    let live = true;
    void sendInspector(tabId, { cmd: 'state', state });
    void setStateHoist(tabId, state, state ? selector : null).then((found) => {
      if (!live) return;
      setCascade(found);
      void sendInspector<ElementProps | null>(tabId, { cmd: 'read' }).then((props) => {
        if (live && isElementProps(props)) updateSession({ pinned: props });
      });
    });
    return () => {
      live = false;
    };
  }, [tabId, selector, state, generation, painted]);

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
          ...(element.component ? { component: element.component } : {}),
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
    condition,
    setCondition,
    cascade,
    widths: offered,
    playCondition: () => {
      if (tabId == null || !state) return;
      // Off, then on a frame later: the same change applied in one go would
      // not transition, since there would be nothing to transition from.
      if (playTimer.current) clearTimeout(playTimer.current);
      void sendInspector(tabId, { cmd: 'state', state: null });
      playTimer.current = setTimeout(() => {
        playTimer.current = null;
        // The state may have been let go inside those 60ms, and putting it
        // back then would leave the page held in something the panel no
        // longer believes it is in.
        if (heldNow.current !== state) return;
        void sendInspector(tabId, { cmd: 'state', state });
      }, 60);
    },
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
      // The effect above takes the class off and drops the hoisted sheet when
      // the condition goes; without this the panel would go on claiming to be
      // editing a state nothing is in.
      setConditionState(undefined);
      setCascade([]);
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
    // The tree lives in the rail, in the page; a drag or the eye there is an
    // element edit, and this is where element edits are filed.
    move: (node, parent, before, wasIn, wasBefore) => {
      const samePlace = parent.id === wasIn.id && (before?.id ?? null) === (wasBefore?.id ?? null);
      if (before?.id === node.id || samePlace) return;
      const place = (p: LayerNode, b: LayerNode | null) =>
        b ? `before ${rowName(b)} in \`${p.selector}\`` : `last in \`${p.selector}\``;
      setLog((l) =>
        commit(l, {
          selector: node.selector,
          matches: 1,
          stable: node.stable,
          property: 'move',
          from: place(wasIn, wasBefore),
          to: place(parent, before),
          move: { parent: parent.selector, before: before?.selector ?? null },
        }),
      );
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
    },
  };
}
