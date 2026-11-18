// Live scores. Meet organizers post official scores during or after a meet (typed, or a results file from their
// scoring software); parents add their own athlete's scores, visible to their family and team. Anyone can watch a
// meet's live page for free, without an account. Followers get an email when their athlete's official scores post.
// Revenue: Live Scoring Pro per meet (TV scoreboard, branding, sponsors, export) — free when the meet sells tickets with us.
import crypto from "node:crypto";
import { handler, readJson, requireUser, requireFeature, deps, env, HttpError, dbError, sendEmail, emailEnabled, emailLayout, esc, todayIn, addDays, throttle, clientIp } from "../lib.js";
import { isAdmin } from "./admin/support.js";
import { totalOf, athleteKey, eventsFor, fmtScore, formatOf, parseTime, matchLine } from "../../src/data/live.js";
import { SPORT_NAMES } from "../../src/data/sports.js";

const appUrl = () => env("APP_URL").replace(/\/$/, "");
export const LIVE_PRO_CENTS = () => Number(process.env.LIVE_PRO_PRICE_CENTS || 14900);
const str = (v, n = 80) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, n) : "");
const httpsUrl = (v) => { try { const u = new URL(String(v || "").trim()); return u.protocol === "https:" && u.hostname.includes(".") ? u.toString().slice(0, 300) : null; } catch { return null; } };
const COLOR = /^#[0-9a-f]{6}$/i;

async function optionalUser(req) { try { return await requireUser(req); } catch { return null; } }
async function getListing(id) {
  if (!id || !/^[A-Za-z0-9-]{2,64}$/.test(String(id))) throw new HttpError(404, "We couldn't find that meet.");
  const { data, error } = await deps.supabase().from("meet_listings").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "We couldn't find that meet.");
  return data;
}
// The organizer who created the event, or an AthleteOrbit admin (meets added from the admin page have no owner).
async function ownListing(userOrId, id, profile) {
  const l = await getListing(id);
  const uid = typeof userOrId === "string" ? userOrId : userOrId.id;
  if (l.owner_id !== uid && !(typeof userOrId === "object" && isAdmin(userOrId, profile))) throw new HttpError(404, "We couldn't find that meet in your events.");
  return l;
}
// Pro is free when the meet sells tickets through AthleteOrbit.
const sellsTickets = (l) => l.status === "on_sale" && (l.ticket_types || []).length > 0;
export const isPro = (l) => !!l.live_pro || sellsTickets(l);
const publicMeet = (l) => ({ id: l.id, name: l.name, host: l.host, location: l.location, sport: l.sport || "Gymnastics", start_date: l.start_date, end_date: l.end_date, sessions: l.sessions || [],
  live_status: l.live_status || "off", pro: isPro(l), branding: isPro(l) ? l.branding || {} : {}, sponsors: isPro(l) ? l.sponsors || [] : [], updates: (l.updates || []).slice(0, 3), tickets: sellsTickets(l) });
const cleanScores = (s, sport) => {
  const f = formatOf(sport), out = {}, max = f === "gym" ? 20 : f === "match" ? 999 : 100000;
  const allowed = new Set(eventsFor(sport, "F").concat(eventsFor(sport, "M")));
  for (const [k, v] of Object.entries(s || {}).slice(0, 8)) {
    const key = str(k, 20); if (!key || v === "" || v == null || (f !== "judged" && !allowed.has(key))) continue;
    const n = f === "timed" ? parseTime(v) : Number(v);
    if (n != null && Number.isFinite(n) && n >= 0 && n <= max) out[key] = f === "match" ? Math.round(n) : Math.round(n * 1000) / 1000;
  }
  return out;
};
const aaOf = (scores, sport) => (formatOf(sport) === "timed" ? scores.Time ?? null : totalOf(scores, sport));
const pubRow = (r) => ({ id: r.id, session: r.session, name: r.name, gym: r.gym, level: r.level, division: r.division, gender: r.gender, scores: r.scores || {}, aa: r.aa, place: r.place, status: r.status || "", source: r.source, updated_at: r.updated_at });

// ---------- public ----------
export const list = handler(["GET"], async (req) => {
  const sp = new URL(req.url || "/", "http://x").searchParams;
  const q = (sp.get("q") || "").toLowerCase().trim(), sport = SPORT_NAMES.includes(sp.get("sport")) ? sp.get("sport") : null;
  const today = todayIn();
  let query = deps.supabase().from("meet_listings").select("*").eq("live_enabled", true).gte("start_date", addDays(today, -400));
  if (sport) query = query.eq("sport", sport);
  const { data, error } = await query;
  if (error) throw dbError(error);
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const all = (data || []).filter((l) => !words.length || words.every((w) => `${l.name} ${l.host || ""} ${l.location || ""} ${l.sport || ""}`.toLowerCase().includes(w)))
    .map((l) => { const end = l.end_date || l.start_date; return { ...publicMeet(l), now: l.live_status === "live" || (l.start_date <= today && end >= today), past: l.live_status === "final" || end < today }; });
  const live = all.filter((m) => !m.past || m.now).sort((a, b) => Number(b.now) - Number(a.now) || (a.start_date > b.start_date ? 1 : -1)).slice(0, 40);
  const past = all.filter((m) => m.past && !m.now).sort((a, b) => (a.start_date < b.start_date ? 1 : -1)).slice(0, 60);
  const athletes = words.length ? await findAthletes(words, data || [], today) : [];
  return { meets: live, past, athletes, sports: [...new Set((data || []).map((l) => l.sport || "Gymnastics"))] };
});

// Search privacy: families can hide an athlete from public name search (More → their athlete → Hide from search).
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
async function hiddenAthletes(sb) {
  try { const { data, error } = await sb.from("gymnasts").select("name,search_name,club").eq("hide_search", true).limit(5000); return error ? [] : (data || []).map((g) => ({ name: norm(g.search_name || g.name), club: norm(g.club) })); } catch { return []; }
}
export function isHidden(r, hidden) {
  if (!hidden.length) return false;
  const n = norm(r.name), gym = norm(r.gym);
  return hidden.some((h) => {
    if (!h.name) return false;
    const a = h.name.split(" "), b = n.split(" ");
    const same = n === h.name || (a[0] === b[0] && (a.length < 2 || b.length < 2 || a[a.length - 1][0] === b[b.length - 1][0]));
    if (!same) return false;
    // Full name typed (first + last): enough on its own. First name only: also needs the gym to match.
    if (a.length >= 2 && b.length >= 2 && (n === h.name || !h.club || !gym || gym.includes(h.club) || h.club.includes(gym))) return true;
    return !!h.club && !!gym && (gym.includes(h.club) || h.club.includes(gym));
  });
}

// Athlete search (like MeetScoresOnline): type a name — optionally with gym, level, meet or city — and get every
// meet with official scores for that athlete. Parent-reported scores stay private to the family and team.
async function findAthletes(words, listings, today) {
  if (!listings.length) return [];
  const byId = Object.fromEntries(listings.map((l) => [l.id, l]));
  const ids = listings.map((l) => l.id), key = [...words].sort((a, b) => b.length - a.length)[0];
  const sb = deps.supabase();
  // Any word could be the name ("maya charlotte"), so look each one up in names (max 3), plus the longest in gyms.
  const looks = await Promise.all([...words.slice(0, 3).map((w) => sb.from("live_scores").select("*").in("listing_id", ids).eq("source", "official").ilike("name", `%${w}%`).limit(300)),
    sb.from("live_scores").select("*").in("listing_id", ids).eq("source", "official").ilike("gym", `%${key}%`).limit(300)]);
  const seen = new Set(), groups = {};
  const hidden = await hiddenAthletes(sb);
  for (const r of looks.flatMap((x) => x.data || [])) {
    if (isHidden(r, hidden)) continue;
    if (seen.has(r.id)) continue; seen.add(r.id);
    const l = byId[r.listing_id]; if (!l) continue;
    const hay = `${r.name} ${r.gym || ""} ${r.level || ""} ${r.division || ""} ${l.name} ${l.location || ""} ${l.host || ""}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    // A name search must hit the athlete's name (not only their gym), unless every word is about the gym/meet.
    if (!words.some((w) => String(r.name).toLowerCase().includes(w))) continue;
    const k = athleteKey(r), sport = l.sport || "Gymnastics", end = l.end_date || l.start_date;
    const g = (groups[k] ||= { key: k, name: r.name, gym: r.gym || "", sport, level: r.level || "", results: [] });
    g.results.push({ meetId: l.id, meet: l.name, date: l.start_date, location: l.location || "", level: r.level || "", division: r.division || "", aa: r.aa, place: r.place ?? null, status: r.status || "", scores: r.scores || {},
      live: l.live_status === "live" || (l.start_date <= today && end >= today) });
    if (!g.level || (r.level && l.start_date > (g.latest || ""))) { g.level = r.level || g.level; g.latest = l.start_date; }
  }
  return Object.values(groups).map(({ latest, ...g }) => ({ ...g, results: g.results.sort((a, b) => (a.date < b.date ? 1 : -1)) }))
    .sort((a, b) => Number(b.results.some((x) => x.live)) - Number(a.results.some((x) => x.live)) || (a.results[0].date < b.results[0].date ? 1 : -1)).slice(0, 30);
}

export const meet = handler(["GET"], async (req) => {
  const id = new URL(req.url || "/", "http://x").searchParams.get("id");
  const l = await getListing(id);
  if (!l.live_enabled) throw new HttpError(404, "Live scores for this meet haven't started yet.");
  const sb = deps.supabase();
  const { data: rows } = await sb.from("live_scores").select("*").eq("listing_id", l.id);
  const official = (rows || []).filter((r) => r.source === "official");
  const me = await optionalUser(req);
  let parent = [], follows = [], mine = [];
  if (me) {
    // Parent-reported scores: your own family's, plus teammates' that were shared with the team.
    const officialKeys = new Set(official.map((r) => `${r.name.toLowerCase()}|${String(r.level || "").toLowerCase()}`));
    parent = (rows || []).filter((r) => r.source === "parent" && (r.reporter_id === me.user.id || (r.share_team && r.club_id && r.club_id === me.profile.club_id)))
      .filter((r) => !officialKeys.has(`${r.name.toLowerCase()}|${String(r.level || "").toLowerCase()}`))
      .map((r) => ({ ...pubRow(r), mine: r.reporter_id === me.user.id, gymnast_id: r.reporter_id === me.user.id ? r.gymnast_id : null, share_team: r.share_team }));
    const { data: f } = await sb.from("live_follows").select("*").eq("user_id", me.user.id).eq("listing_id", l.id);
    follows = (f || []).map((x) => x.athlete_key);
    const { data: kids } = await sb.from("gymnasts").select("id,name,level,program,gender,sport").eq("user_id", me.user.id);
    mine = kids || [];
  }
  return { meet: publicMeet(l), rows: official.map(pubRow), parentRows: parent, follows, myAthletes: mine, signedIn: !!me, canFollow: !!me && (() => { try { requireFeature(me.profile, "liveFollow"); return true; } catch { return false; } })(), owner: !!me && (me.user.id === l.owner_id || isAdmin(me.user, me.profile)) };
});

// ---------- organizer ----------
export const manage = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const b = await readJson(req);
  const l = await ownListing(user, b.id, profile);
  const patch = {};
  if (b.live_enabled !== undefined) patch.live_enabled = !!b.live_enabled;
  if (b.live_status !== undefined) { if (!["off", "live", "final"].includes(b.live_status)) throw new HttpError(400, "Pick off, live or final."); patch.live_status = b.live_status; if (b.live_status !== "off") patch.live_enabled = true; }
  if (b.branding !== undefined || b.sponsors !== undefined) {
    if (!isPro(l)) throw Object.assign(new HttpError(402, "Branding and sponsors are part of Live Scoring Pro."), { code: "live_pro" });
    if (b.branding) patch.branding = { color: COLOR.test(b.branding.color || "") ? b.branding.color : null, tagline: str(b.branding.tagline, 80) || null, logo_url: httpsUrl(b.branding.logo_url) };
    if (b.sponsors) patch.sponsors = (Array.isArray(b.sponsors) ? b.sponsors : []).map((s) => ({ name: str(s.name, 60), tagline: str(s.tagline, 90) || null, url: httpsUrl(s.url), color: COLOR.test(s.color || "") ? s.color : null })).filter((s) => s.name.length >= 2).slice(0, 8);
  }
  if (Object.keys(patch).length) { const { error } = await deps.supabase().from("meet_listings").update(patch).eq("id", l.id); if (error) throw dbError(error); }
  return { ok: true, ...patch };
});

export const post = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const b = await readJson(req);
  const l = await ownListing(user, b.id, profile);
  const sb = deps.supabase();
  if (b.remove) { await sb.from("live_scores").delete().eq("id", b.remove).eq("listing_id", l.id).eq("source", "official"); return { removed: true }; }
  const sport = l.sport || "Gymnastics";
  const incoming = (Array.isArray(b.rows) ? b.rows : []).slice(0, 600).map((r) => {
    const scores = cleanScores(r.scores, sport);
    const aaIn = formatOf(sport) === "timed" ? parseTime(r.aa) : Number(r.aa);
    return { name: str(r.name, 80), gym: str(r.gym, 80), level: str(r.level, 40), division: str(r.division, 40), session: str(r.session, 40), gender: sport === "Gymnastics" ? (r.gender === "M" ? "M" : "F") : null, status: str(r.status, 30),
      scores, aa: Object.keys(scores).length ? aaOf(scores, sport) : formatOf(sport) !== "match" && Number.isFinite(aaIn) && aaIn > 0 ? Math.round(aaIn * 1000) / 1000 : null, place: Number.isInteger(Number(r.place)) && Number(r.place) > 0 && Number(r.place) < 1000 ? Number(r.place) : null };
  }).filter((r) => r.name.length >= 2);
  if (!incoming.length) throw new HttpError(400, "Add at least one athlete with a name.");
  const { data: have } = await sb.from("live_scores").select("*").eq("listing_id", l.id).eq("source", "official");
  const byKey = new Map((have || []).map((r) => [`${athleteKey(r)}|${String(r.session || "").toLowerCase()}`, r]));
  const now = deps.now().toISOString(), changed = [];
  let added = 0, updated = 0;
  for (const r of incoming) {
    const k = `${athleteKey(r)}|${r.session.toLowerCase()}`, old = byKey.get(k);
    if (old) {
      const scores = { ...(old.scores || {}), ...r.scores };
      const next = { ...r, scores, aa: Object.keys(scores).length ? aaOf(scores, sport) : r.aa ?? old.aa, place: r.place ?? old.place, level: r.level || old.level, division: r.division || old.division, status: r.status || old.status || "", updated_at: now };
      if (JSON.stringify([old.scores, old.aa, old.place, old.level, old.status || ""]) !== JSON.stringify([next.scores, next.aa, next.place, next.level, next.status])) { await sb.from("live_scores").update(next).eq("id", old.id); updated++; changed.push({ ...old, ...next }); }
    } else {
      const row = { id: crypto.randomUUID(), listing_id: l.id, source: "official", ...r, created_at: now, updated_at: now };
      const { error } = await sb.from("live_scores").insert(row); if (error) throw dbError(error);
      byKey.set(k, row); added++; changed.push(row);
    }
  }
  const patch = { live_enabled: true, ...(l.live_status === "off" || !l.live_status ? { live_status: "live" } : {}) };
  await sb.from("meet_listings").update(patch).eq("id", l.id);
  const notified = await notifyFollowers({ ...l, ...patch }, changed).catch((e) => { console.error("live notify", e.message); return 0; });
  return { added, updated, notified };
});

// Live Scoring Pro for one meet: $149 one-time (free when the meet sells tickets with AthleteOrbit).
export const proCheckout = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const l = await ownListing(user, (await readJson(req)).id, profile);
  if (isPro(l)) { if (!l.live_pro) await deps.supabase().from("meet_listings").update({ live_pro: true }).eq("id", l.id); return { pro: true }; }
  const s = await deps.stripe().checkout.sessions.create({ mode: "payment", customer_email: user.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: LIVE_PRO_CENTS(), product_data: { name: `Live Scoring Pro — ${l.name}`, description: "TV scoreboard, your branding, sponsor banners and results export for this meet." } } }],
    metadata: { kind: "live_pro", listing_id: l.id, user_id: user.id }, success_url: `${appUrl()}/?page=events&pro=1`, cancel_url: `${appUrl()}/?page=events` });
  return { url: s.url };
});
export async function fulfillLivePro(s) {
  const id = s.metadata?.listing_id; if (!id) return;
  await deps.supabase().from("meet_listings").update({ live_pro: true, live_pro_paid_at: deps.now().toISOString() }).eq("id", id);
}

// ---------- parents ----------
// A parent adds their own athlete's scores (during or after the meet). Shown to their family, and to families of
// the same gym when shared. Replaced on the page as soon as the organizer posts the official scores.
export const report = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const b = await readJson(req);
  const l = await getListing(b.id);
  if (!l.live_enabled) throw new HttpError(409, "This meet isn't taking live scores.");
  const t = throttle(`live-report|${user.id}`, { max: 60, windowMs: 60 * 60 * 1000 }); t.fail();
  const sb = deps.supabase();
  if (b.remove) { await sb.from("live_scores").delete().eq("id", b.remove).eq("reporter_id", user.id).eq("source", "parent"); return { removed: true }; }
  const { data: g } = await sb.from("gymnasts").select("*").eq("id", b.gymnastId).eq("user_id", user.id).maybeSingle();
  if (!g) throw new HttpError(400, "Pick your athlete.");
  const sport = l.sport || "Gymnastics", isMatch = formatOf(sport) === "match";
  const scores = cleanScores(b.scores, sport);
  if (!Object.keys(scores).length) throw new HttpError(400, isMatch ? "Enter the game score." : "Enter at least one score.");
  if (isMatch && str(b.away, 80).length < 2) throw new HttpError(400, "Add the other team's name.");
  const gender = sport === "Gymnastics" ? (g.gender === "M" || g.program === "MAG" ? "M" : "F") : null;
  const { data: clubRow } = profile.club_id ? await sb.from("clubs").select("name").eq("id", profile.club_id).maybeSingle() : { data: null };
  const now = deps.now().toISOString();
  const rec = { listing_id: l.id, source: "parent", reporter_id: user.id, gymnast_id: g.id, club_id: profile.club_id || null, share_team: !!b.share && !!profile.club_id,
    name: isMatch ? str(b.home, 80) || clubRow?.name || g.club || `${g.name}'s team` : g.name, gym: isMatch ? str(b.away, 80) : clubRow?.name || g.club || "", level: isMatch ? str(b.level, 40) || g.level || "" : g.level || "",
    division: str(b.division, 40), session: str(b.session, 40), gender, status: str(b.status, 30), scores, aa: aaOf(scores, sport), updated_at: now };
  let { data: old } = await sb.from("live_scores").select("*").eq("listing_id", l.id).eq("reporter_id", user.id).eq("gymnast_id", g.id).eq("source", "parent").maybeSingle();
  if (old && isMatch && athleteKey(old) !== athleteKey(rec)) old = null; // a different game at the same tournament
  if (old && isMatch) await sb.from("live_scores").update(rec).eq("id", old.id);
  else if (old) await sb.from("live_scores").update({ ...rec, scores: { ...(old.scores || {}), ...scores }, aa: aaOf({ ...(old.scores || {}), ...scores }, sport) }).eq("id", old.id);
  else { const { error } = await sb.from("live_scores").insert({ id: crypto.randomUUID(), ...rec, created_at: now }); if (error) throw dbError(error); }
  // Also keep it in the family's own score history (gymnastics), once per meet.
  let saved = false;
  if (b.saveToScores && sport === "Gymnastics" && (!g.sport || g.sport === "Gymnastics")) {
    const { data: prev } = await sb.from("scores").select("id").eq("user_id", user.id).eq("gymnast_id", g.id).eq("meet_name", l.name);
    const all = old ? { ...(old.scores || {}), ...scores } : scores;
    const ev = { vault: all.Vault ?? null, bars: all.Bars ?? null, beam: all.Beam ?? null, floor: all.Floor ?? null, pommel: all.Pommel ?? null, rings: all.Rings ?? null, pbars: all["P-Bars"] ?? null, highbar: all["High Bar"] ?? null };
    if (prev?.length) await sb.from("scores").update(ev).eq("id", prev[0].id);
    else await sb.from("scores").insert({ user_id: user.id, gymnast_id: g.id, meet_name: l.name, meet_date: l.start_date, level: g.level || null, ...ev });
    saved = true;
  }
  return { saved: true, toScores: saved };
});

// Follow an athlete at a meet: email when their official scores post or change. Included in Basic and Pro.
export const follow = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "liveFollow");
  const b = await readJson(req);
  const l = await getListing(b.id);
  const key = athleteKey({ name: b.name, gym: b.gym });
  if (key.length < 4) throw new HttpError(400, "Pick an athlete to follow.");
  const sb = deps.supabase();
  const { data: f } = await sb.from("live_follows").select("*").eq("user_id", user.id).eq("listing_id", l.id).eq("athlete_key", key).maybeSingle();
  if (f) { await sb.from("live_follows").delete().eq("id", f.id); return { following: false }; }
  const { data: mine } = await sb.from("live_follows").select("id").eq("user_id", user.id).eq("listing_id", l.id);
  if ((mine || []).length >= 20) throw new HttpError(409, "You can follow up to 20 athletes per meet.");
  await sb.from("live_follows").insert({ id: crypto.randomUUID(), user_id: user.id, listing_id: l.id, athlete_key: key, name: str(b.name, 80), gym: str(b.gym, 80) });
  return { following: true };
});

async function notifyFollowers(l, changed) {
  if (!changed.length || !emailEnabled()) return 0;
  const sb = deps.supabase();
  const { data: fs } = await sb.from("live_follows").select("*").eq("listing_id", l.id);
  if (!fs?.length) return 0;
  const byKey = {}; for (const r of changed) byKey[athleteKey(r)] = r;
  let n = 0;
  const users = {};
  for (const f of fs) { const r = byKey[f.athlete_key]; if (!r) continue; (users[f.user_id] ||= []).push(r); }
  for (const [uid, rows] of Object.entries(users)) {
    const { data: p } = await sb.from("profiles").select("email,email_reminders").eq("id", uid).maybeSingle();
    if (!p?.email || p.email_reminders === false) continue;
    const sport = l.sport || "Gymnastics";
    const lines = rows.map((r) => formatOf(sport) === "match" ? `<p style="margin:0 0 10px"><b>${esc(matchLine(r))}</b>${r.status ? ` · ${esc(r.status)}` : ""}${r.level ? ` · ${esc(r.level)}` : ""}</p>` : `<p style="margin:0 0 10px"><b>${esc(r.name)}</b>${r.level ? ` · ${esc(r.level)}` : ""}${r.division ? ` · ${esc(r.division)}` : ""}<br>${eventsFor(sport, r.gender).filter((e) => r.scores?.[e] != null).map((e) => `${esc(e)} ${esc(fmtScore(r.scores[e], sport))}`).join(" · ")}${r.aa != null && sport === "Gymnastics" ? ` · <b>AA ${esc(fmtScore(r.aa, sport))}</b>` : ""}</p>`).join("");
    await sendEmail({ to: p.email, subject: `New scores: ${rows.map((r) => r.name.split(" ")[0]).join(", ")} at ${l.name}`, html: emailLayout({ title: `Live from ${l.name}`, body: `${lines}<p><a href="${esc(appUrl())}/live/${esc(l.id)}" style="color:#6D3FD9;font-weight:bold">See live scores and rankings</a></p>` }) }).then(() => n++).catch(() => {});
  }
  return n;
}
