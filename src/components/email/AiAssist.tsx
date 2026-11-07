"use client";

import { useState } from "react";
import { CornerDownLeft, RotateCcw, Sparkles } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { cn } from "@/lib/utils";
import { draftWithAiAction } from "@/server/email/actions";

/**
 * Gemini-in-Gmail style helper above the reply box: reads the whole conversation and the
 * lead's CRM details, then writes a reply or follow-up into the box for you to edit.
 */
export function AiAssist({
  threadId,
  current,
  onDraft,
  lastFromUs,
}: {
  threadId: string;
  current: string;
  onDraft: (text: string) => void;
  /** Our message is the latest one → a follow-up is the likely ask. */
  lastFromUs: boolean;
}) {
  const { notify } = useCrm();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "reply" | "followup">(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const draft = async (mode: "reply" | "followup") => {
    setBusy(mode);
    try {
      const res = await draftWithAiAction(threadId, { mode, instruction });
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      setPrevious(current);
      onDraft(res.data.text);
      setProvider(res.data.provider === "gemini" ? "Gemini" : "Claude");
    } catch {
      notify("Couldn't reach the server. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const primary = lastFromUs ? "followup" : "reply";
  const btn = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors disabled:opacity-50";

  return (
    <div className="mb-3 rounded-2xl bg-gradient-to-r from-brand-50 to-soft p-2 pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && draft(primary)}
          placeholder={lastFromUs ? "Optional: what should the follow-up say?" : "Optional: e.g. “offer a call Thursday, keep it short”"}
          maxLength={1000}
          className="h-9 min-w-[180px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-neutral-500"
          aria-label="Instructions for the AI"
        />
        <button type="button" disabled={!!busy} onClick={() => draft("reply")} className={cn(btn, primary === "reply" ? "bg-ink text-white hover:bg-ink-muted" : "bg-white text-ink hover:bg-neutral-100")}>
          {busy === "reply" ? "Writing…" : "Draft reply"}
          {primary === "reply" && !busy && <CornerDownLeft className="h-3 w-3 opacity-60" />}
        </button>
        <button type="button" disabled={!!busy} onClick={() => draft("followup")} className={cn(btn, primary === "followup" ? "bg-ink text-white hover:bg-ink-muted" : "bg-white text-ink hover:bg-neutral-100")}>
          {busy === "followup" ? "Writing…" : "Write follow-up"}
          {primary === "followup" && !busy && <CornerDownLeft className="h-3 w-3 opacity-60" />}
        </button>
      </div>
      {provider && (
        <p className="flex items-center gap-2 px-1 pb-0.5 pt-1.5 text-[11.5px] text-neutral-500">
          Drafted by {provider} from the whole conversation — read it before sending.
          {previous !== null && (
            <button
              type="button"
              onClick={() => {
                onDraft(previous);
                setPrevious(null);
                setProvider(null);
              }}
              className="inline-flex items-center gap-1 text-neutral-600 underline-offset-2 hover:text-ink hover:underline"
            >
              <RotateCcw className="h-3 w-3" /> Undo
            </button>
          )}
        </p>
      )}
    </div>
  );
}
