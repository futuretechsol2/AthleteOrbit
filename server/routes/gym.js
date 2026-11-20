// Gym owner operations (Jackrabbit-style): classes with capacity and waitlists, staff schedule, tuition invoices that
// families pay online (straight to the gym's own Stripe account), reports, and targeted emails to families.
import { handler, readJson, requireUser, deps, HttpError, env, sendEmail, emailLayout, esc, todayIn } from "../lib.js";
import { isAdmin } from "./admin/support.js";
import { runsGym } from "../../src/data/roles.js";
import { levelKey } from "../../src/data/levels.js";

const appUrl = () => env("APP_URL").replace(/\/$/, "");
const str = (v, n = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{1,2}:\d{2}$/;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const usd = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
export const PLATFORM_FEE = 0.01; // 1% on tuition paid online when the gym is on the free plan; 0% on a paid gym plan

async function gymOf(req) {
  const { user, profile } = await requireUser(req);
  if (!runsGym(profile) && !isAdmin(user, profile)) throw new HttpError(403, "This is for gym-owner accounts.");
  const { data } = await deps.supabase().from("clubs").select("*").eq("owner_id", user.id);
  if (!data?.[0]) throw new HttpError(403, "Set up your gym first.");
  return { user, profile, club: data[0] };
}
const roster = async (club) => (await deps.supabase().from("club_roster").select("*").eq("club_id", club.id)).data || [];
// Who pays for an athlete: the linked family's account email, else the email on the roster.
async function familyEmails(club, rows) {
  const sb = deps.supabase(), ids = rows.map((r) => r.id);
  const { data: kids } = ids.length ? await sb.from("gymnasts").select("roster_id,user_id").in("roster_id", ids) : { data: [] };
  const uids = [...new Set((kids || []).map((k) => k.user_id))];
  const { data: profs } = uids.length ? await sb.from("profiles").select("id,email").in("id", uids) : { data: [] };
  const byUser = new Map((profs || []).map((p) => [p.id, p.email]));
  const out = new Map();
  for (const r of rows) { const k = (kids || []).find((x) => x.roster_id === r.id); out.set(r.id, String((k && byUser.get(k.user_id)) || r.parent_email || "").toLowerCase() || null); }
  return out;
}

// ---------- Classes, capacity, waitlists ----------
export const classes = handler(["GET", "POST"], async (req) => {
  const { club } = await gymOf(req);
  const sb = deps.supabase();
  const load = async () => {
    const [{ data: cls }, ros] = await Promise.all([sb.from("gym_classes").select("*").eq("club_id", club.id), roster(club)]);
    const ids = (cls || []).map((c) => c.id);
    const { data: en } = ids.length ? await sb.from("class_enrollments").select("*").in("class_id", ids) : { data: [] };
    const name = new Map(ros.map((r) => [r.id, r]));
    return (cls || []).map((c) => {
      const mine = (en || []).filter((e) => e.class_id === c.id).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
      const athletes = (s) => mine.filter((e) => e.status === s).map((e) => ({ roster_id: e.roster_id, name: name.get(e.roster_id)?.name || "—", level: name.get(e.roster_id)?.level || null }));
      return { ...c, enrolled: athletes("enrolled"), waitlist: athletes("waitlist") };
    }).sort((a, b) => DAYS.indexOf(a.days?.[0]) - DAYS.indexOf(b.days?.[0]) || String(a.start_time).localeCompare(String(b.start_time)));
  };
  if (req.method === "GET") return { classes: await load(), roster: (await roster(club)).map((r) => ({ id: r.id, name: r.name, level: r.level })) };
  const b = await readJson(req);
  if (b.remove) { await sb.from("gym_classes").delete().eq("id", b.remove).eq("club_id", club.id); return { removed: true }; }
  if (b.enroll || b.drop) {
    const { data: c } = await sb.from("gym_classes").select("*").eq("id", b.class_id).eq("club_id", club.id).maybeSingle();
    if (!c) throw new HttpError(404, "Class not found.");
    const rid = b.enroll || b.drop;
    if (!(await roster(club)).some((r) => r.id === rid)) throw new HttpError(404, "Athlete not found.");
    const { data: en } = await sb.from("class_enrollments").select("*").eq("class_id", c.id);
    if (b.enroll) {
      if ((en || []).some((e) => e.roster_id === rid)) return { status: (en || []).find((e) => e.roster_id === rid).status };
      const status = (en || []).filter((e) => e.status === "enrolled").length < c.capacity ? "enrolled" : "waitlist";
      const { error } = await sb.from("class_enrollments").insert({ class_id: c.id, roster_id: rid, status, created_at: deps.now().toISOString() }); if (error) throw error;
      return { status };
    }
    const was = (en || []).find((e) => e.roster_id === rid);
    await sb.from("class_enrollments").delete().eq("class_id", c.id).eq("roster_id", rid);
    const promoted = was?.status === "enrolled" ? await promote(c) : [];
    return { dropped: true, promoted };
  }
  const rec = { name: str(b.name, 80), level: str(b.level, 40), days: (Array.isArray(b.days) ? b.days : []).filter((d) => DAYS.includes(d)),
    start_time: TIME.test(b.start_time || "") ? b.start_time : null, end_time: TIME.test(b.end_time || "") ? b.end_time : null, coach_name: str(b.coach_name, 80),
    capacity: Math.max(1, Math.min(500, Math.round(Number(b.capacity) || 12))), monthly_fee_cents: b.monthly_fee_cents == null || b.monthly_fee_cents === "" ? null : Math.max(0, Math.round(Number(b.monthly_fee_cents))) };
  if (!rec.name) throw new HttpError(400, "Name the class.");
  if (b.id) {
    const { data: c } = await sb.from("gym_classes").select("*").eq("id", b.id).eq("club_id", club.id).maybeSingle(); if (!c) throw new HttpError(404, "Class not found.");
    await sb.from("gym_classes").update(rec).eq("id", c.id);
    const promoted = rec.capacity > c.capacity ? await promote({ ...c, ...rec }) : [];
    return { saved: true, promoted };
  }
  const { error } = await sb.from("gym_classes").insert({ club_id: club.id, ...rec }); if (error) throw error;
  return { saved: true };
});
// Move the longest-waiting athletes into open spots and tell their families.
async function promote(c) {
  const sb = deps.supabase();
  const { data: en } = await sb.from("class_enrollments").select("*").eq("class_id", c.id);
  let open = c.capacity - (en || []).filter((e) => e.status === "enrolled").length;
  const wait = (en || []).filter((e) => e.status === "waitlist").sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
  const moved = [];
  for (const w of wait) { if (open <= 0) break; await sb.from("class_enrollments").update({ status: "enrolled" }).eq("id", w.id); moved.push(w.roster_id); open--; }
  if (moved.length) {
    const { data: club } = await sb.from("clubs").select("*").eq("id", c.club_id).maybeSingle();
    const { data: rs } = await sb.from("club_roster").select("*").in("id", moved);
    const emails = await familyEmails(club, rs || []);
    for (const r of rs || []) { const to = emails.get(r.id); if (to) await sendEmail({ to, subject: `${club.name}: a spot opened in ${c.name}`, html: emailLayout({ title: "You're in!", body: `<p>A spot opened in <b>${esc(c.name)}</b> (${esc((c.days || []).join(", "))} ${esc(c.start_time || "")}) and <b>${esc(r.name)}</b> moved off the waitlist.</p><p>Reply to this email if you no longer need the spot.</p>` }) }).catch(() => {}); }
  }
  return moved;
}

// ---------- Staff & schedule ----------
const mondayOf = (d) => { const x = new Date(`${d}T12:00:00Z`); const k = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - k); return x.toISOString().slice(0, 10); };
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
export const staff = handler(["GET", "POST"], async (req) => {
  const { club } = await gymOf(req);
  const sb = deps.supabase();
  if (req.method === "GET") {
    const w = new URL(req.url || "/", "http://x").searchParams.get("week"); const week = mondayOf(DAY.test(w || "") ? w : todayIn());
    const [{ data: st }, { data: sh }, { data: cls }] = await Promise.all([sb.from("gym_staff").select("*").eq("club_id", club.id), sb.from("staff_shifts").select("*").eq("club_id", club.id).gte("day", week), sb.from("gym_classes").select("id,name").eq("club_id", club.id)]);
    const shifts = (sh || []).filter((s) => s.day < addDays(week, 7)).sort((a, b) => (a.day + a.start_time > b.day + b.start_time ? 1 : -1));
    const people = (st || []).map((p) => { const mine = shifts.filter((s) => s.staff_id === p.id); const hours = mine.reduce((a, s) => a + (mins(s.end_time) - mins(s.start_time)) / 60, 0);
      return { ...p, hours: Math.round(hours * 10) / 10, pay_cents: p.pay_rate_cents ? Math.round(hours * p.pay_rate_cents) : null }; });
    return { week, days: [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i)), staff: people, shifts, classes: cls || [] };
  }
  const b = await readJson(req);
  if (b.remove_staff) { await sb.from("gym_staff").delete().eq("id", b.remove_staff).eq("club_id", club.id); return { removed: true }; }
  if (b.remove_shift) { await sb.from("staff_shifts").delete().eq("id", b.remove_shift).eq("club_id", club.id); return { removed: true }; }
  if (b.shift) {
    const s = b.shift;
    const { data: p } = await sb.from("gym_staff").select("id").eq("id", s.staff_id).eq("club_id", club.id).maybeSingle();
    if (!p) throw new HttpError(404, "Pick a staff member.");
    if (!DAY.test(s.day || "") || !TIME.test(s.start_time || "") || !TIME.test(s.end_time || "") || mins(s.end_time) <= mins(s.start_time)) throw new HttpError(400, "Pick a day and a start time before the end time.");
    const { data: same } = await sb.from("staff_shifts").select("*").eq("club_id", club.id).eq("staff_id", p.id).eq("day", s.day);
    const clash = (same || []).find((x) => mins(x.start_time) < mins(s.end_time) && mins(s.start_time) < mins(x.end_time));
    if (clash) throw new HttpError(409, `They're already scheduled ${clash.start_time}–${clash.end_time} that day.`);
    const { error } = await sb.from("staff_shifts").insert({ club_id: club.id, staff_id: p.id, day: s.day, start_time: s.start_time, end_time: s.end_time, class_id: s.class_id || null, note: str(s.note, 120) }); if (error) throw error;
    return { saved: true };
  }
  const rec = { name: str(b.name, 80), role: str(b.role, 40) || "Coach", email: str(b.email, 120), phone: str(b.phone, 30), pay_rate_cents: b.pay_rate_cents ? Math.max(0, Math.round(Number(b.pay_rate_cents))) : null };
  if (!rec.name) throw new HttpError(400, "Add their name.");
  if (b.id) { await sb.from("gym_staff").update(rec).eq("id", b.id).eq("club_id", club.id); return { saved: true }; }
  const { error } = await sb.from("gym_staff").insert({ club_id: club.id, ...rec }); if (error) throw error;
  return { saved: true };
});

// ---------- Tuition & fees ----------
const paidPlan = (club) => club.plan && club.plan !== "trial" && (!club.active_until || club.active_until > deps.now().toISOString());
export const feeFor = (club, cents) => (paidPlan(club) ? 0 : Math.round(cents * PLATFORM_FEE));
export const invoices = handler(["GET", "POST"], async (req) => {
  const { club } = await gymOf(req);
  const sb = deps.supabase();
  if (req.method === "GET") {
    const { data } = await sb.from("gym_invoices").select("*").eq("club_id", club.id);
    const list = (data || []).sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    const today = todayIn();
    return { invoices: list, online: !!club.stripe_account, fee_pct: paidPlan(club) ? 0 : PLATFORM_FEE * 100,
      totals: { open: list.filter((i) => i.status === "open").reduce((a, i) => a + i.amount_cents, 0), overdue: list.filter((i) => i.status === "open" && i.due_date && i.due_date < today).reduce((a, i) => a + i.amount_cents, 0),
        collected30: list.filter((i) => i.status === "paid" && i.paid_at >= new Date(deps.now().getTime() - 30 * 864e5).toISOString()).reduce((a, i) => a + i.amount_cents, 0) } };
  }
  const b = await readJson(req);
  if (b.mark) {
    const { data: inv } = await sb.from("gym_invoices").select("*").eq("id", b.mark).eq("club_id", club.id).maybeSingle(); if (!inv) throw new HttpError(404, "Invoice not found.");
    const patch = b.status === "void" ? { status: "void" } : b.status === "open" ? { status: "open", paid_at: null, paid_via: null } : { status: "paid", paid_at: deps.now().toISOString(), paid_via: ["cash", "check", "other"].includes(b.via) ? b.via : "other" };
    await sb.from("gym_invoices").update(patch).eq("id", inv.id); return { saved: true };
  }
  if (b.remind) {
    const { data: list } = await sb.from("gym_invoices").select("*").eq("club_id", club.id).eq("status", "open");
    const due = (list || []).filter((i) => i.family_email && (b.remind === "overdue" ? i.due_date && i.due_date < todayIn() : true));
    let sent = 0; for (const i of due) { await sendEmail({ to: i.family_email, subject: `${club.name}: ${usd(i.amount_cents)} due${i.due_date ? ` ${i.due_date}` : ""}`, html: emailLayout({ title: `${club.name} — payment reminder`, body: `<p><b>${esc(i.description)}</b>${i.athlete_name ? ` for ${esc(i.athlete_name)}` : ""}: <b>${usd(i.amount_cents)}</b>${i.due_date ? `, due ${esc(i.due_date)}` : ""}.</p><p><a href="${appUrl()}/?page=billing" style="color:#6D28D9;font-weight:bold">Pay securely in AthleteOrbit</a></p>` }) }).then(() => sent++).catch(() => {}); }
    return { reminded: sent };
  }
  // Create: one athlete, a level, a class, or everyone.
  const amount = Math.round(Number(b.amount_cents)), desc = str(b.description, 200);
  if (!desc) throw new HttpError(400, "Describe the charge (e.g. December tuition).");
  if (!(amount >= 50 && amount <= 10000000)) throw new HttpError(400, "Enter an amount of at least $0.50.");
  let rows = await roster(club);
  if (b.roster_id) rows = rows.filter((r) => r.id === b.roster_id);
  else if (b.level) rows = rows.filter((r) => levelKey(r.level) === levelKey(b.level));
  else if (b.class_id) { const { data: en } = await sb.from("class_enrollments").select("roster_id,status").eq("class_id", b.class_id); const ids = new Set((en || []).filter((e) => e.status === "enrolled").map((e) => e.roster_id)); rows = rows.filter((r) => ids.has(r.id)); }
  else if (!b.everyone) throw new HttpError(400, "Choose who to bill.");
  if (!rows.length) throw new HttpError(400, "No athletes match.");
  const emails = await familyEmails(club, rows);
  const due = DAY.test(b.due_date || "") ? b.due_date : null;
  const recs = rows.map((r) => ({ club_id: club.id, roster_id: r.id, athlete_name: r.name, family_email: emails.get(r.id), description: desc, amount_cents: amount, due_date: due, status: "open", created_at: deps.now().toISOString() }));
  const { error } = await sb.from("gym_invoices").insert(recs); if (error) throw error;
  let emailed = 0;
  if (b.send !== false) for (const r of recs) if (r.family_email) await sendEmail({ to: r.family_email, subject: `${club.name}: ${desc} — ${usd(amount)}`, html: emailLayout({ title: `${club.name} — new invoice`, body: `<p><b>${esc(desc)}</b> for ${esc(r.athlete_name)}: <b>${usd(amount)}</b>${due ? `, due ${esc(due)}` : ""}.</p><p><a href="${appUrl()}/?page=billing" style="color:#6D28D9;font-weight:bold">Pay securely in AthleteOrbit</a></p><p style="color:#7B8197;font-size:13px">Card payments go straight to ${esc(club.name)}.</p>` }) }).then(() => emailed++).catch(() => {});
  return { created: recs.length, emailed, missingEmail: recs.filter((r) => !r.family_email).map((r) => r.athlete_name) };
});
// Turn on online payments: the gym's own Stripe Express account (payouts go straight to the gym).
export const connect = handler(["POST"], async (req) => {
  const { user, club } = await gymOf(req);
  const stripe = deps.stripe(), sb = deps.supabase();
  let acct = club.stripe_account;
  if (!acct) { const a = await stripe.accounts.create({ type: "express", email: user.email || undefined, business_profile: { name: club.name }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } }); acct = a.id; await sb.from("clubs").update({ stripe_account: acct }).eq("id", club.id); }
  const a = await stripe.accounts.retrieve(acct).catch(() => null);
  if (a?.charges_enabled) return { ready: true };
  const link = await stripe.accountLinks.create({ account: acct, type: "account_onboarding", refresh_url: `${appUrl()}/?tab=billing`, return_url: `${appUrl()}/?tab=billing` });
  return { url: link.url };
});

// ---------- Parents: balance + pay online ----------
async function familyInvoices(user) {
  const sb = deps.supabase();
  const { data: kids } = await sb.from("gymnasts").select("roster_id").eq("user_id", user.id);
  const rids = (kids || []).map((k) => k.roster_id).filter(Boolean);
  const [{ data: byRoster }, { data: byEmail }] = await Promise.all([rids.length ? sb.from("gym_invoices").select("*").in("roster_id", rids) : { data: [] }, sb.from("gym_invoices").select("*").eq("family_email", String(user.email || "").toLowerCase())]);
  const all = [...new Map([...(byRoster || []), ...(byEmail || [])].map((i) => [i.id, i])).values()].filter((i) => i.status !== "void");
  return all.sort((a, b) => (a.status === b.status ? (a.due_date || "") > (b.due_date || "") ? 1 : -1 : a.status === "open" ? -1 : 1));
}
export const familyBilling = handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const list = await familyInvoices(user);
  const clubIds = [...new Set(list.map((i) => i.club_id))];
  const { data: clubs } = clubIds.length ? await deps.supabase().from("clubs").select("id,name,stripe_account").in("id", clubIds) : { data: [] };
  const cm = new Map((clubs || []).map((c) => [c.id, c]));
  return { invoices: list.map((i) => ({ id: i.id, gym: cm.get(i.club_id)?.name || "Your gym", athlete: i.athlete_name, description: i.description, amount_cents: i.amount_cents, due_date: i.due_date, status: i.status, paid_at: i.paid_at, payable: i.status === "open" && !!cm.get(i.club_id)?.stripe_account })),
    balance: list.filter((i) => i.status === "open").reduce((a, i) => a + i.amount_cents, 0) };
});
export const familyPay = handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const b = await readJson(req);
  const inv = (await familyInvoices(user)).find((i) => i.id === b.id);
  if (!inv) throw new HttpError(404, "Invoice not found.");
  if (inv.status !== "open") throw new HttpError(409, "This invoice is already paid.");
  const { data: club } = await deps.supabase().from("clubs").select("*").eq("id", inv.club_id).maybeSingle();
  if (!club?.stripe_account) throw new HttpError(409, `${club?.name || "Your gym"} hasn't turned on online payments yet — pay them the usual way.`);
  const fee = feeFor(club, inv.amount_cents);
  const s = await deps.stripe().checkout.sessions.create({ mode: "payment", customer_email: user.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: inv.amount_cents, product_data: { name: `${club.name}: ${inv.description}`, description: inv.athlete_name ? `For ${inv.athlete_name}` : undefined } } }],
    payment_intent_data: { ...(fee ? { application_fee_amount: fee } : {}), transfer_data: { destination: club.stripe_account } },
    metadata: { kind: "gym_invoice", invoice_id: inv.id, user_id: user.id }, success_url: `${appUrl()}/?page=billing&paid=1`, cancel_url: `${appUrl()}/?page=billing` });
  await deps.supabase().from("gym_invoices").update({ stripe_session: s.id }).eq("id", inv.id);
  return { url: s.url };
});
export async function fulfillInvoice(s) {
  const id = s.metadata?.invoice_id; if (!id) return;
  const { data: inv } = await deps.supabase().from("gym_invoices").select("*").eq("id", id).maybeSingle();
  if (!inv || inv.status === "paid") return;
  const { data: club } = await deps.supabase().from("clubs").select("*").eq("id", inv.club_id).maybeSingle();
  await deps.supabase().from("gym_invoices").update({ status: "paid", paid_at: deps.now().toISOString(), paid_via: "card", platform_fee_cents: club ? feeFor(club, inv.amount_cents) : null }).eq("id", id);
  // Gyms that collect tuition through AthleteOrbit stay free: each online payment keeps the free plan active 35 more days.
  if (club && !paidPlan(club)) { const until = new Date(deps.now().getTime() + 35 * 864e5).toISOString(); if (!club.active_until || club.active_until < until) await deps.supabase().from("clubs").update({ active_until: until }).eq("id", club.id); }
}

// ---------- Reports ----------
export const reports = handler(["GET"], async (req) => {
  const { club } = await gymOf(req);
  const sb = deps.supabase();
  const [{ data: inv }, { data: cls }, ros, { data: att }, { data: sk }] = await Promise.all([
    sb.from("gym_invoices").select("*").eq("club_id", club.id), sb.from("gym_classes").select("*").eq("club_id", club.id), roster(club),
    sb.from("coach_attendance").select("*").eq("club_id", club.id).gte("day", new Date(deps.now().getTime() - 30 * 864e5).toISOString().slice(0, 10)),
    sb.from("coach_skills").select("*").eq("club_id", club.id)]);
  const months = [...Array(6)].map((_, i) => { const d = new Date(deps.now()); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return d.toISOString().slice(0, 7); });
  const list = (inv || []).filter((i) => i.status !== "void"), today = todayIn();
  const age = (i) => (i.due_date ? Math.floor((Date.parse(today) - Date.parse(i.due_date)) / 864e5) : -1);
  const open = list.filter((i) => i.status === "open");
  const ids = (cls || []).map((c) => c.id);
  const { data: en } = ids.length ? await sb.from("class_enrollments").select("*").in("class_id", ids) : { data: [] };
  const levels = [...new Set(ros.map((r) => r.level || "No level"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    finance: { months: months.map((m) => ({ month: m, billed: list.filter((i) => (i.created_at || "").startsWith(m)).reduce((a, i) => a + i.amount_cents, 0), collected: list.filter((i) => i.status === "paid" && (i.paid_at || "").startsWith(m)).reduce((a, i) => a + i.amount_cents, 0) })),
      outstanding: open.reduce((a, i) => a + i.amount_cents, 0),
      aging: { current: open.filter((i) => age(i) <= 0).reduce((a, i) => a + i.amount_cents, 0), d30: open.filter((i) => age(i) > 0 && age(i) <= 30).reduce((a, i) => a + i.amount_cents, 0), d60: open.filter((i) => age(i) > 30 && age(i) <= 60).reduce((a, i) => a + i.amount_cents, 0), d60plus: open.filter((i) => age(i) > 60).reduce((a, i) => a + i.amount_cents, 0) },
      byMethod: ["card", "cash", "check", "other"].map((m) => ({ method: m, cents: list.filter((i) => i.status === "paid" && i.paid_via === m).reduce((a, i) => a + i.amount_cents, 0) })),
      platformFees: list.reduce((a, i) => a + (i.platform_fee_cents || 0), 0) },
    enrollment: (cls || []).map((c) => { const e = (en || []).filter((x) => x.class_id === c.id); const n = e.filter((x) => x.status === "enrolled").length; return { id: c.id, name: c.name, capacity: c.capacity, enrolled: n, waitlist: e.length - n, fill: Math.round((n / c.capacity) * 100), monthly_cents: c.monthly_fee_cents ? n * c.monthly_fee_cents : null }; }),
    athletes: levels.map((lv) => { const rs = ros.filter((r) => (r.level || "No level") === lv), set = new Set(rs.map((r) => r.id)); const a = (att || []).filter((x) => set.has(x.roster_id) && x.status !== "excused"); const s = (sk || []).filter((x) => set.has(x.roster_id));
      return { level: lv, athletes: rs.length, attendance: a.length ? Math.round((a.filter((x) => x.status !== "absent").length / a.length) * 100) : null, skills: { learning: s.filter((x) => x.status === "learning").length, consistent: s.filter((x) => x.status === "consistent").length, competition: s.filter((x) => x.status === "competition").length } }; }),
  };
});

// ---------- Targeted email to families ----------
export const email = handler(["POST"], async (req) => {
  const { club } = await gymOf(req);
  const b = await readJson(req);
  const subject = str(b.subject, 120), body = str(b.body, 5000);
  if (!subject || !body) throw new HttpError(400, "Add a subject and a message.");
  let rows = await roster(club);
  if (b.level) rows = rows.filter((r) => levelKey(r.level) === levelKey(b.level));
  if (b.class_id) { const { data: en } = await deps.supabase().from("class_enrollments").select("roster_id").eq("class_id", b.class_id); const ids = new Set((en || []).map((e) => e.roster_id)); rows = rows.filter((r) => ids.has(r.id)); }
  const emails = [...new Set([...(await familyEmails(club, rows)).values()].filter(Boolean))];
  if (b.preview) return { recipients: emails.length };
  let sent = 0;
  for (const to of emails) await sendEmail({ to, subject: `${club.name}: ${subject}`, html: emailLayout({ title: subject, body: `${body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}<p style="color:#7B8197;font-size:13px">From ${esc(club.name)} via AthleteOrbit · reply in the app's Messages</p>` }) }).then(() => sent++).catch(() => {});
  return { sent, recipients: emails.length };
});
