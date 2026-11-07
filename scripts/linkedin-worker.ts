import { tenantClient } from "../src/server/tenant-client";
/**
 * Local LinkedIn automation worker (HeyReach-style), for your own account only.
 *
 * It drives a real Chrome window with a saved login, so LinkedIn sees an ordinary
 * browser session from your own PC and IP. Nothing here talks to LinkedIn's private API.
 *
 *   Connect: install extension/linkedin-connect, then sign in to LinkedIn in your browser
 *   (or npm run li:login for a separate saved Chromium login)
 *   npm run li:worker           run campaigns, sync replies, send inbox replies
 *   LI_DRY_RUN=1 npm run li:worker   do everything except click Send
 *
 * Optional env: LI_ACCOUNT_ID (defaults to the first account), LI_HEADLESS=1,
 * LI_IGNORE_HOURS=1 (run outside 9:00–18:00 Mon–Fri in the account's timezone).
 */
import path from "node:path";
import fs from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { PrismaClient, type LiAccount, type LiCampaignProspect, type LiProspect } from "@prisma/client";
import { decryptSecret } from "../src/server/email/crypto";

const prisma = tenantClient(new PrismaClient(), process.env.AGENCY_ID || "default");
const DRY_RUN = process.env.LI_DRY_RUN === "1";
const HEADLESS = process.env.LI_HEADLESS === "1";
const IGNORE_HOURS = process.env.LI_IGNORE_HOURS === "1";
const SHOTS_DIR = path.resolve(".linkedin-profiles", "screenshots");

type Step = { type: "connect" | "message" | "follow_up" | "wait"; waitDays?: number; templateId?: string; note?: string };
type Enrollment = LiCampaignProspect & { prospect: LiProspect; campaign: { steps: unknown } };

// ─── Timing helpers ──────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));
const pause = (min = 800, max = 2500) => sleep(rand(min, max));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function localParts(tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, weekday: get("weekday") };
}

function inWorkingHours(tz: string) {
  if (IGNORE_HOURS) return true;
  const { hour, weekday } = localParts(tz);
  return !["Sat", "Sun"].includes(weekday) && hour >= 9 && hour < 18;
}

/** Weeks 0–3 ramp limits up so a fresh automation pattern doesn't spike. */
function connectLimit(a: LiAccount) {
  if (a.status !== "WARMING") return a.maxDailyConnects;
  return Math.max(3, Math.round(a.maxDailyConnects * Math.min(1, (a.warmupWeeks + 1) / 4)));
}

// ─── Browser ─────────────────────────────────────────────────

function profileDir(a: LiAccount) {
  return path.resolve(a.profilePath || path.join(".linkedin-profiles", process.env.AGENCY_ID || "default", a.id));
}

async function openBrowser(a: LiAccount, headless = HEADLESS): Promise<BrowserContext> {
  const opts = {
    headless,
    viewport: { width: 1366, height: 860 },
    locale: a.locale || "en-US",
    timezoneId: a.timezone || undefined,
    ...(a.proxyServer ? { proxy: { server: a.proxyServer, username: a.proxyUser || undefined } } : {}),
    // Same user agent as the browser the extension synced from, so the session looks consistent.
    ...(a.sessionUserAgent ? { userAgent: a.sessionUserAgent } : {}),
  };
  try {
    // Your installed Chrome looks the most like a normal session.
    return await chromium.launchPersistentContext(profileDir(a), { ...opts, channel: "chrome" });
  } catch {
    // No Chrome: use Playwright's Chromium (npx playwright-core install chromium).
    // Edge is skipped on purpose — a running Edge swallows the launch and exits at once.
    return await chromium.launchPersistentContext(profileDir(a), opts);
  }
}

/** Loads the LinkedIn cookies the browser extension synced (your normal browser's login). */
async function applySyncedSession(ctx: BrowserContext, a: LiAccount) {
  if (!a.sessionEnc) return false;
  const cookies = JSON.parse(decryptSecret(a.sessionEnc)) as { name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; expirationDate?: number; sameSite?: string }[];
  const sameSite = (v?: string) => (v === "strict" ? "Strict" : v === "lax" ? "Lax" : "None") as "Strict" | "Lax" | "None";
  await ctx.addCookies(
    cookies.map((c) => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path || "/",
      secure: c.secure || sameSite(c.sameSite) === "None", httpOnly: c.httpOnly,
      sameSite: sameSite(c.sameSite), expires: c.expirationDate ? Math.floor(c.expirationDate) : -1,
    })),
  );
  return true;
}

async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await pause(2500, 5000);
  const u = page.url();
  if (/\/(login|checkpoint|authwall|uas\/login)/.test(u)) throw new SessionError(`LinkedIn wants you to sign in again (${u}). Click Log in to LinkedIn on the CRM Accounts page.`);
}

class SessionError extends Error {}

async function humanScroll(page: Page) {
  for (let i = 0; i < rand(2, 5); i++) {
    await page.mouse.wheel(0, rand(250, 700));
    await pause(600, 1600);
  }
}

async function typeHuman(page: Page, text: string) {
  for (const ch of text) {
    if (ch === "\n") await page.keyboard.press("Shift+Enter");
    else await page.keyboard.type(ch);
    await sleep(rand(25, 110));
  }
}

async function shot(page: Page, label: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, `${Date.now()}-${label}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  return file;
}

// ─── Profile page reading ────────────────────────────────────

type Relation = "connected" | "pending" | "none";

async function readRelation(page: Page): Promise<Relation> {
  const main = page.locator("main").first();
  if (await main.getByRole("button", { name: /Pending/i }).first().isVisible().catch(() => false)) return "pending";
  const degree = await main.locator(".dist-value, .distance-badge").first().innerText().catch(() => "");
  if (/1st/.test(degree)) return "connected";
  return "none";
}

/** Fills in name/title from the profile when the CSV left them blank. */
async function enrichProspect(page: Page, p: LiProspect) {
  if (p.firstName && p.title) return p;
  const name = (await page.locator("main h1").first().innerText().catch(() => "")).trim();
  const headline = (await page.locator("main .text-body-medium").first().innerText().catch(() => "")).trim();
  if (!name) return p;
  const [firstName, ...rest] = name.split(/\s+/);
  return prisma.liProspect.update({
    where: { id: p.id },
    data: { firstName: p.firstName || firstName, lastName: p.lastName || rest.join(" "), title: p.title || headline },
  });
}

// ─── Actions on LinkedIn ─────────────────────────────────────

async function sendConnect(page: Page, note: string) {
  const main = page.locator("main").first();
  let connect = main.getByRole("button", { name: /^Invite .* to connect$/i }).first();
  if (!(await connect.isVisible().catch(() => false))) {
    // Connect is often tucked into the "More" menu when Follow is the primary button.
    await main.getByRole("button", { name: /^More actions$/i }).first().click();
    await pause();
    connect = main.locator('[role="menu"] [aria-label^="Invite"][aria-label$="to connect"]').first();
  }
  await connect.click();
  await pause();

  const dialog = page.getByRole("dialog").first();
  if (note) {
    await dialog.getByRole("button", { name: /Add a note/i }).click();
    await pause();
    await dialog.locator("textarea").first().click();
    await typeHuman(page, note.slice(0, 300));
    await pause();
    if (DRY_RUN) return dialog.getByRole("button", { name: /Dismiss/i }).click();
    await dialog.getByRole("button", { name: /^Send( invitation| now)?$/i }).click();
  } else {
    if (DRY_RUN) return dialog.getByRole("button", { name: /Dismiss/i }).click();
    await dialog.getByRole("button", { name: /Send without a note|^Send( now)?$/i }).first().click();
  }
  await pause(2000, 4000);
}

async function sendMessageFromProfile(page: Page, text: string) {
  await page.locator("main").first().getByRole("button", { name: /^Message/i }).first().click();
  await pause(2000, 3500);
  await typeIntoComposer(page, text);
}

async function typeIntoComposer(page: Page, text: string) {
  const box = page.locator(".msg-form__contenteditable[contenteditable='true']").last();
  await box.waitFor({ timeout: 15_000 });
  await box.click();
  await typeHuman(page, text);
  await pause();
  if (DRY_RUN) return;
  await page.locator("button.msg-form__send-button, button[type='submit'].msg-form__send-btn").last().click();
  await pause(2000, 3500);
  // Close the chat bubble so the next profile starts clean.
  await page.locator(".msg-overlay-bubble-header__controls button").last().click().catch(() => {});
}

// ─── Campaign engine ─────────────────────────────────────────

async function render(text: string, step: Step, p: LiProspect) {
  let body = text;
  if (step.templateId) body = (await prisma.liTemplate.findUnique({ where: { id: step.templateId } }))?.body ?? text;
  return body
    .replace(/\{firstName\}/g, p.firstName)
    .replace(/\{lastName\}/g, p.lastName)
    .replace(/\{company\}/g, p.company)
    .replace(/\{title\}/g, p.title)
    .replace(/\s+\n/g, "\n")
    .trim();
}

async function logAction(a: LiAccount, prospectId: string | null, type: "VIEW_PROFILE" | "CONNECT" | "MESSAGE" | "FOLLOW_UP" | "SYNC_INBOX" | "WITHDRAW", status: "DONE" | "FAILED" | "SKIPPED", error?: string, screenshotPath?: string) {
  await prisma.liAction.create({ data: { accountId: a.id, prospectId, type, status, dryRun: DRY_RUN, error, screenshotPath } });
}

async function nextDue(a: LiAccount): Promise<Enrollment | null> {
  return prisma.liCampaignProspect.findFirst({
    where: {
      accountId: a.id,
      state: { in: ["QUEUED", "INVITED", "CONNECTED"] },
      campaign: { status: "ACTIVE" },
      OR: [{ nextActionAt: null }, { nextActionAt: { lte: new Date() } }],
    },
    orderBy: [{ nextActionAt: "asc" }, { createdAt: "asc" }],
    include: { prospect: true, campaign: { select: { steps: true } } },
  });
}

/** Runs the enrollment's current step. Returns true when it actually touched LinkedIn. */
async function runStep(page: Page, a: LiAccount, e: Enrollment): Promise<boolean> {
  const steps = (e.campaign.steps as Step[]) ?? [];
  const step = steps[e.stepIndex];
  const advance = (data: Partial<LiCampaignProspect> = {}) =>
    prisma.liCampaignProspect.update({ where: { id: e.id }, data: { stepIndex: e.stepIndex + 1, nextActionAt: new Date(Date.now() + rand(5, 40) * 60_000), failReason: null, ...data } });

  if (!step) {
    await prisma.liCampaignProspect.update({ where: { id: e.id }, data: { state: "DONE", nextActionAt: null } });
    return false;
  }
  if (step.type === "wait") {
    await advance({ nextActionAt: new Date(Date.now() + (step.waitDays ?? 1) * DAY + rand(0, 3) * HOUR) });
    return false;
  }

  const isConnect = step.type === "connect";
  const capHit = isConnect ? a.connectsToday >= connectLimit(a) : a.messagesToday >= a.maxDailyMessages;
  if (capHit || a.viewsToday >= a.maxDailyViews) {
    await prisma.liCampaignProspect.update({ where: { id: e.id }, data: { nextActionAt: new Date(Date.now() + rand(12, 20) * HOUR) } });
    return false;
  }

  await goto(page, e.prospect.linkedinUrl);
  await humanScroll(page);
  await bump(a, "viewsToday");
  const prospect = await enrichProspect(page, e.prospect);
  await logAction(a, prospect.id, "VIEW_PROFILE", "DONE");
  const relation = await readRelation(page);

  if (isConnect) {
    if (relation === "connected") return !!(await advance({ state: "CONNECTED" }));
    if (relation === "pending") return !!(await advance({ state: "INVITED" }));
    await sendConnect(page, await render(step.note ?? "", step, prospect));
    await bump(a, "connectsToday");
    await logAction(a, prospect.id, "CONNECT", "DONE");
    await advance({ state: "INVITED" });
    return true;
  }

  // message / follow_up: needs an accepted connection.
  if (relation !== "connected") {
    const age = Date.now() - e.updatedAt.getTime();
    if (e.state === "INVITED" && age > 21 * DAY) {
      await prisma.liCampaignProspect.update({ where: { id: e.id }, data: { state: "FAILED", failReason: "Invite not accepted after 21 days", nextActionAt: null } });
    } else {
      await prisma.liCampaignProspect.update({ where: { id: e.id }, data: { nextActionAt: new Date(Date.now() + rand(10, 16) * HOUR), failReason: "Waiting for invite to be accepted" } });
    }
    return true;
  }
  const text = await render(step.note ?? "", step, prospect);
  if (!text) {
    await advance({ state: "CONNECTED" });
    return true;
  }
  await sendMessageFromProfile(page, text);
  await bump(a, "messagesToday");
  await logAction(a, prospect.id, step.type === "follow_up" ? "FOLLOW_UP" : "MESSAGE", "DONE");
  await recordOutgoing(a, prospect.id, text);
  await advance({ state: "CONNECTED" });
  return true;
}

async function bump(a: LiAccount, field: "viewsToday" | "connectsToday" | "messagesToday") {
  a[field]++;
  await prisma.liAccount.update({
    where: { id: a.id },
    data: { [field]: a[field], lastActionAt: new Date(), ...(field === "connectsToday" ? { connectsThisWeek: { increment: 1 } } : {}) },
  });
}

async function recordOutgoing(a: LiAccount, prospectId: string, text: string) {
  const conv =
    (await prisma.liConversation.findFirst({ where: { accountId: a.id, prospectId } })) ??
    (await prisma.liConversation.create({ data: { accountId: a.id, prospectId, lastMessageAt: new Date(), unread: false } }));
  await prisma.liMessage.create({ data: { conversationId: conv.id, direction: "OUT", text, sentAt: new Date() } });
  await prisma.liConversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
}

// ─── Inbox sync & replies ────────────────────────────────────

const slugOf = (url: string) => url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? "";

async function syncInbox(page: Page, a: LiAccount) {
  await goto(page, "https://www.linkedin.com/messaging/");
  const items = page.locator("li.msg-conversation-listitem");
  const count = Math.min(await items.count(), 15);
  const prospects = await prisma.liProspect.findMany({ select: { id: true, linkedinUrl: true, firstName: true, lastName: true } });

  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const unread = await item.locator(".msg-conversation-card__unread-count, .notification-badge").count().then((n) => n > 0);
    await item.click();
    await pause(1800, 3200);

    const thread = page.locator(".msg-s-message-list-container, .msg-thread").first();
    const name = (await page.locator(".msg-entity-lockup__entity-title, #thread-detail-jump-target").first().innerText().catch(() => "")).trim();
    const href = (await page.locator("a.msg-thread__link-to-profile").first().getAttribute("href").catch(() => null)) ?? "";
    const prospect =
      prospects.find((p) => slugOf(href) && slugOf(p.linkedinUrl) === slugOf(href)) ??
      prospects.find((p) => name && `${p.firstName} ${p.lastName}`.trim().toLowerCase() === name.toLowerCase());
    if (!prospect) continue; // Only track people who are in the CRM.

    const events = await thread.locator("li.msg-s-message-list__event").evaluateAll((els) =>
      els.map((el) => ({
        inbound: !!el.querySelector(".msg-s-event-listitem--other"),
        text: (el.querySelector(".msg-s-event-listitem__body") as HTMLElement | null)?.innerText.trim() ?? "",
      })),
    );
    const conv =
      (await prisma.liConversation.findFirst({ where: { accountId: a.id, prospectId: prospect.id }, include: { messages: true } })) ??
      (await prisma.liConversation.create({ data: { accountId: a.id, prospectId: prospect.id, lastMessageAt: new Date() }, include: { messages: true } }));

    const known = new Set(conv.messages.map((m) => `${m.direction}|${m.text}`));
    let newInbound = 0;
    for (const ev of events) {
      if (!ev.text) continue;
      const key = `${ev.inbound ? "IN" : "OUT"}|${ev.text}`;
      if (known.has(key)) continue;
      known.add(key);
      await prisma.liMessage.create({ data: { conversationId: conv.id, direction: ev.inbound ? "IN" : "OUT", text: ev.text, sentAt: new Date() } });
      if (ev.inbound) newInbound++;
    }
    if (!newInbound) continue;

    await prisma.liConversation.update({ where: { id: conv.id }, data: { unread: true, stoppedByReply: true, lastMessageAt: new Date(), threadUrl: page.url().slice(0, 500) } });
    // A reply stops every running sequence for this person, like HeyReach does.
    await prisma.liCampaignProspect.updateMany({ where: { prospectId: prospect.id, state: { in: ["QUEUED", "INVITED", "CONNECTED"] } }, data: { state: "REPLIED", nextActionAt: null } });
    console.log(`  ↩ reply from ${name || prospect.linkedinUrl}${unread ? "" : " (already read on LinkedIn)"}`);
  }
  await prisma.liAccount.update({ where: { id: a.id }, data: { lastSyncAt: new Date() } });
  await logAction(a, null, "SYNC_INBOX", "DONE");
}

async function sendPendingReplies(page: Page, a: LiAccount) {
  const pending = await prisma.liMessage.findMany({
    where: { pendingSend: true, conversation: { accountId: a.id } },
    include: { conversation: { include: { prospect: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const m of pending) {
    const { conversation: c } = m;
    try {
      if (c.threadUrl) {
        await goto(page, c.threadUrl);
        await typeIntoComposer(page, m.text);
      } else if (c.prospect) {
        await goto(page, c.prospect.linkedinUrl);
        await sendMessageFromProfile(page, m.text);
      } else throw new Error("No thread or profile to reply on");
      if (!DRY_RUN) await prisma.liMessage.update({ where: { id: m.id }, data: { pendingSend: false, sentAt: new Date() } });
      await bump(a, "messagesToday");
      await logAction(a, c.prospectId, "MESSAGE", "DONE");
      console.log(`  ✉ sent inbox reply to ${c.prospect?.firstName ?? c.threadUrl}`);
    } catch (err) {
      if (err instanceof SessionError) throw err;
      await logAction(a, c.prospectId, "MESSAGE", "FAILED", String(err), await shot(page, "reply"));
    }
    await pause(20_000, 60_000);
  }
}

// ─── Main loops ──────────────────────────────────────────────

async function pickAccount() {
  const id = process.env.LI_ACCOUNT_ID;
  const a = id ? await prisma.liAccount.findUnique({ where: { id } }) : await prisma.liAccount.findFirst({ orderBy: { createdAt: "asc" } });
  if (!a) throw new Error("Add your LinkedIn account in the CRM first (LinkedIn → Accounts).");
  return a;
}

async function resetDay(a: LiAccount) {
  const { day } = localParts(a.timezone);
  if (a.actionDay === day) return a;
  const weekStale = !a.connectsWindowStart || Date.now() - a.connectsWindowStart.getTime() > 7 * DAY;
  return prisma.liAccount.update({
    where: { id: a.id },
    data: {
      actionDay: day, connectsToday: 0, messagesToday: 0, viewsToday: 0,
      ...(weekStale ? { connectsThisWeek: 0, connectsWindowStart: new Date() } : {}),
      ...(a.status === "WARMING" && weekStale && a.connectsWindowStart ? { warmupWeeks: { increment: 1 } } : {}),
    },
  });
}

async function login() {
  const a = await pickAccount();
  console.log(`Opening a browser for "${a.name}". Sign in to LinkedIn in that window — the session is saved in ${profileDir(a)}.`);
  const ctx = await openBrowser(a, false);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://www.linkedin.com/login");
  try {
    await page.waitForURL(/linkedin\.com\/(feed|in\/|mynetwork)/, { timeout: 10 * 60_000 });
  } catch (err) {
    await prisma.liAccount.update({ where: { id: a.id }, data: { lastError: "Sign-in window closed before your LinkedIn feed loaded." } });
    throw err;
  }
  console.log("Signed in. Saving session…");
  await pause(3000, 4000);
  await prisma.liAccount.update({ where: { id: a.id }, data: { profilePath: a.profilePath || path.relative(process.cwd(), profileDir(a)), lastError: null } });
  await ctx.close();
}

async function worker() {
  let a = await pickAccount();
  console.log(`LinkedIn worker for "${a.name}"${DRY_RUN ? " — DRY RUN, nothing is sent" : ""}. Ctrl+C to stop.`);
  if (!a.sessionEnc && !a.profilePath) throw new Error("LinkedIn isn't connected. In the CRM, open LinkedIn → Accounts and click Log in to LinkedIn.");
  const ctx = await openBrowser(a);
  if (await applySyncedSession(ctx, a)) console.log(`Using LinkedIn session synced ${a.sessionSyncedAt?.toLocaleString()}.`);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  let lastSync = 0;

  const stop = async () => { await ctx.close().catch(() => {}); await prisma.$disconnect(); process.exit(0); };
  process.on("SIGINT", stop);

  for (;;) {
    a = await resetDay(await prisma.liAccount.findUniqueOrThrow({ where: { id: a.id } }));
    if (a.status === "PAUSED" || a.status === "RESTRICTED") {
      console.log(`Account is ${a.status}; checking again in 10 min.`);
      await sleep(10 * 60_000);
      continue;
    }
    if (!inWorkingHours(a.timezone)) {
      await sleep(15 * 60_000);
      continue;
    }
    try {
      if (Date.now() - lastSync > rand(20, 35) * 60_000) {
        console.log("Syncing inbox…");
        await syncInbox(page, a);
        lastSync = Date.now();
      }
      await sendPendingReplies(page, a);

      const due = await nextDue(a);
      if (!due) {
        await sleep(rand(3, 6) * 60_000);
        continue;
      }
      const steps = due.campaign.steps as Step[];
      console.log(`→ ${steps[due.stepIndex]?.type ?? "done"}: ${due.prospect.firstName || due.prospect.linkedinUrl}`);
      let touched = false;
      try {
        touched = await runStep(page, a, due);
      } catch (err) {
        if (err instanceof SessionError) throw err;
        const file = await shot(page, "step");
        console.error(`  ✗ ${String(err).split("\n")[0]}  (screenshot: ${file})`);
        await logAction(a, due.prospectId, steps[due.stepIndex]?.type === "connect" ? "CONNECT" : "MESSAGE", "FAILED", String(err), file);
        await prisma.liCampaignProspect.update({ where: { id: due.id }, data: { failReason: String(err).slice(0, 500), nextActionAt: new Date(Date.now() + 6 * HOUR) } });
        touched = true;
      }
      // Human-like gap between profile visits.
      if (touched) await sleep(rand(2, 7) * 60_000 + rand(0, 60_000));
    } catch (err) {
      if (err instanceof SessionError) {
        await prisma.liAccount.update({ where: { id: a.id }, data: { lastError: err.message, status: "PAUSED" } });
        console.error(err.message);
        return stop();
      }
      console.error(err);
      await sleep(5 * 60_000);
    }
  }
}

(process.argv[2] === "login" ? login() : worker()).catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
