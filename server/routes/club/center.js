// Gym / center features: roster, season schedule (from a photo) that each athlete sees filtered to
// their own level and girls/boys, online lookup of host + website + session times, and parent–gym messages.
import { handler, readJson, requireUser, requireFeature, useQuota, tierOf, deps, env, HttpError, callClaude, canSearchWeb, WEB_SEARCH, imageBlock, sendEmail, emailEnabled, emailLayout, esc, todayIn, addDays } from "../../lib.js";
import { levelKey, genderOf, parseGender, meetMatches, sessionFor, shortName } from "../../../src/data/levels.js";
import { SPORTS, sportOf } from "../../../src/data/sports.js";
import { defaultPacking } from "../../../src/data/packing.js";
import { hasFeature } from "../../../src/data/plans.js";

const str = (v, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const appUrl = () => env("APP_URL").replace(/\/$/, "");
const httpsUrl = (v) => { try { const u = new URL(String(v || "").trim()); return u.protocol === "https:" && !u.username && u.hostname.includes(".") ? u.toString().slice(0, 480) : null; } catch { return null; } };

async function ownedClub(userId) {
  const { data } = await deps.supabase().from("clubs").select("*").eq("owner_id", userId);
  const club = (data || [])[0];
  if (!club) throw new HttpError(403, "This is for gym accounts. Start your gym plan or free trial first.");
  return club;
}
const parseJson = (text, msg) => {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  try { return JSON.parse(text.slice(a, b + 1)); } catch { throw new HttpError(422, msg); }
};

// ---------- gym free trial: a gym can start without paying, so roster and schedule can be set up first ----------
export const trial = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const sb = deps.supabase();
  const { data: mine } = await sb.from("clubs").select("id").eq("owner_id", user.id);
  if (mine?.length) throw new HttpError(409, "Your gym is already set up.");
  const name = str((await readJson(req)).clubName, 80) || str(profile.gym_name, 80);
  if (!name || name.length < 2) throw new HttpError(400, "Enter your gym or club name.");
  const code = `${name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "GYM"}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
  const active_until = new Date(deps.now().getTime() + 30 * 86400000).toISOString();
  const { error } = await sb.from("clubs").insert({ name, code, owner_id: user.id, seats: Number(process.env.CLUB_SEATS || 50), active_until, plan: "trial" });
  if (error) throw error;
  return { code, active_until };
});

// ---------- roster ----------
export function cleanRosterRow(r, sport = "Gymnastics") {
  const name = str(r.name, 80); if (!name) return null;
  const level = str(r.level, 40);
  let gender = parseGender(r.gender) || parseGender(r.program);
  let program = null;
  if (sport === "Gymnastics") {
    const p = String(r.program || "").toUpperCase();
    program = /XCEL/i.test(`${r.program} ${level}`) || levelKey(level).startsWith("x-") ? "Xcel" : p === "MAG" || gender === "M" ? "MAG" : "WAG";
    gender = program === "MAG" ? "M" : "F";
  }
  const email = String(r.parent_email || "").trim().toLowerCase();
  return { name, level, program, gender, sport, group_name: str(r.group || r.group_name, 60), parent_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null };
}

async function linkedCounts(rosterIds) {
  if (!rosterIds.length) return {};
  const { data } = await deps.supabase().from("gymnasts").select("id,user_id,roster_id").in("roster_id", rosterIds);
  const out = {};
  for (const g of data || []) (out[g.roster_id] ||= new Set()).add(g.user_id);
  return out;
}

export const roster = handler(["GET", "POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await ownedClub(user.id);
  const sb = deps.supabase();
  if (req.method === "POST") {
    const b = await readJson(req);
    if (b.remove) { await sb.from("club_roster").delete().eq("id", b.remove).eq("club_id", club.id); return { ok: true }; }
    if (b.update?.id) {
      const row = cleanRosterRow(b.update, club.sport || "Gymnastics");
      if (!row) throw new HttpError(400, "Add the athlete's name.");
      await sb.from("club_roster").update(row).eq("id", b.update.id).eq("club_id", club.id);
      // Athletes already linked to a family follow the gym's level, then their schedule is rebuilt.
      await sb.from("gymnasts").update({ level: row.level, ...(row.program ? { program: row.program } : {}), gender: row.gender }).eq("roster_id", b.update.id);
      await syncClub(club.id);
      return { ok: true };
    }
    const rows = (Array.isArray(b.rows) ? b.rows : []).map((r) => cleanRosterRow(r, club.sport || "Gymnastics")).filter(Boolean).slice(0, 600);
    if (!rows.length) throw new HttpError(400, "We couldn't find any athletes in that list. Use one line per athlete: Name, Level, Girl/Boy.");
    const { data: existing } = await sb.from("club_roster").select("*").eq("club_id", club.id);
    const have = new Set((existing || []).map((r) => `${r.name.toLowerCase()}|${levelKey(r.level)}`));
    const fresh = rows.filter((r) => { const k = `${r.name.toLowerCase()}|${levelKey(r.level)}`; if (have.has(k)) return false; have.add(k); return true; });
    if (fresh.length) { const { error } = await sb.from("club_roster").insert(fresh.map((r) => ({ ...r, club_id: club.id }))); if (error) throw error; }
    const linked = await autoClaimAll(club);
    return { added: fresh.length, skipped: rows.length - fresh.length, linked };
  }
  const { data } = await sb.from("club_roster").select("*").eq("club_id", club.id);
  const counts = await linkedCounts((data || []).map((r) => r.id));
  return { club: { name: club.name, code: club.code }, roster: (data || []).sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ ...r, families: counts[r.id]?.size || 0 })) };
});

// Parents in the gym search the roster by name or level. Other families' athletes show as "First L." only.
export const rosterSearch = handler(["GET"], async (req) => {
  const { user, profile } = await requireUser(req);
  if (!profile.club_id) throw new HttpError(403, "Join your gym with its code first.");
  const u = new URL(req.url || "/", "http://x");
  const q = (u.searchParams.get("q") || "").toLowerCase().trim(), lvl = u.searchParams.get("level") || "";
  const sb = deps.supabase();
  const { data } = await sb.from("club_roster").select("*").eq("club_id", profile.club_id);
  const { data: mine } = await sb.from("gymnasts").select("id,roster_id").eq("user_id", user.id);
  const mineIds = new Set((mine || []).map((g) => g.roster_id).filter(Boolean));
  const rows = (data || []).filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!lvl || levelKey(r.level) === levelKey(lvl)));
  const counts = await linkedCounts(rows.map((r) => r.id));
  const levels = [...new Set((data || []).map((r) => r.level).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { total: (data || []).length, levels, results: rows.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40).map((r) => ({ id: r.id, name: shortName(r.name), level: r.level, program: r.program, gender: r.gender, sport: r.sport, group: r.group_name, mine: mineIds.has(r.id), full: (counts[r.id]?.size || 0) >= 2 && !mineIds.has(r.id) })) };
});

// Link a roster athlete to this family: creates the child's profile (or links an existing one with the same first name).
async function claim(sb, club, userId, r) {
  const { data: kids } = await sb.from("gymnasts").select("*").eq("user_id", userId);
  if ((kids || []).some((g) => g.roster_id === r.id)) return false;
  const first = r.name.trim().split(/\s+/)[0];
  const rec = { level: r.level || "Team", program: r.sport === "Gymnastics" ? r.program || "WAG" : "Other", sport: r.sport || "Gymnastics", gender: r.gender, club: club.name, roster_id: r.id };
  const same = (kids || []).find((g) => !g.roster_id && g.name.trim().toLowerCase() === first.toLowerCase());
  if (same) await sb.from("gymnasts").update(rec).eq("id", same.id).eq("user_id", userId);
  else {
    if ((kids || []).length >= 6) throw new HttpError(409, "You already have 6 athletes on this account.");
    const { error } = await sb.from("gymnasts").insert({ user_id: userId, name: first, ...rec }); if (error) throw error;
  }
  return true;
}
export const rosterClaim = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  if (!profile.club_id) throw new HttpError(403, "Join your gym with its code first.");
  const { rosterId } = await readJson(req);
  const sb = deps.supabase();
  const { data: r } = await sb.from("club_roster").select("*").eq("id", rosterId).eq("club_id", profile.club_id).maybeSingle();
  if (!r) throw new HttpError(404, "We couldn't find that athlete on your gym's roster.");
  const counts = await linkedCounts([r.id]);
  if ((counts[r.id]?.size || 0) >= 2 && !counts[r.id].has(user.id)) throw new HttpError(409, "This athlete is already linked to two family accounts. Ask your gym if that's not right.");
  const { data: club } = await sb.from("clubs").select("*").eq("id", profile.club_id).maybeSingle();
  await claim(sb, club, user.id, r);
  const added = await syncClub(club.id, user.id);
  return { linked: true, name: r.name.split(/\s+/)[0], meets: added };
});

// Roster rows that carry a parent's email link themselves: no searching needed.
export async function autoClaim(club, userId, email) {
  if (!email) return 0;
  const sb = deps.supabase();
  const { data } = await sb.from("club_roster").select("*").eq("club_id", club.id).eq("parent_email", String(email).toLowerCase());
  let n = 0;
  for (const r of data || []) { try { if (await claim(sb, club, userId, r)) n++; } catch {} }
  if (n) await syncClub(club.id, userId);
  return n;
}
async function autoClaimAll(club) {
  const sb = deps.supabase();
  const { data: fams } = await sb.from("profiles").select("id,email").eq("club_id", club.id);
  let n = 0;
  for (const f of fams || []) n += await autoClaim(club, f.id, f.email);
  await syncClub(club.id);
  return n;
}

// ---------- season schedule ----------
const SCHEDULE_PROMPT = (today, sport) => `You read a photo or screenshot of a sports team's competition schedule for the season and return ONLY JSON:
{"sport": string, "competitions": [{"name": string, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"|null, "location": string|null, "host": string|null, "levels": [string], "gender": "F"|"M"|null, "notes": string|null}]}
Rules:
- One entry per competition per group that attends it. If girls and boys (or different levels) attend different meets, make separate entries.
- levels: the levels or groups that attend, written like "Level 4", "Level 10", "Xcel Gold" (or the sport's own group names). "Levels 3-5" means ["Level 3","Level 4","Level 5"]. If the schedule says all levels / whole team, or gives no levels, use [].
- gender: "F" for girls/women (WAG, Xcel, "Girls"), "M" for boys/men (MAG, "Boys"), null when it applies to both or isn't stated.
- Dates: today is ${today}. Schedules often leave out the year: pick the year that makes each date fall in the coming season (not more than 2 months in the past).
- location: "City, ST" when shown. host: the host gym or organizer when shown. Never invent a detail that isn't on the page.
- sport: one of ${Object.keys(SPORTS).join(", ")}${sport ? ` (this team does ${sport})` : ""}.`;

export function cleanCompetitions(j, sport) {
  const sp = SPORTS[j?.sport] ? j.sport : SPORTS[sport] ? sport : "Gymnastics";
  const out = [];
  for (const c of Array.isArray(j?.competitions) ? j.competitions : []) {
    const name = str(c.name, 140), start = date(c.start_date);
    if (!name || name.length < 2 || !start) continue;
    const end = date(c.end_date);
    out.push({ name, start_date: start, end_date: end && end >= start ? end : null, location: str(c.location), host: str(c.host), website: httpsUrl(c.website), venue: str(c.venue),
      levels: [...new Set((Array.isArray(c.levels) ? c.levels : []).map((l) => str(String(l), 40)).filter(Boolean))].slice(0, 20), gender: c.gender === "F" || c.gender === "M" ? c.gender : null, sport: sp, notes: str(c.notes, 300) });
  }
  return out.sort((a, b) => (a.start_date > b.start_date ? 1 : -1)).slice(0, 80);
}

export const scheduleRead = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const sb = deps.supabase();
  const { data: own } = await sb.from("clubs").select("id,sport").eq("owner_id", user.id);
  if (!own?.length) requireFeature(profile, "schedule");
  const b = await readJson(req);
  await useQuota(user.id, "schedule");
  const text = await callClaude({ system: SCHEDULE_PROMPT(todayIn(), own?.[0]?.sport || str(b.sport, 40)), maxTokens: 4000,
    messages: [{ role: "user", content: [imageBlock(b.image), { type: "text", text: "Read every competition on this schedule." }] }] });
  const comps = cleanCompetitions(parseJson(text, "We couldn't read that schedule. Try a clearer, straight-on photo or a screenshot."), own?.[0]?.sport || b.sport);
  if (!comps.length) throw new HttpError(422, "We couldn't find any competitions with dates in that picture. Try a clearer photo or a screenshot.");
  return { competitions: comps };
});

// Build each family's meets from the gym's published schedule. Only matching level + girls/boys are added;
// auto-added meets that no longer match (the athlete changed level) are removed if still in the future.
export async function syncClub(clubId, onlyUserId = null) {
  const sb = deps.supabase(), today = todayIn();
  const { data: cms } = await sb.from("club_meets").select("*").eq("club_id", clubId).eq("status", "published");
  const meets = (cms || []).filter((m) => (m.end_date || m.start_date) >= today);
  let fams;
  if (onlyUserId) fams = [{ id: onlyUserId }];
  else { const { data } = await sb.from("profiles").select("id").eq("club_id", clubId); fams = data || []; }
  if (!fams.length) return 0;
  const { data: kids } = await sb.from("gymnasts").select("*").in("user_id", fams.map((f) => f.id));
  const { data: existing } = await sb.from("meets").select("*").in("user_id", fams.map((f) => f.id));
  const mine = (existing || []).filter((m) => m.club_meet_id);
  const liveIds = new Set(meets.map((m) => m.id));
  let added = 0;
  for (const g of kids || []) {
    for (const cm of meets) {
      const row = mine.find((m) => m.gymnast_id === g.id && m.club_meet_id === cm.id);
      const match = meetMatches(cm, g);
      const session = sessionFor(cm, g);
      if (match && !row) {
        // A meet the parent typed in themselves (same day, similar name) is linked instead of duplicated.
        const twin = (existing || []).find((m) => m.gymnast_id === g.id && !m.club_meet_id && m.start_date === cm.start_date);
        if (twin) { await sb.from("meets").update({ club_meet_id: cm.id, host: twin.host || cm.host, location: twin.location || cm.location, website: cm.website, venue: cm.venue, session_time: twin.session_time || session }).eq("id", twin.id); continue; }
        const { error } = await sb.from("meets").insert({ user_id: g.user_id, gymnast_id: g.id, club_meet_id: cm.id, name: cm.name, start_date: cm.start_date, end_date: cm.end_date, location: cm.location, host: cm.host,
          website: cm.website, venue: cm.venue, session_time: session, status: "Planned", notes: cm.notes, info_source: cm.info_source, info_checked_at: cm.info_checked_at, checklist: defaultPacking(g) });
        if (!error) added++;
      } else if (match && row) {
        const patch = {};
        for (const k of ["name", "start_date", "end_date", "location", "host", "website", "venue", "info_source", "info_checked_at"]) if ((cm[k] ?? null) !== (row[k] ?? null) && cm[k] != null) patch[k] = cm[k];
        if (session && session !== row.session_time) patch.session_time = session;
        if (Object.keys(patch).length) await sb.from("meets").update(patch).eq("id", row.id);
      } else if (!match && row && row.start_date >= today) {
        await sb.from("meets").delete().eq("id", row.id);
      }
    }
  }
  // Competitions the gym removed: drop the auto-added copies that haven't happened yet.
  for (const m of mine) if (!liveIds.has(m.club_meet_id) && m.start_date >= today && (cms || []).every((c) => c.id !== m.club_meet_id)) await sb.from("meets").delete().eq("id", m.id);
  return added;
}

export const schedule = handler(["GET", "POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await ownedClub(user.id);
  const sb = deps.supabase();
  if (req.method === "POST") {
    const b = await readJson(req);
    if (b.remove) {
      const { data: cm } = await sb.from("club_meets").select("id").eq("id", b.remove).eq("club_id", club.id).maybeSingle();
      if (!cm) throw new HttpError(404, "Competition not found.");
      // Families' auto-added copies that haven't happened yet go with it; past ones stay as history.
      await sb.from("meets").delete().eq("club_meet_id", cm.id).gte("start_date", todayIn());
      await sb.from("club_meets").delete().eq("id", cm.id);
      return { ok: true };
    }
    if (b.publish) { await sb.from("club_meets").update({ status: "published" }).eq("id", b.publish).eq("club_id", club.id); return { ok: true, added: await syncClub(club.id) }; }
    if (b.update?.id) {
      const [c] = cleanCompetitions({ sport: club.sport, competitions: [b.update] }, club.sport);
      if (!c) throw new HttpError(400, "Add the competition's name and date.");
      const sessions = Array.isArray(b.update.sessions) ? b.update.sessions.map((s) => ({ levels: (s.levels || []).map(String).slice(0, 20), gender: s.gender === "F" || s.gender === "M" ? s.gender : null, text: str(s.text, 160) })).filter((s) => s.text).slice(0, 20) : undefined;
      await sb.from("club_meets").update({ ...c, ...(sessions ? { sessions } : {}) }).eq("id", b.update.id).eq("club_id", club.id);
      return { ok: true, added: await syncClub(club.id) };
    }
    const comps = cleanCompetitions({ sport: club.sport, competitions: b.add }, club.sport);
    if (!comps.length) throw new HttpError(400, "Add at least one competition with a name and date.");
    const { data: have } = await sb.from("club_meets").select("*").eq("club_id", club.id);
    const key = (c) => `${c.start_date}|${c.name.toLowerCase()}|${c.gender || ""}|${(c.levels || []).map(levelKey).sort().join(",")}`;
    const seen = new Set((have || []).map(key));
    const fresh = comps.filter((c) => !seen.has(key(c)));
    if (fresh.length) { const { error } = await sb.from("club_meets").insert(fresh.map((c) => ({ ...c, club_id: club.id, created_by: user.id, status: "published" }))); if (error) throw error; }
    const added = await syncClub(club.id);
    return { saved: fresh.length, skipped: comps.length - fresh.length, added };
  }
  const { data } = await sb.from("club_meets").select("*").eq("club_id", club.id);
  const { data: fams } = await sb.from("profiles").select("id").eq("club_id", club.id);
  const { data: kids } = fams?.length ? await sb.from("gymnasts").select("*").in("user_id", fams.map((f) => f.id)) : { data: [] };
  const { data: ros } = await sb.from("club_roster").select("*").eq("club_id", club.id);
  return { competitions: (data || []).sort((a, b) => (a.start_date > b.start_date ? 1 : -1)).map((m) => ({ ...m, athletes: (ros || []).filter((r) => meetMatches(m, r)).length, families: new Set((kids || []).filter((g) => meetMatches(m, g)).map((g) => g.user_id)).size })) };
});

// A parent adds the schedule for their own athletes (and can pass it to the gym to publish for everyone).
export const scheduleApply = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "schedule");
  const b = await readJson(req);
  const comps = cleanCompetitions({ competitions: b.competitions, sport: b.sport }, b.sport);
  if (!comps.length) throw new HttpError(400, "Pick at least one competition.");
  const sb = deps.supabase();
  const { data: kids } = await sb.from("gymnasts").select("*").eq("user_id", user.id);
  const { data: have } = await sb.from("meets").select("*").eq("user_id", user.id);
  const per = {}; let added = 0;
  for (const g of kids || []) for (const c of comps) {
    if (!meetMatches(c, g)) continue;
    if ((have || []).some((m) => m.gymnast_id === g.id && m.start_date === c.start_date && m.name.toLowerCase() === c.name.toLowerCase())) continue;
    const { error } = await sb.from("meets").insert({ user_id: user.id, gymnast_id: g.id, name: c.name, start_date: c.start_date, end_date: c.end_date, location: c.location, host: c.host, status: "Planned", notes: c.notes, checklist: defaultPacking(g) });
    if (!error) { added++; per[g.name] = (per[g.name] || 0) + 1; }
  }
  let shared = 0;
  if (b.share && profile.club_id) {
    const { data: cm } = await sb.from("club_meets").select("*").eq("club_id", profile.club_id);
    const seen = new Set((cm || []).map((c) => `${c.start_date}|${c.name.toLowerCase()}`));
    const fresh = comps.filter((c) => !seen.has(`${c.start_date}|${c.name.toLowerCase()}`));
    if (fresh.length) { await sb.from("club_meets").insert(fresh.map((c) => ({ ...c, club_id: profile.club_id, created_by: user.id, status: "suggested" }))); shared = fresh.length; }
  }
  return { added, perAthlete: per, shared };
});

// ---------- look the competition up online: host, official website, venue, session times ----------
const LOOKUP_PROMPT = `You find official details for a youth sports competition using web search. Return ONLY JSON:
{"found": boolean, "host": string|null, "website": string|null, "venue": string|null, "address": string|null,
 "sessions": [{"levels": [string], "gender": "F"|"M"|null, "text": string}], "schedule_published": boolean, "source_url": string|null}
Rules:
- website: the official meet page (host gym's meet page, meet website, or the organizer's event page). https only. Not a search page.
- sessions: ONLY if a session schedule is published for THIS competition and year. One entry per session for the levels asked about, text like "Sat Jan 17 · Session 2 · open stretch 11:30 AM, march-in 12:15 PM". Otherwise [] and schedule_published false.
- Never guess times, sessions, venues or websites. If you can't confirm that a page is about this exact competition (same name and year/date), set found false.
- source_url: the page you took the details from.`;

export async function lookupOnline(m, athlete = null) {
  if (!canSearchWeb()) return null;
  const who = athlete ? `${athlete.level || ""} ${genderOf(athlete) === "M" ? "boys" : genderOf(athlete) === "F" ? "girls" : ""}`.trim() : `${(m.levels || []).join(", ") || "all levels"} ${m.gender === "M" ? "boys" : m.gender === "F" ? "girls" : ""}`.trim();
  const text = await callClaude({ system: LOOKUP_PROMPT, maxTokens: 1500, tools: [WEB_SEARCH],
    messages: [{ role: "user", content: `Competition: ${m.name}\nSport: ${m.sport || (athlete ? sportOf(athlete) : "Gymnastics")}\nDate: ${m.start_date}${m.end_date ? ` to ${m.end_date}` : ""}\nLocation: ${m.location || "unknown"}\nHost (if known): ${m.host || "unknown"}\nSessions needed for: ${who}` }] });
  let j; try { j = parseJson(text, "x"); } catch { return null; }
  if (!j || j.found === false) return { found: false };
  const sessions = (Array.isArray(j.sessions) ? j.sessions : []).map((s) => ({ levels: (Array.isArray(s.levels) ? s.levels : []).map((l) => String(l).slice(0, 40)).slice(0, 20), gender: s.gender === "F" || s.gender === "M" ? s.gender : null, text: str(s.text, 160) })).filter((s) => s.text).slice(0, 20);
  return { found: true, host: str(j.host), website: httpsUrl(j.website), venue: str([j.venue, j.address].filter(Boolean).join(", "), 200), sessions: j.schedule_published === false ? [] : sessions, source: httpsUrl(j.source_url) || httpsUrl(j.website) };
}

async function applyLookupToClubMeet(cm, info) {
  const sb = deps.supabase();
  const patch = { info_checked_at: deps.now().toISOString() };
  if (info?.found) Object.assign(patch, { host: cm.host || info.host, website: info.website || cm.website, venue: info.venue || cm.venue, info_source: info.source, ...(info.sessions.length ? { sessions: info.sessions } : {}) });
  await sb.from("club_meets").update(patch).eq("id", cm.id);
  return patch;
}
async function applyLookupToMeet(meet, g, info) {
  const sb = deps.supabase();
  const patch = { info_checked_at: deps.now().toISOString() };
  let newTime = null;
  if (info?.found) {
    const s = sessionFor({ sessions: info.sessions }, g) || (info.sessions.length === 1 ? info.sessions[0].text : null);
    if (s && s !== meet.session_time) newTime = s;
    Object.assign(patch, { host: meet.host || info.host, website: info.website || meet.website, venue: info.venue || meet.venue, info_source: info.source, ...(newTime ? { session_time: newTime } : {}) });
  }
  await sb.from("meets").update(patch).eq("id", meet.id);
  return { patch, newTime };
}

export const lookup = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const b = await readJson(req);
  const sb = deps.supabase();
  if (!canSearchWeb()) throw new HttpError(501, "Online lookup isn't switched on yet.");
  if (b.clubMeetId) {
    const club = await ownedClub(user.id);
    const { data: cm } = await sb.from("club_meets").select("*").eq("id", b.clubMeetId).eq("club_id", club.id).maybeSingle();
    if (!cm) throw new HttpError(404, "Competition not found.");
    await useQuota(user.id, "lookup");
    const info = await lookupOnline(cm);
    const patch = await applyLookupToClubMeet(cm, info);
    await syncClub(club.id);
    return { found: !!info?.found, ...patch };
  }
  requireFeature(profile, "schedule");
  const { data: meet } = await sb.from("meets").select("*").eq("id", b.meetId).eq("user_id", user.id).maybeSingle();
  if (!meet) throw new HttpError(404, "Meet not found.");
  const { data: g } = await sb.from("gymnasts").select("*").eq("id", meet.gymnast_id).maybeSingle();
  await useQuota(user.id, "lookup");
  const info = await lookupOnline(meet, g);
  const { patch } = await applyLookupToMeet(meet, g || {}, info);
  return { found: !!info?.found, ...patch };
});

// Daily: look up upcoming competitions that have never been checked, and re-check ones inside 3 weeks that
// still have no session time. When a time appears, the family is emailed. Small batches (each lookup takes a while).
export async function runLookups({ max = 3, budgetMs = 40000 } = {}) {
  if (!canSearchWeb()) return { skipped: "no web search" };
  const sb = deps.supabase(), today = todayIn(), soon = addDays(today, 21), started = Date.now(), stale = deps.now().getTime() - 3 * 86400000;
  const due = (m, hasTime) => (m.end_date || m.start_date) >= today && (!m.info_checked_at || (m.start_date <= soon && !hasTime && new Date(m.info_checked_at).getTime() < stale));
  let checked = 0, times = 0;
  const { data: cms } = await sb.from("club_meets").select("*").eq("status", "published").gte("start_date", addDays(today, -3));
  for (const cm of (cms || []).filter((m) => due(m, (m.sessions || []).length > 0)).sort((a, b) => (a.start_date > b.start_date ? 1 : -1))) {
    if (checked >= max || Date.now() - started > budgetMs) break;
    checked++;
    try { const patch = await applyLookupToClubMeet(cm, await lookupOnline(cm)); if (patch.sessions) times++; await syncClub(cm.club_id); } catch (e) { console.error("lookup failed", cm.id, e.message); }
  }
  const { data: ms } = await sb.from("meets").select("*").gte("start_date", addDays(today, -1));
  for (const m of (ms || []).filter((x) => !x.club_meet_id && x.status !== "Skipped" && x.start_date <= addDays(today, 45) && due(x, !!x.session_time)).sort((a, b) => (a.start_date > b.start_date ? 1 : -1))) {
    if (checked >= max || Date.now() - started > budgetMs) break;
    const { data: pr } = await sb.from("profiles").select("*").eq("id", m.user_id).maybeSingle();
    if (!pr) continue;
    if (pr.club_id) { const { data: club } = await sb.from("clubs").select("*").eq("id", pr.club_id).maybeSingle(); pr._club = club; }
    if (!hasFeature(tierOf(pr), "schedule")) continue;
    const { data: g } = await sb.from("gymnasts").select("*").eq("id", m.gymnast_id).maybeSingle();
    checked++;
    try {
      const { newTime } = await applyLookupToMeet(m, g || {}, await lookupOnline(m, g));
      if (newTime) {
        times++;
        if (pr.email && pr.email_reminders !== false && emailEnabled()) await sendEmail({ to: pr.email, subject: `Session time posted: ${m.name}`, html: emailLayout({ title: `${g?.name || "Your athlete"}'s session time is posted`,
          body: `<p><b>${esc(m.name)}</b> · ${esc(m.start_date)}</p><p>🕐 ${esc(newTime)}</p><p style="color:#7B8197;font-size:13px">Found online — please double-check with your gym.</p><p><a href="${esc(appUrl())}/?meet=${esc(m.id)}" style="color:#E5523F;font-weight:bold">Open the meet</a></p>` }) }).catch(() => {});
      }
    } catch (e) { console.error("lookup failed", m.id, e.message); }
  }
  return { checked, times };
}

// ---------- messages between a family and their gym ----------
async function familyLabel(sb, familyId) {
  const [{ data: p }, { data: kids }] = await Promise.all([sb.from("profiles").select("full_name,username,email").eq("id", familyId).maybeSingle(), sb.from("gymnasts").select("name,level").eq("user_id", familyId)]);
  return { name: p?.full_name || p?.username || "Parent", email: p?.email || null, athletes: (kids || []).map((k) => `${k.name}${k.level ? ` (${k.level})` : ""}`).join(", ") };
}

export const messages = handler(["GET", "POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const sb = deps.supabase();
  const { data: own } = await sb.from("clubs").select("*").eq("owner_id", user.id);
  const club = own?.[0] || null;
  if (req.method === "POST") {
    const b = await readJson(req);
    const body = str(b.body, 2000);
    if (!body) throw new HttpError(400, "Write a message first.");
    if (club && b.familyId) {
      const { data: fam } = await sb.from("profiles").select("id,email,club_id,email_reminders").eq("id", b.familyId).maybeSingle();
      if (!fam || fam.club_id !== club.id) throw new HttpError(404, "That family isn't in your gym.");
      const { error } = await sb.from("club_messages").insert({ club_id: club.id, family_id: fam.id, sender: "gym", body, read_by_gym: true }); if (error) throw error;
      if (fam.email && emailEnabled()) await sendEmail({ to: fam.email, subject: `New message from ${club.name}`, html: emailLayout({ title: `${club.name} sent you a message`, body: `<p style="white-space:pre-wrap;line-height:1.6">${esc(body)}</p><p><a href="${esc(appUrl())}/?page=gym" style="color:#E5523F;font-weight:bold">Reply in AthleteOrbit</a></p>` }) }).catch(() => {});
      return { sent: true };
    }
    if (!profile.club_id) throw new HttpError(403, "Join your gym with its code to message them.");
    const { data: c } = await sb.from("clubs").select("*").eq("id", profile.club_id).maybeSingle();
    if (!c) throw new HttpError(404, "Gym not found.");
    const { error } = await sb.from("club_messages").insert({ club_id: c.id, family_id: user.id, sender: "family", body, read_by_family: true }); if (error) throw error;
    const { data: owner } = await sb.from("profiles").select("email").eq("id", c.owner_id).maybeSingle();
    const who = await familyLabel(sb, user.id);
    if (owner?.email && emailEnabled()) await sendEmail({ to: owner.email, subject: `Message from ${who.name}${who.athletes ? ` — ${who.athletes}` : ""}`, html: emailLayout({ title: `${who.name} sent your gym a message`, body: `${who.athletes ? `<p style="color:#7B8197">Athletes: ${esc(who.athletes)}</p>` : ""}<p style="white-space:pre-wrap;line-height:1.6">${esc(body)}</p><p><a href="${esc(appUrl())}/?page=messages" style="color:#E5523F;font-weight:bold">Reply in AthleteOrbit</a></p>` }) }).catch(() => {});
    return { sent: true };
  }
  const famParam = new URL(req.url || "/", "http://x").searchParams.get("family");
  if (club) {
    const { data: all } = await sb.from("club_messages").select("*").eq("club_id", club.id);
    if (famParam) {
      const thread = (all || []).filter((m) => m.family_id === famParam).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
      await sb.from("club_messages").update({ read_by_gym: true }).eq("club_id", club.id).eq("family_id", famParam);
      return { who: await familyLabel(sb, famParam), messages: thread.map(({ id, sender, body, created_at }) => ({ id, sender, body, created_at })) };
    }
    const byFam = {};
    for (const m of all || []) { const t = (byFam[m.family_id] ||= { family_id: m.family_id, unread: 0, last: m }); if (m.created_at >= t.last.created_at) t.last = m; if (m.sender === "family" && !m.read_by_gym) t.unread++; }
    const threads = [];
    for (const t of Object.values(byFam)) threads.push({ family_id: t.family_id, unread: t.unread, last: { sender: t.last.sender, body: t.last.body.slice(0, 140), created_at: t.last.created_at }, ...(await familyLabel(sb, t.family_id)), email: undefined });
    return { threads: threads.sort((a, b) => (a.last.created_at < b.last.created_at ? 1 : -1)) };
  }
  if (!profile.club_id) return { club: null, messages: [] };
  const { data: c } = await sb.from("clubs").select("name").eq("id", profile.club_id).maybeSingle();
  const { data: thread } = await sb.from("club_messages").select("*").eq("club_id", profile.club_id).eq("family_id", user.id);
  await sb.from("club_messages").update({ read_by_family: true }).eq("club_id", profile.club_id).eq("family_id", user.id);
  return { club: c ? { name: c.name } : null, messages: (thread || []).sort((a, b) => (a.created_at > b.created_at ? 1 : -1)).map(({ id, sender, body, created_at }) => ({ id, sender, body, created_at })) };
});

// What a parent sees on "My gym": announcements, unread messages, whether their athletes are linked.
export const home = handler(["GET"], async (req) => {
  const { user, profile } = await requireUser(req);
  const sb = deps.supabase();
  // Gym owners see their own gym's posts here too.
  if (!profile.club_id) { const { data: own } = await sb.from("clubs").select("id").eq("owner_id", user.id); if (own?.[0]) profile.club_id = own[0].id; }
  if (!profile.club_id) return { club: null };
  const [{ data: c }, { data: ann }, { data: msgs }, { data: ros }, { data: kids }] = await Promise.all([
    sb.from("clubs").select("name,sport").eq("id", profile.club_id).maybeSingle(),
    sb.from("club_announcements").select("*").eq("club_id", profile.club_id).order("created_at", { ascending: false }).limit(20),
    sb.from("club_messages").select("*").eq("club_id", profile.club_id).eq("family_id", user.id),
    sb.from("club_roster").select("id").eq("club_id", profile.club_id),
    sb.from("gymnasts").select("id,name,roster_id").eq("user_id", user.id),
  ]);
  return { club: c ? { name: c.name, sport: c.sport || "Gymnastics" } : null, announcements: (ann || []).map(({ id, title, body, summary, created_at }) => ({ id, title, body, summary, created_at })),
    unread: (msgs || []).filter((m) => m.sender === "gym" && !m.read_by_family).length, rosterSize: (ros || []).length, linked: (kids || []).filter((k) => k.roster_id).map((k) => k.name), unlinked: (kids || []).filter((k) => !k.roster_id).map((k) => k.name) };
});

// ---------- Find your athlete before adding one (any gym on AthleteOrbit) ----------
// Parents type a name; we show "Maya P. · Level 5 · Apex Gymnastics". Linking is instant with the gym's code
// or when the gym listed this parent's email; otherwise the gym approves the request (kids' names stay protected).
async function joinClubFor(sb, club, userId, profile) {
  if (profile.club_id === club.id) return;
  if (profile.club_id) { const { data: cur } = await sb.from("clubs").select("name").eq("id", profile.club_id).maybeSingle(); throw new HttpError(409, `You're connected to ${cur?.name || "another gym"}. Leave it under My gym first.`); }
  if (!club.active_until || new Date(club.active_until) <= deps.now()) throw new HttpError(409, "This gym's AthleteOrbit plan isn't active right now.");
  const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("club_id", club.id);
  if ((count || 0) >= club.seats) throw new HttpError(409, "This gym's plan is full. Ask your gym to add more families.");
  await sb.from("profiles").update({ club_id: club.id }).eq("id", userId);
  profile.club_id = club.id;
}
export const rosterFind = handler(["GET"], async (req) => {
  const { user, profile } = await requireUser(req);
  const u = new URL(req.url || "/", "http://x");
  const q = (u.searchParams.get("q") || "").trim().replace(/[%_,()]/g, "").slice(0, 60), gym = (u.searchParams.get("gym") || "").trim().toLowerCase();
  if (q.length < 2) return { results: [] };
  useLimit(`find:${user.id}`, 40);
  const sb = deps.supabase();
  const { data: rows } = await sb.from("club_roster").select("*").ilike("name", `%${q}%`).limit(60);
  const clubIds = [...new Set((rows || []).map((r) => r.club_id))];
  const { data: clubs } = clubIds.length ? await sb.from("clubs").select("id,name,sport,active_until").in("id", clubIds) : { data: [] };
  const cById = Object.fromEntries((clubs || []).map((c) => [c.id, c]));
  const { data: mine } = await sb.from("gymnasts").select("roster_id").eq("user_id", user.id);
  const { data: reqs } = await sb.from("roster_requests").select("roster_id,status").eq("user_id", user.id);
  const mineIds = new Set((mine || []).map((g) => g.roster_id)), pending = new Set((reqs || []).filter((r) => r.status === "pending").map((r) => r.roster_id));
  const out = (rows || []).filter((r) => cById[r.club_id] && (!gym || cById[r.club_id].name.toLowerCase().includes(gym)))
    .map((r) => ({ id: r.id, name: shortName(r.name), level: r.level, gender: r.gender, sport: r.sport || cById[r.club_id].sport || "Gymnastics", gym: cById[r.club_id].name, myGym: r.club_id === profile.club_id, mine: mineIds.has(r.id), pending: pending.has(r.id) }))
    .sort((a, b) => Number(b.myGym) - Number(a.myGym) || a.name.localeCompare(b.name)).slice(0, 12);
  return { results: out };
});
const limits = new Map();
function useLimit(key, max, windowMs = 3600000) {
  const now = deps.now().getTime(); const list = (limits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new HttpError(429, "Too many searches. Try again in a little while.");
  list.push(now); limits.set(key, list);
}
export const rosterRequest = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const b = await readJson(req);
  const sb = deps.supabase();
  const { data: r } = await sb.from("club_roster").select("*").eq("id", b.rosterId).maybeSingle();
  if (!r) throw new HttpError(404, "We couldn't find that athlete.");
  const { data: club } = await sb.from("clubs").select("*").eq("id", r.club_id).maybeSingle();
  const email = String(profile.email || user.email || "").toLowerCase();
  const codeOk = b.code && String(b.code).trim().toUpperCase() === club.code;
  if (b.code && !codeOk) throw new HttpError(400, "That gym code doesn't match. Check it with your gym, or send a request instead.");
  if (codeOk || profile.club_id === club.id || (r.parent_email && r.parent_email === email)) {
    const counts = await linkedCounts([r.id]);
    if ((counts[r.id]?.size || 0) >= 2 && !counts[r.id].has(user.id)) throw new HttpError(409, "This athlete is already linked to two family accounts. Ask your gym if that's not right.");
    await joinClubFor(sb, club, user.id, profile);
    await claim(sb, club, user.id, r);
    const meets = await syncClub(club.id, user.id);
    return { linked: true, name: r.name.split(/\s+/)[0], gym: club.name, meets };
  }
  useLimit(`req:${user.id}`, 10, 86400000);
  const { data: dup } = await sb.from("roster_requests").select("id").eq("roster_id", r.id).eq("user_id", user.id).eq("status", "pending");
  if (!dup?.length) await sb.from("roster_requests").insert({ roster_id: r.id, club_id: club.id, user_id: user.id, status: "pending" });
  const { data: owner } = await sb.from("profiles").select("email").eq("id", club.owner_id).maybeSingle();
  const who = profile.full_name || profile.username || email;
  if (owner?.email && emailEnabled()) await sendEmail({ to: owner.email, subject: `${who} asked to link ${r.name}`, html: emailLayout({ title: "A parent wants to follow their athlete",
    body: `<p><b>${esc(who)}</b> (${esc(email)}) says they're ${esc(r.name)}'s parent (${esc(r.level || "")}).</p><p><a href="${esc(appUrl())}/?page=messages" style="color:#E5523F;font-weight:bold">Approve or decline in AthleteOrbit</a></p>` }) }).catch(() => {});
  return { requested: true, gym: club.name };
});
export const rosterRequests = handler(["GET", "POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await ownedClub(user.id);
  const sb = deps.supabase();
  if (req.method === "POST") {
    const b = await readJson(req);
    const { data: rq } = await sb.from("roster_requests").select("*").eq("id", b.id).eq("club_id", club.id).maybeSingle();
    if (!rq || rq.status !== "pending") throw new HttpError(404, "Request not found.");
    const { data: p } = await sb.from("profiles").select("*").eq("id", rq.user_id).maybeSingle();
    if (!b.approve) { await sb.from("roster_requests").update({ status: "declined" }).eq("id", rq.id); return { declined: true }; }
    const { data: r } = await sb.from("club_roster").select("*").eq("id", rq.roster_id).maybeSingle();
    if (!r || !p) throw new HttpError(404, "That athlete or parent is gone.");
    await joinClubFor(sb, club, p.id, p);
    await claim(sb, club, p.id, r);
    await syncClub(club.id, p.id);
    await sb.from("roster_requests").update({ status: "approved" }).eq("id", rq.id);
    if (p.email && emailEnabled()) await sendEmail({ to: p.email, subject: `${club.name} linked ${r.name.split(/\s+/)[0]}`, html: emailLayout({ title: "You're connected", body: `<p>${esc(club.name)} approved your request. ${esc(r.name.split(/\s+/)[0])}'s level, season schedule and gym announcements are now in your app.</p><p><a href="${esc(appUrl())}" style="color:#E5523F;font-weight:bold">Open AthleteOrbit</a></p>` }) }).catch(() => {});
    return { approved: true };
  }
  const { data: rqs } = await sb.from("roster_requests").select("*").eq("club_id", club.id).eq("status", "pending");
  const out = [];
  for (const rq of rqs || []) {
    const [{ data: r }, { data: p }] = await Promise.all([sb.from("club_roster").select("name,level").eq("id", rq.roster_id).maybeSingle(), sb.from("profiles").select("full_name,username,email").eq("id", rq.user_id).maybeSingle()]);
    if (r && p) out.push({ id: rq.id, athlete: r.name, level: r.level, parent: p.full_name || p.username, email: p.email, created_at: rq.created_at });
  }
  return { requests: out };
});
