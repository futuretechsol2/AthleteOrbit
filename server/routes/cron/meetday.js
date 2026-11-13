// Runs early every morning (see vercel.json): on a meet day, each family gets one message per meet with
// when to arrive, directions, unpacked items, a motivation tip and a nutrition tip (AI-personalized on Pro).
import { handler, deps, env, HttpError, sendEmail, sendSms, emailEnabled, smsEnabled, emailLayout, esc, signToken, todayIn } from "../../lib.js";
import { meetDayTips } from "../ai/meetday.js";
import { isMeetDay } from "../../../src/data/meetday.js";

export default handler(["GET", "POST"], async (req) => {
  if (req.headers.authorization !== `Bearer ${env("CRON_SECRET")}`) throw new HttpError(401, "Unauthorized");
  return runMeetDay();
});

export async function runMeetDay() {
  const today = todayIn(), sb = deps.supabase();
  const { data: meets } = await sb.from("meets").select("*").gte("start_date", new Date(Date.parse(`${today}T12:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10));
  const due = (meets || []).filter((m) => isMeetDay(m, today));
  const app = (process.env.APP_URL || "").replace(/\/$/, "");
  let sent = 0;
  for (const m of due) {
    const { data: done } = await sb.from("meetday_sent").select("meet_id").eq("meet_id", m.id).eq("day", today);
    if (done?.length) continue;
    const [{ data: pr }, { data: g }] = await Promise.all([sb.from("profiles").select("*").eq("id", m.user_id).maybeSingle(), sb.from("gymnasts").select("*").eq("id", m.gymnast_id).maybeSingle()]);
    if (!pr || !g || pr.email_reminders === false) continue;
    if (pr.club_id) { const { data: club } = await sb.from("clubs").select("*").eq("id", pr.club_id).maybeSingle(); pr._club = club; }
    const tips = await meetDayTips({ userId: pr.id, profile: pr, g, meet: m });
    const left = (Array.isArray(m.checklist) ? m.checklist : []).filter((i) => !i.done).map((i) => i.text);
    let ticket = null;
    if (m.listing_id) { const { data: l } = await sb.from("meet_listings").select("id,status").eq("id", m.listing_id).maybeSingle(); if (l?.status === "on_sale") ticket = `${app}/tickets/${l.id}?utm_source=meetday`; }
    const subject = `${g.name}'s ${tips.event.toLowerCase()} day: ${m.name}${tips.arrive ? ` — arrive by ${tips.arrive}` : ""}`;
    const unsub = `${app}/api/unsubscribe?u=${pr.id}&t=${signToken(pr.id)}`;
    const body = `<p style="font-size:16px">Good luck today, ${esc(g.name)}! 🌟</p>
<p><b>${esc(m.name)}</b>${m.session_time ? ` · session ${esc(m.session_time)}` : ""}${m.location ? `<br>${esc(m.location)}` : ""}</p>
${tips.arrive ? `<p>⏰ <b>Aim to arrive by ${esc(tips.arrive)}</b> for check-in and warm-ups (use your gym's report time if it's earlier).</p>` : ""}
${tips.maps ? `<p>📍 <a href="${esc(tips.maps)}" style="color:#E5523F">Directions</a></p>` : ""}
${ticket ? `<p>🎟️ <a href="${esc(ticket)}" style="color:#E5523F;font-weight:bold">Buy spectator tickets now and skip the line</a></p>` : ""}
<p>💬 <b>Say this today:</b> ${esc(tips.motivation)}</p>
<p>🍎 <b>Fuel:</b> ${esc(tips.nutrition)}</p>
${tips.focus ? `<p>🎯 <b>Focus cue:</b> ${esc(tips.focus)}</p>` : ""}
${left.length ? `<p>🎒 <b>Still to pack:</b> ${left.map(esc).join(", ")}</p>` : ""}
<p><a href="${esc(app)}/?meet=${esc(m.id)}" style="color:#E5523F;font-weight:bold">Open the meet in AthleteOrbit</a></p>`;
    try {
      if (pr.email && emailEnabled()) await sendEmail({ to: pr.email, subject, html: emailLayout({ title: `It's ${tips.event.toLowerCase()} day!`, body, unsubscribeUrl: unsub }), unsubscribeUrl: unsub });
      if (pr.sms_reminders && pr.phone && smsEnabled()) await sendSms({ to: pr.phone, body: `AthleteOrbit: ${g.name}'s ${tips.event.toLowerCase()} today, ${m.name}${tips.arrive ? `. Arrive by ${tips.arrive}` : ""}. ${tips.motivation} Reply STOP to opt out.` });
      await sb.from("meetday_sent").insert({ meet_id: m.id, user_id: pr.id, day: today });
      sent++;
    } catch (e) { console.error("meet-day message failed", m.id, e.message); }
  }
  return { meets: due.length, sent };
}
