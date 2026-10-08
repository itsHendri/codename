import { createContext, useContext } from 'react';

/**
 * Where the panel's popups (listboxes, the token chip's menu) are drawn: a
 * layer inside the panel's own root, so they wear its theme and stay inside
 * what the panel owns. Outside a panel (a test of one field) they fall back
 * to the document's body.
 */
export const PopupLayer = createContext<HTMLElement | null>(null);

export const usePopupLayer = () => useContext(PopupLayer) ?? undefined;
