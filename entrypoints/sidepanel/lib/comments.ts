import type { Comment } from '@/shared/protocol';
import type { CommentNote } from '@/studio/commit';

/** What goes into the brief: the notes still waiting for someone. */
export function pendingNotes(comments: Comment[]): CommentNote[] {
  return comments
    .filter((c) => c.status === 'pending' || c.status === 'acknowledged')
    .map((c) => ({ id: c.id, selector: c.selector, matches: c.matches, text: c.text }));
}

/** Pins for the page overlay, numbered in creation order. */
export function pinsOf(comments: Comment[]): { id: string; selector: string; label: string; done: boolean }[] {
  return comments.map((c, i) => ({
    id: c.id,
    selector: c.selector,
    label: String(i + 1),
    done: c.status === 'resolved' || c.status === 'dismissed',
  }));
}
