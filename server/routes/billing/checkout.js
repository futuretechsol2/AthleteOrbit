// Parents pick a plan length (monthly, 3 months, 6 months, yearly) and pay through Stripe Checkout.
import { handler, readJson, requireUser, deps, env, HttpError, isPaid } from "../../lib.js";
import { TERMS, PLANS, TIERS, TIER_ORDER, priceEnv } from "../../../src/data/plans.js";

// kind: "gym" | "basic" | "plus" | "pro" ("parent" = plus). Plus falls back to the older STRIPE_PRICE_PARENT_* names.
export function priceFor(kind, term) {
  if (kind === "parent") kind = "plus";
  const legacy = kind === "plus" ? [priceEnv("parent", term), { monthly: "STRIPE_PRICE_MONTHLY", yearly: "STRIPE_PRICE_YEARLY" }[term]] : kind === "gym" ? [{ yearly: "STRIPE_PRICE_CLUB" }[term]] : [];
  const v = [priceEnv(kind, term), ...legacy].filter(Boolean).map((k) => process.env[k]).find(Boolean);
  if (!v) throw new HttpError(500, `The ${kind === "gym" ? PLANS.gym.name : `AthleteOrbit ${TIERS[kind]?.name || kind}`} ${term} plan isn't set up yet. Please contact support.`);
  return v;
}
// Stripe price id -> our tier (reverse of priceFor).
export function tierFromPrice(priceId) {
  if (!priceId) return null;
  for (const tier of TIER_ORDER) for (const t of TERMS) {
    try { if (priceFor(tier, t.key) === priceId) return tier; } catch {}
  }
  return null;
}

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  if (isPaid(profile) && ["active", "trialing"].includes(profile.subscription_status)) throw new HttpError(409, "You already have a AthleteOrbit plan. Use Change plan to switch.");
  const { plan, tier: askTier } = await readJson(req);
  const term = TERMS.some((t) => t.key === plan) ? plan : "monthly";
  const tier = TIER_ORDER.includes(askTier) ? askTier : "plus";
  const price = priceFor(tier, term);
  const stripe = deps.stripe();
  let customer = profile.stripe_customer_id;
  if (!customer) {
    const c = await stripe.customers.create({ email: user.email, name: profile.full_name || undefined, metadata: { supabase_user_id: user.id, username: profile.username || "" } });
    customer = c.id;
    const up = await deps.supabase().from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
    if (up.error) throw up.error;
  }
  const appUrl = env("APP_URL");
  // The 7-day trial starts at sign-up (no card). Subscribing during it bills only when it ends.
  const end = profile.trial_ends_at ? Math.floor(new Date(profile.trial_ends_at).getTime() / 1000) : 0;
  const trial = end > Math.floor(deps.now().getTime() / 1000) + 3600 ? { trial_end: end } : {};
  const referral = profile.referred_by && !profile.stripe_subscription_id && process.env.STRIPE_REFERRAL_COUPON ? process.env.STRIPE_REFERRAL_COUPON : null;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { ...trial, metadata: { supabase_user_id: user.id, kind: "parent", tier, plan: term } },
    // Referred families get the referral coupon on their first plan (Stripe allows a coupon OR promo codes, not both).
    ...(referral ? { discounts: [{ coupon: referral }] } : { allow_promotion_codes: true }),
    success_url: `${appUrl}/?checkout=success`,
    cancel_url: `${appUrl}/?checkout=cancel`,
  });
  return { url: session.url };
});
