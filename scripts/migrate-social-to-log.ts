// One-off: copy social DM outreach (cold-calling Social tab: Lead + LeadSocialProfile +
// OutreachThread + OutreachActivity) into the Outreach & Jobs Log (LogContact + LogActivity).
// Non-destructive: the original Lead rows are left in place (the cold-calling CRM hides leads
// without a phone). Idempotent: contacts already in the log (same channel + handle) are skipped.
//
//   npx tsx --env-file=.env scripts/migrate-social-to-log.ts          # dry run
//   npx tsx --env-file=.env scripts/migrate-social-to-log.ts --apply

import { PrismaClient } from "@prisma/client";
import { handleKey } from "../src/lib/outreach-log/rules";

const p = new PrismaClient();
const apply = process.argv.includes("--apply");

const STAGE: Record<string, string> = {
  not_contacted: "new",
  connection_sent: "contacted",
  connected: "contacted",
  message_sent: "contacted",
  replied: "replied",
  interested: "interested",
  call_booked: "meeting",
  won: "won",
  lost: "lost",
  not_interested: "lost",
  no_response: "no_response",
};
const LABEL: Record<string, string> = {
  connection_request: "Connection request",
  comment: "Comment",
  like: "Like",
  story_reply: "Story reply",
  voice_note: "Voice note",
};

async function main() {
  const threads = await p.outreachThread.findMany({ include: { activities: { orderBy: { occurredAt: "asc" } } } });
  let created = 0;
  let skipped = 0;
  for (const t of threads) {
    const [lead, prof] = await Promise.all([
      p.lead.findFirst({ where: { id: t.leadId, agencyId: t.agencyId } }),
      p.leadSocialProfile.findFirst({ where: { leadId: t.leadId, platform: t.platform, agencyId: t.agencyId } }),
    ]);
    if (!lead) continue;
    const handle = prof?.url ?? t.threadUrl ?? "";
    const key = handleKey(t.platform, handle);
    if (key && (await p.logContact.findFirst({ where: { agencyId: t.agencyId, channel: t.platform, handleKey: key } }))) {
      skipped++;
      continue;
    }
    let stage = STAGE[t.stage] ?? "new";
    if (stage === "contacted" && t.followupCount > 0) stage = "followed_up";
    const name = lead.decisionMakerName?.trim() || lead.businessName;
    const company = lead.decisionMakerName?.trim() ? lead.businessName : "";
    created++;
    if (!apply) continue;
    const c = await p.logContact.create({
      data: {
        agencyId: t.agencyId,
        ownerId: t.ownerId,
        name: name.slice(0, 200),
        company: company.slice(0, 200),
        title: (lead.jobTitle ?? "").slice(0, 200),
        channel: t.platform,
        handle: handle.slice(0, 500),
        handleKey: key.slice(0, 500),
        stage,
        followupCount: t.followupCount,
        lastOutboundAt: t.lastOutboundAt,
        lastInboundAt: t.lastInboundAt,
        nextFollowupAt: t.nextFollowupAt,
        source: "Moved from cold-calling Social tab",
        notes: [t.notes, lead.notes].filter(Boolean).join("\n\n") || null,
        createdAt: t.createdAt,
      },
    });
    let sentOnce = false;
    for (const a of t.activities) {
      const inbound = a.direction === "inbound";
      const type = inbound ? "reply" : sentOnce ? "followup" : "sent";
      if (!inbound) sentOnce = true;
      const label = LABEL[a.type];
      await p.logActivity.create({
        data: {
          agencyId: a.agencyId,
          userId: a.userId,
          contactId: c.id,
          type,
          direction: inbound ? "inbound" : "outbound",
          text: [label && !inbound ? `[${label}]` : "", a.messageText ?? ""].filter(Boolean).join(" ") || null,
          occurredAt: a.occurredAt,
        },
      });
    }
  }
  console.log(`${apply ? "Copied" : "Would copy"} ${created} social contacts into the Outreach & Jobs Log; ${skipped} already there.`);
}

main().finally(() => p.$disconnect());
