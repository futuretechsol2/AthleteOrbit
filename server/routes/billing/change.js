// Switch an existing family subscription to another tier and/or plan length (upgrade or downgrade), prorated by Stripe.
import { handler, readJson, requireUser, deps, HttpError } from "../../lib.js";
import { TERMS, TIER_ORDER, normTier } from "../../../src/data/plans.js";
import { priceFor } from "./checkout.js";

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const { tier, plan } = await readJson(req);
  if (!TIER_ORDER.includes(tier)) throw new HttpError(400, "Pick Solo, Basic or Pro.");
  if (tier === "solo") {
    const { data: kids } = await deps.supabase().from("gymnasts").select("id").eq("user_id", user.id);
    if ((kids || []).length > 1) throw new HttpError(409, `Solo covers 1 athlete and you have ${kids.length}. Remove the extra athletes first, or stay on Basic.`);
  }
  const term = TERMS.some((t) => t.key === plan) ? plan : profile.subscription_plan || "monthly";
  if (!["active", "trialing", "past_due"].includes(profile.subscription_status) || !profile.stripe_subscription_id) throw new HttpError(409, "No active plan to change. Choose a plan first.");
  const stripe = deps.stripe();
  const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
  const item = sub.items?.data?.[0];
  if (!item) throw new HttpError(409, "Couldn't find your plan. Please contact support.");
  const price = priceFor(tier, term);
  const up = TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(normTier(profile.subscription_tier) || "basic");
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price }],
    proration_behavior: up ? "always_invoice" : "create_prorations",
    metadata: { ...(sub.metadata || {}), tier, plan: term },
  });
  // Unlock right away; the webhook confirms shortly after.
  await deps.supabase().from("profiles").update({ subscription_tier: tier, subscription_plan: term }).eq("id", user.id);
  return { tier, plan: term };
});
