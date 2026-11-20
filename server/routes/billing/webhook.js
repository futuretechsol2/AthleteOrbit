import { fulfillInvoice } from "../gym.js";
import { fulfillMeetPro } from "../org.js";
import { handler, readRaw, deps, env, HttpError, sendEmail, emailLayout, esc } from "../../lib.js";
import crypto from "node:crypto";
import { termFromRecurring, PLANS, TIER_ORDER, TIERS, termLabel } from "../../../src/data/plans.js";
import { tierFromPrice } from "./checkout.js";
import { fulfillTickets } from "../tickets/index.js";
import { fulfillPrints } from "../photos.js";
import { fulfillLivePro } from "../live.js";
import { fulfillAthletePage } from "../athletePage.js";

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
  const out = await processEvent(sb, event);
  // Payment emails (after the order is fulfilled): the family gets a confirmation, support@ gets a copy. Never blocks.
  await paymentEmails(sb, event).catch((e) => console.error("payment email", e.message));
  return out;
});

async function processEvent(sb, event) {
  if (event.type === "checkout.session.completed" && event.data.object?.metadata?.kind === "athlete_page") {
    if (event.data.object.payment_status === "paid") await fulfillAthletePage(event.data.object);
    return { received: true };
  }
  if (event.type === "checkout.session.completed" && event.data.object?.metadata?.kind === "live_pro") {
    if (event.data.object.payment_status === "paid") await fulfillLivePro(event.data.object);
    return { received: true };
  }
  if (event.type === "checkout.session.completed" && event.data.object?.metadata?.kind === "prints") {
    if (event.data.object.payment_status === "paid") await fulfillPrints(event.data.object);
    return { received: true };
  }
  if (event.type === "checkout.session.completed" && event.data.object?.metadata?.kind === "gym_invoice") {
    if (event.data.object.payment_status === "paid") await fulfillInvoice(event.data.object);
    return { received: true };
  }
  if (event.type === "checkout.session.completed" && event.data.object?.metadata?.kind === "meet_pro") {
    if (event.data.object.payment_status === "paid") await fulfillMeetPro(event.data.object);
    return { received: true };
  }
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
    const tier = tierFromPrice(price?.id) || (TIER_ORDER.includes(sub.metadata?.tier) ? sub.metadata.tier : "basic");
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
}

function mapStatus(s) {
  if (s === "active" || s === "trialing") return s;
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "past_due";
  return "canceled";
}

const SEATS = () => Number(process.env.CLUB_SEATS || PLANS.gym.seats);

async function handleClub(sb, type, sub) {
  const periodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
  const live = ["active", "trialing", "past_due"].includes(sub.status) && type !== "customer.subscription.deleted";
  const active_until = live && periodEnd ? new Date(periodEnd * 1000 + 3 * 86400000).toISOString() : deps.now().toISOString();
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
  const tier = TIERS[ref.subscription_tier] ? ref.subscription_tier : "basic";
  if (ref.stripe_customer_id && ["active", "trialing", "past_due"].includes(ref.subscription_status)) {
    await deps.stripe().customers.createBalanceTransaction(ref.stripe_customer_id, { amount: -Math.round(TIERS[tier].prices.monthly * 100), currency: "usd", description: "Referral reward: 1 month free" });
  } else {
    const base = ref.trial_ends_at && new Date(ref.trial_ends_at) > deps.now() ? new Date(ref.trial_ends_at) : deps.now();
    await sb.from("profiles").update({ trial_ends_at: new Date(base.getTime() + 30 * 86400000).toISOString() }).eq("id", ref.id);
  }
  if (ref.email) await sendEmail({ to: ref.email, subject: "You earned a free month of AthleteOrbit 🎉", html: emailLayout({ title: "Thanks for spreading the word!", body: "<p>A family you invited just joined AthleteOrbit, so your next month is on us. Keep sharing your invite link under <b>More &gt; Invite a family</b>.</p>" }) }).catch(() => {});
  return true;
}

// ---------- Payment confirmation emails ----------
const supportInbox = () => process.env.SUPPORT_INBOX_EMAIL || "support@athleteorbit.org";
const usd = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const day = (sec) => new Date(sec * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const KIND_NAMES = { gym_invoice: "Gym tuition / fees", meet_pro: "Meet Pro (12 months)", tickets: "Meet tickets", prints: "Photo prints", live_pro: "Live Scoring Pro", athlete_page: "Recruiting page" };

function planName(meta = {}) {
  if (meta.kind === "club") return `AthleteOrbit for Gyms (${termLabel(meta.plan || "monthly")})`;
  const t = TIERS[meta.tier]; return `AthleteOrbit ${t ? t.name : "plan"}${meta.plan ? ` (${termLabel(meta.plan)})` : ""}`;
}

export async function paymentEmails(sb, event) {
  const o = event.data.object || {};
  if (event.type === "checkout.session.completed") {
    const meta = { ...(o.metadata || {}) };
    const email = o.customer_details?.email || o.customer_email;
    if (o.mode === "subscription") {
      // Subscription details (tier/plan) live on the subscription; the session carries the user id.
      let sub = null; try { if (o.subscription) sub = await deps.stripe().subscriptions.retrieve(o.subscription); } catch {}
      Object.assign(meta, sub?.metadata || {});
      const name = planName(meta), paid = o.payment_status === "paid" && o.amount_total > 0;
      const trialEnd = sub?.trial_end;
      const amount = paid ? usd(o.amount_total) : usd(sub?.items?.data?.[0]?.price?.unit_amount);
      if (email) await sendEmail({ to: email, subject: paid ? `Payment received: ${name}` : `You're subscribed: ${name}`, html: emailLayout({ title: paid ? "Thank you, your payment went through" : "You're all set",
        body: `<p><b>${esc(name)}</b> is now active on your account.</p>${paid ? `<p>Amount paid: <b>${amount}</b></p>` : `<p>Your free trial continues${trialEnd ? ` until <b>${day(trialEnd)}</b>` : ""}. Your first payment of <b>${amount}</b> is taken${trialEnd ? " then" : " at the end of the trial"}, and we'll email you a confirmation.</p>`}
<p>Manage or cancel any time in the app under <b>More &gt; Account &gt; Manage plan</b>.</p><p style="font-size:13px;color:#7B8197">Questions? Just reply to this email.</p>` }) });
      await sendEmail({ to: supportInbox(), replyTo: email || undefined, subject: `${paid ? "💰 New payment" : "🆕 New subscriber (trial)"}: ${name}${paid ? ` ${amount}` : ""} · ${email || "unknown email"}`, html: emailLayout({ title: paid ? "New payment" : "New subscriber",
        body: `<p><b>${esc(email || "unknown")}</b> subscribed to <b>${esc(name)}</b>.</p><p>${paid ? `Paid now: <b>${amount}</b>` : `First charge ${amount}${trialEnd ? ` on ${day(trialEnd)}` : " when the trial ends"}`}</p><p>Stripe customer: ${esc(o.customer || "")}</p>` }) });
      return;
    }
    if (o.payment_status !== "paid") return;
    const what = KIND_NAMES[meta.kind] || "Purchase", amount = usd(o.amount_total);
    // Tickets and prints already send their own confirmation with the details; the others get a receipt here.
    if (email && ["live_pro", "athlete_page", "gym_invoice", "meet_pro"].includes(meta.kind)) await sendEmail({ to: email, subject: `Payment received: ${what}`, html: emailLayout({ title: "Thank you, your payment went through", body: `<p><b>${esc(what)}</b>: <b>${amount}</b></p><p style="font-size:13px;color:#7B8197">Questions? Just reply to this email.</p>` }) });
    await sendEmail({ to: supportInbox(), replyTo: email || undefined, subject: `💰 New payment: ${what} ${amount} · ${email || "unknown email"}`, html: emailLayout({ title: "New payment", body: `<p><b>${esc(email || "unknown")}</b> paid <b>${amount}</b> for <b>${esc(what)}</b>.</p>` }) });
    return;
  }
  // Renewals and the first charge after a trial. (The very first charge without a trial was confirmed at checkout.)
  if (event.type === "invoice.paid" && o.amount_paid > 0 && o.billing_reason !== "subscription_create") {
    const meta = o.subscription_details?.metadata || o.parent?.subscription_details?.metadata || {};
    let email = o.customer_email;
    if (!email && o.customer) { const { data: p } = await sb.from("profiles").select("email").eq("stripe_customer_id", o.customer).maybeSingle(); email = p?.email; }
    const name = planName(meta), amount = usd(o.amount_paid);
    if (email) await sendEmail({ to: email, subject: `Payment received: ${name}`, html: emailLayout({ title: "Thank you, your payment went through",
      body: `<p><b>${esc(name)}</b>: <b>${amount}</b></p>${o.hosted_invoice_url ? `<p><a href="${esc(o.hosted_invoice_url)}" style="color:#6D28D9;font-weight:bold">View your receipt</a></p>` : ""}<p>Manage or cancel any time in the app under <b>More &gt; Account &gt; Manage plan</b>.</p>` }) });
    await sendEmail({ to: supportInbox(), replyTo: email || undefined, subject: `💰 ${o.billing_reason === "subscription_cycle" ? "Renewal" : "Payment"}: ${name} ${amount} · ${email || "unknown email"}`, html: emailLayout({ title: "Payment received", body: `<p><b>${esc(email || "unknown")}</b> paid <b>${amount}</b> for <b>${esc(name)}</b>.</p>` }) });
  }
}
