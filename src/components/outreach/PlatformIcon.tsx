import { Mail, Phone } from "lucide-react";
import { platformDef } from "@/lib/outreach/platforms";
import { cn } from "@/lib/utils";

/** Small round brand-coloured mark for a platform (no third-party logos bundled). */
export function PlatformIcon({ platform, size = 22, className }: { platform: string; size?: number; className?: string }) {
  const def = platformDef(platform);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (platform === "phone" || platform === "email") {
    const Icon = platform === "phone" ? Phone : Mail;
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-full bg-page text-ink", className)} style={style}>
        <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  }
  return (
    <span
      title={def?.label ?? platform}
      className={cn("grid shrink-0 select-none place-items-center rounded-full font-semibold leading-none text-white", className)}
      style={{ ...style, background: def?.color ?? "#737373", color: platform === "tiktok" ? "#111" : "#fff" }}
    >
      {def?.mark ?? platform.slice(0, 2).toUpperCase()}
    </span>
  );
}
