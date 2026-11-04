import { handler, readRaw, deps, env, HttpError, sendEmail, emailLayout, esc } from "../../lib.js";
import crypto from "node:crypto";
import { termFromRecurring, PLANS, TIER_ORDER, TIERS } from "../../../src/data/plans.js";
import { tierFromPrice } from "./checkout.js";
import { fulfillTickets } from "../tickets/index.js";

export const config = { api: { bodyParser: false } };

// Stripe tells us when a subscription starts, renews, fails or ends; we mirror it on the profile.
export default handler(["POST"], async (req) => {
  const raw = await readRaw(req);
  let event;
  try {
    event = deps.stripe().webhooks.constructEvent(raw, req.headers["stripe-signature"], env("STRIPE_WEBHOOK_SECRET"));
  } catch {
    throw new HttpError(400, "Invalid signature");
  }
  const sb = deps.supabase();
  if (event.type === "checkout.session.completed" && event.data.object?.metadata?.kind === "tickets") {
    if (event.data.object.payment_status === "paid") await fulfillTickets(event.data.object);
    return { received: true };
  }
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const sub = event.data.object;
    if (sub.metadata?.kind === "club") { await handleClub(sb, event.type, sub); return { received: true }; }
    const status = event.type === "customer.subscription.deleted" ? "canceled" : mapStatus(sub.status);
    const term = termFromRecurring(sub.items?.data?.[0]?.price?.recurring);
    const periodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
    const price = sub.items?.data?.[0]?.price;
    const tier = tierFromPrice(price?.id) || (TIER_ORDER.includes(sub.metadata?.tier) ? sub.metadata.tier : "plus");
    const patch = {
      subscription_status: status,
      subscription_tier: tier,
      stripe_subscription_id: sub.id,
      subscription_plan: term,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    };
    const userId = sub.metadata?.supabase_user_id;
    const q = userId ? sb.from("profiles").update(patch).eq("id", userId) : sb.from("profiles").update(patch).eq("stripe_customer_id", sub.customer);
    const { error } = await q;
    if (error) throw error;
    if (status === "active") await rewardReferrer(sb, userId, sub.customer).catch((e) => console.error("referral reward failed", e.message));
  }
  return { received: true };
});

function mapStatus(s) {
  if (s === "active" || s === "trialing") return s;
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "past_due";
  return "canceled";
}

const SEATS = () => Number(process.env.CLUB_SEATS || PLANS.gym.seats);

async function handleClub(sb, type, sub) {
  const periodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
  const live = ["active", "trialing", "past_due"].includes(sub.status) && type !== "customer.subscription.deleted";
  const active_until = live && periodEnd ? new Date(periodEnd * 1000 + 3 * 86400000).toISOString() : new Date().toISOString();
  const { data: existing } = await sb.from("clubs").select("*").eq("stripe_subscription_id", sub.id).maybeSingle();
  if (existing) {
    const { error } = await sb.from("clubs").update({ active_until, plan: termFromRecurring(sub.items?.data?.[0]?.price?.recurring) || existing.plan }).eq("id", existing.id);
    if (error) throw error;
    return;
  }
  if (!live) return;
  const name = sub.metadata.club_name || "Gym";
  const code = `${name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase() || "GYM"}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const owner = sub.metadata.supabase_user_id || null;
  const plan = sub.metadata.plan || termFromRecurring(sub.items?.data?.[0]?.price?.recurring);
  const { error } = await sb.from("clubs").insert({ name, code, owner_id: owner, seats: SEATS(), active_until, plan, stripe_customer_id: sub.customer, stripe_subscription_id: sub.id });
  if (error) throw error;
  const { data: prof } = owner ? await sb.from("profiles").select("email").eq("id", owner).maybeSingle() : { data: null };
  if (prof?.email) {
    const app = process.env.APP_URL || "";
    await sendEmail({ to: prof.email, subject: `Your AthleteOrbit gym code: ${code}`, html: emailLayout({ title: `${name} is on AthleteOrbit Pro`,
      body: `<p>Share this code with your families. Each family signs up free, then enters the code under <b>More &gt; Gym code</b> to unlock Pro.</p>
<p style="font:700 28px Georgia,serif;letter-spacing:2px;margin:16px 0">${esc(code)}</p>
<p>Up to ${SEATS()} families. Sign up link to share: <a href="${esc(app)}/?gym=${esc(code)}">${esc(app)}/?gym=${esc(code)}</a></p>` }) }).catch(() => {});
  }
}

// Give a month, get a month: when a referred family's first paid period starts, the family that invited them
// gets one month of their own plan as account credit (or 30 more trial days if they haven't subscribed yet).
export async function rewardReferrer(sb, userId, customer) {
  const { data: me } = userId ? await sb.from("profiles").select("*").eq("id", userId).maybeSingle() : await sb.from("profiles").select("*").eq("stripe_customer_id", customer).maybeSingle();
  if (!me?.referred_by || me.referral_rewarded) return false;
  const { data: list } = await sb.from("profiles").select("*").eq("referral_code", me.referred_by);
  const ref = (list || [])[0];
  await sb.from("profiles").update({ referral_rewarded: true }).eq("id", me.id);
  if (!ref || ref.id === me.id) return false;
  const tier = TIERS[ref.subscription_tier] ? ref.subscription_tier : "plus";
  if (ref.stripe_customer_id && ["active", "trialing", "past_due"].includes(ref.subscription_status)) {
    await deps.stripe().customers.createBalanceTransaction(ref.stripe_customer_id, { amount: -Math.round(TIERS[tier].prices.monthly * 100), currency: "usd", description: "Referral reward: 1 month free" });
  } else {
    const base = ref.trial_ends_at && new Date(ref.trial_ends_at) > deps.now() ? new Date(ref.trial_ends_at) : deps.now();
    await sb.from("profiles").update({ trial_ends_at: new Date(base.getTime() + 30 * 86400000).toISOString() }).eq("id", ref.id);
  }
  if (ref.email) await sendEmail({ to: ref.email, subject: "You earned a free month of AthleteOrbit 🎉", html: emailLayout({ title: "Thanks for spreading the word!", body: "<p>A family you invited just joined AthleteOrbit, so your next month is on us. Keep sharing your invite link under <b>More &gt; Invite a family</b>.</p>" }) }).catch(() => {});
  return true;
}
