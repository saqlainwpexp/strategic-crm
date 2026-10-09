// SMTP transport + building the final email (merge tags, tracking, unsubscribe, signature).

import nodemailer, { type Transporter } from "nodemailer";
import type { EmailAccount, Lead } from "@prisma/client";
import { fillMergeTags, htmlToText, type MergeData } from "@/lib/email";
import { appUrl, decryptSecret, sign } from "./crypto";
import { unsubscribeToken } from "./tokens";

// ─── Transport ───────────────────────────────────────────────

const transports = new Map<string, { version: number; t: Transporter }>();

export function transportFor(acc: EmailAccount): Transporter {
  const version = acc.updatedAt.getTime();
  const hit = transports.get(acc.id);
  if (hit && hit.version === version) return hit.t;
  hit?.t.close();
  const t = nodemailer.createTransport({
    host: acc.smtpHost,
    port: acc.smtpPort,
    // 465 = TLS from the first byte; 587/25 = plain then STARTTLS.
    secure: acc.smtpPort === 465 ? true : acc.smtpSecure && acc.smtpPort !== 587 && acc.smtpPort !== 25,
    requireTLS: acc.smtpPort === 587,
    auth: { user: acc.smtpUser, pass: decryptSecret(acc.passwordEnc) },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  transports.set(acc.id, { version, t });
  return t;
}

export function forgetTransport(accountId: string) {
  transports.get(accountId)?.t.close();
  transports.delete(accountId);
}

/** Turn SMTP/IMAP errors into something a non-technical person can act on. */
export function friendlyMailError(e: unknown, host: string): string {
  const err = e as { message?: string; code?: string; responseCode?: number };
  const msg = (err.message || String(e)).toLowerCase();
  const code = err.code || "";
  if (code === "EDECRYPT") return err.message ?? "Unreadable stored password.";
  if (code === "ETIMEDOUT" || msg.includes("timeout") || msg.includes("timed out"))
    return `Timed out connecting to ${host}. Check the host and port.`;
  if (code === "ECONNREFUSED") return `${host} refused the connection. Check the port (465 = SSL, 587 = STARTTLS).`;
  if (code === "ENOTFOUND" || msg.includes("getaddrinfo")) return `Server "${host}" wasn't found. Check the hostname.`;
  if (code === "EAUTH" || err.responseCode === 535 || msg.includes("authentication") || msg.includes("invalid login") || msg.includes("auth"))
    return host.includes("gmail")
      ? "Gmail rejected the login. Use an App Password, not your normal Gmail password."
      : "The mailbox rejected the username or password.";
  if (msg.includes("certificate") || msg.includes("ssl") || msg.includes("tls") || msg.includes("wrong version number"))
    return "SSL/TLS mismatch. Port 465 needs SSL; port 587 uses STARTTLS.";
  if (err.responseCode === 550 || msg.includes("mailbox unavailable") || msg.includes("user unknown"))
    return "The recipient address was rejected by the server.";
  return (err.message || "Unknown error").slice(0, 300);
}

// ─── Building an email ───────────────────────────────────────

export type BuildOptions = {
  sendId: string;
  subject: string;
  html: string;
  previewText?: string;
  trackOpens: boolean;
  trackClicks: boolean;
  addUnsubscribe: boolean;
  fromName?: string;
  replyTo?: string;
  agencyName: string;
};

export type BuiltEmail = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  messageId: string;
  headers: Record<string, string>;
};

function trackLinks(html: string, sendId: string, skip: string) {
  return html.replace(/<a\b([^>]*?)href=(["'])(.*?)\2([^>]*)>/gi, (match, pre: string, q: string, raw: string, post: string) => {
    const url = raw.replace(/&amp;/g, "&");
    if (!/^https?:\/\//i.test(url) || url === skip) return match;
    const tracked = `${appUrl()}/api/e/c/${sendId}?u=${encodeURIComponent(url)}&s=${sign(`c:${sendId}:${url}`)}`;
    return `<a${pre}href=${q}${tracked.replace(/&/g, "&amp;")}${q}${post}>`;
  });
}

export function buildEmail(acc: EmailAccount, lead: Pick<Lead, "id" | "email" | "decisionMakerName" | "businessName" | "city" | "website" | "service">, o: BuildOptions): BuiltEmail {
  const to = (lead.email ?? "").trim();
  const token = unsubscribeToken(lead.id);
  const unsubscribeUrl = `${appUrl()}/unsubscribe/${token}`;
  const senderName = o.fromName?.trim() || acc.fromName || acc.name;
  const merge: MergeData = {
    decisionMakerName: lead.decisionMakerName ?? "",
    businessName: lead.businessName,
    city: lead.city ?? "",
    website: lead.website ?? "",
    service: lead.service,
    email: to,
    senderName,
    agencyName: o.agencyName,
    unsubscribeUrl,
  };

  let body = fillMergeTags(o.html, merge, true);
  if (acc.signature.trim()) body += `<div style="margin-top:20px">${fillMergeTags(acc.signature, merge, true)}</div>`;
  if (o.addUnsubscribe && !body.includes(unsubscribeUrl)) {
    body += `<p style="margin-top:32px;font-size:12px;color:#8a8a8a">Don't want these emails? <a href="${unsubscribeUrl}" style="color:#8a8a8a">Unsubscribe</a></p>`;
  }
  if (o.trackClicks) body = trackLinks(body, o.sendId, unsubscribeUrl);
  const preheader = o.previewText?.trim()
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${fillMergeTags(o.previewText, merge, true)}</div>`
    : "";
  const pixel = o.trackOpens
    ? `<img src="${appUrl()}/api/e/o/${o.sendId}.${sign(`o:${o.sendId}`)}.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#ffffff">${preheader}<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111111;max-width:640px;padding:8px 4px">${body}</div>${pixel}</body></html>`;

  const domain = acc.email.split("@")[1] || "localhost";
  const headers: Record<string, string> = {};
  if (o.addUnsubscribe) {
    headers["List-Unsubscribe"] = `<${appUrl()}/api/e/u/${token}>, <mailto:${acc.email}?subject=unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  return {
    from: `"${senderName.replace(/"/g, "")}" <${acc.email}>`,
    to,
    replyTo: o.replyTo?.trim() || undefined,
    subject: fillMergeTags(o.subject, merge, false).replace(/[\r\n]+/g, " ").slice(0, 300),
    html,
    text: htmlToText(body),
    messageId: `<${o.sendId}.${Date.now().toString(36)}@${domain}>`,
    headers,
  };
}

export async function deliver(acc: EmailAccount, m: BuiltEmail) {
  const info = await transportFor(acc).sendMail({
    from: m.from,
    to: m.to,
    replyTo: m.replyTo,
    subject: m.subject,
    html: m.html,
    text: m.text,
    messageId: m.messageId,
    headers: m.headers,
  });
  return info;
}
