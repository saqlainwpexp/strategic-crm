import { cn, hashString, initials } from "@/lib/utils";

const TONES: [bg: string, fg: string][] = [
  ["rgb(var(--brand-200))", "rgb(var(--brand-800))"],
  ["#E3E3E3", "#2E2E2E"],
  ["rgb(var(--ink))", "#FFFFFF"],
  ["rgb(var(--brand-500))", "rgb(var(--brand-fg))"],
  ["#D6CFC9", "#2E2E2E"],
];

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const [bg, fg] = TONES[hashString(name) % TONES.length];
  return (
    <span
      title={name}
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

/** Avatar followed by a first name. */
export function UserChip({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <Avatar name={name} size={size} />
      <span className="truncate text-[13px] text-ink">{name.split(" ")[0]}</span>
    </span>
  );
}

export function AvatarStack({ names, max = 2, size = 28 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((n) => (
        <Avatar key={n} name={n} size={size} className="ring-2 ring-white" />
      ))}
      {extra > 0 && (
        <span
          className="grid place-items-center rounded-full bg-ink text-[10px] font-medium text-white ring-2 ring-white"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
