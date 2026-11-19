// Meet sign-ups & entry fees: the gym sees, per competition, which athletes are going, who hasn't answered and who
// has paid the entry fee — and nudges the families who haven't replied with one tap. Families answer from the meet.
import { handler, readJson, requireUser, deps, HttpError, sendEmail, emailLayout, esc, todayIn, env } from "../../lib.js";
import { meetMatches } from "../../../src/data/levels.js";

const appUrl = () => env("APP_URL").replace(/\/$/, "");
const usd = (c) => `$${(Number(c || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
async function ownedClub(userId) {
  const { data } = await deps.supabase().from("clubs").select("*").eq("owner_id", userId);
  if (!data?.[0]) throw new HttpError(403, "This is for gym accounts.");
  return data[0];
}
async function clubMeet(clubId, id) {
  const { data } = await deps.supabase().from("club_meets").select("*").eq("id", id).eq("club_id", clubId).maybeSingle();
  if (!data) throw new HttpError(404, "We couldn't find that competition.");
  return data;
}
// Everyone expected at a competition: athletes of the gym's families whose level/program the meet includes.
async function expected(club, cm) {
  const sb = deps.supabase();
  const { data: fams } = await sb.from("profiles").select("id,email,full_name,email_reminders").eq("club_id", club.id);
  if (!fams?.length) return [];
  const { data: kids } = await sb.from("gymnasts").select("*").in("user_id", fams.map((f) => f.id));
  const { data: rs } = await sb.from("meet_rsvps").select("*").eq("club_meet_id", cm.id);
  const byKid = new Map((rs || []).map((r) => [r.gymnast_id, r]));
  return (kids || []).filter((g) => meetMatches(cm, g)).map((g) => {
    const f = fams.find((x) => x.id === g.user_id) || {}, r = byKid.get(g.id) || {};
    return { gymnast_id: g.id, name: [g.name, g.last_name].filter(Boolean).join(" "), level: g.level, family: f.full_name || null, email: f.email || null, reminders: f.email_reminders !== false,
      status: r.status || null, paid: !!r.paid_at, paid_at: r.paid_at || null, note: r.note || null };
  }).sort((a, b) => (a.level || "").localeCompare(b.level || "") || a.name.localeCompare(b.name));
}
const counts = (list) => ({ expected: list.length, going: list.filter((a) => a.status === "going").length, notGoing: list.filter((a) => a.status === "not_going").length,
  noAnswer: list.filter((a) => !a.status).length, paid: list.filter((a) => a.paid).length });
const meetOut = (cm) => ({ id: cm.id, name: cm.name, start_date: cm.start_date, end_date: cm.end_date, location: cm.location, levels: cm.levels || [], fee_cents: cm.fee_cents ?? null, fee_due: cm.fee_due || null });

// ---------- Gym owner ----------
export const signups = handler(["GET", "POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await ownedClub(user.id);
  const sb = deps.supabase();
  if (req.method === "GET") {
    const id = new URL(req.url || "/", "http://x").searchParams.get("meet");
    if (id) { const cm = await clubMeet(club.id, id); const list = await expected(club, cm); return { meet: meetOut(cm), athletes: list, counts: counts(list) }; }
    const { data: cms } = await sb.from("club_meets").select("*").eq("club_id", club.id).eq("status", "published").gte("start_date", todayIn());
    const out = [];
    for (const cm of (cms || []).sort((a, b) => (a.start_date > b.start_date ? 1 : -1)).slice(0, 20)) out.push({ ...meetOut(cm), counts: counts(await expected(club, cm)) });
    return { meets: out };
  }
  const b = await readJson(req);
  const cm = await clubMeet(club.id, b.meet);
  if (b.fee_cents !== undefined || b.fee_due !== undefined) {
    const fee = b.fee_cents === null || b.fee_cents === "" ? null : Math.round(Number(b.fee_cents));
    if (fee !== null && !(fee >= 0 && fee <= 100000)) throw new HttpError(400, "Enter an entry fee between $0 and $1,000.");
    const due = b.fee_due && /^\d{4}-\d{2}-\d{2}$/.test(b.fee_due) ? b.fee_due : null;
    await sb.from("club_meets").update({ fee_cents: fee, fee_due: due }).eq("id", cm.id);
    return { saved: true };
  }
  if (b.gymnast_id) {
    const list = await expected(club, cm), a = list.find((x) => x.gymnast_id === b.gymnast_id);
    if (!a) throw new HttpError(404, "That athlete isn't expected at this competition.");
    const { data: kid } = await sb.from("gymnasts").select("user_id").eq("id", a.gymnast_id).maybeSingle();
    const patch = { club_meet_id: cm.id, gymnast_id: a.gymnast_id, user_id: kid.user_id, updated_at: deps.now().toISOString() };
    if (b.paid !== undefined) patch.paid_at = b.paid ? deps.now().toISOString() : null;
    if (b.status !== undefined) patch.status = ["going", "not_going"].includes(b.status) ? b.status : null;
    const { error } = await sb.from("meet_rsvps").upsert(patch, { onConflict: "club_meet_id,gymnast_id" }); if (error) throw error;
    return { saved: true };
  }
  if (b.nudge) {
    const list = await expected(club, cm), who = b.nudge === "unpaid" ? list.filter((a) => a.status === "going" && !a.paid) : list.filter((a) => !a.status);
    const byEmail = new Map(); for (const a of who) if (a.email && a.reminders) byEmail.set(a.email, [...(byEmail.get(a.email) || []), a.name.split(" ")[0]]);
    const fee = cm.fee_cents ? `${usd(cm.fee_cents)} entry fee${cm.fee_due ? `, due ${cm.fee_due}` : ""}` : "";
    let sent = 0;
    for (const [to, names] of byEmail) {
      const kids = names.join(" and ");
      const subject = b.nudge === "unpaid" ? `${club.name}: entry fee for ${cm.name}` : `${club.name}: is ${kids} competing at ${cm.name}?`;
      const body = b.nudge === "unpaid"
        ? `<p>${esc(kids)} is signed up for <b>${esc(cm.name)}</b> (${esc(cm.start_date)}). Our records show the ${esc(fee || "entry fee")} isn't paid yet.</p><p>Already paid? Just reply and let us know.</p>`
        : `<p>Please let us know if <b>${esc(kids)}</b> will compete at <b>${esc(cm.name)}</b> on ${esc(cm.start_date)}${cm.location ? ` in ${esc(cm.location)}` : ""}.</p>${fee ? `<p>${esc(fee)}.</p>` : ""}<p><a href="${appUrl()}/?page=meets" style="color:#6D28D9;font-weight:bold">Answer in AthleteOrbit (one tap)</a></p>`;
      await sendEmail({ to, subject, html: emailLayout({ title: subject, body: `${body}<p style="color:#7B8197;font-size:13px">From ${esc(club.name)} via AthleteOrbit</p>` }) }).then(() => sent++).catch(() => {});
    }
    return { nudged: sent, athletes: who.length };
  }
  throw new HttpError(400, "Nothing to change.");
});

// ---------- Family ----------
// GET ?meet=<meets.id>: the gym's sign-up for this competition (if the meet came from the gym's schedule).
// POST { meet, status: "going" | "not_going" }
export const familyRsvp = handler(["GET", "POST"], async (req) => {
  const { user } = await requireUser(req);
  const sb = deps.supabase();
  const b = req.method === "POST" ? await readJson(req) : { meet: new URL(req.url || "/", "http://x").searchParams.get("meet") };
  const { data: m } = await sb.from("meets").select("*").eq("id", b.meet).eq("user_id", user.id).maybeSingle();
  if (!m?.club_meet_id || !m.gymnast_id) return { rsvp: null };
  const { data: cm } = await sb.from("club_meets").select("*").eq("id", m.club_meet_id).maybeSingle();
  if (!cm) return { rsvp: null };
  const { data: club } = await sb.from("clubs").select("name").eq("id", cm.club_id).maybeSingle();
  if (req.method === "POST") {
    if (!["going", "not_going"].includes(b.status)) throw new HttpError(400, "Choose going or not going.");
    const { error } = await sb.from("meet_rsvps").upsert({ club_meet_id: cm.id, gymnast_id: m.gymnast_id, user_id: user.id, status: b.status, note: typeof b.note === "string" ? b.note.slice(0, 200) : null, updated_at: deps.now().toISOString() }, { onConflict: "club_meet_id,gymnast_id" });
    if (error) throw error;
  }
  const { data: r } = await sb.from("meet_rsvps").select("*").eq("club_meet_id", cm.id).eq("gymnast_id", m.gymnast_id).maybeSingle();
  return { rsvp: { gym: club?.name || "Your gym", status: r?.status || null, paid: !!r?.paid_at, fee_cents: cm.fee_cents ?? null, fee_due: cm.fee_due || null } };
});
