"use client";

import { useMemo } from "react";
import { dayKey, todayKey } from "@/lib/date";
import { PLATFORMS, platformDef } from "@/lib/outreach/platforms";
import { MESSAGE_TYPES, limitStatus, type LimitStatus } from "@/lib/outreach/rules";
import type { OutreachData } from "@/lib/outreach/types";

export type SendCount = {
  platform: string;
  connections: number;
  connectionLimit: number;
  dms: number;
  dmLimit: number;
  connectionStatus: LimitStatus;
  dmStatus: LimitStatus;
};

/** Today's sends per platform for one user, against their limits. */
export function useSendCounts(data: OutreachData, userId: string): SendCount[] {
  return useMemo(() => {
    const today = todayKey();
    const mine = data.activities.filter((a) => a.userId === userId && a.direction === "outbound" && dayKey(a.occurredAt) === today);
    const used = new Set([...data.threads.filter((t) => t.ownerId === userId).map((t) => t.platform), ...data.accounts.filter((a) => a.userId === userId).map((a) => a.platform)]);
    const shown = PLATFORMS.filter((p) => used.has(p.id) || ["linkedin", "facebook", "instagram"].includes(p.id));
    return shown.map((p) => {
      const acct = data.accounts.find((a) => a.userId === userId && a.platform === p.id);
      const def = platformDef(p.id)!;
      const connectionLimit = acct?.dailyConnectionLimit ?? def.defaultConnectionLimit;
      const dmLimit = acct?.dailyDmLimit ?? def.defaultDmLimit;
      const connections = mine.filter((a) => a.platform === p.id && a.type === "connection_request").length;
      const dms = mine.filter((a) => a.platform === p.id && MESSAGE_TYPES.includes(a.type)).length;
      return {
        platform: p.id,
        connections,
        connectionLimit,
        dms,
        dmLimit,
        connectionStatus: limitStatus(connections, connectionLimit),
        dmStatus: limitStatus(dms, dmLimit),
      };
    });
  }, [data.activities, data.threads, data.accounts, userId]);
}
