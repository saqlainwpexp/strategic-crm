import { getAgency } from "../db";
// Signed, unguessable tokens for public email links. Nothing is stored: the signature proves
// the link came from us, so a lead id can't be swapped to unsubscribe or track someone else.

import { sign, verify } from "./crypto";

export function emailAgencyId(token: string) {
  const id = token.includes("~") ? token.split("~")[0] : "default";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid agency link");
  return id;
}
export function emailRecordId(token: string) { return token.includes("~") ? token.slice(token.indexOf("~") + 1) : token; }
export function emailReference(id: string, agencyId: string) { return agencyId === "default" ? id : agencyId + "~" + id; }
export async function unsubscribeToken(leadId: string) {
  const agencyId = (await getAgency()).id;
  return `${emailReference(leadId, agencyId)}.${sign(`u:${leadId}`, 22, agencyId)}`;
}

export async function readUnsubscribeToken(token: string): Promise<string | null> {
  const [leadId, sig] = emailRecordId(token).split(".");
  if (!leadId || !sig || !/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return null;
  return verify(`u:${leadId}`, sig, 22, (await getAgency()).id) ? leadId : null;
}

/** "<sendId>.<sig>[.gif]" → sendId for the open pixel. */
export async function readOpenToken(token: string): Promise<string | null> {
  const [sendId, sig] = emailRecordId(token).split(".");
  if (!sendId || !sig || !/^[A-Za-z0-9_-]{1,64}$/.test(sendId)) return null;
  return verify(`o:${sendId}`, sig, 22, (await getAgency()).id) ? sendId : null;
}

export async function verifyClick(sendId: string, url: string, sig: string) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(sendId) && verify(`c:${sendId}:${url}`, sig, 22, (await getAgency()).id);
}
