import type { Comment } from '@/shared/protocol';
import { describeTarget, selectorsOf, type CommentTarget, type Pin } from '@/studio/annotations';
import type { CommentNote } from '@/studio/commit';

/** What goes into the brief: the notes still waiting for someone. */
export function pendingNotes(comments: Comment[]): CommentNote[] {
  return comments
    .filter((c) => c.status === 'pending' || c.status === 'acknowledged')
    .map((c) => ({
      id: c.id,
      about: describeTarget(c.target),
      selectors: selectorsOf(c.target),
      text: c.text,
    }));
}

/**
 * Pins for the page overlay, numbered in creation order. A note about a set
 * gets one pin per element, all carrying the same number.
 */
export function pinsOf(comments: Comment[]): Pin[] {
  const pins: Pin[] = [];
  comments.forEach((c, i) => {
    const label = String(i + 1);
    const done = c.status === 'resolved' || c.status === 'dismissed';
    if (c.target.kind === 'region') {
      pins.push({ id: c.id, label, done, rect: c.target.rect });
      return;
    }
    for (const selector of selectorsOf(c.target)) pins.push({ id: c.id, label, done, selector });
  });
  return pins;
}

/** The one selector a note can be re-selected by, if it has one. */
export function firstSelector(target: CommentTarget): string | null {
  return selectorsOf(target)[0] ?? null;
}
