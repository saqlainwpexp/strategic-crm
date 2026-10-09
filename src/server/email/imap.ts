// Reads replies from each mailbox over IMAP into the shared inbox, links them to leads and to
// the email they answer, and marks bounces.

import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { Prisma, type EmailAccount } from "@prisma/client";
import { prisma } from "../db";
import { decryptSecret } from "./crypto";
import { friendlyMailError } from "./mailer";

const FIRST_SYNC_MESSAGES = 30;
const MAX_PER_SYNC = 100;

export function imapHostFor(acc: Pick<EmailAccount, "imapHost" | "smtpHost">) {
  return acc.imapHost.trim() || acc.smtpHost.replace(/^(smtp|mail|out|outgoing)\./i, "imap.");
}

function client(acc: EmailAccount) {
  return new ImapFlow({
    host: imapHostFor(acc),
    port: acc.imapPort,
    secure: acc.imapSecure,
    auth: { user: acc.smtpUser, pass: decryptSecret(acc.passwordEnc) },
    logger: false,
    socketTimeout: 60_000,
  });
}

/** Connect and log out — used by "Test connection". Returns an error message or null. */
export async function testImap(acc: EmailAccount): Promise<string | null> {
  const c = client(acc);
  c.on("error", () => {});
  try {
    await c.connect();
    await c.logout();
    return null;
  } catch (e) {
    return friendlyMailError(e, imapHostFor(acc));
  }
}

export async function syncAllInboxes() {
  const accounts = await prisma.emailAccount.findMany({ where: { imapEnabled: true, status: "CONNECTED" } });
  let added = 0;
  for (const acc of accounts) {
    try {
      added += await syncAccount(acc);
    } catch (e) {
      console.error(`[email] IMAP sync failed for ${acc.email}:`, friendlyMailError(e, imapHostFor(acc)));
    }
  }
  return added;
}

const clean = (id?: string | null) => (id ?? "").trim().replace(/^<|>$/g, "");
const baseSubject = (s: string) => s.replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?:\s*)+/i, "").trim() || "(no subject)";

const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i;
const BOUNCE_SUBJECT = /undeliver|delivery status notification|failure notice|returned mail|delivery (has )?failed|mail delivery failed|could not be delivered/i;

export async function syncAccount(acc: EmailAccount): Promise<number> {
  const c = client(acc);
  c.on("error", () => {});
  await c.connect();
  let added = 0;
  try {
    const lock = await c.getMailboxLock("INBOX");
    try {
      const box = c.mailbox;
      if (!box) return 0;
      const validity = String(box.uidValidity ?? "");
      let lastUid = acc.uidValidity === validity ? acc.lastUid : 0;
      const uidNext = Number(box.uidNext ?? 1);
      if (lastUid === 0) lastUid = Math.max(0, uidNext - 1 - FIRST_SYNC_MESSAGES);
      if (uidNext - 1 <= lastUid) {
        await prisma.emailAccount.update({ where: { id: acc.id }, data: { lastSyncAt: new Date(), uidValidity: validity, lastUid } });
        return 0;
      }

      const end = Math.min(uidNext - 1, lastUid + MAX_PER_SYNC);
      let maxUid = lastUid;
      for await (const msg of c.fetch(`${lastUid + 1}:${end}`, { uid: true, source: true }, { uid: true })) {
        maxUid = Math.max(maxUid, msg.uid);
        if (!msg.source) continue;
        try {
          const parsed = await simpleParser(msg.source);
          if (await storeMessage(acc, parsed, `uid-${validity}-${msg.uid}`)) added++;
        } catch (e) {
          console.error(`[email] couldn't read message ${msg.uid} for ${acc.email}`, e);
        }
      }
      await prisma.emailAccount.update({ where: { id: acc.id }, data: { lastSyncAt: new Date(), uidValidity: validity, lastUid: maxUid } });
    } finally {
      lock.release();
    }
  } finally {
    await c.logout().catch(() => {});
  }
  return added;
}

async function storeMessage(acc: EmailAccount, m: ParsedMail, fallbackId: string): Promise<boolean> {
  const from = m.from?.value?.[0];
  const fromEmail = (from?.address ?? "").trim().toLowerCase();
  if (!fromEmail || fromEmail === acc.email.toLowerCase()) return false;
  const subject = (m.subject ?? "(no subject)").slice(0, 490);
  const text = (m.text ?? (typeof m.html === "string" ? m.html.replace(/<[^>]+>/g, " ") : "") ?? "").trim().slice(0, 200_000);
  const refs = [clean(m.inReplyTo), ...(Array.isArray(m.references) ? m.references : m.references ? [m.references] : []).map(clean)].filter(Boolean);

  // Bounce: mark the original send + lead, don't clutter the inbox.
  if (BOUNCE_FROM.test(`${from?.name ?? ""} ${fromEmail}`) || BOUNCE_SUBJECT.test(subject)) {
    await markBounce(text, refs);
    return false;
  }

  const send = refs.length
    ? await prisma.emailSend.findFirst({ where: { messageId: { in: refs.map((r) => `<${r}>`) } }, select: { id: true, leadId: true, repliedAt: true } })
    : null;
  const autoReply = /^(auto|out of office|automatic reply|abwesend)/i.test(subject) || (m.headers.get("auto-submitted") ?? "no") !== "no";
  if (send && !send.repliedAt && !autoReply) {
    await prisma.emailSend.update({ where: { id: send.id }, data: { repliedAt: m.date ?? new Date() } });
  }

  const leadId =
    send?.leadId ??
    (await prisma.lead.findFirst({ where: { email: fromEmail }, select: { id: true } }))?.id ??
    null;

  const sentAt = m.date ?? new Date();
  const subj = baseSubject(subject).slice(0, 490);
  let thread = await prisma.inboxThread.findFirst({
    where: { accountId: acc.id, contactEmail: fromEmail, subject: subj },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!thread) {
    thread = await prisma.inboxThread.create({
      data: { accountId: acc.id, leadId, subject: subj, contactEmail: fromEmail, contactName: from?.name ?? "", lastMessageAt: sentAt },
    });
  }

  try {
    await prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        accountId: acc.id,
        messageId: (clean(m.messageId) || fallbackId).slice(0, 250),
        inReplyTo: refs[0]?.slice(0, 250) ?? null,
        references: refs.join(" ").slice(0, 5000) || null,
        direction: "IN",
        fromEmail,
        fromName: from?.name ?? "",
        toEmail: acc.email,
        subject,
        text,
        sentAt,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; // already imported
    throw e;
  }
  await prisma.inboxThread.update({
    where: { id: thread.id },
    data: { unread: true, archived: false, lastMessageAt: sentAt > thread.lastMessageAt ? sentAt : thread.lastMessageAt, leadId: thread.leadId ?? leadId },
  });
  return true;
}

async function markBounce(text: string, refs: string[]) {
  const now = new Date();
  // Prefer the original Message-ID (quoted in most bounce reports); fall back to the failed address.
  const ids = new Set(refs.map((r) => `<${r}>`));
  for (const mid of text.match(/<[^<>\s]+@[^<>\s]+>/g) ?? []) ids.add(mid);
  let send = ids.size ? await prisma.emailSend.findFirst({ where: { messageId: { in: [...ids] } } }) : null;
  if (!send) {
    const failed = text.match(/final-recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i)?.[1] ?? text.match(/<([^<>\s]+@[^<>\s]+)>:?\s*\n?.*(does not exist|unknown|rejected|not found)/i)?.[1];
    if (failed) send = await prisma.emailSend.findFirst({ where: { email: failed.toLowerCase(), status: "SENT" }, orderBy: { sentAt: "desc" } });
  }
  if (!send) return;
  await prisma.emailSend.update({ where: { id: send.id }, data: { bouncedAt: now } });
  if (send.leadId) await prisma.lead.update({ where: { id: send.leadId }, data: { emailBouncedAt: now } }).catch(() => {});
}
