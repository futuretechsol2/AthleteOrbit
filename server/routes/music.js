// Floor Music. Women's gymnastics floor routines are performed to music, and today every meet plays it from a coach's
// or parent's phone (dead batteries, no signal, wrong song). Here the gym uploads the music once — per level (every girl
// at that level gets it) or per athlete (her own routine) — and the meet's music table plays any athlete's music with
// one tap, from a list that also works offline. Families of athletes whose gym isn't on AthleteOrbit can add their own.
import crypto from "node:crypto";
import { handler, readJson, requireUser, deps, HttpError, env, signToken, checkToken } from "../lib.js";
import { levelKey, genderOf } from "../../src/data/levels.js";
import { isAdmin } from "./admin/support.js";

const BUCKET = "music";
const store = () => deps.supabase().storage.from(BUCKET);
const appUrl = () => env("APP_URL").replace(/\/$/, "");
const EXT = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav" };
const str = (v, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const okPath = (owner, p) => typeof p === "string" && p.startsWith(`${owner}/`) && /^[A-Za-z0-9_-]+\/[a-f0-9-]+\.(mp3|m4a|aac|wav)$/.test(p);
// Floor music is for women's gymnastics (WAG / Xcel). Men's floor has no music.
export const hasFloorMusic = (a) => (a?.sport || "Gymnastics") === "Gymnastics" && genderOf(a) !== "M";
export const deskKey = (id) => signToken(`music:${id}`);
const out = (m, url) => m && { id: m.id, title: m.title, duration: m.duration_sec, scope: m.roster_id || m.gymnast_id ? "athlete" : "level", ...(url ? { url } : {}) };

async function ownedClub(userId) {
  const { data } = await deps.supabase().from("clubs").select("*").eq("owner_id", userId);
  if (!data?.[0]) throw new HttpError(403, "This is for gym accounts.");
  return data[0];
}
async function sign(rows, seconds) {
  const paths = rows.filter(Boolean).map((m) => m.path);
  if (!paths.length) return {};
  const { data } = await store().createSignedUrls([...new Set(paths)], seconds);
  return Object.fromEntries((data || []).map((x) => [x.path, x.signedUrl]));
}
// A gym's music, resolved per athlete: her own routine music wins over her level's music.
function resolver(music) {
  const byRoster = new Map(), byLevel = new Map();
  for (const m of music) { if (m.roster_id) byRoster.set(m.roster_id, m); else if (m.level) byLevel.set(levelKey(m.level), m); }
  return (r) => byRoster.get(r.id) || byLevel.get(levelKey(r.level)) || null;
}
async function clubMusic(clubIds) {
  if (!clubIds.length) return [];
  const { data } = await deps.supabase().from("floor_music").select("*").in("club_id", clubIds);
  return data || [];
}

// Step 1: one-time upload link (the file goes straight from the phone/computer to storage).
export const uploadUrl = handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const b = await readJson(req);
  const ext = EXT[String(b.type || "").toLowerCase()] || (/\.(mp3|m4a|aac|wav)$/i.exec(b.name || "") || [])[1]?.toLowerCase();
  if (!ext) throw new HttpError(400, "Choose an MP3, M4A or WAV music file.");
  if (Number(b.size) > 20 * 1024 * 1024) throw new HttpError(400, "That file is over 20 MB. Export it as an MP3 and try again.");
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await store().createSignedUploadUrl(path);
  if (error) throw new HttpError(503, "Music storage isn't set up yet.");
  return { path, token: data.token };
});

// Step 2: attach the uploaded file. Gym owner: { level } or { roster_id }. Parent: { gymnast_id }.
// GET (gym): levels with how many girls each, every girl with the music she'll compete to.
// GET ?gymnast=<id> (parent): that athlete's music (from her gym, or the family's own).
export const music = handler(["GET", "POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const sb = deps.supabase();
  const b = req.method === "POST" ? await readJson(req) : Object.fromEntries(new URL(req.url || "/", "http://x").searchParams);

  // ----- parent -----
  if (b.gymnast || b.gymnast_id) {
    const { data: g } = await sb.from("gymnasts").select("*").eq("id", b.gymnast || b.gymnast_id).eq("user_id", user.id).maybeSingle();
    if (!g) throw new HttpError(404, "Athlete not found.");
    if (!hasFloorMusic(g)) return { music: null, eligible: false };
    let gym = null;
    if (g.roster_id) {
      const { data: r } = await sb.from("club_roster").select("*").eq("id", g.roster_id).maybeSingle();
      if (r) { const { data: c } = await sb.from("clubs").select("id,name").eq("id", r.club_id).maybeSingle(); gym = r && c ? { club: c, m: resolver(await clubMusic([c.id]))(r) } : null; }
    }
    const { data: own } = await sb.from("floor_music").select("*").eq("gymnast_id", g.id).maybeSingle();
    if (req.method === "POST") {
      if (b.remove) { if (own) { await sb.from("floor_music").delete().eq("id", own.id); await store().remove([own.path]); } return { removed: true }; }
      if (!okPath(user.id, b.path)) throw new HttpError(400, "Upload the music file first.");
      const rec = { gymnast_id: g.id, path: b.path, title: str(b.title) || "Floor music", duration_sec: Math.round(Number(b.duration) || 0) || null, uploaded_by: user.id };
      if (own) { const was = own.path; await sb.from("floor_music").update(rec).eq("id", own.id); await store().remove([was]); } else { const { error } = await sb.from("floor_music").insert(rec); if (error) throw error; }
      return { saved: true };
    }
    const m = gym?.m || own; const urls = await sign([m], 3600);
    return { eligible: true, music: out(m, m && urls[m.path]), from: gym?.m ? gym.club.name : own ? "family" : null, gym: gym?.club?.name || null };
  }

  // ----- gym owner -----
  const club = await ownedClub(user.id);
  const { data: roster } = await sb.from("club_roster").select("*").eq("club_id", club.id);
  const girls = (roster || []).filter(hasFloorMusic);
  const mine = await clubMusic([club.id]);
  if (req.method === "POST") {
    if (b.remove) {
      const m = mine.find((x) => x.id === b.remove); if (!m) throw new HttpError(404, "Music not found.");
      await sb.from("floor_music").delete().eq("id", m.id); await store().remove([m.path]);
      return { removed: true };
    }
    if (!okPath(user.id, b.path)) throw new HttpError(400, "Upload the music file first.");
    const rec = { club_id: club.id, path: b.path, title: str(b.title) || "Floor music", duration_sec: Math.round(Number(b.duration) || 0) || null, uploaded_by: user.id };
    let old;
    if (b.roster_id) {
      const r = girls.find((x) => x.id === b.roster_id); if (!r) throw new HttpError(404, "That athlete isn't on your roster (or doesn't compete floor to music).");
      rec.roster_id = r.id; rec.level = r.level; old = mine.find((x) => x.roster_id === r.id);
    } else {
      const lv = str(b.level, 40); if (!lv) throw new HttpError(400, "Pick the level this music is for.");
      rec.level = lv; old = mine.find((x) => !x.roster_id && levelKey(x.level) === levelKey(lv));
    }
    if (old) { const was = old.path; await sb.from("floor_music").update(rec).eq("id", old.id); await store().remove([was]); }
    else { const { error } = await sb.from("floor_music").insert(rec); if (error) throw error; }
    const n = rec.roster_id ? 1 : girls.filter((r) => levelKey(r.level) === levelKey(rec.level) && !mine.some((x) => x.roster_id === r.id)).length;
    return { saved: true, athletes: n };
  }
  const pick = resolver(mine), urls = await sign(mine, 3600);
  const levels = [...new Map(girls.map((r) => [levelKey(r.level), r.level || "No level"])).entries()].map(([k, level]) => {
    const m = mine.find((x) => !x.roster_id && levelKey(x.level) === k);
    return { level, girls: girls.filter((r) => levelKey(r.level) === k).length, music: out(m, m && urls[m.path]) };
  }).sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true }));
  const athletes = girls.map((r) => { const m = pick(r); return { roster_id: r.id, name: r.name, level: r.level, music: out(m, m && urls[m.path]) }; })
    .sort((a, b) => (a.level || "").localeCompare(b.level || "", undefined, { numeric: true }) || a.name.localeCompare(b.name));
  return { club: { name: club.name }, levels, athletes, desk_url: `${appUrl()}/music/gym-${club.id}?k=${deskKey(`gym-${club.id}`)}`,
    counts: { girls: girls.length, ready: athletes.filter((a) => a.music).length } };
});

// The music table. /music/<listingId>?k=… for a meet (athletes from every attending gym), /music/gym-<clubId>?k=… for a
// gym's own home meet or practice. Opened by the organizer (signed in) or by a volunteer with the private link (no account).
export const desk = handler(["GET"], async (req) => {
  const sp = new URL(req.url || "/", "http://x").searchParams;
  const id = sp.get("id") || "", k = sp.get("k");
  const sb = deps.supabase();
  let clubs = [], title = "", gyms = [];
  const keyOk = k && checkToken(`music:${id}`, k);
  if (id.startsWith("gym-")) {
    const clubId = id.slice(4);
    if (!keyOk) { const { user } = await requireUser(req); const c = await ownedClub(user.id); if (c.id !== clubId) throw new HttpError(403, "This music table belongs to another gym."); }
    const { data: c } = await sb.from("clubs").select("id,name,code").eq("id", clubId).maybeSingle();
    if (!c) throw new HttpError(404, "Gym not found.");
    clubs = [c]; title = `${c.name} · Floor music`;
  } else {
    const { data: l } = await sb.from("meet_listings").select("*").eq("id", id).maybeSingle();
    if (!l) throw new HttpError(404, "Event not found.");
    if (!keyOk) { const { user, profile } = await requireUser(req); if (l.owner_id !== user.id && !isAdmin(user, profile)) throw new HttpError(403, "Ask the organizer for the music table link."); }
    const codes = (l.club_codes || []).filter(Boolean);
    const { data: owned } = await sb.from("clubs").select("id,name,code").eq("owner_id", l.owner_id);
    const { data: cs } = codes.length ? await sb.from("clubs").select("id,name,code").in("code", codes) : { data: [] };
    clubs = [...new Map([...(owned || []), ...(cs || [])].map((c) => [c.id, c])).values()];
    title = l.name; gyms = l.attending_gyms || [];
  }
  const ids = clubs.map((c) => c.id);
  const { data: roster } = ids.length ? await sb.from("club_roster").select("*").in("club_id", ids) : { data: [] };
  const music = await clubMusic(ids);
  const urls = await sign(music, 12 * 3600); // a whole meet day
  const athletes = [];
  for (const c of clubs) {
    const pick = resolver(music.filter((m) => m.club_id === c.id));
    for (const r of (roster || []).filter((x) => x.club_id === c.id && hasFloorMusic(x))) { const m = pick(r); athletes.push({ id: r.id, name: r.name, level: r.level, gym: c.name, music: out(m, m && urls[m.path]) }); }
  }
  athletes.sort((a, b) => (a.level || "").localeCompare(b.level || "", undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const missing = gyms.filter((g) => !clubs.some((c) => c.name.toLowerCase() === String(g).toLowerCase()));
  return { title, gyms: clubs.map((c) => c.name), notOnApp: missing, athletes, counts: { athletes: athletes.length, ready: athletes.filter((a) => a.music).length } };
});
