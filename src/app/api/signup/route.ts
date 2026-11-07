import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { systemDb } from "@/server/system-db";
import { registerAgency, signupSchema } from "@/server/signup";
import { publicUrl } from "@/server/agencies";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(publicUrl()).origin) return Response.json({ error: "Please register from this website." }, { status: 403 });
  if (!req.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Invalid request." }, { status: 415 });
  if (Number(req.headers.get("content-length") || 0) > 8192) return Response.json({ error: "Request too large." }, { status: 413 });
  try {
    const body = await req.text();
    if (body.length > 8192) return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = signupSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return Response.json({ error: "Enter your agency, name, valid email and a password of 10–72 characters." }, { status: 400 });
    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const bucket = Math.floor(Date.now() / 3600000);
    const key = createHash("sha256").update(ip + ":" + bucket).digest("hex");
    const limit = await systemDb.signupLimit.upsert({ where: { key }, create: { key, expiresAt: new Date(Date.now() + 7200000) }, update: { count: { increment: 1 } } });
    if (limit.count > 5) return Response.json({ error: "Too many attempts. Please try again in an hour." }, { status: 429, headers: { "Retry-After": "3600" } });
    await systemDb.signupLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await registerAgency(parsed.data);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "This email already has an account. Sign in or use another email." }, { status: 409 });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    console.error("[signup] Could not create agency", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "We couldn't create your account. Please try again." }, { status: 500 });
  }
}
