// Email + password sign-in (NextAuth credentials provider, JWT sessions).

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getDb, withAgency } from "./db";
import { systemDb } from "./system-db";
import { publicUrl } from "./agencies";
import { audit } from "./audit";

export const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 10;

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = 30;

// Compared against when the email doesn't exist, so response time doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-placeholder", BCRYPT_ROUNDS);

// Per-IP throttle (in memory — fine for a single app instance).
const ipAttempts = new Map<string, { count: number; resetAt: number }>();
function ipAllowed(ip: string) {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= IP_MAX_ATTEMPTS;
}

function clientIp(headers: Record<string, unknown> | undefined) {
  const fwd = headers?.["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : typeof fwd === "string" ? fwd : "").split(",")[0]?.trim();
  return first || "unknown";
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const email = String(credentials?.email ?? "").trim().toLowerCase().slice(0, 254);
        const password = String(credentials?.password ?? "");
        if (!email || !password || password.length > 200) return null;

        const ip = clientIp(req?.headers as Record<string, unknown> | undefined);
        if (!ipAllowed(ip)) {
          // No tenant is authenticated yet.
          return null;
        }

        const user = await systemDb.user.findUnique({ where: { email } });
        const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.active) return null;
        const agency = await systemDb.agency.findUnique({ where: { id: user.agencyId } });
        if (!agency?.active) return null;
        return withAgency(user.agencyId, async () => {
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await audit(user.id, "auth.blocked_locked", "User", user.id, { ip });
          return null;
        }
        if (!passwordOk) {
          const failed = user.failedLogins + 1;
          const lock = failed >= MAX_FAILED_LOGINS;
          await (await getDb()).user.update({
            where: { id: user.id },
            data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null },
          });
          await audit(user.id, lock ? "auth.locked" : "auth.failed", "User", user.id, { ip });
          return null;
        }

        await (await getDb()).user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await audit(user.id, "auth.login", "User", user.id, { ip });
        return { agencyId: user.agencyId, id: user.id, name: user.name, email: user.email, pv: user.passwordChangedAt?.getTime() ?? 0 };
        });
      },
    }),
  ],
  callbacks: {
    async redirect({ url }) {
      const base = publicUrl();
      const target = new URL(url, base);
      return target.origin === new URL(base).origin ? target.toString() : base;
    },
    async jwt({ token, user }) {
      if (user) {
        token.agencyId = (user as { agencyId?: string }).agencyId;
        token.uid = user.id;
        token.pv = (user as { pv?: number }).pv ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.agencyId = token.agencyId;
        session.user.id = token.uid as string;
        session.user.pv = (token.pv as number) ?? 0;
      }
      return session;
    },
  },
};
