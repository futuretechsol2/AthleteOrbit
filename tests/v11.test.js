import { test } from "node:test";
import assert from "node:assert/strict";
import { setupStripe, WEBHOOK_EVENTS } from "../scripts/setup-stripe.mjs";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";

// In-memory Stripe with just what the setup script uses.
function fakeStripe() {
  const S = { products: {}, prices: [], coupons: {}, promos: [], hooks: [], portals: [] }; let n = 0;
  const nf = () => Object.assign(new Error("No such object"), { statusCode: 404 });
  return { S, stripe: {
    products: { retrieve: async (id) => { if (!S.products[id]) throw nf(); return S.products[id]; }, create: async (p) => (S.products[p.id] = { ...p, active: true }), update: async (id, p) => Object.assign(S.products[id], p) },
    prices: { list: async ({ lookup_keys }) => ({ data: S.prices.filter((p) => lookup_keys.includes(p.lookup_key)) }),
      create: async (p) => { if (p.transfer_lookup_key) S.prices.forEach((x) => { if (x.lookup_key === p.lookup_key) x.lookup_key = null; }); const x = { ...p, id: `price_${++n}` }; S.prices.push(x); return x; } },
    coupons: { retrieve: async (id) => { if (!S.coupons[id]) throw nf(); return S.coupons[id]; }, create: async (c) => (S.coupons[c.id] = c) },
    promotionCodes: { list: async ({ code }) => ({ data: S.promos.filter((p) => p.code === code) }), create: async (p) => (S.promos.push(p), p) },
    webhookEndpoints: { list: async () => ({ data: S.hooks }), create: async (h) => { const x = { ...h, id: `we_${++n}`, secret: "whsec_abc" }; S.hooks.push(x); return x; }, update: async (id, p) => Object.assign(S.hooks.find((h) => h.id === id), p) },
    billingPortal: { configurations: { list: async () => ({ data: S.portals }), create: async (c) => { const x = { ...c, id: `bpc_${++n}` }; S.portals.push(x); return x; }, update: async (id, c) => Object.assign(S.portals.find((p) => p.id === id), c) } },
  } };
}

test("Stripe setup creates every plan price, coupons, webhook and portal — and is safe to run twice", async () => {
  const { S, stripe } = fakeStripe();
  const a = await setupStripe(stripe, { appUrl: "https://athleteorbit.app" });
  assert.equal(S.prices.length, 16); assert.equal(Object.keys(S.products).length, 4);
  const plusYear = S.prices.find((p) => p.lookup_key === "ao_plus_yearly"); assert.equal(plusYear.unit_amount, 12900); assert.deepEqual(plusYear.recurring, { interval: "year", interval_count: 1 });
  assert.deepEqual(S.prices.find((p) => p.lookup_key === "ao_pro_quarterly").recurring, { interval: "month", interval_count: 3 });
  assert.equal(a.env.STRIPE_PRICE_BASIC_MONTHLY, S.prices.find((p) => p.lookup_key === "ao_basic_monthly").id);
  assert.equal(a.env.STRIPE_WEBHOOK_SECRET, "whsec_abc"); assert.equal(S.hooks[0].url, "https://athleteorbit.app/api/billing/webhook"); assert.deepEqual(S.hooks[0].enabled_events, WEBHOOK_EVENTS);
  assert.equal(S.coupons.AO_REFERRAL.percent_off, 100); assert.equal(S.promos[0].code, "FOUNDING"); assert.equal(S.promos[0].max_redemptions, 25);
  assert.equal(S.portals[0].features.subscription_update.products.length, 3);
  assert.ok(a.env.CRON_SECRET.length >= 40 && a.env.LINK_SECRET !== a.env.CRON_SECRET);
  const b = await setupStripe(stripe, { appUrl: "https://athleteorbit.app" });
  assert.equal(S.prices.length, 16, "no duplicate prices"); assert.equal(S.hooks.length, 1); assert.equal(S.portals.length, 1); assert.equal(S.promos.length, 1);
  assert.equal(b.env.STRIPE_PRICE_BASIC_MONTHLY, a.env.STRIPE_PRICE_BASIC_MONTHLY); assert.equal(b.env.STRIPE_WEBHOOK_SECRET, undefined); assert.match(b.notes[0], /Signing secret/);
});

test("health check lists missing setting names (never values) and schema status", async () => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (/^(STRIPE|SUPABASE|VITE_|SENDGRID|EMAIL_FROM|BUSINESS|ADMIN_EMAILS|CRON_SECRET|LINK_SECRET|APP_URL|ANTHROPIC|OPENAI)/.test(k)) delete process.env[k];
  process.env.STRIPE_SECRET_KEY = "sk_test_123"; process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "srv";
  deps.supabase = () => fakeSupabase({ profiles: [], meet_listings: [] }, {});
  const r = await call(ROUTES.health, { method: "GET" });
  assert.equal(r.status, 200); assert.equal(r.json.ok, false); assert.equal(r.json.checks.stripeMode, "test"); assert.equal(r.json.checks.schemaUpToDate, true);
  assert.ok(r.json.missing.includes("STRIPE_PRICE_PRO_YEARLY")); assert.ok(r.json.missing.includes("ANTHROPIC_API_KEY (or OPENAI_API_KEY)"));
  assert.doesNotMatch(JSON.stringify(r.json), /sk_test_123|srv/);
  process.env = saved;
});
