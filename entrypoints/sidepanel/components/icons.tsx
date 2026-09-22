import type { ReactNode } from 'react';

interface IconProps {
  className?: string;
}

const base = 'w-4 h-4';

export function LogoIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1 L15 8 L8 15 L1 8 Z" />
      <path d="M8 5 L11 8 L8 11 L5 8 Z" fill="var(--accent)" stroke="none" />
    </svg>
  );
}

export function InspectIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 2 L13 7.5 L8.7 9 L7 13.5 Z" />
    </svg>
  );
}

export function DesignIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5 V13.5 M2.5 8 H13.5" />
    </svg>
  );
}

export function SvgsIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="3.5" cy="12.5" r="1.5" />
      <circle cx="12.5" cy="3.5" r="1.5" />
      <path d="M4.5 11.5 C6.5 6.5, 9.5 9.5, 11.5 4.5" />
    </svg>
  );
}

export function PagesIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 1.5h5.5L13 5v9.5H4z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  );
}

export function LayersIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2.5 14 5.5 8 8.5 2 5.5z" />
      <path d="M2 8.5l6 3 6-3M2 11.5l6 3 6-3" />
    </svg>
  );
}

export function ChangesIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h4" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

export function ExportIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 V10 M5 7 L8 10 L11 7 M3 13 H13" />
    </svg>
  );
}

export function DownloadIcon({ className = base }: IconProps) {
  return <ExportIcon className={className} />;
}

export function CopyIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M11 5 V3 a1 1 0 0 0 -1 -1 H3 a1 1 0 0 0 -1 1 V10 a1 1 0 0 0 1 1 H5" />
    </svg>
  );
}

export function WarnIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 L15 14 H1 Z" />
      <path d="M8 6.5 V10 M8 11.8 V12.2" />
    </svg>
  );
}

/*
 * The small ones: 12px marks that used to be text glyphs (▶ ✕ ✓ ◉ ↻ ↗),
 * which drew in whatever font the system had beside the SVGs above.
 * `aria-hidden`, because each sits inside a button that names itself.
 */
const small = 'w-3 h-3';

function Small({ className = small, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ChevronIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M4.5 2.5 8 6l-3.5 3.5" />
  </Small>
);

export const CloseIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M3 3l6 6M9 3 3 9" />
  </Small>
);

export const CheckIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M2.5 6.5 5 9l4.5-6" />
  </Small>
);

export const PlusIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M6 2.5v7M2.5 6h7" />
  </Small>
);

export const RefreshIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M9.5 4.5A4 4 0 1 0 10 7" />
    <path d="M9.8 1.8v2.9H6.9" />
  </Small>
);

export const EyeIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M1 6s1.8-3.5 5-3.5S11 6 11 6 9.2 9.5 6 9.5 1 6 1 6z" />
    <circle cx="6" cy="6" r="1.5" />
  </Small>
);

export const EyeOffIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M1 6s1.8-3.5 5-3.5S11 6 11 6 9.2 9.5 6 9.5 1 6 1 6z" />
    <path d="M2 10 10 2" />
  </Small>
);

export const ExternalIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M5 2.5H2.5v7h7V7M7 2.5h2.5V5M9.5 2.5 5.5 6.5" />
  </Small>
);

/** The scrub handle a number field shows when it has no letter of its own. */
export const GripIcon = ({ className }: IconProps) => (
  <svg className={className ?? 'w-2 h-3'} viewBox="0 0 8 12" fill="currentColor" aria-hidden="true">
    <circle cx="2.5" cy="3" r="0.9" />
    <circle cx="5.5" cy="3" r="0.9" />
    <circle cx="2.5" cy="6" r="0.9" />
    <circle cx="5.5" cy="6" r="0.9" />
    <circle cx="2.5" cy="9" r="0.9" />
    <circle cx="5.5" cy="9" r="0.9" />
  </svg>
);

export const UndoIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M4 3 1.8 5.2 4 7.4" />
    <path d="M2 5.2h5.3a2.7 2.7 0 0 1 0 5.4H5" />
  </Small>
);

export const RedoIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <path d="M8 3l2.2 2.2L8 7.4" />
    <path d="M10 5.2H4.7a2.7 2.7 0 0 0 0 5.4H7" />
  </Small>
);

export const SearchIcon = ({ className }: IconProps) => (
  <Small className={className}>
    <circle cx="5.2" cy="5.2" r="3.2" />
    <path d="M7.6 7.6 10 10" />
  </Small>
);
