// Meet organizer suite: registration & roster verification, sessions with automatic rotations, officials &
// volunteers, and the Meet Pro plan. Scoped to meets the organizer owns (tickets, live scores and the music table
// live in tickets/, live.js and music.js).
import { handler, readJson, requireUser, deps, HttpError, env, sendEmail, emailLayout, esc } from "../lib.js";
import { isAdmin } from "./admin/support.js";
import { runsMeets } from "../../src/data/roles.js";

const appUrl = () => env("APP_URL").replace(/\/$/, "");
const str = (v, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const FREE_ENTRIES = 50;
export const MEET_PRO_CENTS = () => Number(process.env.MEET_PRO_CENTS || 19900);
export const isOrgPro = (p) => p?.organizer_plan === "pro" && (!p.organizer_pro_until || p.organizer_pro_until > deps.now().toISOString());

async function myMeet(req, id) {
  const { user, profile } = await requireUser(req);
  if (!runsMeets(profile) && !isAdmin(user, profile)) throw new HttpError(403, "This is for meet-organizer and gym accounts.");
  const { data: l } = await deps.supabase().from("meet_listings").select("*").eq("id", id).maybeSingle();
  if (!l || (l.owner_id !== user.id && !isAdmin(user, profile))) throw new HttpError(404, "Meet not found.");
  return { user, profile, l };
}
const idOf = async (req) => (req.method === "GET" ? new URL(req.url || "/", "http://x").searchParams.get("id") : (await readJson(req)).id);

// Plan
export const plan = handler(["GET", "POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  if (req.method === "GET") return { plan: isOrgPro(profile) ? "pro" : "free", until: profile.organizer_pro_until || null, price_cents: MEET_PRO_CENTS(), free_entries: FREE_ENTRIES };
  if (isOrgPro(profile)) return { pro: true };
  const s = await deps.stripe().checkout.sessions.create({ mode: "payment", customer_email: user.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: MEET_PRO_CENTS(), product_data: { name: "AthleteOrbit Meet Pro — 12 months", description: "Unlimited meets and entries, sessions & rotations, officials & volunteers, TV scoreboard, music table." } } }],
    metadata: { kind: "meet_pro", user_id: user.id }, success_url: `${appUrl()}/?page=home&pro=1`, cancel_url: `${appUrl()}/?page=home` });
  return { url: s.url };
});
export async function fulfillMeetPro(s) {
  const id = s.metadata?.user_id; if (!id) return;
  const until = new Date(deps.now().getTime() + 365 * 864e5).toISOString();
  await deps.supabase().from("profiles").update({ organizer_plan: "pro", organizer_pro_until: until }).eq("id", id);
}

// Registration: gyms' entries. POST { id, rows:[{gym_name, athlete_name, level, division, member_number}] } | { id, set: entryId, status|fee_paid } | { id, remove }
export const entries = handler(["GET", "POST"], async (req) => {
  const b = req.method === "POST" ? await readJson(req) : null;
  const { profile, l } = await myMeet(req, b ? b.id : new URL(req.url || "/", "http://x").searchParams.get("id"));
  const sb = deps.supabase();
  const { data: all } = await sb.from("meet_entries").select("*").eq("listing_id", l.id);
  const list = (all || []).sort((a, x) => a.gym_name.localeCompare(x.gym_name) || a.athlete_name.localeCompare(x.athlete_name));
  if (!b) {
    const dupKey = (e) => `${e.athlete_name.toLowerCase()}|${e.gym_name.toLowerCase()}`; const counts = new Map(); list.forEach((e) => counts.set(dupKey(e), (counts.get(dupKey(e)) || 0) + 1));
    const gyms = [...new Set(list.map((e) => e.gym_name))].map((g) => { const es = list.filter((e) => e.gym_name === g && e.status !== "scratched"); return { gym: g, athletes: es.length, verified: es.filter((e) => e.status === "verified").length, paid: es.filter((e) => e.fee_paid).length }; });
    return { entries: list.map((e) => ({ ...e, duplicate: counts.get(dupKey(e)) > 1, missing: [!e.level && "level", !e.member_number && "member #"].filter(Boolean) })), gyms,
      counts: { total: list.filter((e) => e.status !== "scratched").length, verified: list.filter((e) => e.status === "verified").length, pending: list.filter((e) => e.status === "pending").length, scratched: list.filter((e) => e.status === "scratched").length },
      plan: isOrgPro(profile) ? "pro" : "free", limit: isOrgPro(profile) ? null : FREE_ENTRIES };
  }
  if (b.remove) { await sb.from("meet_entries").delete().eq("id", b.remove).eq("listing_id", l.id); return { removed: true }; }
  if (b.set) {
    const patch = {}; if (["pending", "verified", "scratched"].includes(b.status)) patch.status = b.status; if (typeof b.fee_paid === "boolean") patch.fee_paid = b.fee_paid;
    if (b.verifyAll) { for (const e of list.filter((e) => e.status === "pending" && e.level)) await sb.from("meet_entries").update({ status: "verified" }).eq("id", e.id); return { saved: true }; }
    await sb.from("meet_entries").update(patch).eq("id", b.set).eq("listing_id", l.id); return { saved: true };
  }
  if (b.verifyAll) { let n = 0; for (const e of list.filter((e) => e.status === "pending" && e.level)) { await sb.from("meet_entries").update({ status: "verified" }).eq("id", e.id); n++; } return { verified: n }; }
  const rows = (Array.isArray(b.rows) ? b.rows : []).map((r) => ({ listing_id: l.id, gym_name: str(r.gym_name, 80), athlete_name: str(r.athlete_name, 80), level: str(r.level, 40), division: str(r.division, 40), member_number: str(r.member_number, 30), status: "pending", fee_paid: false })).filter((r) => r.gym_name && r.athlete_name).slice(0, 1000);
  if (!rows.length) throw new HttpError(400, "Add at least one athlete with a gym name.");
  const live = list.filter((e) => e.status !== "scratched").length;
  if (!isOrgPro(profile) && live + rows.length > FREE_ENTRIES) throw Object.assign(new HttpError(402, `The free plan covers ${FREE_ENTRIES} entries per meet. Upgrade to Meet Pro for unlimited entries.`), { code: "meet_pro" });
  const { error } = await sb.from("meet_entries").insert(rows); if (error) throw error;
  return { added: rows.length };
});

// Sessions & rotations. Rotation = gyms (or flights) spread over the four women's events in Olympic order, rotating each round.
const OLYMPIC = { F: ["Vault", "Bars", "Beam", "Floor"], M: ["Floor", "Pommel", "Rings", "Vault", "P-Bars", "High Bar"] };
export function buildRotation(groups, events = OLYMPIC.F) {
  const squads = events.map(() => []);
  [...groups].sort((a, b) => b.count - a.count).forEach((g) => { const i = squads.map((s) => s.reduce((n, x) => n + x.count, 0)).reduce((m, v, k, arr) => (v < arr[m] ? k : m), 0); squads[i].push(g); });
  return events.map((_, round) => ({ round: round + 1, stations: events.map((ev, k) => ({ event: ev, squad: squads[(k - round + events.length * 4) % events.length].map((g) => g.name), athletes: squads[(k - round + events.length * 4) % events.length].reduce((n, g) => n + g.count, 0) })) }));
}
export const sessions = handler(["GET", "POST"], async (req) => {
  const b = req.method === "POST" ? await readJson(req) : null;
  const { profile, l } = await myMeet(req, b ? b.id : new URL(req.url || "/", "http://x").searchParams.get("id"));
  const sb = deps.supabase();
  const { data: ss } = await sb.from("meet_sessions").select("*").eq("listing_id", l.id);
  if (!b) {
    const { data: es } = await sb.from("meet_entries").select("*").eq("listing_id", l.id);
    const live = (es || []).filter((e) => e.status !== "scratched");
    const levels = [...new Set(live.map((e) => e.level).filter(Boolean))].sort((a, x) => a.localeCompare(x, undefined, { numeric: true }));
    return { sessions: (ss || []).sort((a, x) => ((a.day || "") + (a.start_time || "") > (x.day || "") + (x.start_time || "") ? 1 : -1)).map((s) => ({ ...s, athletes: live.filter((e) => s.levels.includes(e.level)).length })), levels,
      unassigned: levels.filter((lv) => !(ss || []).some((s) => s.levels.includes(lv))), pro: isOrgPro(profile) };
  }
  if (b.remove) { await sb.from("meet_sessions").delete().eq("id", b.remove).eq("listing_id", l.id); return { removed: true }; }
  if (b.rotate) {
    if (!isOrgPro(profile) && (ss || []).filter((s) => s.rotation).length >= 1 && !(ss || []).find((s) => s.id === b.rotate)?.rotation) throw Object.assign(new HttpError(402, "Automatic rotations for more than one session are part of Meet Pro."), { code: "meet_pro" });
    const s = (ss || []).find((x) => x.id === b.rotate); if (!s) throw new HttpError(404, "Session not found.");
    const { data: es } = await sb.from("meet_entries").select("*").eq("listing_id", l.id);
    const mine = (es || []).filter((e) => e.status !== "scratched" && s.levels.includes(e.level));
    if (!mine.length) throw new HttpError(400, "No entries in this session's levels yet.");
    const groups = [...new Set(mine.map((e) => `${e.gym_name} · ${e.level}`))].map((name) => ({ name, count: mine.filter((e) => `${e.gym_name} · ${e.level}` === name).length }));
    const rotation = buildRotation(groups, b.mens ? OLYMPIC.M : OLYMPIC.F);
    await sb.from("meet_sessions").update({ rotation }).eq("id", s.id);
    return { rotation };
  }
  const rec = { name: str(b.name, 80), day: DAY.test(b.day || "") ? b.day : null, warmup: str(b.warmup, 20), start_time: str(b.start_time, 20), levels: (Array.isArray(b.levels) ? b.levels : []).map((x) => str(x, 40)).filter(Boolean) };
  if (!rec.name) throw new HttpError(400, "Name the session.");
  if (b.session) { await sb.from("meet_sessions").update(rec).eq("id", b.session).eq("listing_id", l.id); return { saved: true }; }
  const { error } = await sb.from("meet_sessions").insert({ listing_id: l.id, ...rec }); if (error) throw error;
  return { saved: true };
});

// Officials & volunteers, with a one-tap email of everyone's assignment.
export const officials = handler(["GET", "POST"], async (req) => {
  const b = req.method === "POST" ? await readJson(req) : null;
  const { l } = await myMeet(req, b ? b.id : new URL(req.url || "/", "http://x").searchParams.get("id"));
  const sb = deps.supabase();
  const { data: list } = await sb.from("meet_officials").select("*").eq("listing_id", l.id);
  const { data: ss } = await sb.from("meet_sessions").select("id,name,day,start_time").eq("listing_id", l.id);
  if (!b) {
    const roles = [...new Set((list || []).map((o) => o.role))];
    return { officials: (list || []).sort((a, x) => a.role.localeCompare(x.role) || a.name.localeCompare(x.name)), sessions: ss || [], byRole: roles.map((r) => ({ role: r, count: (list || []).filter((o) => o.role === r).length, confirmed: (list || []).filter((o) => o.role === r && o.confirmed).length })) };
  }
  if (b.remove) { await sb.from("meet_officials").delete().eq("id", b.remove).eq("listing_id", l.id); return { removed: true }; }
  if (b.notify) {
    let sent = 0;
    for (const o of (list || []).filter((x) => x.email)) {
      const s = (ss || []).find((x) => x.id === o.session_id);
      await sendEmail({ to: o.email, subject: `${l.name}: your assignment`, html: emailLayout({ title: `${l.name} — ${o.role}`, body: `<p>Hi ${esc(o.name.split(" ")[0])},</p><p>You're our <b>${esc(o.role)}</b>${o.station ? ` at <b>${esc(o.station)}</b>` : ""}${s ? ` for <b>${esc(s.name)}</b>${s.day ? ` on ${esc(s.day)}` : ""}${s.start_time ? ` (${esc(s.start_time)})` : ""}` : ""}.</p><p>${l.location ? `Location: ${esc(l.location)}. ` : ""}Please reply to confirm. Thank you!</p>` }) }).then(() => sent++).catch(() => {});
    }
    return { sent };
  }
  const rec = { name: str(b.name, 80), email: str(b.email, 120), phone: str(b.phone, 30), role: str(b.role, 40) || "Volunteer", session_id: (ss || []).some((s) => s.id === b.session_id) ? b.session_id : null, station: str(b.station, 60), confirmed: !!b.confirmed };
  if (!rec.name) throw new HttpError(400, "Add their name.");
  if (b.official) { await sb.from("meet_officials").update(rec).eq("id", b.official).eq("listing_id", l.id); return { saved: true }; }
  const { error } = await sb.from("meet_officials").insert({ listing_id: l.id, ...rec }); if (error) throw error;
  return { saved: true };
});

// Send one update to every registered gym contact, ticket buyer and follower (uses the meet's update feed).
export const announce = handler(["POST"], async (req) => {
  const b = await readJson(req);
  const { l } = await myMeet(req, b.id);
  const text = str(b.text, 500); if (!text || text.length < 3) throw new HttpError(400, "Write the update first.");
  const sb = deps.supabase();
  const updates = [{ text, at: deps.now().toISOString() }, ...(l.updates || [])].slice(0, 20);
  await sb.from("meet_listings").update({ updates }).eq("id", l.id);
  const [{ data: orders }, { data: offs }] = await Promise.all([sb.from("ticket_orders").select("buyer_email,status").eq("listing_id", l.id), sb.from("meet_officials").select("email").eq("listing_id", l.id)]);
  const extra = (Array.isArray(b.emails) ? b.emails : String(b.emails || "").split(/[\s,;]+/)).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const to = [...new Set([...(orders || []).filter((o) => o.status === "paid").map((o) => o.buyer_email), ...(b.officials ? (offs || []).map((o) => o.email) : []), ...extra].filter(Boolean).map((e) => e.toLowerCase()))].slice(0, 2000);
  let sent = 0;
  for (const e of to) await sendEmail({ to: e, subject: `Update: ${l.name}`, html: emailLayout({ title: `${l.name} — update`, body: `<p style="font-size:17px;line-height:1.5"><b>${esc(text)}</b></p><p><a href="${appUrl()}/tickets/${l.id}" style="color:#6D28D9;font-weight:bold">Meet page</a> · <a href="${appUrl()}/live/${l.id}" style="color:#6D28D9;font-weight:bold">Live scores</a></p>` }) }).then(() => sent++).catch(() => {});
  return { posted: true, sent };
});
