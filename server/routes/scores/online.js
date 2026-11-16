// Pull a child's scores from an online results page (MeetScoresOnline and similar).
// The parent gives the meet's results link (or pastes the page text). We read that one public page,
// keep only the lines around the child's name, and AI turns them into scores for the parent to confirm.
import { handler, readJson, requireUser, requireFeature, useQuota, loadGymnast, callClaude, extractJson, deps, HttpError } from "../../lib.js";
import { sportOf } from "../../../src/data/sports.js";
import { SYSTEM as GYM_SYSTEM, OTHER, cleanGym, cleanOther, EV } from "../ai/scoresheet.js";

export const DEFAULT_HOSTS = ["meetscoresonline.com", "scorecatonline.com", "myusagym.com"];
const hosts = () => (process.env.SCORE_SOURCE_HOSTS ? process.env.SCORE_SOURCE_HOSTS.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean) : DEFAULT_HOSTS);
export function allowedUrl(raw) {
  let u; try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && !["80", "443"].includes(u.port))) return null;
  const h = u.hostname.toLowerCase();
  return hosts().some((d) => h === d || h.endsWith(`.${d}`)) ? u : null;
}

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(tr|p|div|li|h\d|table|section)>|<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

// Keep the page header (meet name/date) and the lines around the athlete's name.
export function excerptFor(text, name) {
  const lines = text.split("\n");
  const parts = String(name || "").toLowerCase().split(/\s+/).filter((p) => p.length > 1);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  const hits = [];
  lines.forEach((l, i) => { const low = l.toLowerCase(); if (low.includes(last) && (parts.length === 1 || parts.some((p) => p !== last && low.includes(p)) || low.includes(parts.join(" ")))) hits.push(i); });
  if (!hits.length) lines.forEach((l, i) => { if (l.toLowerCase().includes(last)) hits.push(i); });
  if (!hits.length) return null;
  const keep = new Set();
  for (let i = 0; i < Math.min(30, lines.length); i++) keep.add(i);
  for (const h of hits.slice(0, 6)) for (let i = Math.max(0, h - 4); i <= Math.min(lines.length - 1, h + 4); i++) keep.add(i);
  return [...keep].sort((a, b) => a - b).map((i) => lines[i]).join("\n").slice(0, 12000);
}

export async function fetchPage(u) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await deps.fetch(u.toString(), { redirect: "follow", signal: ctl.signal,
      headers: { "user-agent": `AthleteOrbit/1.0 (family score tracker; ${process.env.APP_URL || ""})`, accept: "text/html,application/xhtml+xml" } });
    if (r.url && !allowedUrl(r.url)) throw new HttpError(422, "That link redirected somewhere we can't read.");
    if (!r.ok) throw new HttpError(422, "The results site didn't let us read that page right now. Open it, copy the results (select all, copy) and paste them here instead.");
    const html = await r.text();
    return htmlToText(html.slice(0, 3_000_000));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, "We couldn't reach the results site. Try again, or paste the results text instead.");
  } finally { clearTimeout(t); }
}

// Shared by the button in the app and the daily auto-check.
export async function extractScores({ g, text, name, sourceUrl }) {
  const sport = sportOf(g);
  const excerpt = excerptFor(text, name);
  if (!excerpt) return { found: false };
  const gym = sport === "Gymnastics";
  const system = `${gym ? GYM_SYSTEM : OTHER(sport)}\nThe input is TEXT copied from an online results web page (not a photo). Rows may be separated by " | ". Only use the row(s) for the named athlete. If the athlete is not in the text, return all nulls / empty results with confidence "low" and say so in notes.`;
  const t = await callClaude({ system, maxTokens: 700, messages: [{ role: "user", content: `Athlete: ${name}${g.level ? ` (${g.level})` : ""}${g.club ? `, club ${g.club}` : ""}\nSource: ${sourceUrl || "pasted text"}\n\n${excerpt}` }] });
  const j = extractJson(t);
  if (gym) { const s = cleanGym(j); return { found: EV.some((k) => s[k] !== null), scores: s }; }
  const o = cleanOther(j, sport); return { found: o.results.length > 0, ...o };
}

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "onlineScores");
  const body = await readJson(req);
  const g = await loadGymnast(user.id, body.gymnastId);
  if (!g) throw new HttpError(400, "Pick a child first.");
  const name = String(body.athleteName || g.results_name || g.name).trim().slice(0, 80);
  let text, sourceUrl = null;
  if (typeof body.text === "string" && body.text.trim().length > 20) {
    text = body.text.slice(0, 400000);
  } else {
    const u = allowedUrl(body.url);
    if (!u) throw new HttpError(400, `Paste a results link from ${hosts().join(", ")}.`);
    sourceUrl = u.toString();
    await useQuota(user.id, "online");
    text = await fetchPage(u);
  }
  if (body.athleteName && body.athleteName.trim() !== (g.results_name || "")) await deps.supabase().from("gymnasts").update({ results_name: name }).eq("id", g.id).eq("user_id", user.id);
  if (body.meetId && sourceUrl) await deps.supabase().from("meets").update({ results_url: sourceUrl }).eq("id", body.meetId).eq("user_id", user.id);
  const out = await extractScores({ g, text, name, sourceUrl });
  if (!out.found) throw new HttpError(404, `We couldn't find ${name} on that page yet. Check the name matches the results exactly (first and last name), or try again once scores are posted.`);
  return { ...out, source_url: sourceUrl };
});
