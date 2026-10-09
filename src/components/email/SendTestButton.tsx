"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { useCrm } from "@/components/providers/CrmProvider";
import type { EmailAccountView } from "@/lib/email-types";
import { sendTestEmailAction } from "@/server/email/actions";
import { useEmailAction } from "./kit";

/** "Send test" — delivers the draft to your own inbox with sample personalisation. */
export function SendTestButton({
  accounts,
  subject,
  html,
  previewText,
  defaultAccountId,
}: {
  accounts: EmailAccountView[];
  subject: string;
  html: string;
  previewText?: string;
  defaultAccountId?: string;
}) {
  const { viewer } = useCrm();
  const { run, busy } = useEmailAction();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(viewer.email);
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={!accounts.length} title={accounts.length ? undefined : "Add a mailbox first"}>
        <FlaskConical className="h-4 w-4" /> Send test
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send a test email"
        subtitle="Personalisation is filled with sample data so you can check the layout."
        className="max-w-[480px]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!to || !accountId || busy === "test"}
              onClick={async () => {
                const ok = await run("test", sendTestEmailAction({ accountId, to, subject, html, previewText }), `Test sent to ${to}`);
                if (ok !== null) setOpen(false);
              }}
            >
              {busy === "test" ? "Sending…" : "Send test"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="Send to">
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Send from">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fromName} &lt;{a.email}&gt;
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
