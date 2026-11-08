// POST /api/outreach/quick-add {url, name?, title?, company?}
// Signed-in users only (session cookie). Works out the platform from the URL, runs the
// duplicate check, then creates or returns the contact in the Outreach & Jobs Log
// (social leads no longer go into the cold-calling CRM).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/session";
import { LogError, createContact, findContactByHandle } from "@/server/outreach-log/service";
import { detectPlatform } from "@/lib/outreach/normalize";

const body = z.object({
  url: z.string().min(1).max(1000),
  name: z.string().max(200).optional(),
  title: z.string().max(190).optional(),
  company: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  // Same-origin only: the bookmarklet goes through /quick-add on this site, so a page on
  // another site can't create leads with the user's cookies.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Please sign in to the CRM first." }, { status: 401 });
  let input: z.infer<typeof body>;
  try {
    input = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Send JSON: {url, name?, title?, company?}" }, { status: 400 });
  }
  try {
    const platform = detectPlatform(input.url);
    if (!platform) return NextResponse.json({ error: "Open this on a LinkedIn, Facebook, Instagram, Threads, X or TikTok profile." }, { status: 422 });
    const existing = await findContactByHandle(platform, input.url);
    const c = existing ?? (await createContact(me, { channel: platform, handle: input.url, name: input.name || input.url, company: input.company, title: input.title, source: "Bookmarklet" }));
    return NextResponse.json({ created: !existing, platform, contactId: c.id, name: c.name, stage: c.stage }, { status: existing ? 200 : 201 });
  } catch (e) {
    if (e instanceof LogError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[quick-add]", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
