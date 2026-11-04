import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { rewardReferrer } from "../server/routes/billing/webhook.js";

const jwt = (sid) => `h.${Buffer.from(JSON.stringify({ sub: "u1", session_id: sid })).toString("base64url")}.s`;
const A = jwt("sess-A"), B = jwt("sess-B");
let T, balance, mails;
beforeEach(() => {
  process.env.APP_URL = "https://app.test"; delete process.env.SINGLE_SESSION; process.env.STRIPE_PRICE_PLUS_MONTHLY = "pl_m";
  T = {
    profiles: [{ id: "u1", email: "a@x.com", subscription_status: "active", subscription_tier: "plus", referral_code: "AAA111" },
      { id: "u2", email: "b@x.com", subscription_status: "none", referred_by: "AAA111", trial_ends_at: new Date(Date.now() + 86400000).toISOString() },
      { id: "u3", email: "c@x.com", subscription_status: "none", referral_code: "CCC333", trial_ends_at: new Date(Date.now() + 2 * 86400000).toISOString() },
      { id: "u4", email: "d@x.com", subscription_status: "active", referred_by: "CCC333" }],
    gymnasts: [], clubs: [],
  };
  T.profiles[0].stripe_customer_id = "cus_A";
  deps._sb = fakeSupabase(T, { [A]: { id: "u1", email: "a@x.com" }, [B]: { id: "u1", email: "a@x.com" }, t2: { id: "u2", email: "b@x.com" } }); deps.supabase = () => deps._sb;
  balance = []; mails = [];
  deps.stripe = () => ({ customers: { createBalanceTransaction: async (c, p) => { balance.push([c, p]); return {}; }, create: async () => ({ id: "cus_new" }) },
    checkout: { sessions: { create: async (p) => { balance.push(["checkout", p]); return { url: "u" }; } } } });
});

test("one device at a time: newest sign-in wins, older device is told why", async () => {
  let r = await call(ROUTES.me, { token: A, method: "GET" }); assert.equal(r.status, 200); assert.equal(T.profiles[0].active_session, "sess-A");
  r = await call(ROUTES["session/claim"], { token: B }); assert.equal(r.status, 200); assert.equal(T.profiles[0].active_session, "sess-B");
  r = await call(ROUTES.me, { token: A, method: "GET" }); assert.equal(r.status, 401); assert.equal(r.json.code, "signed_in_elsewhere");
  r = await call(ROUTES.me, { token: B, method: "GET" }); assert.equal(r.status, 200);
  process.env.SINGLE_SESSION = "off"; r = await call(ROUTES.me, { token: A, method: "GET" }); assert.equal(r.status, 200, "can be switched off");
});

test("me shows invite code and how many families joined", async () => {
  const r = await call(ROUTES.me, { token: A, method: "GET" });
  assert.equal(r.json.referral_code, "AAA111"); assert.equal(r.json.referrals, 1);
});

test("referred family gets the coupon at checkout; promo codes otherwise", async () => {
  process.env.STRIPE_REFERRAL_COUPON = "REF1MONTH";
  await call(ROUTES["billing/checkout"], { token: "t2", body: { tier: "plus", plan: "monthly" } });
  const made = balance.find((b) => b[0] === "checkout")[1];
  assert.deepEqual(made.discounts, [{ coupon: "REF1MONTH" }]); assert.equal(made.allow_promotion_codes, undefined);
  delete process.env.STRIPE_REFERRAL_COUPON;
});

test("referrer rewarded once: account credit if subscribed, 30 extra trial days if not", async () => {
  T.profiles[1].subscription_status = "active";
  assert.equal(await rewardReferrer(deps._sb, "u2", null), true);
  assert.equal(balance[0][0], "cus_A"); assert.equal(balance[0][1].amount, -1599);
  assert.equal(await rewardReferrer(deps._sb, "u2", null), false, "only once");
  const before = new Date(T.profiles[2].trial_ends_at).getTime();
  assert.equal(await rewardReferrer(deps._sb, "u4", null), true);
  assert.ok(new Date(T.profiles[2].trial_ends_at).getTime() - before >= 29 * 86400000);
});
