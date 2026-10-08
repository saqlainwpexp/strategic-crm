"use client";

import { useBranding } from "@/components/providers/BrandingProvider";
import { cn } from "@/lib/utils";

/** Built-in mark: three stripes in the current text colour plus one accent stripe. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-7 w-7", className)} aria-hidden>
      <path d="M3 10.5 10.5 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M3 16.5 16.5 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M7.5 21 21 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13.5 21 21 13.5" stroke="rgb(var(--brand-500))" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** The agency's uploaded logo, or the built-in mark. */
export function BrandMark({ className, imgClassName }: { className?: string; imgClassName?: string }) {
  const { branding } = useBranding();
  if (branding.logoDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={branding.logoDataUrl} alt={branding.appName} className={cn("h-7 w-auto max-w-[120px] object-contain", imgClassName)} />;
  }
  return <LogoMark className={className} />;
}

/** Mark + app name (classic header, login screens). */
export function Logo({ className }: { className?: string }) {
  const { branding } = useBranding();
  return (
    <span className={cn("flex items-center gap-2.5 text-ink", className)}>
      <BrandMark />
      <span className="text-[21px] font-semibold tracking-[-0.02em]">{branding.appName}</span>
    </span>
  );
}
