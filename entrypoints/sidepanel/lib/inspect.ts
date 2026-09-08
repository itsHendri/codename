/**
 * What the Inspect tab can do to the page, behind one object.
 *
 * The components render `InspectController`; `useInspect` is the only
 * implementation and owns the change log, the messages to the inspector and
 * the managed stylesheet. Keeping the contract narrow is what lets the panel
 * be laid out in the harness with a stubbed page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementProps } from '@/shared/types';
import type { Comment, CommentStatus } from '@/shared/protocol';
import {
  canRedo,
  canUndo,
  commit,
  redo as redoLog,
  revert as revertLog,
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
import { pinsOf } from './comments';

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
  addComment(text: string): void;
  removeComment(id: string): void;
  setCommentStatus(id: string, status: CommentStatus): void;
  /** Select the element a note is about. */
  selectComment(comment: Comment): void;
}

/** The current value of a longhand, as the element reports it. */
export function readValue(el: ElementProps, property: string): string {
  const map: Record<string, string> = {
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
    addComment: (text) => {
      if (!element) return;
      const wide = scope === 'all' && element.intent.matches > 1;
      addCommentToSession(wide ? element.intent.selector : element.selector, wide ? element.intent.matches : 1, tabUrl, text);
    },
    removeComment: removeCommentFromSession,
    setCommentStatus: setStatusInSession,
    selectComment: (c) => send({ cmd: 'select', selector: c.selector }),
  };
}
