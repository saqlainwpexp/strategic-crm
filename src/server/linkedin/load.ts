"use server";

import { getDb } from "@/server/db";

export async function loadLinkedInOverview() {
  const [accounts, campaigns, prospects, conversations] = await Promise.all([
    (await getDb()).liAccount.findMany({ orderBy: { createdAt: "desc" } }),
    (await getDb()).liCampaign.findMany({ orderBy: { createdAt: "desc" } }),
    (await getDb()).liProspect.findMany({ orderBy: { createdAt: "desc" }, take: 1, select: { id: true } }),
    (await getDb()).liConversation.findMany({ where: { unread: true }, select: { id: true } }),
  ]);
  const [prospectCount, recentActions] = await Promise.all([
    (await getDb()).liProspect.count(),
    (await getDb()).liAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { account: { select: { name: true } }, prospect: { select: { firstName: true, lastName: true, company: true } } },
    }),
  ]);
  return { accounts, campaigns, prospectCount, unreadCount: conversations.length, recentActions };
}

export type LinkedInOverview = Awaited<ReturnType<typeof loadLinkedInOverview>>;

export async function loadAccounts() {
  return (await getDb()).liAccount.findMany({ orderBy: { createdAt: "desc" } });
}

export async function loadAccount(id: string) {
  return (await getDb()).liAccount.findUniqueOrThrow({ where: { id } });
}

export async function loadCampaigns() {
  const campaigns = await (await getDb()).liCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { prospects: true } },
    },
  });
  return campaigns;
}

export async function loadCampaign(id: string) {
  return (await getDb()).liCampaign.findUniqueOrThrow({
    where: { id },
    include: {
      prospects: {
        include: { prospect: true, account: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function loadProspects(opts?: { search?: string; tag?: string }) {
  const where: Record<string, unknown> = {};
  if (opts?.search) {
    const s = opts.search.toLowerCase();
    where.OR = [
      { firstName: { contains: s } },
      { lastName: { contains: s } },
      { company: { contains: s } },
      { title: { contains: s } },
    ];
  }
  return (await getDb()).liProspect.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function loadInbox(opts?: { accountId?: string; label?: string; unreadOnly?: boolean }) {
  return (await getDb()).liConversation.findMany({
    where: {
      ...(opts?.accountId ? { accountId: opts.accountId } : {}),
      ...(opts?.label ? { label: opts.label as never } : {}),
      ...(opts?.unreadOnly ? { unread: true } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      account: { select: { id: true, name: true } },
      prospect: { select: { id: true, firstName: true, lastName: true, company: true, title: true } },
      messages: { orderBy: { sentAt: "asc" } },
    },
    take: 100,
  });
}

export type LiConversationWithDetails = Awaited<ReturnType<typeof loadInbox>>[number];

export async function loadTemplates() {
  return (await getDb()).liTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function loadUnreadCount() {
  return (await getDb()).liConversation.count({ where: { unread: true } });
}
