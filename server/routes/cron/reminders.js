// Runs once a day (see vercel.json "crons"). Sends meet and entry-deadline reminders.
import { tierOf } from "../../lib.js";
import { hasFeature } from "../../../src/data/plans.js";
import { allowedUrl, fetchPage, extractScores } from "../scores/online.js";
import { notifyListing } from "../tickets/index.js";
import { handler, deps, env, HttpError, sendEmail, sendSms, emailEnabled, smsEnabled, emailLayout, esc, signToken, todayIn, addDays, prettyDate } from "../../lib.js";
import { travelLinks, tripDates } from "../../../src/data/travel.js";
import { seasonOf, budgetStatus } from "../../../src/data/family.js";

import { runLookups } from "../club/center.js";
export const MEET_DAYS = [14, 7, 2, 1];
export const DEADLINE_DAYS = [7, 2];

export default handler(["GET", "POST"], async (req) => {
  if (req.headers.authorization !== `Bearer ${env("CRON_SECRET")}`) throw new HttpError(401, "Unauthorized");
  const reminders = await runReminders();
  const digest = await runDigest();
  const scores = await runAutoScores().catch((e) => ({ error: e.message }));
  const trial = await runTrialNotices().catch((e) => ({ error: e.message }));
  const tickets = await runListingNotices().catch((e) => ({ error: e.message }));
  // Last, with whatever time is left: find hosts, websites and session times online for upcoming competitions.
  const lookups = await runLookups({ max: 3, budgetMs: 35000 }).catch((e) => ({ error: e.message }));
  return { ...reminders, digest, scores, trial, tickets, lookups };
});

// Mondays: one email per family listing unpaid fees and budgets that are nearly used up.
export async function runDigest({ force = false } = {}) {
  const today = todayIn();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (weekday !== 1 && !force) return { skipped: "not Monday" };
  const sb = deps.supabase();
  const [{ data: unpaid }, { data: budgets }, { data: done }] = await Promise.all([
    sb.from("costs").select("*").eq("paid", false),
    sb.from("budgets").select("*").eq("season", seasonOf(today)),
    sb.from("digests_sent").select("user_id").eq("week", today),
  ]);
  const sent = new Set((done || []).map((d) => d.user_id));
  const users = new Set([...(unpaid || []).map((c) => c.user_id), ...(budgets || []).map((b) => b.user_id)]);
  let count = 0;
  for (const uid of users) {
    if (sent.has(uid)) continue;
    const { data: pr } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (!pr?.email || pr.email_reminders === false || !emailEnabled()) continue;
    const mine = (unpaid || []).filter((c) => c.user_id === uid);
    let over = [];
    const myBudgets = (budgets || []).filter((b) => b.user_id === uid);
    if (myBudgets.length) {
      const { data: costs } = await sb.from("costs").select("*").eq("user_id", uid);
      over = budgetStatus(myBudgets, costs || [], seasonOf(today)).filter((b) => b.pct >= 0.9);
    }
    if (!mine.length && !over.length) continue;
    const { data: kids } = await sb.from("gymnasts").select("id,name").eq("user_id", uid);
    const nm = (id) => (kids || []).find((k) => k.id === id)?.name || "Family";
    const $ = (n) => `$${Math.round(Number(n)).toLocaleString("en-US")}`;
    const total = mine.reduce((a, c) => a + Number(c.amount), 0);
    const app = (process.env.APP_URL || "").replace(/\/$/, "");
    const unsub = `${app}/api/unsubscribe?u=${uid}&t=${signToken(uid)}`;
    const body = (mine.length ? `<p><b>${$(total)} unpaid</b></p><ul style="padding-left:18px">${mine.map((c) => `<li>${esc(c.description || c.category)} · ${esc(nm(c.gymnast_id))} · ${$(c.amount)}</li>`).join("")}</ul>` : "") +
      (over.length ? `<p><b>Budgets almost used</b></p><ul style="padding-left:18px">${over.map((b) => `<li>${esc(b.gymnast_id ? nm(b.gymnast_id) : "Family")} ${esc(b.category || "total")}: ${$(b.spent)} of ${$(b.amount)} (${Math.round(b.pct * 100)}%)</li>`).join("")}</ul>` : "") +
      `<p><a href="${esc(app)}/?page=costs" style="color:#E5523F;font-weight:bold">Open costs</a></p>`;
    const subject = mine.length ? `Weekly check: ${$(total)} in unpaid sports fees` : "Weekly check: a sports budget is almost used";
    try {
      await sendEmail({ to: pr.email, subject, html: emailLayout({ title: subject, body, unsubscribeUrl: unsub }), unsubscribeUrl: unsub });
      await sb.from("digests_sent").insert({ user_id: uid, week: today });
      count++;
    } catch (e) { console.error("digest failed", uid, e.message); }
  }
  return { sent: count };
}

export async function runReminders() {
  const sb = deps.supabase();
  const today = todayIn();
  const meetDates = MEET_DAYS.map((n) => addDays(today, n));
  const deadlineDates = DEADLINE_DAYS.map((n) => addDays(today, n));
  const [a, b] = await Promise.all([
    sb.from("meets").select("*").in("start_date", meetDates),
    sb.from("meets").select("*").in("entry_deadline", deadlineDates).eq("status", "Planned"),
  ]);
  if (a.error) throw a.error; if (b.error) throw b.error;

  const jobs = [];
  for (const m of a.data || []) if (!["Skipped", "Completed"].includes(m.status)) jobs.push({ m, kind: `meet-${MEET_DAYS[meetDates.indexOf(m.start_date)]}` });
  for (const m of b.data || []) jobs.push({ m, kind: `deadline-${DEADLINE_DAYS[deadlineDates.indexOf(m.entry_deadline)]}` });
  if (!jobs.length) return { today, sent: 0, skipped: 0 };

  const meetIds = [...new Set(jobs.map((j) => j.m.id))];
  const [g, p, s] = await Promise.all([
    sb.from("gymnasts").select("id,name").in("id", [...new Set(jobs.map((j) => j.m.gymnast_id))]),
    sb.from("profiles").select("*").in("id", [...new Set(jobs.map((j) => j.m.user_id))]),
    sb.from("reminders_sent").select("meet_id,kind,channel").in("meet_id", meetIds),
  ]);
  const gym = Object.fromEntries((g.data || []).map((x) => [x.id, x]));
  const prof = Object.fromEntries((p.data || []).map((x) => [x.id, x]));
  const done = new Set((s.data || []).map((x) => `${x.meet_id}|${x.kind}|${x.channel}`));
  let sent = 0, skipped = 0, failed = 0;

  for (const { m, kind } of jobs) {
    const pr = prof[m.user_id]; const name = gym[m.gymnast_id]?.name || "Your gymnast";
    if (!pr) { skipped++; continue; }
    const msg = compose({ m, kind, name, profile: pr });
    const channels = [];
    if (pr.email_reminders && pr.email && emailEnabled()) channels.push(["email", () => sendEmail({ to: pr.email, subject: msg.subject, html: msg.html, unsubscribeUrl: msg.unsub })]);
    if (pr.sms_reminders && pr.phone && smsEnabled()) channels.push(["sms", () => sendSms({ to: pr.phone, body: msg.sms })]);
    for (const [ch, send] of channels) {
      const key = `${m.id}|${kind}|${ch}`;
      if (done.has(key)) { skipped++; continue; }
      try {
        await send();
        await sb.from("reminders_sent").insert({ meet_id: m.id, kind, channel: ch });
        done.add(key); sent++;
      } catch (e) { failed++; console.error("reminder failed", key, e.message); }
    }
  }
  return { today, sent, skipped, failed };
}

export function compose({ m, kind, name, profile }) {
  const app = (process.env.APP_URL || "").replace(/\/$/, "");
  const unsub = `${app}/api/unsubscribe?u=${profile.id}&t=${signToken(profile.id)}`;
  const open = `${app}/?meet=${m.id}`;
  const [type, nStr] = kind.split("-"); const n = Number(nStr);
  const when = n === 1 ? "tomorrow" : `in ${n} days`;
  let subject, lead, sms;
  if (type === "deadline") {
    subject = `Entry deadline ${when}: ${m.name}`;
    lead = `The entry deadline for <b>${esc(m.name)}</b> is <b>${prettyDate(m.entry_deadline)}</b>. ${esc(name)} is still marked <i>Planned</i>; register with your gym before it closes.`;
    sms = `AthleteOrbit: entry deadline for ${m.name} is ${when} (${prettyDate(m.entry_deadline)}). Reply STOP to opt out.`;
  } else {
    subject = `${name}'s meet is ${when}: ${m.name}`;
    lead = `<b>${esc(m.name)}</b> is <b>${prettyDate(m.start_date)}</b>${m.session_time ? `, session ${esc(m.session_time)}` : ""}${m.location ? ` in ${esc(m.location)}` : ""}.`;
    sms = `AthleteOrbit: ${name}'s meet ${m.name} is ${when}${m.session_time ? `, ${m.session_time}` : ""}${m.location ? `, ${m.location}` : ""}. Packing list: ${open} Reply STOP to opt out.`;
  }
  const items = (Array.isArray(m.checklist) ? m.checklist : []).filter((i) => !i.done).slice(0, 8);
  const packing = type === "meet" && n <= 2 && items.length
    ? `<p style="margin:16px 0 6px"><b>Still to pack</b></p><ul style="margin:0;padding-left:18px">${items.map((i) => `<li>${esc(i.text)}</li>`).join("")}</ul>` : "";
  let travel = "";
  if (type === "meet" && n >= 7 && m.location) {
    const d = tripDates(m);
    const links = travelLinks({ dest: m.location, origin: profile.home_airport || profile.home_city, depart: d.depart, ret: d.return },
      { bookingAid: process.env.BOOKING_AID, hotelsUrl: process.env.TRAVEL_HOTELS_URL, flightsUrl: process.env.TRAVEL_FLIGHTS_URL });
    travel = `<p style="margin:16px 0 6px"><b>Plan the trip</b> (${prettyDate(d.depart)} – ${prettyDate(d.return)})</p>` +
      links.map((l) => `<p style="margin:4px 0"><a href="${esc(l.url)}" style="color:#E5523F;font-weight:bold">${esc(l.label)}</a> <span style="color:#7B8197;font-size:13px">· ${esc(l.note)}</span></p>`).join("");
  }
  const body = `<p style="line-height:1.6;margin:0">${lead}</p>${packing}${travel}
<p style="margin:20px 0 0"><a href="${esc(open)}" style="display:inline-block;background:#FF6B5B;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Open meet & trip planner</a></p>`;
  return { subject, html: emailLayout({ title: subject, body, unsubscribeUrl: unsub }), sms, unsub };
}

// Daily: for meets with a results link that happened in the last 4 days, look for the child's scores
// and save them as "found online, please confirm" (Plus and Pro families).
export async function runAutoScores({ max = 25 } = {}) {
  const today = todayIn();
  const sb = deps.supabase();
  const { data: meets } = await sb.from("meets").select("*").gte("start_date", addDays(today, -4));
  const due = (meets || []).filter((m) => m.results_url && m.start_date <= today && m.status !== "Skipped").slice(0, max);
  let found = 0, checked = 0;
  for (const m of due) {
    const { data: prior } = await sb.from("score_imports").select("id").eq("meet_id", m.id);
    if (prior?.length) continue;
    const { data: pr } = await sb.from("profiles").select("*").eq("id", m.user_id).maybeSingle();
    if (!pr) continue;
    if (pr.club_id) { const { data: club } = await sb.from("clubs").select("*").eq("id", pr.club_id).maybeSingle(); pr._club = club || null; }
    if (!hasFeature(tierOf(pr), "onlineScores")) continue;
    const { data: g } = await sb.from("gymnasts").select("*").eq("id", m.gymnast_id).maybeSingle();
    const u = allowedUrl(m.results_url);
    if (!g || !u) continue;
    checked++;
    try {
      const text = await fetchPage(u);
      const out = await extractScores({ g, text, name: g.results_name || g.name, sourceUrl: u.toString() });
      if (!out.found) continue;
      await sb.from("score_imports").insert({ user_id: m.user_id, gymnast_id: g.id, meet_id: m.id, source_url: u.toString(), data: out, status: "pending" });
      found++;
      if (pr.email && pr.email_reminders !== false && emailEnabled()) {
        const app = (process.env.APP_URL || "").replace(/\/$/, "");
        await sendEmail({ to: pr.email, subject: `${g.name}'s scores from ${m.name} are in`, html: emailLayout({ title: `${g.name}'s scores are in`,
          body: `<p>We found ${esc(g.name)}'s results from <b>${esc(m.name)}</b> online. Open AthleteOrbit to check and save them.</p><p><a href="${esc(app)}/?page=scores" style="color:#E5523F;font-weight:bold">Review scores</a></p>` }) }).catch(() => {});
      }
    } catch (e) { console.error("auto score pull failed", m.id, e.message); }
  }
  return { checked, found };
}

// Two emails per family: 2 days before the free trial ends, and the day it ends. Each is sent once.
export async function runTrialNotices() {
  if (!emailEnabled()) return { skipped: "email off" };
  const sb = deps.supabase(), now = deps.now().getTime(), day = 86400000;
  const { data: rows } = await sb.from("profiles").select("*").eq("subscription_status", "none");
  const app = (process.env.APP_URL || "").replace(/\/$/, "");
  let sent = 0;
  for (const p of rows || []) {
    if (!p.email || !p.trial_ends_at || p.account_type === "gym" || p.club_id) continue;
    const left = (new Date(p.trial_ends_at).getTime() - now) / day;
    const kind = left > 0 && left <= 2 ? "2d" : left <= 0 && left > -3 ? "end" : null;
    if (!kind || (p.trial_notice || "").split(",").includes(kind)) continue;
    const subject = kind === "2d" ? "2 days left in your AthleteOrbit free trial" : "Your AthleteOrbit trial has ended — your season is saved";
    const body = kind === "2d"
      ? `<p>Your free trial ends in 2 days. Pick a plan now and you won't be charged until the trial is over.</p><p><b>Basic $29.99/mo</b> · season schedule from a photo, scores pulled in, reminders, messages with your gym<br><b>Pro $39.99/mo</b> · everything in Basic plus the AI coach, meet-day tips and video check</p><p><a href="${esc(app)}/?page=plans&utm_source=trial_email" style="color:#E5523F;font-weight:bold">Choose my plan</a></p>`
      : `<p>Everything you logged is saved. Choose a plan to keep tracking — it takes one minute.</p><p><a href="${esc(app)}/?page=plans&utm_source=trial_email" style="color:#E5523F;font-weight:bold">Choose my plan</a></p>`;
    try {
      await sendEmail({ to: p.email, subject, html: emailLayout({ title: subject, body }) });
      await sb.from("profiles").update({ trial_notice: [p.trial_notice, kind].filter(Boolean).join(",") }).eq("id", p.id);
      sent++;
    } catch (e) { console.error("trial notice failed", p.id, e.message); }
  }
  return { sent };
}

// Daily: every meet with tickets on sale picks up newly matching families (each family is told once).
export async function runListingNotices() {
  const { data } = await deps.supabase().from("meet_listings").select("id,start_date,end_date").eq("status", "on_sale");
  const today = todayIn(); let notified = 0;
  for (const l of data || []) if ((l.end_date || l.start_date) >= today) notified += (await notifyListing(l.id)).notified || 0;
  return { notified };
}
