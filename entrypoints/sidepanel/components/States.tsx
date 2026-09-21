import type { ReactNode } from 'react';
import { WarnIcon } from './icons';

/**
 * Every empty state in the panel, at one of two sizes. Full fills a tab: an
 * icon on a filled disc, a title, a line or two, and at most one action.
 * Inline sits in a column: a title and a line, left-aligned, no icon.
 */
export function Empty({
  icon,
  title,
  children,
  action,
  size = 'full',
  tone = 'ink',
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  size?: 'full' | 'inline';
  tone?: 'ink' | 'warn';
}) {
  if (size === 'inline') {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="text-xs font-medium text-ink">{title}</div>
        {children && <div className="text-xs text-ink-muted">{children}</div>}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-10 text-center">
      {icon && (
        <div
          className={`mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-surface-field ${
            tone === 'warn' ? 'text-warn-ink' : 'text-ink-muted'
          }`}
        >
          {icon}
        </div>
      )}
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="max-w-64 text-xs text-ink-muted">{children}</div>}
      {action && <div className="mt-2 flex flex-col items-center gap-2">{action}</div>}
    </div>
  );
}

export function EmptyState({
  onScan,
  error,
  needsAccess = false,
}: {
  onScan: () => void;
  error: string | null;
  needsAccess?: boolean;
}) {
  return (
    <div className="flex h-full flex-col justify-center">
      <Empty
        icon={
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 L21 21 M8 10.5 H13 M10.5 8 V13" />
          </svg>
        }
        title={needsAccess ? 'Codename needs access to this site' : 'Nothing read yet'}
        action={
          <>
            <button onClick={onScan} className="btn btn-lg btn-primary">
              {needsAccess ? 'Allow and read the page' : 'Read this page'}
            </button>
            {error && <p className="max-w-64 text-xs text-warn-ink">{error}</p>}
          </>
        }
      >
        {needsAccess
          ? 'Chrome asks once per site. Allow it and the page is read straight away — or turn on "Always allow localhost" in the menu.'
          : 'Read this page to pull its fonts, colors, SVGs and design tokens.'}
      </Empty>
    </div>
  );
}

export function ScanningState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
      <svg className="h-6 w-6 animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 a10 10 0 0 1 10 10" />
      </svg>
      <div className="text-sm text-ink-secondary">Reading the page&hellip;</div>
      <div className="w-full max-w-60 space-y-2">
        <div className="h-8 animate-pulse rounded-control bg-surface-field" />
        <div className="h-8 animate-pulse rounded-control bg-surface-field" />
        <div className="h-8 animate-pulse rounded-control bg-surface-field" />
      </div>
    </div>
  );
}

export function RestrictedState({ url, onOpenLayers }: { url: string; onOpenLayers: () => void }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <Empty
        tone="warn"
        icon={
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10 V7 a4 4 0 0 1 8 0 V10" />
            <circle cx="12" cy="15" r="1.4" />
          </svg>
        }
        title="Can't inspect this page"
        action={
          <>
            <div className="flex max-w-64 items-start gap-2 rounded-control bg-surface-field px-2.5 py-2 text-left text-xs text-ink-muted">
              <WarnIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Layers, Variables and the hand-off all need a page Chrome lets extensions read.</span>
            </div>
            <button onClick={onOpenLayers} className="btn btn-lg btn-secondary">
              Open Style
            </button>
          </>
        }
      >
        Chrome blocks extensions on this page ({url ? new URL(url).protocol.replace(':', '') : 'internal'} pages and
        the Web Store). Open a normal website to use Codename.
      </Empty>
    </div>
  );
}
