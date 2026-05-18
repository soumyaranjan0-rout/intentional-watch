import { useId } from "react";

export function ZenLogo({ size = 24, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="ZenTube"
      className={className}
      style={{ width: size, height: size, display: "block" }}
    >
      <defs>
        <linearGradient id={`zen-logo-${id}`} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--primary)" />
          <stop offset="0.52" stopColor="var(--primary-soft)" />
          <stop offset="1" stopColor="var(--accent-violet)" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#zen-logo-${id})`} />
      <path d="M19 18h25L21 46h25" fill="none" stroke="var(--primary-foreground)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 25.5 49 32 38 38.5Z" fill="var(--primary-foreground)" opacity="0.92" />
      <path d="M14 14c8-6 28-6 36 2" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}
