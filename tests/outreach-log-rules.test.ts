import { test } from "node:test";
import assert from "node:assert/strict";
import { applyContactEvent, applyContactStage, applyJobEvent, awaitingUs, expireContact, expireJob, handleKey, type TrackState } from "../src/lib/outreach-log/rules";

const DAY = 864e5;
const t0 = new Date("2026-11-01T10:00:00Z");
const at = (d: number) => new Date(t0.getTime() + d * DAY);
const fresh = (stage = "new"): TrackState => ({ stage, followupCount: 0, lastOutboundAt: null, lastInboundAt: null, nextFollowupAt: null });
const days = (s: TrackState, from: number) => (s.nextFollowupAt!.getTime() - at(from).getTime()) / DAY;

test("first message → contacted, follow-up in 2 days", () => {
  const s = applyContactEvent(fresh(), "sent", at(0));
  assert.equal(s.stage, "contacted");
  assert.equal(days(s, 0), 2);
});

test("follow-ups advance to followed_up with growing gaps, then go cold", () => {
  let s = applyContactEvent(fresh(), "sent", at(0));
  s = applyContactEvent(s, "followup", at(2));
  assert.equal(s.stage, "followed_up");
  assert.equal(days(s, 2), 3);
  s = applyContactEvent(s, "followup", at(5));
  s = applyContactEvent(s, "followup", at(10));
  assert.equal(s.followupCount, 3);
  assert.equal(days(s, 10), 7);
  assert.equal(expireContact(s, at(16)), null);
  assert.equal(expireContact(s, at(17.1))?.stage, "no_response");
});

test("reply → replied and due now; our answer pushes 2 days", () => {
  let s = applyContactEvent(applyContactEvent(fresh(), "sent", at(0)), "reply", at(1));
  assert.equal(s.stage, "replied");
  assert.ok(awaitingUs(s));
  assert.equal(days(s, 1), 0);
  s = applyContactEvent(s, "sent", at(1.5));
  assert.equal(s.stage, "replied");
  assert.equal(days(s, 1.5), 2);
  assert.equal(expireContact({ ...s, followupCount: 5 }, at(30)), null);
});

test("won clears follow-ups; meeting follows up the day after", () => {
  const s = applyContactEvent(fresh(), "sent", at(0));
  assert.equal(applyContactStage(s, "won", at(1)).nextFollowupAt, null);
  assert.equal(days(applyContactStage(s, "meeting", at(1), at(4)), 4), 1);
});

test("jobs: applied → 7d, two follow-ups, then ghosted", () => {
  let s = applyJobEvent(fresh("saved"), "applied", at(0));
  assert.equal(s.stage, "applied");
  assert.equal(days(s, 0), 7);
  s = applyJobEvent(s, "followup", at(7));
  s = applyJobEvent(s, "followup", at(14));
  assert.equal(s.stage, "followed_up");
  assert.equal(expireJob(s, at(20)), null);
  assert.equal(expireJob(s, at(21.1))?.stage, "ghosted");
});

test("jobs: response, interview, rejection", () => {
  let s = applyJobEvent(applyJobEvent(fresh("saved"), "applied", at(0)), "response", at(3));
  assert.equal(s.stage, "responded");
  s = applyJobEvent(s, "interview", at(4), { interviewAt: at(6) });
  assert.equal(s.stage, "interview");
  assert.equal(days(s, 6), 1);
  assert.equal(applyJobEvent(s, "response", at(7)).stage, "interview");
  assert.equal(applyJobEvent(s, "rejected", at(8)).nextFollowupAt, null);
});

test("handle keys", () => {
  assert.equal(handleKey("whatsapp", "+92 300-123 4567"), "923001234567");
  assert.equal(handleKey("email", " Jane@X.com "), "jane@x.com");
  assert.equal(handleKey("facebook", "https://www.facebook.com/jane.doe/?ref=1"), "facebook.com/jane.doe");
});
