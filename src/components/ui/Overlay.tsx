"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

function useOverlay(open: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return mounted;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const mounted = useOverlay(open, onClose);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8">
      <div className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-pop-in relative flex max-h-[calc(100vh-48px)] w-full max-w-[580px] flex-col rounded-[24px] bg-white shadow-2xl",
          className
        )}
      >
        <div className="flex items-start justify-between gap-6 px-8 pb-2 pt-7">
          <div className="min-w-0">
            <h2 className="text-[21px] font-medium tracking-[-0.015em]">{title}</h2>
            {subtitle && <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-500">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} size="sm">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-8 py-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-100 px-8 py-5">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const mounted = useOverlay(open, onClose);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="animate-fade-in absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-slide-in relative flex h-full w-full max-w-[640px] flex-col bg-white shadow-2xl sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-[24px]",
          className
        )}
      >
        {children}
      </aside>
    </div>,
    document.body
  );
}
