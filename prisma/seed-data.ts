// Starter content for a fresh install (not demo data): call-script templates, custom
// lead fields and a default lead pool. Used by prisma/seed.ts; safe to edit or delete
// later from the app.

import type { CustomFieldDef, Script } from "../src/lib/types";

export const INDUSTRIES = [
  "Restaurant", "Clinic", "Retail", "Fitness", "Automotive", "Real Estate", "Education",
  "Beauty & Salon", "Home Services", "Technology", "Events", "Travel", "Professional Services",
];

export function starterScripts(updatedAt: string): Script[] {
  return [
    {
      id: "scr_web",
      title: "Web Design — Cold Opener",
      category: "Web Design",
      active: true,
      createdById: "u_admin",
      updatedAt,
      body: `OPENER
Hi, is this {decision_maker}? This is {rep_name} from {agency_name} — I'll be quick. Is now a bad time?

REASON FOR THE CALL
I was looking at {business_name} online and noticed {issue}. Most customers check a business on their phone before they call or visit — if the site is slow or hard to use, they go to the next result.

VALUE
We build fast, mobile-first websites for local businesses in {city}, with WhatsApp and call buttons so enquiries come straight to you.

QUESTION
How are most of your new customers finding you right now?

CLOSE
Would it make sense to do a quick 15-minute call where I show you two or three sites we've built for businesses like yours? I have {slot_1} or {slot_2} — which works better?`,
    },
    {
      id: "scr_ghl",
      title: "GHL — Missed Call Text-Back",
      category: "GHL",
      active: true,
      createdById: "u_admin",
      updatedAt,
      body: `OPENER
Hi {decision_maker}, {rep_name} here from {agency_name}. Quick question — when someone calls {business_name} and nobody picks up, what happens to that customer?

PAIN
Most businesses lose 20–30% of callers that way. They simply call the competitor.

SOLUTION
We set up a system that instantly texts back every missed caller — "Sorry we missed you, how can we help?" — so the conversation keeps going on WhatsApp or SMS. It also sends appointment reminders and asks happy customers for Google reviews automatically.

QUESTION
Roughly how many calls do you think you miss in a busy week?

CLOSE
Let me show you how it works on a 15-minute call — {slot_1} or {slot_2}?`,
    },
    {
      id: "scr_graphic",
      title: "Graphic Design — Brand Refresh",
      category: "Graphic Design",
      active: true,
      createdById: "u_admin",
      updatedAt,
      body: `OPENER
Hi {decision_maker}, this is {rep_name} from {agency_name}. I came across {business_name}'s Instagram — you have a great product.

OBSERVATION
One thing I noticed: {issue}. When the visuals aren't consistent, customers assume the business is smaller than it really is.

OFFER
We design complete brand kits — logo refresh, colours, and templates for posts and stories — so everything you publish looks premium and on-brand.

CLOSE
Can I send you a few before-and-after examples and set up a short call to walk through them? Does {slot_1} work?`,
    },
    {
      id: "scr_gatekeeper",
      title: "Gatekeeper — Reaching the Owner",
      category: "General",
      active: true,
      createdById: "u_mgr",
      updatedAt,
      body: `IF A RECEPTIONIST OR STAFF MEMBER ANSWERS
"Hi, this is {rep_name} — could you put me through to {decision_maker}, please?"

IF ASKED "WHAT IS IT REGARDING?"
"It's about the calls and enquiries {business_name} gets online — I have a quick question only the owner can answer."

IF THE OWNER IS UNAVAILABLE
"No problem — when is the best time to catch them? I'll call back then."
→ Log CALL ME LATER with the exact time.

ALWAYS
Get the owner's name and best time to call. Thank the person by name.`,
    },
    {
      id: "scr_objections",
      title: "Objection Handling",
      category: "Objections",
      active: true,
      createdById: "u_mgr",
      updatedAt,
      body: `"JUST SEND ME AN EMAIL"
"Happy to — so I send the right thing, what's the main thing you'd want to improve: getting more enquiries, or handling the ones you already get?" → then book the call.

"WE ALREADY HAVE SOMEONE"
"That's great — most of our clients did too. Would you be open to a second opinion? If we can't show a clear improvement in 15 minutes, no hard feelings."

"IT'S TOO EXPENSIVE"
"Totally fair. What would one extra customer a week be worth to you? Most of our packages pay for themselves with two or three new customers."

"NOT INTERESTED"
"Understood — just so I don't call at a bad time again, is it the timing, or is this not a priority this year?"
→ Log NOT INTERESTED or CALL ME LATER.`,
    },
    {
      id: "scr_web_v1",
      title: "Web Design — Opener (v1, retired)",
      category: "Web Design",
      active: false,
      createdById: "u_admin",
      updatedAt,
      body: `Hi, I'm calling from {agency_name}. We make websites. Do you need a new website?\n\n(Retired — too direct, low connect-to-meeting rate.)`,
    },
  ];
}

export const STARTER_FIELDS: CustomFieldDef[] = [
  { id: "cf_industry", key: "industry", name: "Industry", type: "SELECT", options: INDUSTRIES, required: false, active: true },
  { id: "cf_rating", key: "google_rating", name: "Google Rating", type: "NUMBER", options: [], required: false, active: true },
  { id: "cf_site", key: "has_website", name: "Has Website", type: "BOOLEAN", options: [], required: false, active: true },
  { id: "cf_insta", key: "instagram", name: "Instagram", type: "URL", options: [], required: false, active: true },
  { id: "cf_size", key: "team_size", name: "Team Size", type: "SELECT", options: ["1–5", "6–20", "21–50", "50+"], required: false, active: true },
];
