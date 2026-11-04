import { deps, handler, requireUser, isPaid, trialActive, tierOf, DAILY_LIMITS, emailEnabled, smsEnabled } from "../lib.js";
import { isAdmin } from "./admin/support.js";
// Plan status, gym plan, and which features are switched on for this deployment.
export default handler(["GET"], async (req) => {
  const { user, profile } = await requireUser(req);
  let referrals = 0;
  if (profile.referral_code) { const { data } = await deps.supabase().from("profiles").select("id").eq("referred_by", profile.referral_code); referrals = (data || []).length; }
  return {
    referral_code: profile.referral_code || null, referrals,
    subscription_status: profile.subscription_status, plan: profile.subscription_plan, username: profile.username, account_type: profile.account_type, gym_name: profile.gym_name, current_period_end: profile.current_period_end,
    pro: isPaid(profile), tier: tierOf(profile), subscription_tier: profile.subscription_tier || null, trial: trialActive(profile), trial_ends_at: profile.trial_ends_at || null, club: profile._club ? { name: profile._club.name, active_until: profile._club.active_until } : null,
    admin: isAdmin(user, profile), email_enabled: emailEnabled(), sms_enabled: smsEnabled(), limits: DAILY_LIMITS,
  };
});
