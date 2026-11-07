import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyActivity,
  applyStage,
  awaitingUs,
  expireIfSilent,
  limitStatus,
  mergeTemplate,
  pipelineStageFor,
  type ThreadState,
} from "../src/lib/outreach/rules";
import { detectPlatform, nameFromPageTitle, normalizeAny, normalizeProfile } from "../src/lib/outreach/normalize";

const DAY = 864e5;
const t0 = new Date("2026-11-01T10:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY);
const fresh = (): ThreadState => ({
  stage: "not_contacted",
  connectionSentAt: null,
  connectionAcceptedAt: null,
  firstMessageAt: null,
  lastOutboundAt: null,
  lastInboundAt: null,
  followupCount: 0,
  nextFollowupAt: null,
});
const dm = (d: number) => ({ direction: "outbound" as const, type: "dm" as const, occurredAt: at(d) });

test("connection request → connection_sent", () => {
  const s = applyActivity(fresh(), { direction: "outbound", type: "connection_request", occurredAt: t0 });
  assert.equal(s.stage, "connection_sent");
  assert.deepEqual(s.connectionSentAt, t0);
  assert.deepEqual(s.lastOutboundAt, t0);
});

test("accepted connection → follow-up due in 2 days", () => {
  const s = applyStage(fresh(), "connected", t0);
  assert.equal(s.stage, "connected");
  assert.deepEqual(s.nextFollowupAt, at(2));
});

test("first DM → message_sent, follow-up in 3 days, no follow-up counted", () => {
  const s = applyActivity(applyStage(fresh(), "connected", t0), dm(1));
  assert.equal(s.stage, "message_sent");
  assert.equal(s.followupCount, 0);
  assert.deepEqual(s.firstMessageAt, at(1));
  assert.deepEqual(s.nextFollowupAt, at(4));
});

test("unanswered follow-ups wait 5 then 7 days, then no_response after 3", () => {
  let s = applyActivity(fresh(), dm(0));
  s = applyActivity(s, dm(3));
  assert.equal(s.followupCount, 1);
  assert.deepEqual(s.nextFollowupAt, at(8));
  s = applyActivity(s, dm(8));
  assert.equal(s.followupCount, 2);
  assert.deepEqual(s.nextFollowupAt, at(15));
  s = applyActivity(s, dm(15));
  assert.equal(s.followupCount, 3);
  assert.equal(s.stage, "message_sent");
  assert.equal(expireIfSilent(s, at(16)), null, "still waiting");
  const done = expireIfSilent(s, at(23))!;
  assert.equal(done.stage, "no_response");
  assert.equal(done.nextFollowupAt, null);
});

test("inbound → replied, follow-up cleared, awaiting us", () => {
  let s = applyActivity(fresh(), dm(0));
  s = applyActivity(s, { direction: "inbound", type: "dm", occurredAt: at(1) });
  assert.equal(s.stage, "replied");
  assert.equal(s.nextFollowupAt, null);
  assert.ok(awaitingUs(s));
  assert.equal(expireIfSilent({ ...s, followupCount: 3, stage: "message_sent", nextFollowupAt: at(0) }, at(30)), null);
});

test("our answer to a reply is not a follow-up", () => {
  let s = applyActivity(fresh(), dm(0));
  s = applyActivity(s, { direction: "inbound", type: "dm", occurredAt: at(1) });
  s = applyActivity(s, dm(2));
  assert.equal(s.followupCount, 0);
  assert.equal(s.stage, "replied");
  assert.ok(!awaitingUs(s));
});

test("inbound never downgrades interested or booked", () => {
  const s = applyActivity({ ...fresh(), stage: "call_booked" }, { direction: "inbound", type: "dm", occurredAt: t0 });
  assert.equal(s.stage, "call_booked");
});

test("closed stages clear the follow-up", () => {
  for (const st of ["interested", "call_booked", "won", "not_interested"] as const)
    assert.equal(applyStage({ ...fresh(), nextFollowupAt: at(3) }, st, t0).nextFollowupAt, null);
});

test("pipeline moves forward only", () => {
  assert.equal(pipelineStageFor("interested", "LEAD"), "INTERESTED");
  assert.equal(pipelineStageFor("interested", "MEETING_BOOKED"), null);
  assert.equal(pipelineStageFor("call_booked", "INTERESTED"), "MEETING_BOOKED");
  assert.equal(pipelineStageFor("won", "SHOWED"), "CLOSED_WON");
  assert.equal(pipelineStageFor("message_sent", "LEAD"), "CONTACTED");
});

test("limits: warn at 80%, block at 100%, 0 = unlimited", () => {
  assert.equal(limitStatus(15, 20), "ok");
  assert.equal(limitStatus(16, 20), "warn");
  assert.equal(limitStatus(20, 20), "block");
  assert.equal(limitStatus(500, 0), "ok");
});

test("template merge fields", () => {
  const out = mergeTemplate("Hi {first_name}, saw {company}'s work as {job_title}. {unknown}", {
    decisionMakerName: "Jane Doe",
    businessName: "Acme",
    jobTitle: "CEO",
  });
  assert.equal(out, "Hi Jane, saw Acme's work as CEO. {unknown}");
  assert.equal(mergeTemplate("Hi {first_name}", {}), "Hi there");
});

// ─── Normalisation / duplicate keys ──────────────────────────

test("LinkedIn URLs normalise to one key", () => {
  const variants = [
    "https://www.linkedin.com/in/Jane-Doe/",
    "linkedin.com/in/jane-doe?utm_source=share",
    "https://uk.linkedin.com/in/jane-doe/details/experience/",
    "http://m.linkedin.com/in/jane-doe#about",
    "jane-doe",
  ];
  for (const v of variants) assert.equal(normalizeProfile("linkedin", v)?.key, "linkedin.com/in/jane-doe", v);
});

test("Facebook keeps the numeric id but drops other query params", () => {
  assert.equal(normalizeProfile("facebook", "https://www.facebook.com/profile.php?id=1000123&ref=x")?.key, "facebook.com/profile.php?id=1000123");
  assert.equal(normalizeProfile("facebook", "https://m.facebook.com/John.Smith/?ref=bookmarks")?.key, "facebook.com/john.smith");
});

test("handle platforms: URL and @handle match", () => {
  assert.equal(normalizeProfile("instagram", "@Jane.Doe")?.key, "jane.doe");
  assert.equal(normalizeProfile("instagram", "https://instagram.com/jane.doe/?hl=en")?.key, "jane.doe");
  assert.equal(normalizeProfile("threads", "https://www.threads.net/@jane.doe")?.key, "jane.doe");
  assert.equal(normalizeProfile("x", "https://twitter.com/JaneDoe")?.key, "janedoe");
});

test("wrong network or junk is rejected", () => {
  assert.equal(normalizeProfile("linkedin", "https://facebook.com/jane"), null);
  assert.equal(normalizeProfile("instagram", ""), null);
  assert.equal(normalizeProfile("linkedin", "https://www.linkedin.com/"), null);
});

test("platform detection and page titles", () => {
  assert.equal(detectPlatform("https://www.linkedin.com/in/x"), "linkedin");
  assert.equal(detectPlatform("https://www.instagram.com/x/"), "instagram");
  assert.equal(detectPlatform("https://www.threads.net/@x"), "threads");
  assert.equal(detectPlatform("https://example.com"), null);
  assert.equal(normalizeAny("https://www.instagram.com/jane/")?.platform, "instagram");
  assert.equal(nameFromPageTitle("(3) Jane Doe | LinkedIn"), "Jane Doe");
  assert.equal(nameFromPageTitle("Jane Doe (@jane) • Instagram photos and videos"), "Jane Doe");
});
