"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { fillMergeTags, SAMPLE_MERGE, type MergeData } from "@/lib/email";

/** Renders an email body in a sandboxed iframe, merge tags filled with sample data. */
export function EmailPreview({
  html,
  merge,
  className,
  scale = 1,
  height = 520,
}: {
  html: string;
  merge?: Partial<MergeData>;
  className?: string;
  /** Shrink for thumbnails (e.g. 0.42). */
  scale?: number;
  height?: number;
}) {
  const doc = useMemo(() => {
    const body = fillMergeTags(html || "<p style='color:#a3a3a3'>Nothing written yet.</p>", { ...SAMPLE_MERGE, ...merge }, true);
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
      body{margin:0;padding:28px 32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;background:#fff}
      img{max-width:100%;height:auto} a{color:#2563eb} p{margin:0 0 14px} h1,h2,h3{line-height:1.3;margin:0 0 12px}
      blockquote{margin:0 0 14px;border-left:3px solid #ddd;padding-left:12px;color:#555}
    </style></head><body>${body}</body></html>`;
  }, [html, merge]);

  return (
    <div className={cn("overflow-hidden", className)} style={{ height: height * scale }}>
      <iframe
        title="Email preview"
        sandbox="allow-popups"
        srcDoc={doc}
        className="block border-0 bg-white"
        style={{ width: `${100 / scale}%`, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        tabIndex={scale < 1 ? -1 : undefined}
      />
    </div>
  );
}
