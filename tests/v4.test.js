import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";

Object.assign(process.env, { APP_URL: "https://app.test", SENDGRID_API_KEY: "sg", EMAIL_FROM: "hi@g.test", ADMIN_EMAILS: "boss@g.test", STRIPE_WEBHOOK_SECRET: "w",
  STRIPE_PRICE_BASIC_MONTHLY: "p_m", STRIPE_PRICE_BASIC_QUARTERLY: "p_q", STRIPE_PRICE_BASIC_SEMIANNUAL: "p_s", STRIPE_PRICE_BASIC_YEARLY: "p_y",
  STRIPE_PRICE_GYM_MONTHLY: "g_m", STRIPE_PRICE_GYM_QUARTERLY: "g_q", STRIPE_PRICE_GYM_SEMIANNUAL: "g_s", STRIPE_PRICE_GYM_YEARLY: "g_y" });
const NOW = new Date("2026-11-10T15:00:00Z");
let T, emails, made, signIns;
beforeEach(() => {
  T = {
    profiles: [
      { id: "u1", email: "priya@x.com", username: "priya_k", full_name: "Priya Kumar", account_type: "parent", subscription_status: "none", created_at: "2026-11-09T00:00:00Z" },
      { id: "u2", email: "gym@x.com", username: "axcel", account_type: "gym", gym_name: "Axcelerate", subscription_status: "none", created_at: "2026-10-01T00:00:00Z" },
      { id: "u3", email: "pay@x.com", username: "payer", account_type: "parent", subscription_status: "active", subscription_tier: "pro", subscription_plan: "quarterly", created_at: "2026-11-01T00:00:00Z" },
      { id: "u4", email: "pay2@x.com", username: "payer2", account_type: "parent", subscription_status: "active", subscription_tier: "pro", subscription_plan: "yearly", club_id: null, created_at: "2026-09-01T00:00:00Z" },
      { id: "u5", email: "trial@x.com", username: "trial", account_type: "parent", subscription_status: "trialing", subscription_plan: "monthly", club_id: "c1", created_at: "2026-11-08T00:00:00Z" },
      { id: "boss", email: "boss@g.test", username: "boss", account_type: "parent", subscription_status: "none", created_at: "2026-08-01T00:00:00Z" },
    ],
    clubs: [{ id: "c1", name: "Axcelerate", code: "AXC-1", plan: "semiannual", seats: 50, active_until: "2027-05-01T00:00:00Z" }],
    support_messages: [{ id: "s1", status: "open" }], gymnasts: [{ id: "g1" }, { id: "g2" }],
  };
  deps._sb = fakeSupabase(T, { tok1: { id: "u1", email: "priya@x.com" }, tok2: { id: "u2", email: "gym@x.com" }, tokB: { id: "boss", email: "boss@g.test" } });
  deps.supabase = () => deps._sb; deps.now = () => NOW;
  signIns = [];
  deps.supabaseAnon = () => ({ auth: { signInWithPassword: async ({ email, password }) => {
    signIns.push(email);
    if (email === "unconfirmed@x.com") return { error: { message: "Email not confirmed" } };
    return password === "Secret123" ? { data: { session: { access_token: "AT", refresh_token: "RT" } } } : { error: { message: "Invalid login credentials" } };
  } } });
  emails = []; made = null;
  deps.fetch = async (url, init) => { if (url.includes("sendgrid")) emails.push(JSON.parse(init.body)); return { ok: true }; };
  deps._stripe = { customers: { create: async () => ({ id: "cus_new" }) }, checkout: { sessions: { create: async (p) => { made = p; return { url: "https://stripe.test/s" }; } } } };
  deps.stripe = () => deps._stripe;
});

test("username check: format, reserved, taken, available", async () => {
  const u = (x) => call(ROUTES["auth/username"], { method: "GET", url: `/api/router?path=auth/username&u=${x}` }).then((r) => r.json);
  assert.equal((await u("ab")).valid, false);
  assert.equal((await u("bad name")).valid, false);
  assert.equal((await u("admin")).available, false);
  assert.equal((await u("Priya_K")).available, false);
  assert.equal((await u("new_family1")).available, true);
});

test("log in with username: right password returns a session; never reveals the email", async () => {
  const r = await call(ROUTES["auth/login"], { body: { identifier: "Priya_K", password: "Secret123" } });
  assert.equal(r.status, 200); assert.equal(r.json.access_token, "AT"); assert.deepEqual(signIns, ["priya@x.com"]);
  assert.ok(!JSON.stringify(r.json).includes("priya@x.com"));
  const wrong = await call(ROUTES["auth/login"], { body: { identifier: "priya_k", password: "nope" } });
  assert.equal(wrong.status, 401); assert.equal(wrong.json.error, "Wrong username or password.");
  const ghost = await call(ROUTES["auth/login"], { body: { identifier: "nobody", password: "x" } });
  assert.equal(ghost.status, 401); assert.equal(ghost.json.error, "Wrong username or password.", "same message for unknown usernames");
  const em = await call(ROUTES["auth/login"], { body: { identifier: "priya@x.com", password: "Secret123" } });
  assert.equal(em.status, 200);
});

test("unconfirmed email gets a clear message", async () => {
  const r = await call(ROUTES["auth/login"], { body: { identifier: "unconfirmed@x.com", password: "Secret123" } });
  assert.equal(r.status, 403); assert.match(r.json.error, /confirm your email/);
});

test("too many wrong passwords are throttled", async () => {
  for (let i = 0; i < 8; i++) await call(ROUTES["auth/login"], { body: { identifier: "payer", password: "bad" }, headers: { "x-forwarded-for": "9.9.9.9" } });
  const r = await call(ROUTES["auth/login"], { body: { identifier: "payer", password: "Secret123" }, headers: { "x-forwarded-for": "9.9.9.9" } });
  assert.equal(r.status, 429);
});

test("forgot username emails it, and answers the same for unknown emails", async () => {
  const a = await call(ROUTES["auth/forgot-username"], { body: { email: "Priya@x.com" }, headers: { "x-forwarded-for": "1.1.1.1" } });
  const b = await call(ROUTES["auth/forgot-username"], { body: { email: "nobody@x.com" }, headers: { "x-forwarded-for": "1.1.1.2" } });
  assert.equal(a.json.message, b.json.message);
  assert.equal(emails.length, 1); assert.match(emails[0].content[1].value, /priya_k/);
});

test("parent checkout: each plan length uses its own price; no extra Stripe trial after the app trial", async () => {
  for (const [plan, price] of [["monthly", "p_m"], ["quarterly", "p_q"], ["semiannual", "p_s"], ["yearly", "p_y"]]) {
    T.profiles[0].subscription_status = "none";
    const r = await call(ROUTES["billing/checkout"], { token: "tok1", body: { plan } });
    assert.equal(r.status, 200); assert.equal(made.line_items[0].price, price); assert.equal(made.subscription_data.metadata.plan, plan);
    assert.equal(made.subscription_data.trial_end, undefined);
  }
});

test("gym checkout: plan length picked, gym name from sign-up used", async () => {
  const r = await call(ROUTES["club/checkout"], { token: "tok2", body: { plan: "semiannual" } });
  assert.equal(r.status, 200); assert.equal(made.line_items[0].price, "g_s");
  assert.equal(made.subscription_data.metadata.club_name, "Axcelerate"); assert.equal(made.subscription_data.metadata.plan, "semiannual");
});

test("webhook stores quarterly and 6-month plans correctly", async () => {
  let evt; deps._stripe.webhooks = { constructEvent: () => evt };
  for (const [count, want] of [[3, "quarterly"], [6, "semiannual"], [1, "monthly"]]) {
    evt = { type: "customer.subscription.updated", data: { object: { status: "active", customer: "c", metadata: { supabase_user_id: "u1" }, current_period_end: 1800000000, items: { data: [{ price: { recurring: { interval: "month", interval_count: count } } }] } } } };
    await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
    assert.equal(T.profiles[0].subscription_plan, want);
  }
});

test("owner dashboard: admins only; revenue math by plan", async () => {
  const no = await call(ROUTES["admin/stats"], { method: "GET", token: "tok1" });
  assert.equal(no.status, 403);
  const r = await call(ROUTES["admin/stats"], { method: "GET", token: "tokB" });
  const j = r.json;
  assert.equal(j.totals.accounts, 6); assert.equal(j.totals.gymOwners, 1);
  assert.equal(j.subscriptions.paying, 2); assert.equal(j.subscriptions.trialing, 1); assert.equal(j.subscriptions.byPlan.quarterly, 1);
  // 42.99/3 + 129/12 + gym 499/6 = 14.33 + 10.75 + 83.17 = 108.25
  assert.equal(j.revenue.mrr, 146, "Pro prices: 107.99/3 + 319/12 + gym"); assert.equal(j.gyms.active, 1); assert.equal(j.gyms.list[0].families, 1);
  assert.equal(j.signups.last7, 2); assert.equal(j.signups.last30, 3); assert.equal(j.support.open, 1);
});
