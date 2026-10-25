import { cn } from "@/lib/utils";

/** PocketPulse mark: a pulse line inside a rounded pocket, with a lime "saved" dot. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <defs>
        <linearGradient id="pp-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.72 0.19 293)" />
          <stop offset="1" stopColor="oklch(0.52 0.23 285)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#pp-mark)" />
      <path
        d="M6 17h5l2.5-6 4 11 2.5-5H26"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.5" cy="8.5" r="2.5" fill="oklch(0.88 0.19 128)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[1.05rem] font-semibold tracking-tight">
        Pocket<span className="text-primary">Pulse</span>
      </span>
    </span>
  );
}
