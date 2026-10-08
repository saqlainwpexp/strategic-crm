import { forwardRef } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const inputBase =
  "h-11 w-full rounded-xl border border-black/[0.08] bg-white px-4 text-[14px] text-ink outline-none transition placeholder:text-neutral-400 focus:border-ink/30 focus:ring-4 focus:ring-black/[0.04] disabled:bg-soft disabled:text-neutral-500";

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className="text-[13px] text-neutral-600">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </span>
      {children}
      {hint && <span className="text-[12px] leading-relaxed text-neutral-400">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(inputBase, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputBase, "h-auto min-h-[104px] py-3 leading-relaxed", className)} {...props} />;
  }
);

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(inputBase, "cursor-pointer appearance-none pr-10")} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
    </div>
  );
}

/** Pill-shaped select for filter bars. */
export function FilterSelect({
  className,
  children,
  active,
  onPage,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  active?: boolean;
  /** Sitting on the grey page background (not inside a white card): white, taller pill. */
  onPage?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(
          "w-full cursor-pointer appearance-none rounded-full border pl-4 pr-9 text-[13px] outline-none transition",
          onPage ? "h-11 pl-5" : "h-10",
          active
            ? "border-ink bg-ink text-white"
            : onPage
              ? "border-black/[0.06] bg-white text-ink hover:bg-neutral-50"
              : "border-transparent bg-page text-ink hover:bg-neutral-200/70"
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2",
          active ? "text-white" : "text-neutral-500"
        )}
      />
    </div>
  );
}

/** Pill search box (as in the reference table header). */
export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("flex h-10 items-center gap-2.5 rounded-full bg-page px-4 text-neutral-500", className)}>
      <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
      <input
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-neutral-500"
        {...props}
      />
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 text-[13.5px] text-ink disabled:opacity-50"
    >
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-ink" : "bg-neutral-300"
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </span>
      {label}
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  indeterminate?: boolean;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-neutral-300 accent-ink"
    />
  );
}
