#!/usr/bin/env node
// One-command Stripe setup for AthleteOrbit. Safe to run again: it reuses what already exists.
//
//   STRIPE_SECRET_KEY=sk_test_... APP_URL=https://athleteorbit.app node scripts/setup-stripe.mjs
//
// Creates: Basic / Plus / Pro (4 plan lengths each) + gym plans, the referral coupon, the
// "FOUNDING" promo code, the webhook, and the customer portal (cancel, switch plan, cards, invoices).
// Writes every setting into stripe-settings.env — paste that file into Vercel → Settings → Environment Variables.
import Stripe from "stripe";
import crypto from "node:crypto";
import fs from "node:fs";
import { TIERS, PLANS, TERMS } from "../src/data/plans.js";

const MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
const recurring = (term) => (term === "yearly" ? { interval: "year", interval_count: 1 } : { interval: "month", interval_count: MONTHS[term] });
export const WEBHOOK_EVENTS = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "checkout.session.completed"];

async function product(stripe, id, name, description) {
  try { const p = await stripe.products.retrieve(id); if (p.active === false) await stripe.products.update(id, { active: true }); return p; }
  catch { return stripe.products.create({ id, name, description }); }
}
async function price(stripe, productId, lookup_key, amount, term) {
  const unit_amount = Math.round(amount * 100);
  const { data } = await stripe.prices.list({ lookup_keys: [lookup_key], limit: 1 });
  const p = data[0];
  const r = recurring(term);
  if (p && p.unit_amount === unit_amount && p.recurring?.interval === r.interval && (p.recurring?.interval_count || 1) === r.interval_count) return p;
  return stripe.prices.create({ product: productId, currency: "usd", unit_amount, recurring: r, lookup_key, transfer_lookup_key: true, nickname: lookup_key });
}

export async function setupStripe(stripe, { appUrl, log = () => {} }) {
  const env = {}, notes = [];
  const prods = {};
  for (const [tier, t] of Object.entries(TIERS)) {
    prods[tier] = await product(stripe, `ao_${tier}`, `AthleteOrbit ${t.name}`, t.tagline);
    for (const { key } of TERMS) {
      const p = await price(stripe, prods[tier].id, `ao_${tier}_${key}`, t.prices[key], key);
      env[`STRIPE_PRICE_${tier.toUpperCase()}_${key.toUpperCase()}`] = p.id;
    }
    log(`✓ ${t.name}: 4 plan lengths`);
  }
  prods.gym = await product(stripe, "ao_gym", "AthleteOrbit for Gyms", "Plus for up to 50 families");
  for (const { key } of TERMS) env[`STRIPE_PRICE_GYM_${key.toUpperCase()}`] = (await price(stripe, prods.gym.id, `ao_gym_${key}`, PLANS.gym.prices[key], key)).id;
  log("✓ Gym plans: 4 plan lengths");

  // Invited families: first month free (applied automatically at checkout).
  try { await stripe.coupons.retrieve("AO_REFERRAL"); } catch { await stripe.coupons.create({ id: "AO_REFERRAL", percent_off: 100, duration: "once", name: "Invited by a friend: first month free" }); }
  env.STRIPE_REFERRAL_COUPON = "AO_REFERRAL";
  // Founding families: Plus for $9.99/month for life — first 25 families who type FOUNDING at checkout.
  try { await stripe.coupons.retrieve("AO_FOUNDING"); } catch { await stripe.coupons.create({ id: "AO_FOUNDING", amount_off: 600, currency: "usd", duration: "forever", name: "Founding family", applies_to: { products: [prods.plus.id] } }); }
  const promo = await stripe.promotionCodes.list({ code: "FOUNDING", limit: 1 });
  if (!promo.data.length) await stripe.promotionCodes.create({ coupon: "AO_FOUNDING", code: "FOUNDING", max_redemptions: 25 });
  log("✓ Coupons: AO_REFERRAL, promo code FOUNDING (25 uses)");

  // Webhook: subscriptions + ticket sales.
  const url = `${appUrl.replace(/\/$/, "")}/api/billing/webhook`;
  const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = hooks.data.find((h) => h.url === url);
  if (existing) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: WEBHOOK_EVENTS, disabled: false });
    notes.push("The webhook already existed, so Stripe won't show its secret again. If STRIPE_WEBHOOK_SECRET isn't set in Vercel yet: Stripe → Developers → Webhooks → your endpoint → Signing secret → Reveal (or Roll).");
  } else {
    const h = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: "AthleteOrbit" });
    env.STRIPE_WEBHOOK_SECRET = h.secret;
  }
  log(`✓ Webhook → ${url}`);

  // Customer portal: cancel at period end, switch plan or plan length, update card, invoices.
  const portal = { business_profile: { headline: "AthleteOrbit — manage your plan" }, default_return_url: appUrl, metadata: { app: "athleteorbit" },
    features: { customer_update: { enabled: true, allowed_updates: ["email", "address"] }, invoice_history: { enabled: true }, payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations",
        products: Object.keys(TIERS).map((tier) => ({ product: prods[tier].id, prices: TERMS.map(({ key }) => env[`STRIPE_PRICE_${tier.toUpperCase()}_${key.toUpperCase()}`]) })) } } };
  const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
  const mine = configs.data.find((c) => c.metadata?.app === "athleteorbit");
  const cfg = mine ? await stripe.billingPortal.configurations.update(mine.id, portal) : await stripe.billingPortal.configurations.create(portal);
  env.STRIPE_PORTAL_CONFIG = cfg.id;
  log("✓ Customer portal");

  env.APP_URL = appUrl; env.VITE_APP_URL = appUrl;
  env.CRON_SECRET = crypto.randomBytes(24).toString("hex");
  env.LINK_SECRET = crypto.randomBytes(24).toString("hex");
  return { env, notes };
}

// ---- command line ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.STRIPE_SECRET_KEY, appUrl = process.env.APP_URL;
  if (!key || !/^sk_(test|live)_/.test(key) || !appUrl || !/^https:\/\//.test(appUrl)) {
    console.error("Usage: STRIPE_SECRET_KEY=sk_test_... APP_URL=https://yourdomain.com node scripts/setup-stripe.mjs");
    process.exit(1);
  }
  const live = key.startsWith("sk_live_");
  console.log(`\nSetting up Stripe in ${live ? "LIVE" : "TEST"} mode for ${appUrl}\n`);
  try {
    const { env, notes } = await setupStripe(new Stripe(key), { appUrl, log: console.log });
    const out = Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
    fs.writeFileSync("stripe-settings.env", out, { mode: 0o600 });
    console.log(`\nDone. ${Object.keys(env).length} settings written to stripe-settings.env`);
    console.log("Next: Vercel → your project → Settings → Environment Variables → paste the file's contents → Save → Redeploy.");
    console.log("Keep this file private and delete it after pasting. (CRON_SECRET and LINK_SECRET are new random values: only paste them the first time.)");
    for (const n of notes) console.log(`\nNote: ${n}`);
    if (!live) console.log("\nThis was TEST mode. When everything works, run it again with your sk_live_ key.");
  } catch (e) { console.error(`\nStripe said: ${e.message}`); process.exit(1); }
}
