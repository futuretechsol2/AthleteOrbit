import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps, tierOf, todayIn } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { allowedUrl, excerptFor, htmlToText } from "../server/routes/scores/online.js";
import { runAutoScores } from "../server/routes/cron/reminders.js";
import { hasFeature } from "../src/data/plans.js";

const day = 86400000;
const PAGE = `<html><head><script>var x=1</script></head><body><h1>2026 Turkey Invitational</h1><p>November 22, 2026 · Raleigh, NC</p>
<table><tr><th>Gymnast</th><th>Team</th><th>VT</th><th>UB</th><th>BB</th><th>FX</th><th>AA</th></tr>
<tr><td>Ana Lopez</td><td>Other Gym</td><td>9.0</td><td>8.7</td><td>8.8</td><td>9.0</td><td>35.5</td></tr>
<tr><td>Maya Patel</td><td>Demo Gymnastics</td><td>9.25</td><td>8.95</td><td>9.0</td><td>9.2</td><td>36.4 (1)</td></tr></table></body></html>`;
let T, sent, reply;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "t"; process.env.APP_URL = "https://app.test"; delete process.env.AI_PROVIDER; delete process.env.SCORE_SOURCE_HOSTS;
  process.env.STRIPE_PRICE_BASIC_MONTHLY = "pb_m"; process.env.STRIPE_PRICE_PRO_YEARLY = "pp_y"; process.env.STRIPE_PRICE_PLUS_MONTHLY = "pl_m";
  T = {
    profiles: [
      { id: "b", email: "b@x.com", subscription_status: "active", subscription_tier: "basic", stripe_subscription_id: "sub_b" },
      { id: "p", email: "p@x.com", subscription_status: "active", subscription_tier: "plus", email_reminders: true },
      { id: "t", email: "t@x.com", subscription_status: "none", trial_ends_at: new Date(Date.now() + 2 * day).toISOString() },
    ],
    gymnasts: [{ id: "gb", user_id: "b", name: "Ana", program: "WAG", level: "Level 4" }, { id: "gp", user_id: "p", name: "Maya", results_name: "Maya Patel", program: "WAG", level: "Level 5", club: "Demo Gymnastics" }],
    meets: [], scores: [], stats: [], skill_status: [], coach_notes: [], goals: [], ai_usage: [], ai_notes: [], score_imports: [], clubs: [],
  };
  deps._sb = fakeSupabase(T, { tb: { id: "b", email: "b@x.com" }, tp: { id: "p", email: "p@x.com" }, tt: { id: "t", email: "t@x.com" } }); deps.supabase = () => deps._sb;
  sent = []; reply = '{"meet_name":"2026 Turkey Invitational","meet_date":"2026-11-22","level":"Level 5","vault":9.25,"bars":8.95,"beam":9.0,"floor":9.2,"aa_place":1,"confidence":"high","notes":""}';
  deps.fetch = async (url, init = {}) => {
    sent.push({ url, init });
    if (url.includes("anthropic")) return { ok: true, json: async () => ({ content: [{ type: "text", text: reply }] }) };
    return { ok: true, url, text: async () => PAGE };
  };
});

test("tiers: basic < plus < pro; trial = pro; gym code = plus", () => {
  assert.equal(tierOf(T.profiles[0]), "basic"); assert.equal(tierOf(T.profiles[2]), "pro");
  assert.equal(tierOf({ subscription_status: "none", _club: { active_until: new Date(Date.now() + day).toISOString() } }), "plus");
  assert.equal(tierOf({ subscription_status: "active" }), "plus", "older subscriptions count as Plus");
  assert.ok(hasFeature("plus", "onlineScores")); assert.ok(!hasFeature("basic", "onlineScores")); assert.ok(!hasFeature("plus", "coach")); assert.ok(hasFeature("pro", "video"));
});

test("Basic can't use AI coach or online scores; error names the plan to upgrade to", async () => {
  let r = await call(ROUTES["ai/coach"], { token: "tb", body: { gymnastId: "gb", messages: [{ role: "user", content: "hi" }] } });
  assert.equal(r.status, 402); assert.equal(r.json.upgrade, "pro"); assert.match(r.json.error, /AthleteOrbit Pro/);
  r = await call(ROUTES["scores/online"], { token: "tb", body: { gymnastId: "gb", url: "https://www.meetscoresonline.com/R12345" } });
  assert.equal(r.status, 402); assert.equal(r.json.upgrade, "plus");
  r = await call(ROUTES["calendar-link"], { token: "tb", method: "GET" }); assert.equal(r.status, 402);
});

test("online scores: reads the results page, keeps only the athlete's rows, returns scores", async () => {
  const r = await call(ROUTES["scores/online"], { token: "tp", body: { gymnastId: "gp", url: "https://www.meetscoresonline.com/R12345" } });
  assert.equal(r.status, 200); assert.equal(r.json.scores.vault, 9.25); assert.equal(r.json.scores.aa_place, 1);
  const page = sent.find((s) => s.url.includes("meetscoresonline")); assert.match(page.init.headers["user-agent"], /AthleteOrbit/);
  const prompt = JSON.parse(sent.find((s) => s.url.includes("anthropic")).init.body).messages[0].content;
  assert.match(prompt, /Maya Patel/); assert.doesNotMatch(prompt, /var x=1/);
});

test("online scores: only results sites; pasted text works; name not on page = 404 with no AI call", async () => {
  assert.equal(allowedUrl("http://169.254.169.254/latest"), null); assert.equal(allowedUrl("https://evil.com/?meetscoresonline.com"), null);
  assert.equal(allowedUrl("https://meetscoresonline.com.evil.com/x"), null); assert.ok(allowedUrl("https://www.meetscoresonline.com/R1"));
  let r = await call(ROUTES["scores/online"], { token: "tp", body: { gymnastId: "gp", url: "https://example.com/results" } }); assert.equal(r.status, 400);
  r = await call(ROUTES["scores/online"], { token: "tp", body: { gymnastId: "gp", text: htmlToText(PAGE) } }); assert.equal(r.status, 200); assert.equal(r.json.scores.floor, 9.2);
  sent = [];
  r = await call(ROUTES["scores/online"], { token: "tp", body: { gymnastId: "gp", athleteName: "Zoe Nguyen", text: htmlToText(PAGE) } });
  assert.equal(r.status, 404); assert.equal(sent.length, 0);
  assert.equal(T.gymnasts[1].results_name, "Zoe Nguyen", "name as listed online is remembered");
});

test("excerpt keeps header and the athlete's row only", () => {
  const ex = excerptFor(htmlToText(PAGE), "Maya Patel");
  assert.match(ex, /Turkey Invitational/); assert.match(ex, /Maya Patel \| Demo Gymnastics \| 9.25/);
});

test("daily auto-pull: linked meet → pending import for review (Plus), Basic skipped", async () => {
  const today = todayIn();
  T.meets.push({ id: "m1", user_id: "p", gymnast_id: "gp", name: "Turkey Invitational", start_date: today, status: "Registered", results_url: "https://www.meetscoresonline.com/R12345" });
  T.meets.push({ id: "m2", user_id: "b", gymnast_id: "gb", name: "Basic meet", start_date: today, status: "Registered", results_url: "https://www.meetscoresonline.com/R9" });
  const r = await runAutoScores();
  assert.equal(r.found, 1); assert.equal(T.score_imports.length, 1); assert.equal(T.score_imports[0].status, "pending"); assert.equal(T.score_imports[0].data.scores.vault, 9.25);
  const again = await runAutoScores(); assert.equal(again.found, 0, "not pulled twice");
});

test("checkout uses the chosen tier's price; change plan upgrades in place", async () => {
  let made; const updates = [];
  deps.stripe = () => ({ customers: { create: async () => ({ id: "cus" }) }, checkout: { sessions: { create: async (p) => { made = p; return { url: "u" }; } } },
    subscriptions: { retrieve: async () => ({ id: "sub_b", items: { data: [{ id: "si_1" }] }, metadata: {} }), update: async (id, p) => { updates.push(p); return {}; } } });
  let r = await call(ROUTES["billing/checkout"], { token: "tt", body: { tier: "pro", plan: "yearly" } });
  assert.equal(r.status, 200); assert.equal(made.line_items[0].price, "pp_y"); assert.equal(made.subscription_data.metadata.tier, "pro"); assert.ok(made.subscription_data.trial_end);
  r = await call(ROUTES["billing/change"], { token: "tb", body: { tier: "plus", plan: "monthly" } });
  assert.equal(r.status, 200); assert.equal(updates[0].items[0].price, "pl_m"); assert.equal(updates[0].proration_behavior, "always_invoice");
  assert.equal(T.profiles[0].subscription_tier, "plus");
});

test("webhook stores tier from the Stripe price", async () => {
  deps.stripe = () => ({ webhooks: { constructEvent: () => ({ type: "customer.subscription.updated", data: { object: { id: "sub_x", customer: "c", status: "active", metadata: { supabase_user_id: "t" }, items: { data: [{ price: { id: "pb_m", recurring: { interval: "month", interval_count: 1 } } }] } } } }) } });
  process.env.STRIPE_WEBHOOK_SECRET = "w";
  const r = await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "s" } });
  assert.equal(r.status, 200); assert.equal(T.profiles[2].subscription_tier, "basic"); assert.equal(T.profiles[2].stripe_subscription_id, "sub_x");
});
