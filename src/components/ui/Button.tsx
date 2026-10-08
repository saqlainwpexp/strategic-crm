import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "brand" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-muted",
  secondary: "border border-black/[0.08] bg-white text-ink hover:bg-neutral-50",
  brand: "bg-brand text-brand-fg hover:bg-brand-600",
  ghost: "bg-page text-ink hover:bg-neutral-200/80",
  danger: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
  link: "bg-transparent px-0 text-neutral-600 underline-offset-4 hover:text-ink hover:underline",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 gap-1.5 px-4 text-[13px]",
  md: "h-11 gap-2 px-5 text-[14px]",
  lg: "h-12 gap-2 px-6 text-[15px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full transition-colors disabled:pointer-events-none disabled:opacity-45",
    VARIANTS[variant],
    variant === "link" ? "h-auto" : SIZES[size],
    className
  );
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
});

type IconVariant = "ghost" | "white" | "ink" | "brand";
const ICON_VARIANTS: Record<IconVariant, string> = {
  ghost: "bg-page text-ink hover:bg-neutral-200/80",
  white: "border border-black/[0.06] bg-white text-ink hover:bg-neutral-50",
  ink: "bg-ink text-white hover:bg-ink-muted",
  brand: "bg-brand text-brand-fg hover:bg-brand-600",
};
const ICON_SIZES = { sm: "h-9 w-9", md: "h-10 w-10", lg: "h-11 w-11" };

export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: IconVariant;
    size?: keyof typeof ICON_SIZES;
    label: string;
  }
>(function IconButton({ variant = "ghost", size = "md", label, className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-45",
        ICON_VARIANTS[variant],
        ICON_SIZES[size],
        className
      )}
      {...props}
    />
  );
});
