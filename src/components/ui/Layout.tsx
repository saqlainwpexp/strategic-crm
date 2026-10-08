import { Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";
import { Delta } from "./Badges";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 pb-10 pt-6">
      <div className="min-w-0">
        <h1 className="text-[34px] font-normal leading-[1.1] tracking-[-0.025em] md:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-3 text-[15px] text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-[13.5px] text-neutral-600">
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full",
              active ? "bg-brand text-brand-fg" : "bg-page text-ink"
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.7} />
          </span>
          {label}
        </span>
        {delta && <Delta value={delta} />}
      </div>
      <div className="mt-6">
        <p className="text-[30px] font-normal leading-none tracking-[-0.02em] tabular-nums">{value}</p>
        {hint && <p className="mt-3 text-[12.5px] text-neutral-500">{hint}</p>}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-[20px] bg-white p-6 text-left transition-shadow hover:shadow-[0_0_0_1px_rgba(10,10,10,0.08)]",
          active && "shadow-[0_0_0_1.5px_rgb(var(--ink))]"
        )}
      >
        {body}
      </button>
    );
  }
  return <Card>{body}</Card>;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <span className="grid h-14 w-14 place-items-center rounded-full bg-page text-neutral-500">
        <Icon className="h-6 w-6" strokeWidth={1.6} />
      </span>
      <p className="mt-5 text-[15px] font-medium">{title}</p>
      {body && <p className="mt-2 max-w-[340px] text-[13.5px] leading-relaxed text-neutral-500">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function AccessDenied({ what }: { what: string }) {
  return (
    <div className="pt-10">
      <Card className="mx-auto max-w-[560px]">
        <EmptyState
          icon={Lock}
          title={`You don't have access to ${what}`}
          body="This area is limited by your role. Ask your manager or the super admin if you need access."
        />
      </Card>
    </div>
  );
}
