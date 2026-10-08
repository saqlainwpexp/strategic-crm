// Deterministic mock database for Strategic CRM.
// Stands in for Prisma until the MySQL database is connected; shapes match src/lib/types.ts.

import type {
  CallDisposition,
  CallLog,
  CrmData,
  CsvImport,
  CustomFieldDef,
  Lead,
  Meeting,
  MeetingType,
  Payment,
  Pool,
  Script,
  TimeLog,
  User,
} from "../types";
import { AGENCY_SERVICES, type AgencyService, type PipelineStage, type Priority } from "../constants";
import { dayKey, pktISO, shiftDayKey, todayKey, weekdayOf, zonedParts } from "../date";
import { slugify } from "../utils";

// ─── RNG helpers ─────────────────────────────────────────────

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function weighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x < 0) return v;
  }
  return items[items.length - 1][0];
}
function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Users ───────────────────────────────────────────────────

export const USERS: User[] = [
  { id: "u_admin", name: "Zain Ahmed", email: "zain@example.com", role: "SUPER_ADMIN", title: "Developer · Super Admin", reportsToId: null, active: true },
  { id: "u_mgr", name: "Hassan Raza", email: "hassan@example.com", role: "MANAGER", title: "Sales Manager", reportsToId: null, active: true },
  { id: "u_bd", name: "Ayesha Noor", email: "ayesha@example.com", role: "BD", title: "Business Development", reportsToId: "u_mgr", active: true },
  { id: "u_ali", name: "Ali Khan", email: "ali@example.com", role: "SALES", title: "Sales Executive", reportsToId: "u_bd", active: true },
  { id: "u_sana", name: "Sana Malik", email: "sana@example.com", role: "SALES", title: "Sales Executive", reportsToId: "u_bd", active: true },
];

// ─── Businesses ──────────────────────────────────────────────

type Biz = { name: string; industry: string; area: string; city: string; dm: string };

const CURATED: Biz[] = [
  ["Zahra Boutique", "Retail", "Gulberg III", "Lahore", "Zahra Iqbal"],
  ["Mehran Motors", "Automotive", "Shahrah-e-Faisal", "Karachi", "Bilal Ahmed"],
  ["CloudNest Solutions", "Technology", "Blue Area", "Islamabad", "Faraz Hussain"],
  ["FreshMart Grocers", "Retail", "DHA Phase 5", "Lahore", "Imran Sheikh"],
  ["Apex Fitness Studio", "Fitness", "Clifton", "Karachi", "Hamza Siddiqui"],
  ["Karachi Kebab House", "Restaurant", "Tariq Road", "Karachi", "Naveed Akhtar"],
  ["Gulberg Smiles Dental", "Clinic", "Gulberg II", "Lahore", "Dr. Mariam Aslam"],
  ["Margalla Physio Clinic", "Clinic", "F-7 Markaz", "Islamabad", "Dr. Usman Ghani"],
  ["Saffron Events Co.", "Events", "Model Town", "Lahore", "Rabia Kamal"],
  ["BrightPath Academy", "Education", "Satellite Town", "Rawalpindi", "Kashif Mehmood"],
  ["Noor Skincare Studio", "Beauty & Salon", "Bahadurabad", "Karachi", "Noor Fatima"],
  ["Ravi Textiles", "Retail", "Peoples Colony", "Faisalabad", "Shahid Mahmood"],
  ["Clifton Bakers", "Restaurant", "Clifton Block 5", "Karachi", "Asif Qureshi"],
  ["Hunza Organics", "Retail", "E-11", "Islamabad", "Sadia Baig"],
  ["Thar Solar Solutions", "Home Services", "Gulshan-e-Iqbal", "Karachi", "Waqas Memon"],
  ["Bolan Travel & Tours", "Travel", "Saddar", "Rawalpindi", "Tahir Kakar"],
  ["Sialkot Sports Co.", "Retail", "Paris Road", "Sialkot", "Adnan Cheema"],
  ["Faisal Auto Parts", "Automotive", "Badami Bagh", "Lahore", "Faisal Javed"],
  ["Kohinoor Interiors", "Home Services", "DHA Phase 6", "Karachi", "Mahnoor Ali"],
  ["Urban Chai Café", "Restaurant", "Johar Town", "Lahore", "Daniyal Raza"],
  ["Petals & Co. Florists", "Retail", "F-6 Supermarket", "Islamabad", "Hina Javaid"],
  ["BlueWave Pool Services", "Home Services", "Bahria Town", "Lahore", "Junaid Anwar"],
  ["Iqra Learning Hub", "Education", "North Nazimabad", "Karachi", "Saima Rehman"],
  ["Rehman Law Associates", "Professional Services", "Mall Road", "Lahore", "Abdul Rehman"],
  ["Tariq Electronics", "Retail", "Hall Road", "Lahore", "Tariq Mehmood"],
  ["Mirage Photography", "Events", "PECHS", "Karachi", "Omar Farooq"],
  ["GreenLeaf Landscaping", "Home Services", "DHA Phase 2", "Islamabad", "Kamran Yousaf"],
  ["Royal Biryani Express", "Restaurant", "Gulshan Block 13", "Karachi", "Salman Khan"],
  ["Swift Movers & Packers", "Home Services", "I-8 Markaz", "Islamabad", "Zeeshan Haider"],
  ["Amna's Kitchen", "Restaurant", "Cantt", "Multan", "Amna Tariq"],
  ["Prime Property Advisors", "Real Estate", "Bahria Town", "Rawalpindi", "Fahad Malik"],
  ["Elite Car Rentals", "Automotive", "Clifton", "Karachi", "Rizwan Ali"],
  ["Shafqat Home Care", "Clinic", "Wapda Town", "Lahore", "Shafqat Hussain"],
  ["Velvet Hair Lounge", "Beauty & Salon", "MM Alam Road", "Lahore", "Sobia Nadeem"],
  ["Indus Realty Group", "Real Estate", "DHA Phase 8", "Karachi", "Arsalan Shah"],
  ["Crescent Logistics", "Professional Services", "Korangi", "Karachi", "Nadeem Butt"],
  ["Peak Performance Gym", "Fitness", "G-9 Markaz", "Islamabad", "Ahsan Mirza"],
  ["Lyallpur Sweets", "Restaurant", "D-Ground", "Faisalabad", "Khalid Pervaiz"],
  ["Nexa Dental Lab", "Clinic", "Johar Town", "Lahore", "Dr. Komal Shafiq"],
  ["Spice Route Caterers", "Events", "Gulistan-e-Jauhar", "Karachi", "Yasir Hameed"],
  ["Blossom Montessori", "Education", "Bahria Town", "Islamabad", "Farah Naz"],
  ["Metro Tiles & Sanitary", "Retail", "Ferozepur Road", "Lahore", "Ghulam Abbas"],
].map(([name, industry, area, city, dm]) => ({ name, industry, area, city, dm }));

const NAME_PREFIXES = [
  "Al-Madina", "Star", "Royal", "Green Valley", "City", "Golden", "Paradise", "Classic",
  "Prime", "Unique", "New Life", "Modern", "Smart", "Elite", "Silver", "Crown",
];
const NAME_TYPES: [string, string][] = [
  ["Bakers", "Restaurant"], ["Dental Clinic", "Clinic"], ["Salon", "Beauty & Salon"],
  ["Motors", "Automotive"], ["Pharmacy", "Clinic"], ["Restaurant", "Restaurant"],
  ["Gym", "Fitness"], ["Academy", "Education"], ["Boutique", "Retail"],
  ["Electronics", "Retail"], ["Furniture", "Retail"], ["Travels", "Travel"],
  ["Properties", "Real Estate"], ["Caterers", "Events"], ["Tailors", "Retail"],
  ["Opticals", "Retail"], ["Printing Press", "Professional Services"], ["Marble", "Home Services"],
  ["Sweets", "Restaurant"], ["Café", "Restaurant"],
];

const FIRST_NAMES = [
  "Ahmed", "Usman", "Bilal", "Hamza", "Kamran", "Imran", "Asad", "Saad", "Fahad", "Waleed",
  "Sara", "Hira", "Maryam", "Fatima", "Ayesha", "Sana", "Iqra", "Mehwish", "Rabia", "Zainab",
  "Shoaib", "Adeel", "Raheel", "Nabeel", "Tariq", "Junaid", "Faisal", "Danish", "Haris", "Owais",
];
const LAST_NAMES = [
  "Khan", "Ahmed", "Malik", "Sheikh", "Qureshi", "Siddiqui", "Butt", "Chaudhry", "Raza", "Hussain",
  "Iqbal", "Javed", "Aslam", "Mirza", "Abbasi", "Baig", "Rana", "Akhtar", "Memon", "Rehman",
];

const CITY_AREAS: Record<string, string[]> = {
  Lahore: ["Gulberg III", "DHA Phase 5", "Johar Town", "Model Town", "Bahria Town", "Wapda Town", "Cantt", "Faisal Town", "Iqbal Town", "Garden Town"],
  Karachi: ["Clifton", "DHA Phase 6", "Gulshan-e-Iqbal", "North Nazimabad", "PECHS", "Bahadurabad", "Saddar", "Gulistan-e-Jauhar", "Korangi", "Tariq Road"],
  Islamabad: ["F-7 Markaz", "Blue Area", "G-9 Markaz", "E-11", "I-8 Markaz", "F-10 Markaz", "DHA Phase 2", "Bahria Town"],
  Rawalpindi: ["Saddar", "Satellite Town", "Bahria Town", "Chaklala Scheme III", "Commercial Market"],
  Faisalabad: ["D-Ground", "Peoples Colony", "Madina Town", "Susan Road"],
  Multan: ["Cantt", "Gulgasht Colony", "Bosan Road"],
  Sialkot: ["Cantt", "Paris Road", "Kashmir Road"],
};
const CITY_WEIGHTS = [
  ["Lahore", 34], ["Karachi", 32], ["Islamabad", 14], ["Rawalpindi", 8],
  ["Faisalabad", 6], ["Multan", 4], ["Sialkot", 2],
] as const;

export const INDUSTRIES = [
  "Restaurant", "Clinic", "Retail", "Fitness", "Automotive", "Real Estate", "Education",
  "Beauty & Salon", "Home Services", "Technology", "Events", "Travel", "Professional Services",
];

// ─── Opportunity copy ────────────────────────────────────────

const ISSUES: Record<AgencyService, [issue: string, solution: string][]> = {
  "Web Design": [
    ["No website — relies only on a Facebook page", "Responsive business website with WhatsApp & call buttons"],
    ["Outdated website that isn't mobile friendly", "Mobile-first website redesign"],
    ["Website takes 7+ seconds to load and loses visitors", "Speed-optimised rebuild with better hosting"],
    ["No online booking or ordering on the site", "Online booking / ordering integration"],
    ["Not showing up on Google for local searches", "Local SEO landing pages + Google Business Profile setup"],
  ],
  "Graphic Design": [
    ["Inconsistent branding across social media pages", "Brand identity kit (logo, colours, typography)"],
    ["Low-quality logo that looks unprofessional", "Logo refresh + brand guidelines"],
    ["No designed menu or product catalogue", "Menu / catalogue design for print and digital"],
    ["Social posts get low engagement — weak creatives", "Monthly social media creatives pack"],
  ],
  GHL: [
    ["Missed calls after hours are never followed up", "GHL missed-call text-back automation"],
    ["Ad leads are followed up hours or days late", "GHL speed-to-lead workflow (SMS + email)"],
    ["No CRM — enquiries tracked on WhatsApp and paper", "GHL CRM + sales pipeline setup"],
    ["Far fewer Google reviews than competitors", "GHL automated review requests"],
    ["Frequent no-shows, no appointment reminders", "GHL appointment reminders via SMS/WhatsApp"],
  ],
};

const SERVICE_VALUE: Record<AgencyService, [number, number]> = {
  "Web Design": [150_000, 900_000],
  "Graphic Design": [60_000, 350_000],
  GHL: [250_000, 1_500_000],
};

const SOURCE_WEIGHTS = [
  ["Google Maps", 34], ["Facebook", 16], ["Instagram", 14], ["Cold List", 14],
  ["LinkedIn", 8], ["Referral", 8], ["Website Form", 6],
] as const;

const NOTES: Partial<Record<PipelineStage, string[]>> = {
  CONTACTED: [
    "Spoke briefly, asked for examples on WhatsApp.",
    "Receptionist answered — owner usually in after 4 PM.",
    "Owner open to a chat; send portfolio first.",
  ],
  INTERESTED: [
    "Liked the examples. Wants pricing for {service}.",
    "Interested — comparing with one other agency.",
    "Asked for a proposal before end of week.",
  ],
  MEETING_BOOKED: ["Discovery call booked — prepare 3 {service} examples.", "Meeting booked with owner and partner."],
  SHOWED: ["Good meeting — send proposal with two package options.", "Owner engaged; wants a phased plan."],
  NO_SHOW: ["Didn't join the meeting — reschedule.", "No-show; WhatsApp sent to rebook."],
  NOT_INTERESTED: ["Already working with a freelancer.", "Says budget is frozen until next quarter.", "Not interested in {service} right now."],
  HUNG_UP: ["Hung up during the opener.", "Hung up after hearing the price range."],
  CALL_ME_LATER: ["Owner travelling — call back later in the week.", "Busy season, asked for a callback.", "Asked to call back after Friday prayers."],
  CLOSED_WON: ["Signed up — onboarding in progress.", "Paid advance; kickoff scheduled."],
};

const STAGE_PLAN: [PipelineStage, number][] = [
  ["LEAD", 4], ["CONTACTED", 5], ["INTERESTED", 5], ["MEETING_BOOKED", 4], ["SHOWED", 2],
  ["NO_SHOW", 1], ["NOT_INTERESTED", 3], ["HUNG_UP", 1], ["CALL_ME_LATER", 3], ["CLOSED_WON", 8],
];

const GEN_STAGE_WEIGHTS: (readonly [PipelineStage, number])[] = [
  ["LEAD", 38], ["CONTACTED", 16], ["INTERESTED", 7], ["MEETING_BOOKED", 3], ["SHOWED", 2],
  ["NO_SHOW", 2], ["NOT_INTERESTED", 14], ["HUNG_UP", 6], ["CALL_ME_LATER", 9], ["CLOSED_WON", 3],
];

const SCORE_RANGE: Record<PipelineStage, [number, number]> = {
  LEAD: [18, 80], CONTACTED: [40, 72], INTERESTED: [66, 92], MEETING_BOOKED: [72, 94],
  SHOWED: [75, 95], NO_SHOW: [45, 70], NOT_INTERESTED: [8, 32], HUNG_UP: [10, 30],
  CALL_ME_LATER: [42, 68], CLOSED_WON: [82, 98],
};

const STAGE_DEFINING_CALL: Partial<Record<PipelineStage, CallDisposition>> = {
  CONTACTED: "CONNECTED",
  INTERESTED: "INTERESTED",
  MEETING_BOOKED: "MEETING_BOOKED",
  SHOWED: "MEETING_BOOKED",
  NO_SHOW: "MEETING_BOOKED",
  NOT_INTERESTED: "NOT_INTERESTED",
  HUNG_UP: "HUNG_UP",
  CALL_ME_LATER: "CALL_ME_LATER",
};

// Curated follow-ups so the schedule always has realistic items: [days from today, minute of day]
const CURATED_FOLLOW_UPS: Partial<Record<PipelineStage, [number, number][]>> = {
  CALL_ME_LATER: [[0, 13 * 60 + 30], [1, 11 * 60], [-1, 16 * 60]],
  INTERESTED: [[0, 17 * 60], [2, 12 * 60 + 30], [1, 15 * 60], [4, 11 * 60 + 30], [0, 10 * 60]],
  CONTACTED: [[1, 12 * 60], [3, 15 * 60 + 30], [2, 10 * 60 + 30], [5, 14 * 60], [1, 16 * 60 + 30]],
  NO_SHOW: [[1, 12 * 60]],
};

// ─── Pools, scripts, custom fields ───────────────────────────

const POOLS: Pool[] = [
  { id: "pool_lhr", name: "Lahore — Local Businesses", description: "Google Maps scrape of Lahore SMBs" },
  { id: "pool_khi", name: "Karachi — Local Businesses", description: "Google Maps scrape of Karachi SMBs" },
  { id: "pool_isb", name: "Islamabad & Rawalpindi", description: "Twin-cities list" },
  { id: "pool_other", name: "Other Cities", description: "Faisalabad, Multan, Sialkot" },
  { id: "pool_inbound", name: "Inbound & Referrals", description: "Website forms and referrals" },
];

function poolFor(city: string, source: string) {
  if (source === "Referral" || source === "Website Form") return "pool_inbound";
  if (city === "Lahore") return "pool_lhr";
  if (city === "Karachi") return "pool_khi";
  if (city === "Islamabad" || city === "Rawalpindi") return "pool_isb";
  return "pool_other";
}

const SCRIPT_FOR_SERVICE: Record<AgencyService, string> = {
  "Web Design": "scr_web",
  "Graphic Design": "scr_graphic",
  GHL: "scr_ghl",
};

function scripts(updatedAt: string): Script[] {
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

const CUSTOM_FIELDS: CustomFieldDef[] = [
  { id: "cf_industry", key: "industry", name: "Industry", type: "SELECT", options: INDUSTRIES, required: false, active: true },
  { id: "cf_rating", key: "google_rating", name: "Google Rating", type: "NUMBER", options: [], required: false, active: true },
  { id: "cf_site", key: "has_website", name: "Has Website", type: "BOOLEAN", options: [], required: false, active: true },
  { id: "cf_insta", key: "instagram", name: "Instagram", type: "URL", options: [], required: false, active: true },
  { id: "cf_size", key: "team_size", name: "Team Size", type: "SELECT", options: ["1–5", "6–20", "21–50", "50+"], required: false, active: true },
];

// ─── Generator ───────────────────────────────────────────────

let cache: { key: string; data: CrmData } | null = null;

/** Mock database for "today" (regenerated when the PKT date changes). */
export function getSeed(): CrmData {
  const key = todayKey();
  if (!cache || cache.key !== key) cache = { key, data: generate() };
  return cache.data;
}

function generate(): CrmData {
  const today = todayKey();
  const nowP = zonedParts(new Date());
  const nowMin = nowP.hour * 60 + nowP.minute;
  const at = (key: string, minute: number) => pktISO(key, Math.floor(minute / 60), minute % 60);
  const nextWorkday = (key: string) => (weekdayOf(key) === 6 ? shiftDayKey(key, 1) : key);

  // Last 26 workdays (Mon–Sat, ~30 days), most recent first.
  const workdays: string[] = [];
  for (let back = 0; workdays.length < 26; back++) {
    const k = shiftDayKey(today, -back);
    if (weekdayOf(k) !== 6) workdays.push(k);
  }
  /** A call time on a recent workday during shift hours — never in the future. */
  const recentCallTime = (rng: Rng, maxBack = 25, minBack = 0) => {
    const idx = int(rng, minBack, maxBack);
    const minute = int(rng, 615, 1140);
    let key = workdays[idx];
    if (key === today && minute > nowMin - 5) key = workdays[Math.min(idx + 1, workdays.length - 1)];
    return at(key, minute);
  };

  // ── Leads ──
  const rl = mulberry32(20261008);
  const curatedStages = shuffle(rl, STAGE_PLAN.flatMap(([s, n]) => Array<PipelineStage>(n).fill(s)));
  const curatedOwners = shuffle(rl, [
    ...Array<string>(14).fill("u_ali"),
    ...Array<string>(14).fill("u_sana"),
    ...Array<string>(8).fill("u_bd"),
  ]);
  const generatedOwners = shuffle(rl, [
    ...Array<string | null>(126).fill("u_ali"),
    ...Array<string | null>(126).fill("u_sana"),
    ...Array<string | null>(42).fill("u_bd"),
    ...Array<string | null>(24).fill(null),
  ]);
  const generatedBiz: Biz[] = shuffle(
    rl,
    NAME_PREFIXES.flatMap((p) => NAME_TYPES.map(([t, industry]) => ({ p, t, industry })))
  )
    .slice(0, 318)
    .map(({ p, t, industry }) => {
      const city = weighted(rl, CITY_WEIGHTS);
      return {
        name: `${p} ${t}`,
        industry,
        area: pick(rl, CITY_AREAS[city]),
        city,
        dm: `${pick(rl, FIRST_NAMES)} ${pick(rl, LAST_NAMES)}`,
      };
    });

  const closedOn = new Map<string, { key: string; monthOffset: number }>();
  const closedDraws = new Map<string, { recentDay: number; pastDay: number; gap: number; minute: number }>();
  const followUpCounters: Partial<Record<PipelineStage, number>> = {};
  const leads: Lead[] = [];

  [...CURATED, ...generatedBiz].forEach((biz, i) => {
    const curated = i < CURATED.length;
    const owner = curated ? (i < 36 ? curatedOwners[i] : null) : generatedOwners[i - CURATED.length];
    const stage: PipelineStage = owner === null ? "LEAD" : curated ? curatedStages[i] : weighted(rl, GEN_STAGE_WEIGHTS);
    const service = pick(rl, AGENCY_SERVICES);
    const pool = ISSUES[service];
    const first = int(rl, 0, pool.length - 1);
    const second = rl() < 0.45 ? (first + int(rl, 1, pool.length - 1)) % pool.length : -1;
    const chosen = second >= 0 ? [pool[first], pool[second]] : [pool[first]];
    const noSite = chosen.some(([issue]) => issue.startsWith("No website"));
    const hasSite = !noSite && rl() > 0.15;
    const slug = slugify(biz.name);
    const score = int(rl, ...SCORE_RANGE[stage]);
    const pRoll = rl();
    const priority: Priority =
      score >= 75 ? (pRoll < 0.8 ? "HIGH" : "MEDIUM") : score >= 45 ? (pRoll < 0.6 ? "MEDIUM" : pRoll < 0.8 ? "HIGH" : "LOW") : pRoll < 0.7 ? "LOW" : "MEDIUM";
    const source = weighted(rl, SOURCE_WEIGHTS);
    const [vMin, vMax] = SERVICE_VALUE[service];
    const value = Math.round(int(rl, vMin, vMax) / 5000) * 5000;
    const phone = `+92 3${int(rl, 0, 4)}${int(rl, 0, 9)} ${int(rl, 1000000, 9999999)}`;
    const dmFirst = biz.dm.replace(/^Dr\.\s*/, "").split(" ")[0].toLowerCase();
    const createdBack = int(rl, 2, 60);
    const createdMinute = int(rl, 540, 1080);
    const noteTpl = NOTES[stage] ? pick(rl, NOTES[stage]!) : "";
    const rating = Math.round((3.1 + rl() * 1.8) * 10) / 10;
    const teamSize = pick(rl, ["1–5", "6–20", "21–50", "50+"]);

    const createdAt = at(shiftDayKey(today, -createdBack), createdMinute);
    const id = `lead_${String(i + 1).padStart(3, "0")}`;
    // Signed clients get their close date after the loop (see below).
    if (stage === "CLOSED_WON") {
      closedDraws.set(id, { recentDay: int(rl, 1, 6), pastDay: int(rl, 4, 26), gap: int(rl, 20, 35), minute: createdMinute });
    }

    // Next follow-up
    let nextFollowUpAt: string | null = null;
    const curatedPlan = curated && owner ? CURATED_FOLLOW_UPS[stage] : undefined;
    if (curatedPlan) {
      const n = followUpCounters[stage] ?? 0;
      followUpCounters[stage] = n + 1;
      const slot = curatedPlan[n % curatedPlan.length];
      nextFollowUpAt = at(nextWorkday(shiftDayKey(today, slot[0])), slot[1]);
    } else {
      const fBack = int(rl, -2, 6);
      const fMin = pick(rl, [660, 720, 780, 870, 930, 990, 1050]);
      const fRoll = rl();
      if (owner && (stage === "CALL_ME_LATER" || stage === "INTERESTED" || stage === "NO_SHOW" || (stage === "CONTACTED" && fRoll < 0.5))) {
        nextFollowUpAt = at(nextWorkday(shiftDayKey(today, stage === "NO_SHOW" ? Math.abs(fBack) % 3 + 1 : fBack)), fMin);
      }
    }

    leads.push({
      id,
      businessName: biz.name,
      address: `${biz.area}, ${biz.city}`,
      city: biz.city,
      website: hasSite ? `${slug}.pk` : "",
      issues: chosen.map(([issue]) => issue).join("\n"),
      suggestedServices: chosen.map(([, sol]) => sol).join("\n"),
      phone,
      email: `${dmFirst}@${slug}.pk`,
      priority,
      source,
      decisionMakerName: biz.dm,
      leadScore: score,
      stage,
      service,
      estimatedValue: value,
      assignedToId: owner,
      poolId: poolFor(biz.city, source),
      notes: noteTpl.replace("{service}", service),
      customFields: {
        industry: biz.industry,
        google_rating: rating,
        has_website: hasSite,
        instagram: `instagram.com/${slug}`,
        team_size: teamSize,
      },
      createdAt,
      lastContactedAt: null,
      nextFollowUpAt,
      closedAt: null,
    });
  });

  // Spread signed clients over the last 6 months — smaller deals earlier — so revenue trends upward.
  const closedLeads = leads.filter((l) => l.stage === "CLOSED_WON").sort((a, b) => a.estimatedValue - b.estimatedValue);
  closedLeads.forEach((lead, idx) => {
    const frac = idx / closedLeads.length;
    const monthOffset = frac < 0.1 ? 5 : frac < 0.2 ? 4 : frac < 0.32 ? 3 : frac < 0.5 ? 2 : frac < 0.72 ? 1 : 0;
    const d = closedDraws.get(lead.id)!;
    const day = monthOffset === 0 ? Math.max(1, nowP.day - d.recentDay) : d.pastDay;
    const dt = new Date(Date.UTC(nowP.year, nowP.month - 1 - monthOffset, day));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    closedOn.set(lead.id, { key, monthOffset });
    lead.createdAt = at(shiftDayKey(key, -d.gap), d.minute);
    lead.closedAt = at(key, 16 * 60);
  });

  // ── Calls ──
  const rc = mulberry32(777);
  const calls: CallLog[] = [];
  let callSeq = 0;
  const NEUTRAL_LEAD = [["NO_ANSWER", 60], ["VOICEMAIL", 24], ["BUSY", 12], ["WRONG_NUMBER", 4]] as const;
  const NEUTRAL_OPEN = [["NO_ANSWER", 48], ["VOICEMAIL", 20], ["BUSY", 10], ["CONNECTED", 18], ["WRONG_NUMBER", 4]] as const;
  const addCall = (lead: Lead, userId: string, startedAt: string, disposition: CallDisposition) => {
    const quick = disposition === "NO_ANSWER" || disposition === "BUSY" || disposition === "WRONG_NUMBER";
    const durationSec = quick
      ? int(rc, 8, 30)
      : disposition === "VOICEMAIL"
        ? int(rc, 25, 60)
        : disposition === "HUNG_UP"
          ? int(rc, 10, 45)
          : int(rc, 90, 620);
    const talked = !quick && disposition !== "VOICEMAIL";
    const scriptRoll = rc();
    const scriptId = talked
      ? scriptRoll < 0.72
        ? SCRIPT_FOR_SERVICE[lead.service]
        : scriptRoll < 0.86
          ? "scr_gatekeeper"
          : "scr_objections"
      : null;
    calls.push({ id: `call_${++callSeq}`, leadId: lead.id, userId, startedAt, durationSec, disposition, scriptId, notes: "" });
  };

  for (const lead of leads) {
    const owner = lead.assignedToId;
    if (!owner) continue;
    if (lead.stage === "LEAD") {
      // Never reached yet: ~30% untouched, the rest have several no-answer style attempts.
      const attempts = Math.max(0, int(rc, -4, 9));
      for (let k = 0; k < attempts; k++) addCall(lead, owner, recentCallTime(rc), weighted(rc, NEUTRAL_LEAD));
    } else if (lead.stage === "CLOSED_WON") {
      const close = closedOn.get(lead.id)!.key;
      addCall(lead, owner, at(shiftDayKey(close, -int(rc, 14, 20)), int(rc, 660, 1080)), "NO_ANSWER");
      addCall(lead, owner, at(shiftDayKey(close, -int(rc, 8, 12)), int(rc, 660, 1080)), "MEETING_BOOKED");
    } else {
      const older = lead.stage === "SHOWED" || lead.stage === "NO_SHOW";
      // Upcoming meetings were booked in the last few days; held/missed ones earlier.
      const defining = older
        ? recentCallTime(rc, 25, 5)
        : lead.stage === "MEETING_BOOKED"
          ? recentCallTime(rc, 5)
          : recentCallTime(rc, 20);
      // Once a lead is lost or has a meeting, nobody keeps cold-calling it; otherwise
      // follow-up attempts can land after the conversation too.
      const onlyBefore = ["NOT_INTERESTED", "HUNG_UP", "MEETING_BOOKED", "SHOWED", "NO_SHOW"].includes(lead.stage);
      const attempts = int(rc, 3, 11);
      for (let k = 0; k < attempts; k++) {
        const t = recentCallTime(rc);
        const d = weighted(rc, NEUTRAL_OPEN);
        if (!onlyBefore || t < defining) addCall(lead, owner, t, d);
      }
      addCall(lead, owner, defining, STAGE_DEFINING_CALL[lead.stage]!);
    }
  }
  calls.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const lastCall = new Map<string, string>();
  for (const c of calls) lastCall.set(c.leadId, c.startedAt);
  for (const lead of leads) lead.lastContactedAt = lastCall.get(lead.id) ?? null;

  // ── Time logs (shift clock-ins) ──
  const rt = mulberry32(99);
  const timeLogs: TimeLog[] = [];
  for (const userId of ["u_ali", "u_sana", "u_bd"]) {
    for (const key of [...workdays].reverse()) {
      const inMin = int(rt, 595, 640);
      const outMin = int(rt, 1110, 1170);
      if (key === today) {
        if (nowMin < inMin) continue;
        timeLogs.push({ id: `tl_${userId}_${key}`, userId, clockIn: at(key, inMin), clockOut: nowMin < outMin ? null : at(key, outMin) });
      } else {
        timeLogs.push({ id: `tl_${userId}_${key}`, userId, clockIn: at(key, inMin), clockOut: at(key, outMin) });
      }
    }
  }

  // ── Meetings ──
  const rm = mulberry32(4242);
  const meetings: Meeting[] = [];
  let meetingSeq = 0;
  let curatedBookedToday = 0;
  const addMeeting = (lead: Lead, type: MeetingType, scheduledAt: string, status: Meeting["status"], durationMin = 30) =>
    meetings.push({
      id: `mtg_${++meetingSeq}`,
      leadId: lead.id,
      userId: lead.assignedToId!,
      title: { DISCOVERY: "Discovery Call", FOLLOW_UP: "Follow-up", PROPOSAL: "Proposal Review", ONBOARDING: "Onboarding" }[type],
      type,
      scheduledAt,
      durationMin,
      status,
      notes: "",
    });

  leads.forEach((lead, i) => {
    if (!lead.assignedToId) return;
    if (lead.stage === "MEETING_BOOKED") {
      const minute = pick(rm, [660, 690, 750, 870, 900, 960, 1020]);
      let key = nextWorkday(shiftDayKey(today, int(rm, 0, 6)));
      const type: MeetingType = rm() < 0.7 ? "DISCOVERY" : "PROPOSAL";
      if (i < CURATED.length && curatedBookedToday < 2) {
        key = today;
        curatedBookedToday++;
        addMeeting(lead, type, at(key, curatedBookedToday === 1 ? 11 * 60 + 30 : 15 * 60), "BOOKED");
        return;
      }
      if (key === today && minute < nowMin + 30) key = nextWorkday(shiftDayKey(today, 1));
      addMeeting(lead, type, at(key, minute), "BOOKED");
    } else if (lead.stage === "SHOWED" || lead.stage === "NO_SHOW") {
      const base = dayKey(lead.lastContactedAt ?? lead.createdAt);
      let key = nextWorkday(shiftDayKey(base, int(rm, 1, 3)));
      if (key >= today) key = shiftDayKey(today, -1);
      addMeeting(lead, "DISCOVERY", at(key, pick(rm, [690, 780, 900, 990])), lead.stage === "SHOWED" ? "SHOWED" : "NO_SHOW");
    } else if (lead.stage === "CLOSED_WON") {
      const { key: close, monthOffset } = closedOn.get(lead.id)!;
      addMeeting(lead, "DISCOVERY", at(shiftDayKey(close, -7), pick(rm, [690, 900])), "SHOWED");
      addMeeting(lead, "PROPOSAL", at(shiftDayKey(close, -2), pick(rm, [780, 960])), "SHOWED", 45);
      if (monthOffset === 0) {
        addMeeting(lead, "ONBOARDING", at(nextWorkday(shiftDayKey(today, int(rm, 1, 4))), pick(rm, [660, 840])), "BOOKED", 60);
      }
    }
  });
  meetings.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  // ── Payments ──
  const rp = mulberry32(555);
  const payments: Payment[] = [];
  let invoiceSeq = 41;
  for (const lead of leads) {
    if (lead.stage !== "CLOSED_WON" || !lead.assignedToId) continue;
    const { key: close, monthOffset } = closedOn.get(lead.id)!;
    const advance = Math.round((lead.estimatedValue * 0.5) / 1000) * 1000;
    const balance = lead.estimatedValue - advance;
    const base = { leadId: lead.id, userId: lead.assignedToId, service: lead.service };
    payments.push({
      ...base,
      id: `pay_${invoiceSeq}`,
      invoiceNo: `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`,
      amount: advance,
      status: "PAID",
      dueDate: at(close, 900),
      paidAt: at(close, 900 + int(rp, 0, 120)),
    });
    const balanceKey = shiftDayKey(close, int(rp, 10, 20));
    const balancePaid = monthOffset >= 1 && balanceKey < today;
    payments.push({
      ...base,
      id: `pay_${invoiceSeq}`,
      invoiceNo: `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`,
      amount: balance,
      status: balancePaid ? "PAID" : "PENDING",
      dueDate: at(monthOffset === 0 ? shiftDayKey(close, 14) : balanceKey, 900),
      paidAt: balancePaid ? at(balanceKey, 840) : null,
    });
  }

  // ── Import history ──
  const imports: CsvImport[] = [
    { id: "imp_1", fileName: "lahore-smb-google-maps.csv", rowCount: 142, successCount: 131, duplicateCount: 9, errorCount: 2, uploadedById: "u_admin", poolId: "pool_lhr", createdAt: at(shiftDayKey(today, -41), 11 * 60 + 12) },
    { id: "imp_2", fileName: "karachi-clinics-and-salons.csv", rowCount: 118, successCount: 112, duplicateCount: 5, errorCount: 1, uploadedById: "u_admin", poolId: "pool_khi", createdAt: at(shiftDayKey(today, -27), 16 * 60 + 40) },
    { id: "imp_3", fileName: "twin-cities-retail-oct.csv", rowCount: 76, successCount: 74, duplicateCount: 2, errorCount: 0, uploadedById: "u_mgr", poolId: "pool_isb", createdAt: at(shiftDayKey(today, -6), 10 * 60 + 5) },
  ];

  return {
    users: USERS,
    leads,
    calls,
    meetings,
    payments,
    scripts: scripts(at(shiftDayKey(today, -9), 14 * 60)),
    customFields: CUSTOM_FIELDS,
    pools: POOLS,
    timeLogs,
    imports,
    settings: {
      hotThreshold: 75,
      warmThreshold: 40,
      dialerScheme: "zoomphonecall://",
      reminderMinutes: 30,
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
  };
}
