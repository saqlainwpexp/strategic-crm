// Background tick for the Outreach & Jobs log, per agency: expire cold threads, then signal
// newly-due follow-ups to the agent webhook (if one is set).

import { agencyContext, publicUrl } from "../agencies";
import { systemDb } from "../system-db";
import { signalDueFollowups, sweepStale } from "./service";

const TICK_MS = 5 * 60_000;
const g = globalThis as unknown as { __scrmLogWorker?: ReturnType<typeof setInterval> };

export async function runLogTick() {
  const out: { agency: string; expired: number; signalled: number; status: string }[] = [];
  for (const row of await systemDb.agency.findMany({ where: { active: true } })) {
    try {
      out.push(
        await agencyContext.run({ ...row, url: publicUrl() }, async () => {
          const expired = await sweepStale();
          const s = await signalDueFollowups();
          return { agency: row.id, expired, signalled: s.sent, status: s.status };
        })
      );
    } catch (e) {
      console.error("[outreach-log] tick failed for", row.id, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

export function startLogWorker() {
  if (g.__scrmLogWorker) return;
  g.__scrmLogWorker = setInterval(() => void runLogTick().catch(() => undefined), TICK_MS);
}
