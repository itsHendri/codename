import { WarnIcon } from './icons';

export function EmptyState({ onScan, error }: { onScan: () => void; error: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3.5 px-8 text-center">
      <svg className="h-14 w-14 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 L21 21 M8 10.5 H13 M10.5 8 V13" />
      </svg>
      <div className="text-base font-medium text-gray-800">Nothing scanned yet</div>
      <p className="max-w-[240px] text-xs text-gray-500">
        Scan this page to pull its fonts, colors, SVGs and design tokens.
      </p>
      <button
        onClick={onScan}
        className="rounded-lg border border-blue-600 bg-blue-50 px-7 py-2 font-medium text-blue-600 hover:bg-blue-100"
      >
        Scan this page
      </button>
      <p className="text-[11px] text-gray-400">or just use Resize / the color picker — no scan needed</p>
      {error && <p className="max-w-[260px] text-[11px] text-amber-700">{error}</p>}
    </div>
  );
}

export function ScanningState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
      <svg className="h-6 w-6 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 a10 10 0 0 1 10 10" />
      </svg>
      <div className="text-sm text-gray-600">Reading the page&hellip;</div>
      <div className="w-full max-w-[240px] space-y-2">
        <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}

export function RestrictedState({ url, onOpenResize }: { url: string; onOpenResize: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3.5 px-8 text-center">
      <svg className="h-12 w-12 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10 V7 a4 4 0 0 1 8 0 V10" />
        <circle cx="12" cy="15" r="1.4" />
      </svg>
      <div className="text-base font-medium text-gray-800">Can&apos;t inspect this page</div>
      <p className="max-w-[250px] text-xs text-gray-500">
        Chrome blocks extensions on this page ({url ? new URL(url).protocol.replace(':', '') : 'internal'} pages and
        the Web Store). Open a normal website to use Codename.
      </p>
      <div className="flex items-start gap-2 border-t border-dashed border-gray-200 pt-3 text-[11px] text-gray-500">
        <WarnIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span>
          Still available: <b className="text-gray-700">Resize</b> works everywhere · the{' '}
          <b className="text-gray-700">color picker</b> can sample your whole screen
        </span>
      </div>
      <button
        onClick={onOpenResize}
        className="rounded-lg border border-gray-800 px-5 py-1.5 text-gray-800 hover:bg-gray-50"
      >
        Open Resize
      </button>
    </div>
  );
}
