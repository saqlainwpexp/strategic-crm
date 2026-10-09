// Automation workflows as a graph (trigger → email / wait / condition / action …).
// Shared by the flow builder (browser) and the automation engine (server).

import { STAGE_LABELS, TEMP_LABELS, type PipelineStage, type Temperature } from "./constants";
import { TRIGGER_LABELS, WAIT_MS, type AutomationTrigger, type WaitUnit } from "./email";

export type FlowNodeType = "trigger" | "email" | "wait" | "condition" | "action";

export type ConditionKind = "opened" | "clicked" | "replied" | "has_tag" | "stage_is" | "temperature_is" | "has_phone";
export type ActionKind = "send_to_calls" | "add_tag" | "remove_tag" | "move_stage" | "assign_rep" | "unsubscribe";

export type FlowNodeData =
  | { kind: "trigger" }
  | { kind: "email"; subject: string; html: string }
  | { kind: "wait"; amount: number; unit: WaitUnit }
  | { kind: "condition"; condition: ConditionKind; value: string }
  | { kind: "action"; action: ActionKind; value: string };

export type FlowNode = { id: string; type: FlowNodeType; position: { x: number; y: number }; data: FlowNodeData };
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: "yes" | "no" | null };
export type Flow = { nodes: FlowNode[]; edges: FlowEdge[] };

export const CONDITION_LABELS: Record<ConditionKind, string> = {
  opened: "Opened the last email",
  clicked: "Clicked a link in the last email",
  replied: "Replied",
  has_tag: "Has tag",
  stage_is: "Pipeline stage is",
  temperature_is: "Lead temperature is",
  has_phone: "Has a phone number",
};

export const ACTION_LABELS: Record<ActionKind, string> = {
  send_to_calls: "Send to sales calls",
  add_tag: "Add tag",
  remove_tag: "Remove tag",
  move_stage: "Move to pipeline stage",
  assign_rep: "Assign to rep",
  unsubscribe: "Unsubscribe contact",
};

export const ACTION_HINTS: Record<ActionKind, string> = {
  send_to_calls: "Marks the lead Interested, assigns a rep and puts them at the top of the Loadboard call queue.",
  add_tag: "Tag the contact (can start other automations).",
  remove_tag: "Remove a tag from the contact.",
  move_stage: "Move the lead in the calling pipeline.",
  assign_rep: "Give the lead to a rep, or share leads evenly between reps.",
  unsubscribe: "Stop all marketing email to this contact.",
};

const nid = () => `n${Math.random().toString(36).slice(2, 9)}`;

export function newNode(type: Exclude<FlowNodeType, "trigger">, position: { x: number; y: number }): FlowNode {
  const data: FlowNodeData =
    type === "email"
      ? { kind: "email", subject: "", html: "" }
      : type === "wait"
        ? { kind: "wait", amount: 2, unit: "days" }
        : type === "condition"
          ? { kind: "condition", condition: "opened", value: "" }
          : { kind: "action", action: "send_to_calls", value: "" };
  return { id: nid(), type, position, data };
}

/** Title + subtitle shown on a node card. */
export function describeNode(n: FlowNode, trigger: { trigger: AutomationTrigger; triggerValue: string }) {
  const d = n.data;
  switch (d.kind) {
    case "trigger": {
      const v = trigger.trigger === "STAGE_CHANGED" ? STAGE_LABELS[trigger.triggerValue as PipelineStage] ?? "a stage" : trigger.triggerValue || "…";
      const title =
        trigger.trigger === "STAGE_CHANGED" ? `Moves to ${v}` : trigger.trigger === "TAG_ADDED" ? `Tagged “${v}”` : TRIGGER_LABELS[trigger.trigger];
      return { title, subtitle: "Starts the workflow" };
    }
    case "email":
      return { title: d.subject || "Send email", subtitle: d.html ? "Click to edit" : "Click to configure" };
    case "wait":
      return { title: `Wait ${d.amount} ${d.amount === 1 ? d.unit.replace(/s$/, "") : d.unit}`, subtitle: "Then continue to next step" };
    case "condition": {
      const v =
        d.condition === "stage_is"
          ? STAGE_LABELS[d.value as PipelineStage] ?? "…"
          : d.condition === "temperature_is"
            ? TEMP_LABELS[d.value as Temperature] ?? "…"
            : d.value;
      return { title: CONDITION_LABELS[d.condition] + (["has_tag", "stage_is", "temperature_is"].includes(d.condition) ? ` ${v || "…"}` : "?"), subtitle: "Yes ↙   ↘ No" };
    }
    case "action": {
      const v = d.action === "move_stage" ? STAGE_LABELS[d.value as PipelineStage] ?? "" : d.action === "assign_rep" ? (d.value ? "" : "share evenly") : d.value;
      return { title: ACTION_LABELS[d.action] + (v ? ` · ${v}` : ""), subtitle: "Click to configure" };
    }
  }
}

// ─── Normalising stored data ─────────────────────────────────

const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

function normalizeData(type: FlowNodeType, raw: Record<string, unknown>): FlowNodeData {
  switch (type) {
    case "trigger":
      return { kind: "trigger" };
    case "email":
      return { kind: "email", subject: str(raw.subject, 300), html: str(raw.html, 200_000) };
    case "wait": {
      const unit: WaitUnit = raw.unit === "minutes" || raw.unit === "hours" ? raw.unit : "days";
      return { kind: "wait", amount: Math.max(1, Math.min(365, Math.round(num(raw.amount, 1)))), unit };
    }
    case "condition": {
      const c = raw.condition as ConditionKind;
      return { kind: "condition", condition: c in CONDITION_LABELS ? c : "opened", value: str(raw.value, 60) };
    }
    case "action": {
      const a = raw.action as ActionKind;
      return { kind: "action", action: a in ACTION_LABELS ? a : "add_tag", value: str(raw.value, 60) };
    }
  }
}

/** Accepts the stored JSON (a graph, or the older linear list of steps) and returns a clean graph. */
export function normalizeFlow(v: unknown): Flow {
  // Older automations stored a plain array of email/wait steps — turn it into a chain.
  if (Array.isArray(v)) {
    const nodes: FlowNode[] = [{ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { kind: "trigger" } }];
    const edges: FlowEdge[] = [];
    v.slice(0, 50).forEach((s, i) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const type: FlowNodeType = o.type === "wait" ? "wait" : "email";
      const id = typeof o.id === "string" && o.id ? o.id : `s${i}`;
      nodes.push({ id, type, position: { x: 0, y: (i + 1) * 130 }, data: normalizeData(type, o) });
      edges.push({ id: `e${i}`, source: nodes[i].id, target: id });
    });
    return { nodes, edges };
  }
  const o = (v && typeof v === "object" ? v : {}) as { nodes?: unknown; edges?: unknown };
  const types: FlowNodeType[] = ["trigger", "email", "wait", "condition", "action"];
  const nodes: FlowNode[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(o.nodes) ? o.nodes.slice(0, 200) : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const type = r.type as FlowNodeType;
    const id = str(r.id, 40);
    if (!types.includes(type) || !id || seen.has(id)) continue;
    if (type === "trigger" && nodes.some((n) => n.type === "trigger")) continue;
    seen.add(id);
    const p = (r.position ?? {}) as Record<string, unknown>;
    nodes.push({ id, type, position: { x: num(p.x, 0), y: num(p.y, 0) }, data: normalizeData(type, (r.data ?? {}) as Record<string, unknown>) });
  }
  if (!nodes.some((n) => n.type === "trigger")) nodes.unshift({ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { kind: "trigger" } });
  const edges: FlowEdge[] = [];
  const used = new Set<string>();
  for (const raw of Array.isArray(o.edges) ? o.edges.slice(0, 400) : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const source = str(r.source, 40);
    const target = str(r.target, 40);
    if (!seen.has(source) && !nodes.some((n) => n.id === source)) continue;
    if (!nodes.some((n) => n.id === target) || source === target) continue;
    const src = nodes.find((n) => n.id === source)!;
    const handle = src.type === "condition" ? (r.sourceHandle === "no" ? "no" : "yes") : null;
    const key = `${source}:${handle ?? ""}`;
    if (used.has(key)) continue; // one outgoing path per handle
    used.add(key);
    edges.push({ id: str(r.id, 60) || `e${edges.length}`, source, target, sourceHandle: handle });
  }
  return { nodes, edges };
}

export function nextNodeId(flow: Flow, fromId: string, handle?: "yes" | "no"): string | null {
  const e = flow.edges.find((x) => x.source === fromId && (handle ? x.sourceHandle === handle : true));
  return e?.target ?? null;
}

export function triggerNode(flow: Flow) {
  return flow.nodes.find((n) => n.type === "trigger")!;
}

/** Problems that would stop the workflow from running correctly. Empty = ready to go live. */
export function validateFlow(flow: Flow): string[] {
  const problems: string[] = [];
  const start = nextNodeId(flow, triggerNode(flow).id);
  if (!start) problems.push("Connect the trigger to the first step.");
  if (!flow.nodes.some((n) => n.type === "email" || n.type === "action")) problems.push("Add at least one email or action.");
  for (const n of flow.nodes) {
    const d = n.data;
    if (d.kind === "email" && (!d.subject.trim() || d.html.replace(/<[^>]+>/g, "").trim().length < 2)) {
      problems.push("Every email needs a subject and a message.");
      break;
    }
  }
  for (const n of flow.nodes) {
    const d = n.data;
    if (d.kind === "condition" && ["has_tag", "stage_is", "temperature_is"].includes(d.condition) && !d.value) {
      problems.push("A condition is missing its value.");
      break;
    }
    if (d.kind === "action" && ["add_tag", "remove_tag", "move_stage"].includes(d.action) && !d.value) {
      problems.push("An action is missing its value.");
      break;
    }
  }
  // Loops would make a contact cycle forever.
  const visit = (id: string, path: Set<string>): boolean => {
    if (path.has(id)) return true;
    const next = new Set(path).add(id);
    return flow.edges.filter((e) => e.source === id).some((e) => visit(e.target, next));
  };
  if (visit(triggerNode(flow).id, new Set())) problems.push("The workflow loops back on itself — remove the connection that goes backwards.");
  const reachable = new Set<string>();
  const walk = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    flow.edges.filter((e) => e.source === id).forEach((e) => walk(e.target));
  };
  walk(triggerNode(flow).id);
  const orphans = flow.nodes.filter((n) => !reachable.has(n.id)).length;
  if (orphans) problems.push(`${orphans} step${orphans === 1 ? " isn't" : "s aren't"} connected — link or delete ${orphans === 1 ? "it" : "them"}.`);
  return problems;
}

/** Rough length of the longest path in days (for list summaries). */
export function flowSummary(flow: Flow) {
  const emails = flow.nodes.filter((n) => n.type === "email").length;
  const branches = flow.nodes.filter((n) => n.type === "condition").length;
  let maxMs = 0;
  const walk = (id: string, ms: number, depth: number) => {
    if (depth > 200) return;
    const n = flow.nodes.find((x) => x.id === id);
    const add = n?.data.kind === "wait" ? n.data.amount * WAIT_MS[n.data.unit] : 0;
    const out = flow.edges.filter((e) => e.source === id);
    if (!out.length) maxMs = Math.max(maxMs, ms + add);
    out.forEach((e) => walk(e.target, ms + add, depth + 1));
  };
  walk(triggerNode(flow).id, 0, 0);
  const days = Math.round(maxMs / 86_400_000);
  return `${emails} email${emails === 1 ? "" : "s"}${branches ? ` · ${branches} branch${branches === 1 ? "" : "es"}` : ""}${days ? ` · up to ${days} day${days === 1 ? "" : "s"}` : ""}`;
}

/** A sensible starting workflow: email → wait → opened? → follow-up / different angle → … replied → calls. */
export function starterFlow(emails: { subject: string; html: string }[]): Flow {
  const at = (x: number, y: number) => ({ x, y });
  const n = (id: string, type: FlowNodeType, position: { x: number; y: number }, data: FlowNodeData): FlowNode => ({ id, type, position, data });
  const nodes: FlowNode[] = [
    n("trigger", "trigger", at(0, 0), { kind: "trigger" }),
    n("e1", "email", at(0, 140), { kind: "email", ...emails[0] }),
    n("w1", "wait", at(0, 280), { kind: "wait", amount: 3, unit: "days" }),
    n("c1", "condition", at(0, 420), { kind: "condition", condition: "opened", value: "" }),
    n("e2", "email", at(-190, 580), { kind: "email", ...emails[1] }),
    n("e3", "email", at(190, 580), { kind: "email", ...emails[2] }),
    n("w2", "wait", at(0, 730), { kind: "wait", amount: 4, unit: "days" }),
    n("e4", "email", at(0, 870), { kind: "email", ...emails[3] }),
  ];
  const edges: FlowEdge[] = [
    { id: "a", source: "trigger", target: "e1" },
    { id: "b", source: "e1", target: "w1" },
    { id: "c", source: "w1", target: "c1" },
    { id: "d", source: "c1", target: "e2", sourceHandle: "yes" },
    { id: "f", source: "c1", target: "e3", sourceHandle: "no" },
    { id: "g", source: "e2", target: "w2" },
    { id: "h", source: "e3", target: "w2" },
    { id: "i", source: "w2", target: "e4" },
  ];
  return { nodes, edges };
}

export function repliedFlow(): Flow {
  return {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { kind: "trigger" } },
      { id: "a1", type: "action", position: { x: 0, y: 140 }, data: { kind: "action", action: "send_to_calls", value: "" } },
      { id: "a2", type: "action", position: { x: 0, y: 280 }, data: { kind: "action", action: "add_tag", value: "Replied" } },
    ],
    edges: [
      { id: "a", source: "trigger", target: "a1" },
      { id: "b", source: "a1", target: "a2" },
    ],
  };
}
