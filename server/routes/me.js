import { deps, handler, requireUser, isPaid, trialActive, tierOf, DAILY_LIMITS, emailEnabled, smsEnabled, canSearchWeb } from "../lib.js";
import { isAdmin } from "./admin/support.js";
// Plan status, gym plan, and which features are switched on for this deployment.
export default handler(["GET"], async (req) => {
  const { user, profile } = await requireUser(req);
  let referrals = 0;
  if (profile.referral_code) { const { data } = await deps.supabase().from("profiles").select("id").eq("referred_by", profile.referral_code); referrals = (data || []).length; }
  // Unread counts drive the alert badges: messages from the gym (parents) or from families (gym owners).
  const sb = deps.supabase();
  let unread = 0, owns = null, lastAnnouncement = null;
  const { data: own } = await sb.from("clubs").select("*").eq("owner_id", user.id);
  if (own?.length) {
    const { data: ms } = await sb.from("club_messages").select("id,sender,read_by_gym").eq("club_id", own[0].id);
    unread = (ms || []).filter((m) => m.sender === "family" && !m.read_by_gym).length;
    owns = { name: own[0].name, code: own[0].code, plan: own[0].plan || null, active_until: own[0].active_until };
  } else if (profile.club_id) {
    const { data: ms } = await sb.from("club_messages").select("id,sender,read_by_family").eq("club_id", profile.club_id).eq("family_id", user.id);
    unread = (ms || []).filter((m) => m.sender === "gym" && !m.read_by_family).length;
    const { data: an } = await sb.from("club_announcements").select("*").eq("club_id", profile.club_id).order("created_at", { ascending: false }).limit(1);
    if (an?.[0]) lastAnnouncement = { id: an[0].id, title: an[0].title, summary: an[0].summary || String(an[0].body || "").slice(0, 160), created_at: an[0].created_at };
  }
  return {
    unread_messages: unread, owns_club: owns, last_announcement: lastAnnouncement, web_lookup: canSearchWeb(),
    referral_code: profile.referral_code || null, referrals,
    subscription_status: profile.subscription_status, plan: profile.subscription_plan, username: profile.username, account_type: profile.account_type, gym_name: profile.gym_name, current_period_end: profile.current_period_end,
    pro: isPaid(profile), tier: tierOf(profile), subscription_tier: profile.subscription_tier || null, trial: trialActive(profile), trial_ends_at: profile.trial_ends_at || null, club: profile._club ? { name: profile._club.name, active_until: profile._club.active_until } : null,
    admin: isAdmin(user, profile), email_enabled: emailEnabled(), sms_enabled: smsEnabled(), limits: DAILY_LIMITS,
  };
});
