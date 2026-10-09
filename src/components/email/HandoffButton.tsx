"use client";

import { useState } from "react";
import { PhoneForwarded } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import type { ActionResult } from "@/server/actions";
import { useEmailAction } from "./kit";

/** "Send to sales calls" — picks a rep (or shares evenly) and runs the given hand-off action. */
export function HandoffButton({
  reps,
  label = "Send to sales calls",
  count,
  onHandoff,
  size = "sm",
  variant = "primary",
}: {
  reps: { id: string; name: string }[];
  label?: string;
  count?: number;
  onHandoff: (repId: string | null) => Promise<ActionResult<unknown>>;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "brand";
}) {
  const { run, busy } = useEmailAction();
  const [open, setOpen] = useState(false);
  const [rep, setRep] = useState("");
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <PhoneForwarded className="h-3.5 w-3.5" /> {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={count && count > 1 ? `Send ${count} contacts to sales calls` : "Send to sales calls"}
        subtitle="They're marked Interested, assigned to a rep, and put at the top of the rep's Loadboard call queue. Email workflows stop for them."
        className="max-w-[480px]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy === "handoff"}
              onClick={async () => {
                const r = await run("handoff", onHandoff(rep || null), "Sent to sales calls");
                if (r !== null) setOpen(false);
              }}
            >
              {busy === "handoff" ? "Sending…" : "Send to calls"}
            </Button>
          </>
        }
      >
        <Field label="Rep" hint="Keeps the current rep if a lead already has one.">
          <Select value={rep} onChange={(e) => setRep(e.target.value)}>
            <option value="">Share evenly between sales reps</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </>
  );
}
