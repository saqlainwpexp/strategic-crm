import type { Lead, User } from "@/lib/types";
import { dayLabel, shiftDayKey, todayKey, weekdayOf } from "@/lib/date";

export const SCRIPT_VARIABLES = [
  "decision_maker",
  "rep_name",
  "agency_name",
  "business_name",
  "issue",
  "city",
  "slot_1",
  "slot_2",
] as const;

function nextWorkdays(n: number) {
  const out: string[] = [];
  for (let i = 1; out.length < n; i++) {
    const k = shiftDayKey(todayKey(), i);
    if (weekdayOf(k) !== 6) out.push(k);
  }
  return out;
}

/** Values for script placeholders, personalised for a lead and rep. */
export function scriptVars(lead: Lead, rep: Pick<User, "name">, agencyName: string): Record<string, string> {
  const dm = lead.decisionMakerName.startsWith("Dr.")
    ? lead.decisionMakerName.split(" ").slice(0, 2).join(" ")
    : lead.decisionMakerName.split(" ")[0];
  const issue = (lead.issues.split("\n")[0] ?? "").trim();
  const [d1, d2] = nextWorkdays(2);
  const when = (k: string) => {
    const label = dayLabel(k);
    return label === "Tomorrow" ? "tomorrow" : label.split(",")[0];
  };
  return {
    decision_maker: dm,
    rep_name: rep.name.split(" ")[0],
    agency_name: agencyName,
    business_name: lead.businessName,
    issue: issue ? issue.charAt(0).toLowerCase() + issue.slice(1) : "a few things we could improve",
    city: lead.city,
    slot_1: `${when(d1)} at 12 PM`,
    slot_2: `${when(d2)} at 4 PM`,
  };
}

function isHeading(line: string) {
  const t = line.trim();
  return t.length < 70 && /[A-Z]{3}/.test(t) && !/[a-z]/.test(t.replace(/\{[a-z_0-9]+\}/g, ""));
}

function withVars(line: string, vars?: Record<string, string>) {
  return line.split(/(\{[a-z_0-9]+\})/g).map((part, i) => {
    const m = part.match(/^\{([a-z_0-9]+)\}$/);
    if (!m) return <span key={i}>{part}</span>;
    const value = vars?.[m[1]];
    return value ? (
      <mark key={i} className="rounded-md bg-brand-50 px-1 py-0.5 text-brand-700">
        {value}
      </mark>
    ) : (
      <span key={i} className="rounded-md bg-page px-1.5 py-0.5 font-mono text-[12px] text-neutral-600">
        {part}
      </span>
    );
  });
}

/** Renders a script: ALL-CAPS lines become section labels, {placeholders} are filled or highlighted. */
export function ScriptText({ body, vars }: { body: string; vars?: Record<string, string> }) {
  return (
    <div>
      {body.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-3" />;
        if (isHeading(line))
          return (
            <p key={i} className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400 first:mt-0">
              {line}
            </p>
          );
        return (
          <p key={i} className="text-[14px] leading-[1.75] text-neutral-800">
            {withVars(line, vars)}
          </p>
        );
      })}
    </div>
  );
}
