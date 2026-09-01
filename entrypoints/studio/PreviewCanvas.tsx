import { useEffect, useRef, useState } from 'react';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { previewCss } from '@/studio/export/css';
import { PREVIEW_HTML } from './previewKit';

type Context = 'app' | 'marketing' | 'components';
type Width = 'fill' | 390 | 768 | 1280;

/**
 * A real iframe, not a constrained div: `vw` units and media queries have to
 * resolve against an actual viewport or the preview lies about responsive work.
 *
 * The theme attribute goes on the iframe's own documentElement and the CSS is
 * scoped to `:root` — the same selector. Setting it on a wrapper element while
 * the stylesheet targets `:root[data-theme]` renders light values under a UI
 * that says "dark", with every test still green.
 */
export function PreviewCanvas({ resolved, mode }: { resolved: ResolvedTokens; mode: Mode }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [context, setContext] = useState<Context>('app');
  const [width, setWidth] = useState<Width>('fill');
  const [ready, setReady] = useState(false);

  // Write the shell once per mount.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(PREVIEW_HTML);
    doc.close();
    setReady(true);
  }, []);

  // Re-inject tokens whenever they change.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !ready) return;
    let style = doc.getElementById('studio-tokens') as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = 'studio-tokens';
      doc.head.appendChild(style);
    }
    style.textContent = previewCss(resolved, ':root');
    doc.documentElement.setAttribute('data-theme', mode);
  }, [resolved, mode, ready]);

  // Show/hide the context sections without rebuilding the document.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !ready) return;
    for (const section of Array.from(doc.querySelectorAll<HTMLElement>('[data-context]'))) {
      section.hidden = section.dataset.context !== context;
    }
  }, [context, ready]);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-gray-50">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
        <span className="text-sm">Live preview</span>
        <div className="flex gap-1.5">
          {(['app', 'marketing', 'components'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setContext(c)}
              className={`rounded-full border px-2.5 py-0.5 text-xs capitalize ${
                context === c ? 'border-blue-600 text-blue-600' : 'border-gray-300 text-gray-500'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          {([['fill', 'Fill'], [390, '390'], [768, '768'], [1280, '1280']] as const).map(
            ([value, label]) => (
              <button
                key={label}
                onClick={() => setWidth(value as Width)}
                className={`rounded border px-2 py-0.5 text-xs ${
                  width === value ? 'border-gray-800 text-gray-800' : 'border-gray-300 text-gray-400'
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4">
        <iframe
          ref={frame}
          title="Design system preview"
          className="h-full rounded-lg border border-gray-300 bg-white shadow-sm"
          style={{ width: width === 'fill' ? '100%' : `${width}px`, maxWidth: '100%' }}
        />
      </div>
    </div>
  );
}
