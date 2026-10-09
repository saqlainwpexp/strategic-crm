"use client";

import { createContext, useContext } from "react";
import { Handle, NodeToolbar, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Clock, GitBranch, Mail, Trash2, Workflow, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeNode, type FlowNode, type FlowNodeData, type FlowNodeType } from "@/lib/automation-flow";
import type { AutomationTrigger } from "@/lib/email";

/** Trigger settings live on the automation; nodes read them to show the trigger card's title. */
export const TriggerCtx = createContext<{ trigger: AutomationTrigger; triggerValue: string }>({ trigger: "MANUAL", triggerValue: "" });

export const NODE_META: Record<FlowNodeType, { icon: LucideIcon; badge: string; color: string; tint: string; ring: string }> = {
  trigger: { icon: Zap, badge: "Trigger", color: "#404040", tint: "#F1F1F1", ring: "#D4D4D4" },
  email: { icon: Mail, badge: "Send email", color: "rgb(var(--brand-600))", tint: "rgb(var(--brand-50))", ring: "rgb(var(--brand-300))" },
  wait: { icon: Clock, badge: "Wait", color: "#B45309", tint: "#FEF3C7", ring: "#FCD34D" },
  condition: { icon: GitBranch, badge: "Condition", color: "#7C3AED", tint: "#F3E8FF", ring: "#C4B5FD" },
  action: { icon: Workflow, badge: "Action", color: "#2563EB", tint: "#DBEAFE", ring: "#93C5FD" },
};

const handle = "!h-3 !w-3 !rounded-full !border-2 !bg-white";

function FlowCard({ id, type, data, selected }: NodeProps & { type: FlowNodeType }) {
  const trigger = useContext(TriggerCtx);
  const { setNodes, setEdges } = useReactFlow();
  const m = NODE_META[type];
  const { title, subtitle } = describeNode({ id, type, position: { x: 0, y: 0 }, data: data as FlowNodeData } as FlowNode, trigger);

  return (
    <>
      {type !== "trigger" && (
        <NodeToolbar isVisible={selected} position={Position.Top} offset={12}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setNodes((ns) => ns.filter((n) => n.id !== id));
              setEdges((es) => es.filter((x) => x.source !== id && x.target !== id));
            }}
            className="flex items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-2 text-[12.5px] font-medium text-white shadow-lg transition-colors hover:bg-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete step
          </button>
        </NodeToolbar>
      )}

      {type !== "trigger" && <Handle type="target" position={Position.Top} className={handle} style={{ borderColor: "#A3A3A3" }} />}

      <div
        className={cn("w-[236px] cursor-pointer rounded-[18px] border-[1.5px] bg-white p-4 transition-shadow", selected ? "shadow-[0_12px_32px_-8px_rgba(10,10,10,0.25)]" : "shadow-[0_1px_3px_rgba(10,10,10,0.06)] hover:shadow-[0_8px_24px_-8px_rgba(10,10,10,0.18)]")}
        style={{ borderColor: selected ? m.color : m.ring }}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: m.tint, color: m.color }}>
            <m.icon className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: m.color }}>
              {m.badge}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-ink">{title}</p>
            <p className="mt-1.5 text-[11.5px] text-neutral-500">{subtitle}</p>
          </div>
        </div>
      </div>

      {type === "condition" ? (
        <>
          <Handle id="yes" type="source" position={Position.Bottom} className={handle} style={{ left: "28%", borderColor: "#22C55E" }} />
          <Handle id="no" type="source" position={Position.Bottom} className={handle} style={{ left: "72%", borderColor: "#EF4444" }} />
          <span className="pointer-events-none absolute -bottom-6 left-[28%] -translate-x-1/2 text-[10.5px] font-semibold text-[#16A34A]">Yes</span>
          <span className="pointer-events-none absolute -bottom-6 left-[72%] -translate-x-1/2 text-[10.5px] font-semibold text-[#DC2626]">No</span>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className={handle} style={{ borderColor: "#A3A3A3" }} />
      )}
    </>
  );
}

export const nodeTypes = {
  trigger: (p: NodeProps) => <FlowCard {...p} type="trigger" />,
  email: (p: NodeProps) => <FlowCard {...p} type="email" />,
  wait: (p: NodeProps) => <FlowCard {...p} type="wait" />,
  condition: (p: NodeProps) => <FlowCard {...p} type="condition" />,
  action: (p: NodeProps) => <FlowCard {...p} type="action" />,
};
