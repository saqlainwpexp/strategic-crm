"use client";

import { useEffect, useMemo, useState } from "react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Segmented } from "@/components/ui/Segmented";
import { LeadPicker } from "./LeadPicker";
import { AGENCY_SERVICES, type AgencyService } from "@/lib/constants";
import { pktISO, shiftDayKey, todayKey } from "@/lib/date";
import { formatMoney } from "@/lib/utils";
import { currency } from "@/lib/currency";

export function PaymentModal({
  open,
  onClose,
  leadId,
  title = "Record a payment",
  subtitle = "Log money received or an invoice that's due.",
  skipLabel,
}: {
  open: boolean;
  onClose: () => void;
  leadId?: string | null;
  title?: string;
  subtitle?: string;
  skipLabel?: string;
}) {
  const { data, viewer, addPayment } = useCrm();
  const [lead, setLead] = useState<string | null>(leadId ?? null);
  const [service, setService] = useState<AgencyService>("Web Design");
  const [amount, setAmount] = useState(0);
  const [status, setStatus] = useState<"PAID" | "PENDING">("PAID");
  const [date, setDate] = useState(todayKey());

  const selected = lead ? data.leads.find((l) => l.id === lead) : undefined;

  useEffect(() => {
    if (!open) return;
    setLead(leadId ?? null);
    setStatus("PAID");
    setDate(todayKey());
  }, [open, leadId]);

  useEffect(() => {
    if (!selected) return;
    setService(selected.service);
    setAmount(Math.round((selected.estimatedValue * 0.5) / 1000) * 1000);
  }, [selected]);

  useEffect(() => {
    setDate(status === "PAID" ? todayKey() : shiftDayKey(todayKey(), 14));
  }, [status]);

  // Clients first, then everyone else.
  const leads = useMemo(
    () => [...data.leads].sort((a, b) => Number(b.stage === "CLOSED_WON") - Number(a.stage === "CLOSED_WON") || b.leadScore - a.leadScore),
    [data.leads]
  );

  const submit = () => {
    if (!selected || amount <= 0) return;
    const at = pktISO(date, 12);
    addPayment({
      leadId: selected.id,
      userId: selected.assignedToId ?? viewer.id,
      service,
      amount,
      status,
      dueDate: at,
      paidAt: status === "PAID" ? at : null,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {skipLabel ?? "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!selected || amount <= 0}>
            Record {amount > 0 ? formatMoney(amount) : "payment"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6">
        <Field label="Client" required>
          <LeadPicker leads={leads} value={lead} onChange={setLead} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Service">
            <Select value={service} onChange={(e) => setService(e.target.value as AgencyService)}>
              {AGENCY_SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label={`Amount (${currency().code})`} hint={selected ? `Deal value ${formatMoney(selected.estimatedValue)}` : undefined}>
            <Input type="number" min={0} step={1000} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Status">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: "PAID", label: "Received" },
                { value: "PENDING", label: "Invoice due" },
              ]}
            />
          </Field>
          <Field label={status === "PAID" ? "Received on" : "Due on"}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
