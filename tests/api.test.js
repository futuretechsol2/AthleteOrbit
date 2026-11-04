import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import coach from "../server/routes/ai/coach.js";
import scoresheet from "../server/routes/ai/scoresheet.js";
import video from "../server/routes/ai/video.js";
import readiness from "../server/routes/ai/readiness.js";
import checkout from "../server/routes/billing/checkout.js";
import webhook from "../server/routes/billing/webhook.js";
import me from "../server/routes/me.js";

process.env.ANTHROPIC_API_KEY = "test"; process.env.APP_URL = "https://app.test";
process.env.STRIPE_PRICE_MONTHLY = "price_m"; process.env.STRIPE_PRICE_YEARLY = "price_y"; process.env.STRIPE_WEBHOOK_SECRET = "whsec";

const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
let T, claudeCalls, claudeReply;
beforeEach(() => {
  T = {
    profiles: [
      { id: "paid", email: "p@x.com", subscription_status: "trialing", subscription_tier: "pro" },
      { id: "free", email: "f@x.com", subscription_status: "none" },
    ],
    gymnasts: [
      { id: "g1", user_id: "paid", name: "Ava", program: "WAG", level: "Level 5" },
      { id: "g2", user_id: "free", name: "Zoe", program: "Xcel", level: "Gold" },
    ],
    scores: [{ user_id: "paid", gymnast_id: "g1", meet_name: "Fall Classic", meet_date: "2026-11-08", vault: 9.1, bars: 8.65, beam: 8.9, floor: 9.05 }],
    skill_status: [{ user_id: "paid", gymnast_id: "g1", skill_key: "WAG|Level 5|Floor|Back walkover", status: "Have it" }],
    meets: [], ai_usage: [], ai_notes: [],
  };
  deps._sb = fakeSupabase(T, { tokP: { id: "paid", email: "p@x.com" }, tokF: { id: "free", email: "f@x.com" } });
  deps.supabase = () => deps._sb;
  claudeCalls = []; claudeReply = "Great question!";
  deps.fetch = async (url, init) => {
    claudeCalls.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ content: [{ type: "text", text: claudeReply }] }) };
  };
});

test("rejects requests without sign-in", async () => {
  const r = await call(coach, { body: { messages: [{ role: "user", content: "hi" }] } });
  assert.equal(r.status, 401);
});

test("free users hit the paywall for AI features", async () => {
  for (const fn of [coach, scoresheet, video, readiness]) {
    const r = await call(fn, { token: "tokF", body: { messages: [{ role: "user", content: "hi" }], image: IMG, frames: [IMG, IMG], gymnastId: "g2" } });
    assert.equal(r.status, 402);
  }
  assert.equal(claudeCalls.length, 0);
});

test("coach answers with the gymnast's own data and safety rules", async () => {
  const r = await call(coach, { token: "tokP", body: { gymnastId: "g1", messages: [{ role: "user", content: "How is beam going?" }] } });
  assert.equal(r.status, 200); assert.equal(r.json.reply, "Great question!");
  const sys = claudeCalls[0].system;
  assert.match(sys, /Fall Classic/); assert.match(sys, /Back walkover: Have it/); assert.match(sys, /Never comment on body weight/);
  assert.equal(T.ai_usage.length, 1);
});

test("cannot read another family's gymnast", async () => {
  const r = await call(coach, { token: "tokP", body: { gymnastId: "g2", messages: [{ role: "user", content: "hi" }] } });
  assert.equal(r.status, 404);
});

test("daily limit is enforced", async () => {
  for (let i = 0; i < 40; i++) T.ai_usage.push({ user_id: "paid", kind: "coach", created_at: new Date().toISOString() });
  const r = await call(coach, { token: "tokP", body: { messages: [{ role: "user", content: "hi" }] } });
  assert.equal(r.status, 429);
});

test("score sheet photo is parsed and cleaned", async () => {
  claudeReply = 'Here: {"meet_name":"Fall Classic","meet_date":"2026-11-08","level":"Level 5","vault":"9.100","bars":8.65,"beam":null,"floor":9.05,"pommel":null,"rings":null,"pbars":null,"highbar":null,"aa_place":2,"confidence":"high","notes":""}';
  const r = await call(scoresheet, { token: "tokP", body: { image: IMG, program: "WAG" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.scores.vault, 9.1); assert.equal(r.json.scores.beam, null); assert.equal(r.json.scores.aa_place, 2);
  assert.equal(claudeCalls[0].messages[0].content[0].type, "image");
});

test("unreadable score sheet returns a friendly error", async () => {
  claudeReply = "I can't read this.";
  const r = await call(scoresheet, { token: "tokP", body: { image: IMG } });
  assert.equal(r.status, 422);
});

test("bad image is rejected before calling AI", async () => {
  const r = await call(scoresheet, { token: "tokP", body: { image: "data:text/html;base64,AAAA" } });
  assert.equal(r.status, 400); assert.equal(claudeCalls.length, 0);
});

test("video frames get feedback and it is saved", async () => {
  claudeReply = "**What looks good**\n- Tight arms";
  const r = await call(video, { token: "tokP", body: { gymnastId: "g1", event: "Floor", skill: "Round-off back handspring", frames: [IMG, IMG, IMG] } });
  assert.equal(r.status, 200); assert.match(r.json.feedback, /Tight arms/);
  assert.equal(claudeCalls[0].messages[0].content.filter((b) => b.type === "image").length, 3);
  assert.equal(T.ai_notes.length, 1); assert.equal(T.ai_notes[0].kind, "video");
});

test("video needs 2-10 frames", async () => {
  const r = await call(video, { token: "tokP", body: { frames: [IMG] } });
  assert.equal(r.status, 400);
});

test("readiness plan uses next level skills", async () => {
  const r = await call(readiness, { token: "tokP", body: { gymnastId: "g1" } });
  assert.equal(r.status, 200);
  assert.match(claudeCalls[0].messages[0].content, /Next level: Level 6/);
  assert.equal(T.ai_notes[0].kind, "readiness");
});

test("checkout creates customer, bills when the in-app trial ends, returns URL", async () => {
  let created;
  deps._stripe = { customers: { create: async () => ({ id: "cus_1" }) },
    checkout: { sessions: { create: async (p) => { created = p; return { url: "https://checkout.stripe.test/s" }; } } } };
  deps.stripe = () => deps._stripe;
  const ends = new Date(Date.now() + 4 * 86400000).toISOString(); T.profiles[1].trial_ends_at = ends;
  const r = await call(checkout, { token: "tokF", body: { plan: "yearly" } });
  assert.equal(r.status, 200); assert.equal(r.json.url, "https://checkout.stripe.test/s");
  assert.equal(created.line_items[0].price, "price_y"); assert.equal(created.subscription_data.trial_end, Math.floor(new Date(ends).getTime() / 1000));
  assert.equal(T.profiles[1].stripe_customer_id, "cus_1");
});

test("already-subscribed parents can't double-subscribe", async () => {
  const r = await call(checkout, { token: "tokP", body: { plan: "monthly" } });
  assert.equal(r.status, 409);
});

test("webhook activates and cancels subscriptions", async () => {
  let evt;
  deps._stripe = { webhooks: { constructEvent: (raw, sig) => { if (sig !== "good") throw new Error("bad"); return evt; } } };
  deps.stripe = () => deps._stripe;
  const bad = await call(webhook, { body: Buffer.from("{}"), headers: { "stripe-signature": "nope" } });
  assert.equal(bad.status, 400);
  evt = { type: "customer.subscription.updated", data: { object: { status: "active", customer: "cus_1", metadata: { supabase_user_id: "free" }, current_period_end: 1800000000, items: { data: [{ price: { recurring: { interval: "month" } } }] } } } };
  let r = await call(webhook, { body: Buffer.from("{}"), headers: { "stripe-signature": "good" } });
  assert.equal(r.status, 200); assert.equal(T.profiles[1].subscription_status, "active"); assert.equal(T.profiles[1].subscription_plan, "monthly");
  evt = { type: "customer.subscription.deleted", data: { object: { status: "canceled", customer: "cus_1", metadata: { supabase_user_id: "free" }, items: { data: [] } } } };
  r = await call(webhook, { body: Buffer.from("{}"), headers: { "stripe-signature": "good" } });
  assert.equal(T.profiles[1].subscription_status, "canceled");
});

test("me endpoint reports plan", async () => {
  const r = await call(me, { method: "GET", token: "tokP" });
  assert.equal(r.json.subscription_status, "trialing");
});

import del from "../server/routes/account/delete.js";
test("account delete cancels subscription and removes the user", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test";
  T.profiles[0].stripe_customer_id = "cus_9";
  const canceled = []; let deleted;
  deps._stripe = { subscriptions: { list: async () => ({ data: [{ id: "sub_1", status: "trialing" }, { id: "sub_0", status: "canceled" }] }), cancel: async (id) => canceled.push(id) } };
  deps.stripe = () => deps._stripe;
  deps._sb.auth.admin = { deleteUser: async (id) => { deleted = id; return { error: null }; } };
  const r = await call(del, { token: "tokP" });
  assert.equal(r.status, 200); assert.deepEqual(canceled, ["sub_1"]); assert.equal(deleted, "paid");
});
