import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps, isPaid } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";

let T, sent, reply;
const day = 86400000;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "t"; delete process.env.AI_PROVIDER; delete process.env.OPENAI_API_KEY;
  T = {
    profiles: [{ id: "u1", email: "a@x.com", subscription_status: "none", trial_ends_at: new Date(Date.now() + 3 * day).toISOString() },
      { id: "u2", email: "b@x.com", subscription_status: "none", trial_ends_at: new Date(Date.now() - day).toISOString() }],
    gymnasts: [{ id: "g1", user_id: "u1", name: "Maya", program: "WAG", sport: "Gymnastics", level: "Level 5" },
      { id: "s1", user_id: "u1", name: "Zoe", program: "Other", sport: "Swimming", level: "Novice" },
      { id: "g2", user_id: "u2", name: "Ana", program: "Other", sport: "Soccer", level: "U10" }],
    scores: [], stats: [], skill_status: [], meets: [], coach_notes: [], goals: [], ai_usage: [], ai_notes: [], clubs: [],
  };
  deps._sb = fakeSupabase(T, { tok1: { id: "u1", email: "a@x.com" }, tok2: { id: "u2", email: "b@x.com" } }); deps.supabase = () => deps._sb;
  sent = []; reply = "tips here";
  deps.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: true, json: async () => (url.includes("openai") ? { choices: [{ message: { content: reply } }] } : { content: [{ type: "text", text: reply }] }) };
  };
});

test("7-day trial counts as paid; expired trial does not", () => {
  assert.equal(isPaid(T.profiles[0]), true);
  assert.equal(isPaid(T.profiles[1]), false);
});

test("me reports trial status", async () => {
  const r = await call(ROUTES.me, { token: "tok1", method: "GET" });
  assert.equal(r.json.pro, true); assert.equal(r.json.trial, true); assert.ok(r.json.trial_ends_at);
});

test("nutrition tips: sport-aware, kid-safe rules, saved to notes", async () => {
  const r = await call(ROUTES["ai/tips"], { token: "tok1", body: { gymnastId: "s1", kind: "nutrition" } });
  assert.equal(r.status, 200); assert.equal(r.json.tips, "tips here");
  const sys = sent[0].body.system;
  assert.match(sys, /swim/i); assert.match(sys, /Never give calorie or macro targets/); assert.match(sys, /registered sports dietitian/);
  assert.equal(T.ai_notes[0].kind, "nutrition");
});

test("improvement tips use the child's sport coach", async () => {
  await call(ROUTES["ai/tips"], { token: "tok1", body: { gymnastId: "g1", kind: "improve" } });
  assert.match(sent[0].body.system, /gymnastics club coach/); assert.match(sent[0].body.system, /Biggest win this week/);
});

test("after the trial, AI and tracking need a plan", async () => {
  const r = await call(ROUTES["ai/tips"], { token: "tok2", body: { gymnastId: "g2", kind: "improve" } });
  assert.equal(r.status, 402); assert.match(r.json.error, /trial has ended/);
});

test("ChatGPT can power the coach (AI_PROVIDER=openai)", async () => {
  process.env.AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "sk-test";
  const r = await call(ROUTES["ai/coach"], { token: "tok1", body: { gymnastId: "s1", messages: [{ role: "user", content: "How do we drop time?" }] } });
  assert.equal(r.status, 200); assert.equal(r.json.reply, "tips here");
  assert.match(sent[0].url, /api\.openai\.com/); assert.equal(sent[0].headers.authorization, "Bearer sk-test");
  assert.equal(sent[0].body.messages[0].role, "system"); assert.match(sent[0].body.messages[0].content, /Swimming/);
});

test("ChatGPT reads photos too (image blocks converted)", async () => {
  process.env.AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "sk-test";
  reply = '{"event_name":"Splash","event_date":"2026-11-01","results":[{"metric":"50 Free","value":34.5,"unit":"sec"}],"confidence":"high"}';
  const r = await call(ROUTES["ai/scoresheet"], { token: "tok1", body: { image: "data:image/jpeg;base64,/9j/4AAQ", sport: "Swimming" } });
  assert.equal(r.status, 200); assert.equal(r.json.results[0].value, 34.5);
  assert.equal(sent[0].body.messages[1].content[0].type, "image_url");
});
