"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Form";

type Props = {
  params: Record<string, string>;
  clientName: string;
  destination: string;
  users: { id: string; name: string }[];
  defaultUserId: string;
};

export function ConsentForm({ params, clientName, destination, users, defaultUserId }: Props) {
  const [userId, setUserId] = useState(defaultUserId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const decide = async (decision: "approve" | "deny") => {
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params, decision, userId }),
      });
      const data = await res.json();
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setError(data.error ?? "Couldn't complete that. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setPending(false);
  };

  return (
    <div>
      <h1 className="text-[22px] font-medium">Connect {clientName}?</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-neutral-600">
        This app wants to use the CRM's outreach tools: read contacts and follow-ups, and log messages, job applications and stage changes. After approval you'll return to{" "}
        <strong className="font-medium text-ink">{destination}</strong>. Only continue if you started this connection.
      </p>
      <div className="mt-8">
        <Field label="Logs as">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={pending}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <p className="mt-5 text-[13.5px] text-red-600">{error}</p>}
      <div className="mt-10 flex justify-end gap-3">
        <Button onClick={() => decide("deny")} disabled={pending}>
          Decline
        </Button>
        <Button variant="brand" onClick={() => decide("approve")} disabled={pending}>
          Approve
        </Button>
      </div>
    </div>
  );
}
