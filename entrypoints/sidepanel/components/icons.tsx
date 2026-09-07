interface IconProps {
  className?: string;
}

const base = 'w-4 h-4';

export function LogoIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1 L15 8 L8 15 L1 8 Z" />
      <path d="M8 5 L11 8 L8 11 L5 8 Z" fill="#2563eb" stroke="none" />
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

export function FontsIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3.5 H13 M8 3.5 V13" />
    </svg>
  );
}

export function ColorsIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 C8 2 4 7.2 4 10 a4 4 0 0 0 8 0 C12 7.2 8 2 8 2 Z" />
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

export function ResizeIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 6 V2 H6 M10 2 H14 V6 M14 10 V14 H10 M6 14 H2 V10" />
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

export function EyeDropperIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 4 L12 7 L6.5 12.5 L3 13 L3.5 9.5 Z" />
      <path d="M10.5 2.5 L13.5 5.5" />
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
