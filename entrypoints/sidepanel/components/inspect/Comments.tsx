import { useEffect, useRef, useState } from 'react';
import type { Comment, CommentStatus } from '@/shared/protocol';
import type { ElementProps } from '@/shared/types';

const STATUS_LABEL: Record<CommentStatus, string> = {
  pending: 'pending',
  acknowledged: 'seen',
  resolved: 'resolved',
  dismissed: 'dismissed',
};

/**
 * Notes for the agent, pinned to elements. A note lives on the thing it is
 * about: the composer sits under the selected element and the pin on the
 * page carries the same number as the row here.
 */
export function CommentComposer({ element, onAdd }: { element: ElementProps; onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText('');
  };
  return (
    <div className="flex flex-col gap-1">
      <label className="text-2xs tracking-wide text-ink-muted uppercase" htmlFor="comment-composer">
        Note for the agent
      </label>
      <textarea
        id="comment-composer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
        rows={2}
        placeholder={`About ${element.intent.selector}…`}
        className="w-full resize-none rounded-control border border-line bg-surface-panel px-2 py-1 text-xs"
      />
      <div className="flex items-center gap-2">
        <span className="text-2xs text-ink-muted">⌘↩ to pin it</span>
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="ml-auto rounded-control bg-accent px-2 py-0.5 text-2xs font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-40"
        >
          Pin note
        </button>
      </div>
    </div>
  );
}

export function CommentList({
  comments,
  focusId,
  onSelect,
  onStatus,
  onRemove,
}: {
  comments: Comment[];
  /** A pin clicked on the page: scroll its row into view. */
  focusId: string | null;
  onSelect: (c: Comment) => void;
  onStatus: (id: string, status: CommentStatus) => void;
  onRemove: (id: string) => void;
}) {
  const rows = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (focusId) rows.current.get(focusId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusId]);

  if (!comments.length) return null;
  const open = comments.filter((c) => c.status === 'pending' || c.status === 'acknowledged').length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-2xs tracking-wide text-ink-muted uppercase">
          Notes <span className="ml-0.5 font-mono">{open}</span>
        </span>
      </div>
      {comments.map((c, i) => {
        const done = c.status === 'resolved' || c.status === 'dismissed';
        return (
          <div
            key={c.id}
            ref={(el) => {
              if (el) rows.current.set(c.id, el);
              else rows.current.delete(c.id);
            }}
            className={`flex flex-col gap-1 rounded-control border px-2 py-1.5 ${
              focusId === c.id ? 'border-accent bg-accent-soft/60' : 'border-line-subtle bg-surface-panel'
            } ${done ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-2xs font-semibold text-accent-ink">
                {i + 1}
              </span>
              <button
                onClick={() => onSelect(c)}
                className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:text-accent"
                title="Select this element on the page"
              >
                {c.selector}
              </button>
              <span
                className={`shrink-0 rounded-full border px-1.5 text-2xs ${
                  c.status === 'acknowledged' ? 'border-accent text-accent' : 'border-line text-ink-muted'
                }`}
              >
                {STATUS_LABEL[c.status]}
              </span>
            </div>
            <p className={`text-xs whitespace-pre-wrap ${done ? 'line-through' : ''}`}>{c.text}</p>
            {c.replies.map((r, j) => (
              <p key={j} className="border-l-2 border-line pl-2 text-2xs text-ink-secondary">
                <span className="text-ink-muted">{r.from === 'agent' ? 'agent' : 'you'} · </span>
                {r.text}
              </p>
            ))}
            <div className="flex items-center gap-2 text-2xs">
              {!done && (
                <button onClick={() => onStatus(c.id, 'resolved')} className="text-ink-muted hover:text-accent">
                  resolve
                </button>
              )}
              {done && (
                <button onClick={() => onStatus(c.id, 'pending')} className="text-ink-muted hover:text-accent">
                  reopen
                </button>
              )}
              <button onClick={() => onRemove(c.id)} className="ml-auto text-ink-muted hover:text-warn-ink">
                delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
