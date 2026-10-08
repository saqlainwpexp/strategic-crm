import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-[20px] bg-white p-6", className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[18px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <p className="mt-1.5 text-[13px] text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Light grey inset panel used inside cards and drawers. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-soft p-5", className)} {...props} />;
}
