"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { CircleAlert } from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { changeOwnPasswordAction } from "@/server/actions";

const MIN = 10;

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
  }, [open]);

  const problem =
    next && next.length < MIN ? `Use at least ${MIN} characters.` : confirm && next !== confirm ? "The new passwords don't match." : "";

  const submit = async () => {
    setPending(true);
    setError("");
    const res = await changeOwnPasswordAction(current, next);
    if (res.ok) {
      // Changing the password ends every session (including this one) — sign in again.
      await signOut({ callbackUrl: "/login" });
      return;
    }
    setError(res.error);
    setPending(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      subtitle="You'll be signed out everywhere and asked to sign in with the new password."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !current || next.length < MIN || next !== confirm}>
            {pending ? "Saving…" : "Change password"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint={`At least ${MIN} characters. A short sentence is easy to remember and hard to guess.`}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {(problem || error) && (
          <p role="alert" className="flex gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error || problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
