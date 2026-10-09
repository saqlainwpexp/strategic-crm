// Mailbox passwords are stored encrypted (AES-256-GCM). Tracking links are HMAC-signed so
// nobody can forge opens/clicks or turn the click redirect into an open redirect.

import crypto from "crypto";

let warned = false;

function secret(): string {
  const key = process.env.EMAIL_ENCRYPTION_KEY || "";
  if (key.length >= 32) return key;
  const fallback = process.env.NEXTAUTH_SECRET || "";
  if (!fallback) throw new Error("EMAIL_ENCRYPTION_KEY is not set.");
  if (!warned) {
    warned = true;
    console.warn("[email] EMAIL_ENCRYPTION_KEY is not set — falling back to NEXTAUTH_SECRET. Set it so mailbox passwords survive a secret change.");
  }
  return fallback;
}

const derive = (purpose: string) => crypto.createHash("sha256").update(`${purpose}:${secret()}`).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derive("mailbox-password"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(enc: string): string {
  try {
    const [v, iv, tag, data] = enc.split(".");
    if (v !== "v1" || !iv || !tag || !data) throw new Error("bad format");
    const decipher = crypto.createDecipheriv("aes-256-gcm", derive("mailbox-password"), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    const err = new Error("Unreadable stored password — re-enter it, or make EMAIL_ENCRYPTION_KEY match where it was saved.") as Error & { code: string };
    err.code = "EDECRYPT";
    throw err;
  }
}

export function sign(value: string, len = 22): string {
  return crypto.createHmac("sha256", derive("tracking")).update(value).digest("base64url").slice(0, len);
}

export function verify(value: string, sig: string, len = 22): boolean {
  const expected = sign(value, len);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function randomToken(bytes = 18) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Public base URL used in links inside emails (tracking, unsubscribe). */
export function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}
