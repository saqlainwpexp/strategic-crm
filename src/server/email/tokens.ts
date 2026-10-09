// Signed, unguessable tokens for public email links. Nothing is stored: the signature proves
// the link came from us, so a lead id can't be swapped to unsubscribe or track someone else.

import { sign, verify } from "./crypto";

export function unsubscribeToken(leadId: string) {
  return `${leadId}.${sign(`u:${leadId}`)}`;
}

export function readUnsubscribeToken(token: string): string | null {
  const [leadId, sig] = token.split(".");
  if (!leadId || !sig || !/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return null;
  return verify(`u:${leadId}`, sig) ? leadId : null;
}

/** "<sendId>.<sig>[.gif]" → sendId for the open pixel. */
export function readOpenToken(token: string): string | null {
  const [sendId, sig] = token.split(".");
  if (!sendId || !sig || !/^[A-Za-z0-9_-]{1,64}$/.test(sendId)) return null;
  return verify(`o:${sendId}`, sig) ? sendId : null;
}

export function verifyClick(sendId: string, url: string, sig: string) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(sendId) && verify(`c:${sendId}:${url}`, sig);
}
