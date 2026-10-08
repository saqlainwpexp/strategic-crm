"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, UserPlus } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Layout";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Badges";
import { Modal } from "@/components/ui/Overlay";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role, User } from "@/lib/types";
import { dayKey, formatTime, todayKey, weekKeys } from "@/lib/date";
import { cn, formatHours } from "@/lib/utils";

const ROLE_ORDER: Role[] = ["SUPER_ADMIN", "MANAGER", "BD", "SALES"];

export function TeamView() {
  const { data, viewer, perms, userById } = useCrm();
  const [editing, setEditing] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const members = useMemo(() => {
    const list = viewer.role === "BD" ? data.users.filter((u) => u.id === viewer.id || u.reportsToId === viewer.id) : data.users;
    return [...list].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  }, [data.users, viewer]);

  const today = todayKey();
  const week = useMemo(() => new Set(weekKeys(today)), [today]);
  const statsFor = (u: User) => {
    const shift = data.timeLogs.find((t) => t.userId === u.id && dayKey(t.clockIn) === today);
    const end = shift?.clockOut ? new Date(shift.clockOut).getTime() : now ?? new Date(shift?.clockIn ?? 0).getTime();
    return {
      onShift: !!shift && !shift.clockOut,
      clockIn: shift?.clockIn,
      hours: shift ? Math.max(0, (end - new Date(shift.clockIn).getTime()) / 1000) : 0,
      calls: data.calls.filter((c) => c.userId === u.id && dayKey(c.startedAt) === today).length,
      leads: data.leads.filter((l) => l.assignedToId === u.id).length,
      meetings: data.meetings.filter((m) => m.userId === u.id && week.has(dayKey(m.scheduledAt)) && m.status !== "CANCELLED").length,
    };
  };

  const managers = data.users.filter((u) => u.role === "MANAGER");
  const bds = data.users.filter((u) => u.role === "BD");

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={viewer.role === "BD" ? "You and the sales reps who report to you." : "Everyone on the team, their shifts and their workload."}
        actions={
          perms.manageUsers && (
            <Button size="lg" onClick={() => setAdding(true)}>
              <UserPlus className="h-4 w-4" /> Add member
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {members.map((u) => {
          const s = statsFor(u);
          const worksLeads = u.role === "SALES" || u.role === "BD";
          return (
            <Card key={u.id} className={cn("flex flex-col p-7", !u.active && "opacity-60")}>
              <div className="flex items-start gap-4">
                <span className="relative">
                  <Avatar name={u.name} size={54} />
                  {s.onShift && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-[#22C55E] ring-[3px] ring-white" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-medium tracking-[-0.01em]">{u.name}</p>
                  <p className="mt-0.5 truncate text-[13px] text-neutral-500">{u.title}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Chip className={u.role === "SUPER_ADMIN" || u.role === "MANAGER" ? "bg-ink text-white" : ""}>{ROLE_LABELS[u.role]}</Chip>
                    {!u.active && <Chip>Inactive</Chip>}
                  </div>
                </div>
                {perms.manageUsers && (viewer.role === "SUPER_ADMIN" || u.role !== "SUPER_ADMIN") && (
                  <button
                    aria-label={`Edit ${u.name}`}
                    onClick={() => setEditing(u)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-page text-ink hover:bg-neutral-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {worksLeads ? (
                <>
                  <div className="mt-6 flex items-center gap-2 text-[13px]">
                    <span className={cn("h-2 w-2 rounded-full", s.onShift ? "bg-[#22C55E]" : "bg-neutral-300")} />
                    {s.onShift ? (
                      <span>
                        On shift since {formatTime(s.clockIn!)} <span className="text-neutral-500">· {formatHours(s.hours)}</span>
                      </span>
                    ) : s.clockIn ? (
                      <span className="text-neutral-600">Shift finished · {formatHours(s.hours)} today</span>
                    ) : (
                      <span className="text-neutral-500">Not clocked in today</span>
                    )}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Mini label="Calls today" value={s.calls} />
                    <Mini label="Hours today" value={formatHours(s.hours)} />
                    <Mini label="Leads assigned" value={s.leads} />
                    <Mini label="Meetings this week" value={s.meetings} />
                  </div>
                </>
              ) : (
                <p className="mt-6 rounded-2xl bg-soft p-4 text-[13px] leading-relaxed text-neutral-600">
                  {u.role === "SUPER_ADMIN"
                    ? "Manages scripts, custom fields, lead pools, imports and system settings."
                    : "Oversees the whole team, analytics and every lead."}
                </p>
              )}

              <div className="min-h-6 flex-1" />
              <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-5 text-[12.5px] text-neutral-500">
                <span className="truncate">{u.reportsToId ? `Reports to ${userById(u.reportsToId)?.name ?? "—"}` : u.email}</span>
                {worksLeads && (
                  <Link href={`/leads?rep=${u.id}`} className={buttonClass("ghost", "sm")}>
                    View leads
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {viewer.role !== "BD" && (
        <Card className="mt-6 p-7">
          <CardHeader title="Reporting lines" subtitle="Sales reps report to business development, who report to the manager." />
          <div className="flex flex-col gap-4">
            {managers.map((m) => (
              <div key={m.id}>
                <Node user={m} />
                <div className="ml-[26px] mt-4 flex flex-col gap-4 border-l border-neutral-200 pl-8">
                  {bds
                    .filter((b) => b.reportsToId === m.id)
                    .map((b) => (
                      <div key={b.id}>
                        <Node user={b} />
                        <div className="ml-[26px] mt-4 flex flex-wrap gap-4 border-l border-neutral-200 pl-8">
                          {data.users
                            .filter((s) => s.reportsToId === b.id)
                            .map((s) => (
                              <Node key={s.id} user={s} />
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <MemberModal open={adding || !!editing} member={editing} onClose={() => (setAdding(false), setEditing(null))} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-soft px-4 py-3.5">
      <p className="text-[11.5px] text-neutral-500">{label}</p>
      <p className="mt-1.5 text-[18px] tabular-nums leading-none">{value}</p>
    </div>
  );
}

function Node({ user }: { user: User }) {
  return (
    <span className="inline-flex items-center gap-3 rounded-full bg-soft py-1.5 pl-1.5 pr-5">
      <Avatar name={user.name} size={40} />
      <span>
        <span className="block text-[14px]">{user.name}</span>
        <span className="block text-[12px] text-neutral-500">{ROLE_LABELS[user.role]}</span>
      </span>
    </span>
  );
}

function MemberModal({ open, member, onClose }: { open: boolean; member: User | null; onClose: () => void }) {
  const { data, viewer, saveUser } = useCrm();
  const blank: Omit<User, "id"> = { name: "", email: "", role: "SALES", title: "Sales Executive", reportsToId: null, active: true };
  const [d, setD] = useState<Omit<User, "id">>(blank);

  useEffect(() => {
    if (!open) return;
    if (member) {
      const { id: _id, ...rest } = member;
      setD(rest);
    } else {
      setD({ ...blank, reportsToId: data.users.find((u) => u.role === "BD")?.id ?? null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member]);

  const roles: Role[] = viewer.role === "SUPER_ADMIN" ? ["SALES", "BD", "MANAGER", "SUPER_ADMIN"] : ["SALES", "BD", "MANAGER"];
  const leaders = data.users.filter(
    (u) => u.id !== member?.id && (d.role === "SALES" ? u.role === "BD" || u.role === "MANAGER" : u.role === "MANAGER")
  );
  const valid = d.name.trim() && /\S+@\S+\.\S+/.test(d.email);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? `Edit ${member.name}` : "Add a team member"}
      subtitle="Login credentials are issued from here once authentication is connected to the database."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              saveUser({ ...d, id: member?.id, name: d.name.trim(), email: d.email.trim() });
              onClose();
            }}
          >
            {member ? "Save changes" : "Add member"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        </Field>
        <Field label="Role">
          <Select
            value={d.role}
            onChange={(e) => {
              const role = e.target.value as Role;
              setD({ ...d, role, reportsToId: role === "MANAGER" || role === "SUPER_ADMIN" ? null : d.reportsToId });
            }}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Job title">
          <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </Field>
        {(d.role === "SALES" || d.role === "BD") && (
          <Field label="Reports to">
            <Select value={d.reportsToId ?? ""} onChange={(e) => setD({ ...d, reportsToId: e.target.value || null })}>
              <option value="">—</option>
              {leaders.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({ROLE_LABELS[u.role]})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Status">
          <div className="flex h-11 items-center">
            <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={d.active ? "Active" : "Deactivated"} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}
