import { WarnIcon } from './icons';

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
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <svg className="h-14 w-14 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 L21 21 M8 10.5 H13 M10.5 8 V13" />
      </svg>
      <div className="text-lg font-medium text-ink">
        {needsAccess ? 'Codename needs access to this site' : 'Nothing read yet'}
      </div>
      <p className="max-w-60 text-sm text-ink-muted">
        {needsAccess
          ? 'Chrome asks once per site. Allow it and the page is read straight away — or turn on "Always allow localhost" in the menu.'
          : 'Read this page to pull its fonts, colors, SVGs and design tokens.'}
      </p>
      <button
        onClick={onScan}
        className="rounded-card border border-accent bg-accent-soft px-7 py-2 font-medium text-accent hover:bg-accent-soft"
      >
        {needsAccess ? 'Allow and read the page' : 'Read this page'}
      </button>
      <p className="text-xs text-ink-muted">the colour picker works anywhere, no access needed</p>
      {error && <p className="max-w-64 text-xs text-warn-ink">{error}</p>}
    </div>
  );
}

export function ScanningState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
      <svg className="h-6 w-6 animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 a10 10 0 0 1 10 10" />
      </svg>
      <div className="text-base text-ink-secondary">Reading the page&hellip;</div>
      <div className="w-full max-w-60 space-y-2">
        <div className="h-11 animate-pulse rounded-card bg-surface-control" />
        <div className="h-11 animate-pulse rounded-card bg-surface-control" />
        <div className="h-11 animate-pulse rounded-card bg-surface-control" />
      </div>
    </div>
  );
}

export function RestrictedState({ url, onOpenInspect }: { url: string; onOpenInspect: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <svg className="h-12 w-12 text-warn-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10 V7 a4 4 0 0 1 8 0 V10" />
        <circle cx="12" cy="15" r="1.4" />
      </svg>
      <div className="text-lg font-medium text-ink">Can&apos;t inspect this page</div>
      <p className="max-w-64 text-sm text-ink-muted">
        Chrome blocks extensions on this page ({url ? new URL(url).protocol.replace(':', '') : 'internal'} pages and
        the Web Store). Open a normal website to use Codename.
      </p>
      <div className="flex items-start gap-2 border-t border-dashed border-line-subtle pt-3 text-xs text-ink-muted">
        <WarnIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
        <span>
          Still available: the <b className="text-ink-secondary">colour picker</b> samples your whole
          screen
        </span>
      </div>
      <button
        onClick={onOpenInspect}
        className="rounded-card border border-line-strong px-5 py-1.5 text-ink hover:bg-surface-recessed"
      >
        Open Inspect
      </button>
    </div>
  );
}
