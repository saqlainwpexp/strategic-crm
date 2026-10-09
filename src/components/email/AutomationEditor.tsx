"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { ArrowLeft, Check, CircleAlert, Clock, Copy, Pause, Play, Search, Trash2, UserPlus, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { StatusDot } from "@/components/ui/Badges";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/lib/date";
import type { AutomationTrigger } from "@/lib/email";
import { STARTER_TEMPLATES } from "@/lib/email-starters";
import {
  describeNode,
  flowSummary,
  newNode,
  normalizeFlow,
  repliedFlow,
  starterFlow,
  validateFlow,
  type Flow,
  type FlowNode,
  type FlowNodeData,
  type FlowNodeType,
} from "@/lib/automation-flow";
import type { AutomationView, EmailAccountView, EnrollmentView, TemplateView } from "@/lib/email-types";
import { RowMenu } from "@/components/ui/RowMenu";
import { deleteAutomationAction, duplicateAutomationAction, enrollContactsAction, saveAutomationAction, searchContactsAction, setAutomationStatusAction, stopEnrollmentAction } from "@/server/email/actions";
import { NODE_META, nodeTypes, TriggerCtx } from "./flow/FlowNodes";
import { NodePanel } from "./flow/NodePanel";
import { ALL_INBOXES, SenderPicker } from "./SenderPicker";
import { TintPill, useEmailAction } from "./kit";

type RFNode = Node<FlowNodeData>;

const EDGE_STYLE = { stroke: "#B8B8B8", strokeWidth: 1.6 };

function toRF(flow: Flow): { nodes: RFNode[]; edges: Edge[] } {
  return {
    nodes: flow.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data, deletable: n.type !== "trigger" })),
    edges: flow.edges.map((e) => styleEdge({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  };
}

function styleEdge(e: Edge): Edge {
  const color = e.sourceHandle === "yes" ? "#22C55E" : e.sourceHandle === "no" ? "#EF4444" : EDGE_STYLE.stroke;
  return { ...e, style: { ...EDGE_STYLE, stroke: color } };
}

function fromRF(nodes: RFNode[], edges: Edge[]): Flow {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type as FlowNodeType, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: (e.sourceHandle as "yes" | "no" | null) ?? null })),
  };
}

type Props = {
  automation: AutomationView | null;
  enrollments: EnrollmentView[];
  accounts: EmailAccountView[];
  templates: TemplateView[];
  tags: string[];
  reps: { id: string; name: string }[];
};

export function AutomationEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function initial(automation: AutomationView | null, start: string | null) {
  if (automation) return { name: automation.name, trigger: automation.trigger, triggerValue: automation.triggerValue, stopOnReply: automation.stopOnReply, flow: automation.flow };
  if (start === "replied") return { name: "Replies → sales calls", trigger: "EMAIL_REPLIED" as AutomationTrigger, triggerValue: "", stopOnReply: false, flow: repliedFlow() };
  if (start === "blank") return { name: "New workflow", trigger: "MANUAL" as AutomationTrigger, triggerValue: "", stopOnReply: true, flow: normalizeFlow({ nodes: [], edges: [] }) };
  const [audit, ghl, , followUp, breakup] = STARTER_TEMPLATES;
  return {
    name: "Cold outreach sequence",
    trigger: "MANUAL" as AutomationTrigger,
    triggerValue: "",
    stopOnReply: true,
    flow: starterFlow([audit, followUp, ghl, breakup].map(({ subject, html }) => ({ subject, html }))),
  };
}

function Editor({ automation, enrollments, accounts, templates, tags, reps }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const { run, busy } = useEmailAction();
  const { confirm, dialog } = useConfirm();
  const init = useMemo(() => initial(automation, params.get("start")), [automation, params]);
  const rf = useMemo(() => toRF(init.flow), [init]);

  const [name, setName] = useState(init.name);
  const [trigger, setTrigger] = useState<AutomationTrigger>(init.trigger);
  const [triggerValue, setTriggerValue] = useState(init.triggerValue);
  const [stopOnReply, setStopOnReply] = useState(init.stopOnReply);
  const [accountIds, setAccountIds] = useState<string[]>(automation?.accountIds.length ? automation.accountIds : [ALL_INBOXES]);
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(rf.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(rf.edges);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(!automation);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const flow = useMemo(() => fromRF(nodes, edges), [nodes, edges]);
  const problems = useMemo(() => validateFlow(flow), [flow]);
  const selectedNode = nodes.find((n) => n.id === selected) ?? null;
  const touch = () => setDirty(true);

  useEffect(() => {
    if (selected && !nodes.some((n) => n.id === selected)) setSelected(null);
  }, [nodes, selected]);

  const onConnect = useCallback(
    (c: Connection) => {
      // One path out of each dot: a new connection replaces the old one.
      setEdges((es) =>
        addEdge(
          styleEdge({ ...c, id: `e${Math.random().toString(36).slice(2, 9)}` } as Edge),
          es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null)))
        )
      );
      setDirty(true);
    },
    [setEdges]
  );

  /** Adds a step under the selected one (or the lowest step) and links it in. */
  const addStep = (type: Exclude<FlowNodeType, "trigger">) => {
    const anchor = selectedNode ?? [...nodes].sort((a, b) => b.position.y - a.position.y)[0];
    const n = newNode(type, { x: anchor.position.x, y: anchor.position.y + 160 });
    let handle: "yes" | "no" | null = null;
    if (anchor.type === "condition") {
      const used = new Set(edges.filter((e) => e.source === anchor.id).map((e) => e.sourceHandle));
      handle = !used.has("yes") ? "yes" : !used.has("no") ? "no" : null;
      n.position.x += handle === "yes" ? -150 : 150;
    }
    const free = anchor.type === "condition" ? handle !== null : !edges.some((e) => e.source === anchor.id);
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { ...n, deletable: true, selected: true } as RFNode]);
    if (free) setEdges((es) => [...es, styleEdge({ id: `e${Math.random().toString(36).slice(2, 9)}`, source: anchor.id, target: n.id, sourceHandle: handle })]);
    setSelected(n.id);
    touch();
  };

  const updateData = (id: string, data: FlowNodeData) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)));
    touch();
  };

  async function save(): Promise<string | null> {
    const res = await run("save", saveAutomationAction({ id: automation?.id, name, trigger, triggerValue, flow, accountIds, stopOnReply }), automation ? "Workflow saved" : undefined);
    if (!res) return null;
    setDirty(false);
    if (!automation) router.replace(`/email/automations/${res.id}`);
    return res.id;
  }

  const status = automation?.status ?? "DRAFT";
  const live = status === "ACTIVE";
  const nodeTitle = (nodeId: string | null) => {
    const n = flow.nodes.find((x) => x.id === nodeId);
    return n ? describeNode(n as FlowNode, { trigger, triggerValue }).title : null;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 pb-10 pt-6">
        <div className="min-w-0 flex-1">
          <Link href="/email/automations" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Automations
          </Link>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              touch();
            }}
            aria-label="Workflow name"
            className="w-full bg-transparent text-[34px] font-normal leading-[1.1] tracking-[-0.025em] outline-none md:text-[40px]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[15px] text-neutral-500">
            <TintPill color={live ? "#1F9D4C" : status === "PAUSED" ? "#D97706" : "#A3A3A3"}>{live ? "Live" : status === "PAUSED" ? "Paused" : "Draft"}</TintPill>
            {flowSummary(flow)}
            {dirty && " · unsaved changes"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {automation && (
            <RowMenu
              items={[
                {
                  icon: Copy,
                  label: "Duplicate",
                  onClick: async () => {
                    const r = await run("dup", duplicateAutomationAction(automation.id), "Workflow duplicated");
                    if (r) router.push(`/email/automations/${r.id}`);
                  },
                },
                {
                  icon: Trash2,
                  label: "Delete",
                  danger: true,
                  onClick: () =>
                    confirm({
                      title: `Delete “${automation.name}”?`,
                      body: "Everyone in it stops receiving its emails, and its stats are deleted.",
                      confirmLabel: "Delete workflow",
                      danger: true,
                      run: async () => {
                        if (await run("del", deleteAutomationAction(automation.id), "Workflow deleted")) router.push("/email/automations");
                      },
                    }),
                },
              ]}
            />
          )}
          <Button variant="secondary" size="lg" onClick={save} disabled={busy === "save" || !name.trim()}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          {live ? (
            <Button size="lg" variant="secondary" disabled={busy === "status"} onClick={() => run("status", setAutomationStatusAction(automation!.id, "PAUSED"), "Workflow paused")}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={busy === "status" || busy === "save" || problems.length > 0}
              title={problems[0]}
              onClick={async () => {
                const id = dirty || !automation ? await save() : automation.id;
                if (id) await run("status", setAutomationStatusAction(id, "ACTIVE"), "Workflow is live");
              }}
            >
              <Play className="h-4 w-4" /> {status === "PAUSED" ? "Resume" : "Turn on"}
            </Button>
          )}
        </div>
      </div>

      <Card className={cn("grid overflow-hidden p-0", selectedNode ? "xl:grid-cols-[230px_minmax(0,1fr)_380px]" : "xl:grid-cols-[230px_minmax(0,1fr)]")}>
        {/* Palette */}
        <div className="flex flex-col gap-6 border-b border-neutral-100 p-6 xl:border-b-0 xl:border-r">
          <div>
            <p className="text-[15px] font-medium">Add a step</p>
            <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">Adds under the selected step and connects it.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-1">
              {(["email", "wait", "condition", "action"] as const).map((t) => {
                const m = NODE_META[t];
                return (
                  <button key={t} onClick={() => addStep(t)} className="flex items-center gap-3 rounded-2xl border border-black/[0.06] px-3 py-2.5 text-left text-[13.5px] transition-colors hover:bg-page">
                    <span className="grid h-8 w-8 place-items-center rounded-[10px]" style={{ background: m.tint, color: m.color }}>
                      <m.icon className="h-4 w-4" />
                    </span>
                    {m.badge}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-3 text-[11.5px] uppercase tracking-[0.06em] text-neutral-400">Checks</p>
            {problems.length === 0 ? (
              <p className="flex items-start gap-2 text-[12.5px] text-[#1F9D4C]">
                <Check className="mt-0.5 h-4 w-4 shrink-0" /> Ready to go live
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {problems.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[12.5px] leading-snug text-neutral-600">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-auto hidden text-[11.5px] leading-relaxed text-neutral-400 xl:block">
            Drag from a dot to connect steps. Select a line and press Delete to remove it.
          </p>
        </div>

        {/* Canvas */}
        <div className="h-[680px] min-w-0 bg-[#FBFBFA]">
          <TriggerCtx.Provider value={{ trigger, triggerValue }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={(c) => {
                onNodesChange(c);
                if (c.some((x) => x.type !== "select" && x.type !== "dimensions")) touch();
              }}
              onEdgesChange={(c) => {
                onEdgesChange(c);
                if (c.some((x) => x.type === "remove")) touch();
              }}
              onConnect={onConnect}
              onNodeClick={(_, n) => setSelected(n.id)}
              onPaneClick={() => setSelected(null)}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={0.3}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#D9D9D9" />
              <Controls showInteractive={false} position="bottom-right" />
            </ReactFlow>
          </TriggerCtx.Provider>
        </div>

        {/* Settings for the selected step */}
        {selectedNode && (
          <div className="min-w-0 border-t border-neutral-100 xl:border-l xl:border-t-0">
            <NodePanel
              key={selectedNode.id}
              type={selectedNode.type as FlowNodeType}
              data={selectedNode.data}
              onChange={(d) => updateData(selectedNode.id, d)}
              onClose={() => setSelected(null)}
              trigger={trigger}
              triggerValue={triggerValue}
              onTrigger={(t, v) => {
                setTrigger(t);
                setTriggerValue(v);
                if (t === "EMAIL_REPLIED") setStopOnReply(false);
                touch();
              }}
              tags={tags}
              reps={reps}
              templates={templates}
              accounts={accounts}
            />
          </div>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="p-8">
          <CardHeader title="Sending" subtitle="Workflow emails share the same inboxes and daily limits as campaigns." />
          <SenderPicker
            accounts={accounts}
            value={accountIds}
            onChange={(v) => {
              setAccountIds(v);
              touch();
            }}
          />
          <div className="mt-6">
            <Toggle
              checked={stopOnReply}
              onChange={(v) => {
                setStopOnReply(v);
                touch();
              }}
              label="Stop the workflow as soon as the contact replies"
            />
            <p className="mt-2 pl-14 text-[12px] text-neutral-500">Turn this off if your workflow branches on “Replied” itself.</p>
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 px-7 pb-5 pt-6">
            <div>
              <p className="text-[16px] font-medium tracking-[-0.01em]">People in this workflow</p>
              <p className="mt-1 text-[12.5px] text-neutral-500">
                {automation ? `${automation.counts.active} in progress · ${automation.counts.completed + automation.counts.stopped} finished` : "Save first to add people"}
              </p>
            </div>
            <Button size="sm" variant="secondary" disabled={!automation} onClick={() => setEnrollOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Add people
            </Button>
          </div>
          <div className="scroll-slim max-h-[440px] overflow-y-auto border-t border-neutral-100">
            {enrollments.length === 0 ? (
              <p className="px-7 py-10 text-center text-[13px] text-neutral-500">Nobody yet.</p>
            ) : (
              <ul>
                {enrollments.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 border-b border-neutral-100 px-7 py-3.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{e.businessName}</p>
                      <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                        {e.status === "ACTIVE"
                          ? `${nodeTitle(e.nodeId) ?? "Starting"}${e.nextRunAt ? ` · ${relativeTime(e.nextRunAt)}` : ""}`
                          : e.stopReason ?? (e.status === "COMPLETED" ? "Finished" : "Stopped")}
                      </p>
                    </div>
                    <StatusDot color={e.status === "ACTIVE" ? "#1F9D4C" : e.status === "COMPLETED" ? "#525252" : "#A3A3A3"} label={e.status === "ACTIVE" ? "Active" : e.status === "COMPLETED" ? "Done" : "Stopped"} />
                    {e.status === "ACTIVE" && (
                      <IconButton label="Stop for this contact" size="sm" onClick={() => run(`stop${e.id}`, stopEnrollmentAction(e.id), "Stopped")}>
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {automation && (
            <p className="flex items-center gap-1.5 border-t border-neutral-100 px-7 py-4 text-[12px] text-neutral-500">
              <Clock className="h-3.5 w-3.5" /> Last edited {formatDateTime(automation.updatedAt)}
            </p>
          )}
        </Card>
      </div>

      {automation && <EnrollModal open={enrollOpen} onClose={() => setEnrollOpen(false)} automationId={automation.id} />}
      {dialog}
    </div>
  );
}

function EnrollModal({ open, onClose, automationId }: { open: boolean; onClose: () => void; automationId: string }) {
  const { run, busy } = useEmailAction();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; businessName: string; email: string; contactName: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchContactsAction(q);
      if (live && r.ok) setResults(r.data);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add people"
      subtitle="Only subscribed contacts with an email address are listed. To add a whole list, select them on the Contacts page."
      className="max-w-[560px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!picked.size || busy === "enroll"}
            onClick={async () => {
              const r = await run("enroll", enrollContactsAction(automationId, [...picked]), (d) => `${d.enrolled} added${d.skipped ? ` · ${d.skipped} already in it` : ""}`);
              if (r) {
                setPicked(new Set());
                onClose();
              }
            }}
          >
            Add {picked.size || ""}
          </Button>
        </>
      }
    >
      <label className="flex h-11 items-center gap-2.5 rounded-xl bg-page px-4">
        <Search className="h-4 w-4 text-neutral-500" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, contact or email" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-neutral-500" />
      </label>
      <ul className="mt-3 flex flex-col">
        {results.map((r) => {
          const on = picked.has(r.id);
          return (
            <li key={r.id}>
              <button
                onClick={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    on ? n.delete(r.id) : n.add(r.id);
                    return n;
                  })
                }
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-page"
              >
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-ink bg-ink text-white" : "border-neutral-300")}>
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px]">{r.businessName}</span>
                  <span className="block truncate text-[12px] text-neutral-500">{[r.contactName, r.email].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          );
        })}
        {results.length === 0 && <li className="px-3 py-6 text-[13px] text-neutral-500">No matching contacts.</li>}
      </ul>
    </Modal>
  );
}
