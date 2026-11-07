"use server";

import { getDb, getAgency } from "@/server/db";
import { requireLinkedInPage } from "./access";
import type { LiAccountStatus, LiCampaignStatus, LiConvLabel } from "@prisma/client";

// ─── Accounts ────────────────────────────────────────────────

export async function upsertAccount(data: {
  id?: string;
  name: string;
  ownerName: string;
  linkedinEmail: string;
  proxyServer: string;
  proxyUser: string;
  proxyPassEnc: string;
  profilePath: string;
  timezone: string;
  locale: string;
  status: LiAccountStatus;
  maxDailyConnects: number;
  maxDailyMessages: number;
  maxDailyViews: number;
  warmupWeeks: number;
  notes: string;
}) {
  await requireLinkedInPage();
  const { id, ...rest } = data;
  if (id) return (await getDb()).liAccount.update({ where: { id }, data: rest });
  return (await getDb()).liAccount.create({ data: rest });
}

export async function deleteAccount(id: string) {
  await requireLinkedInPage();
  return (await getDb()).liAccount.delete({ where: { id } });
}

export async function setAccountStatus(id: string, status: LiAccountStatus) {
  await requireLinkedInPage();
  return (await getDb()).liAccount.update({ where: { id }, data: { status } });
}

// ─── Campaigns ───────────────────────────────────────────────

export async function upsertCampaign(data: {
  id?: string;
  name: string;
  status: LiCampaignStatus;
  steps: object[];
  senderAccountIds: string[];
  startDate?: Date | null;
}) {
  await requireLinkedInPage();
  const { id, ...rest } = data;
  if (id) return (await getDb()).liCampaign.update({ where: { id }, data: rest });
  return (await getDb()).liCampaign.create({ data: rest });
}

export async function deleteCampaign(id: string) {
  await requireLinkedInPage();
  return (await getDb()).liCampaign.delete({ where: { id } });
}

export async function setCampaignStatus(id: string, status: LiCampaignStatus) {
  await requireLinkedInPage();
  return (await getDb()).liCampaign.update({ where: { id }, data: { status } });
}

// ─── Prospects ───────────────────────────────────────────────

export async function upsertProspect(data: {
  id?: string;
  linkedinUrl: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  location: string;
  tags?: string[];
  source?: string;
  notes?: string;
}) {
  await requireLinkedInPage();
  const { id, tags, ...rest } = data;
  const payload = { ...rest, tags: tags ?? [] };
  if (id) return (await getDb()).liProspect.update({ where: { id }, data: payload });
  return (await getDb()).liProspect.upsert({
    where: { agencyId_linkedinUrl: { agencyId: (await getAgency()).id, linkedinUrl: data.linkedinUrl } },
    create: payload,
    update: payload,
  });
}

export async function deleteProspect(id: string) {
  await requireLinkedInPage();
  return (await getDb()).liProspect.delete({ where: { id } });
}

export async function importProspects(rows: { linkedinUrl: string; firstName?: string; lastName?: string; title?: string; company?: string; location?: string }[]) {
  await requireLinkedInPage();
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await (await getDb()).liProspect.upsert({
        where: { agencyId_linkedinUrl: { agencyId: (await getAgency()).id, linkedinUrl: row.linkedinUrl } },
        create: { linkedinUrl: row.linkedinUrl, firstName: row.firstName ?? "", lastName: row.lastName ?? "", title: row.title ?? "", company: row.company ?? "", location: row.location ?? "", source: "csv" },
        update: {},
      });
      imported++;
    } catch {
      skipped++;
    }
  }
  return { imported, skipped };
}

// ─── Templates ───────────────────────────────────────────────

export async function upsertTemplate(data: { id?: string; name: string; body: string }) {
  await requireLinkedInPage();
  const { id, ...rest } = data;
  if (id) return (await getDb()).liTemplate.update({ where: { id }, data: rest });
  return (await getDb()).liTemplate.create({ data: rest });
}

export async function deleteTemplate(id: string) {
  await requireLinkedInPage();
  return (await getDb()).liTemplate.delete({ where: { id } });
}

// ─── Inbox ───────────────────────────────────────────────────

export async function markConversationRead(id: string) {
  await requireLinkedInPage();
  return (await getDb()).liConversation.update({ where: { id }, data: { unread: false } });
}

export async function setConversationLabel(id: string, label: LiConvLabel | null) {
  await requireLinkedInPage();
  return (await getDb()).liConversation.update({ where: { id }, data: { label } });
}

export async function sendLinkedInReply(conversationId: string, text: string) {
  await requireLinkedInPage();
  const conv = await (await getDb()).liConversation.findUniqueOrThrow({ where: { id: conversationId } });
  const msg = await (await getDb()).liMessage.create({
    data: { conversationId: conv.id, direction: "OUT", text, sentAt: new Date(), pendingSend: true },
  });
  await (await getDb()).liConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), unread: false } });
  // The local worker (npm run li:worker) picks up pendingSend messages and types them on LinkedIn.
  return msg;
}

/** Puts prospects into a campaign, owned by its first sender account. Already-enrolled ones are skipped. */
export async function enrollProspects(campaignId: string, prospectIds: string[]) {
  await requireLinkedInPage();
  const campaign = await (await getDb()).liCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  const accountId = ((campaign.senderAccountIds as string[]) ?? [])[0];
  if (!accountId) throw new Error("Pick a sender account on the campaign first.");
  const res = await (await getDb()).liCampaignProspect.createMany({
    data: prospectIds.map((prospectId) => ({ campaignId, prospectId, accountId })),
    skipDuplicates: true,
  });
  return { added: res.count, skipped: prospectIds.length - res.count };
}
