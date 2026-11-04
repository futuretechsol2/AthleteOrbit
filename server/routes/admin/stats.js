// Owner dashboard numbers: sign-ups, paying families by plan, gyms, revenue estimate, open support.
import { handler, requireUser, deps, HttpError } from "../../lib.js";
import { isAdmin } from "./support.js";
import { PLANS, TERMS, TIERS, TIER_ORDER } from "../../../src/data/plans.js";

export default handler(["GET"], async (req) => {
  const { user, profile } = await requireUser(req);
  if (!isAdmin(user, profile)) throw new HttpError(403, "Team members only.");
  const sb = deps.supabase();
  const [{ data: profiles }, { data: clubs }, { count: openSupport }, { count: children }] = await Promise.all([
    sb.from("profiles").select("id,email,username,full_name,account_type,subscription_status,subscription_plan,subscription_tier,club_id,created_at,signup_source,referred_by,trial_ends_at").order("created_at", { ascending: false }).limit(10000),
    sb.from("clubs").select("id,name,code,plan,seats,active_until,created_at"),
    sb.from("support_messages").select("id", { count: "exact", head: true }).eq("status", "open"),
    sb.from("gymnasts").select("id", { count: "exact", head: true }),
  ]);
  const P = profiles || [], C = clubs || [];
  const now = deps.now().getTime(), day = 86400000;
  const months = Object.fromEntries(TERMS.map((t) => [t.key, t.months]));
  const paying = P.filter((p) => p.subscription_status === "active");
  const trialing = P.filter((p) => p.subscription_status === "trialing");
  const byPlan = Object.fromEntries(TERMS.map((t) => [t.key, paying.filter((p) => (p.subscription_plan || "monthly") === t.key).length]));
  const activeClubs = C.filter((c) => c.active_until && new Date(c.active_until).getTime() > now);
  const gymByPlan = Object.fromEntries(TERMS.map((t) => [t.key, activeClubs.filter((c) => (c.plan || "yearly") === t.key).length]));
  const mrrParents = paying.reduce((a, p) => { const t = p.subscription_plan || "monthly"; const tier = TIERS[p.subscription_tier] || TIERS.plus; return a + tier.prices[t] / months[t]; }, 0);
  const byTier = Object.fromEntries(TIER_ORDER.map((k) => [k, paying.filter((p) => (p.subscription_tier || "plus") === k).length]));
  const recent30 = P.filter((p) => now - new Date(p.created_at).getTime() < 30 * day);
  const sources = {};
  for (const p of recent30) { const k = (p.signup_source || (p.referred_by ? "referral" : "direct")).split("/")[0].trim().toLowerCase() || "direct"; sources[k] = (sources[k] || 0) + 1; }
  const parents = P.filter((p) => p.account_type !== "gym");
  const inTrial = parents.filter((p) => p.subscription_status === "none" && p.trial_ends_at && new Date(p.trial_ends_at).getTime() > now).length;
  const trialEnded = parents.filter((p) => p.trial_ends_at && new Date(p.trial_ends_at).getTime() <= now);
  const converted = trialEnded.filter((p) => ["active", "trialing", "past_due"].includes(p.subscription_status) || p.club_id).length;
  const mrrGyms = activeClubs.reduce((a, c) => { const t = c.plan || "yearly"; return a + PLANS.gym.prices[t] / months[t]; }, 0);
  const since = (d) => P.filter((p) => now - new Date(p.created_at).getTime() < d * day).length;
  return {
    totals: { accounts: P.length, parents: P.filter((p) => p.account_type !== "gym").length, gymOwners: P.filter((p) => p.account_type === "gym").length, children: children || 0 },
    signups: { last7: since(7), last30: since(30) },
    subscriptions: { paying: paying.length, trialing: trialing.length + inTrial, byTier, trialConversion: trialEnded.length ? Math.round((converted / trialEnded.length) * 100) : null, pastDue: P.filter((p) => p.subscription_status === "past_due").length, byPlan, viaGym: P.filter((p) => p.club_id).length },
    gyms: { active: activeClubs.length, byPlan: gymByPlan, list: activeClubs.map((c) => ({ name: c.name, code: c.code, plan: c.plan, families: P.filter((p) => p.club_id === c.id).length, seats: c.seats })) },
    revenue: { mrr: Math.round(mrrParents + mrrGyms), arr: Math.round((mrrParents + mrrGyms) * 12), fromParents: Math.round(mrrParents), fromGyms: Math.round(mrrGyms) },
    support: { open: openSupport || 0 },
    marketing: { sources, referrals: P.filter((p) => p.referred_by).length },
    recent: P.slice(0, 15).map((p) => ({ name: p.full_name, username: p.username, email: p.email, type: p.account_type, status: p.subscription_status, plan: p.subscription_plan, created_at: p.created_at })),
  };
});
