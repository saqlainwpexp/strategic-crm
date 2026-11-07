// POST /api/outreach/quick-add {url, name?, title?, company?}
// Signed-in users only (session cookie). Works out the platform from the URL, runs the
// duplicate check, then creates or returns the lead and its thread.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/session";
import { OutreachError, quickAdd } from "@/server/outreach/service";

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
    const result = await quickAdd(me, input);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (e) {
    if (e instanceof OutreachError) return NextResponse.json({ error: e.message }, { status: e.code === "forbidden" ? 403 : 422 });
    console.error("[quick-add]", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
