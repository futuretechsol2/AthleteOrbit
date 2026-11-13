// Read-only family page for grandparents, co-parents and friends: one secret link per child.
// Shows scores/results, personal bests and upcoming events — never costs, hotels, notes or contact details.
import crypto from "node:crypto";
import { handler, readJson, requireUser, requireFeature, loadGymnast, deps, env, HttpError, esc, tierOf } from "../../lib.js";
import { hasFeature } from "../../../src/data/plans.js";
import { sportOf, conf } from "../../../src/data/sports.js";

const EV = [["vault", "Vault"], ["bars", "Bars"], ["beam", "Beam"], ["floor", "Floor"], ["pommel", "Pommel"], ["rings", "Rings"], ["pbars", "P-Bars"], ["highbar", "High bar"]];
export const shareUrl = (key) => `${env("APP_URL").replace(/\/$/, "")}/api/share?k=${key}`;

export const link = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "share");
  const body = await readJson(req);
  const g = await loadGymnast(user.id, body.gymnastId);
  if (!g) throw new HttpError(400, "Pick a child first.");
  const sb = deps.supabase();
  if (body.enable === false) { await sb.from("gymnasts").update({ share_key: null }).eq("id", g.id).eq("user_id", user.id); return { url: null }; }
  const key = body.rotate || !g.share_key ? crypto.randomBytes(18).toString("base64url") : g.share_key;
  if (key !== g.share_key) await sb.from("gymnasts").update({ share_key: key }).eq("id", g.id).eq("user_id", user.id);
  return { url: shareUrl(key) };
});

export default handler(["GET"], async (req, res) => {
  const k = new URL(req.url || "/", "http://x").searchParams.get("k") || "";
  const sb = deps.supabase();
  const page = (title, body) => { res.statusCode = 200; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "private, max-age=300"); res.setHeader("X-Robots-Tag", "noindex"); res.end(html(title, body)); };
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(k)) return page("Link not found", `<p>This share link isn't valid.</p>`);
  const { data: g } = await sb.from("gymnasts").select("*").eq("share_key", k).maybeSingle();
  if (!g) return page("Link turned off", `<p>This page is no longer shared. Ask the family for a new link.</p>`);
  const { data: pr } = await sb.from("profiles").select("*").eq("id", g.user_id).maybeSingle();
  if (pr?.club_id) { const { data: club } = await sb.from("clubs").select("*").eq("id", pr.club_id).maybeSingle(); pr._club = club; }
  if (!hasFeature(tierOf(pr), "share")) return page("Link paused", `<p>This page is paused right now.</p>`);
  const sport = sportOf(g), S = conf(sport), today = new Date().toISOString().slice(0, 10);
  const [{ data: scores }, { data: stats }, { data: meets }] = await Promise.all([
    sb.from("scores").select("*").eq("gymnast_id", g.id).order("meet_date", { ascending: false }).limit(8),
    sb.from("stats").select("*").eq("gymnast_id", g.id).order("event_date", { ascending: false }).limit(30),
    sb.from("meets").select("name,start_date,end_date,location,session_time,status,gymnast_id").eq("gymnast_id", g.id).gte("start_date", today).order("start_date").limit(5),
  ]);
  const up = (meets || []).filter((m) => m.status !== "Skipped");
  let results = "";
  if (sport === "Gymnastics") {
    const rows = (scores || []).map((s) => { const ev = EV.filter(([key]) => s[key] != null); const aa = ev.reduce((a, [key]) => a + Number(s[key]), 0); return { s, ev, aa }; });
    const best = Math.max(0, ...rows.map((r) => r.aa));
    results = rows.length ? rows.map(({ s, ev, aa }) => `<div class="card"><div class="top"><div><b>${esc(s.meet_name)}</b><small>${esc(s.meet_date)}${s.aa_place ? ` · AA place ${esc(s.aa_place)}` : ""}</small></div><div class="aa">${aa.toFixed(3)}${aa === best ? "<small>★ Season best</small>" : ""}</div></div><div class="ev">${ev.map(([key, l]) => `<span><small>${l}</small>${Number(s[key]).toFixed(3)}</span>`).join("")}</div></div>`).join("") : `<p class="muted">No scores yet this season.</p>`;
  } else {
    const best = {};
    for (const r of stats || []) { const lower = r.better === "lower"; if (!best[r.metric] || (lower ? r.value < best[r.metric].value : r.value > best[r.metric].value)) best[r.metric] = r; }
    results = Object.keys(best).length ? `<div class="card"><b>Personal bests</b>${Object.values(best).map((r) => `<div class="row"><span>${esc(r.metric)}</span><b>${esc(r.value)}${r.unit ? ` ${esc(r.unit)}` : ""}</b></div>`).join("")}</div>` +
      (stats || []).slice(0, 10).map((r) => `<div class="row"><span>${esc(r.event_date)} · ${esc(r.metric)}${r.event_name ? ` · ${esc(r.event_name)}` : ""}</span><b>${esc(r.value)}${r.unit ? ` ${esc(r.unit)}` : ""}</b></div>`).join("") : `<p class="muted">No results yet this season.</p>`;
  }
  const photo = typeof g.photo === "string" && g.photo.startsWith("data:image/") ? `<img class="ph" src="${esc(g.photo)}" alt="">` : `<div class="ph">${esc(g.name[0])}</div>`;
  page(`${g.name}'s season`, `<header style="border-color:${S.color}">${photo}<div><small>${S.icon} ${esc(sport)} · ${esc(g.level || "")}${g.club ? ` · ${esc(g.club)}` : ""}</small><h1>${esc(g.name)}'s season</h1></div></header>
<h2>Coming up</h2>${up.length ? up.map((m) => `<div class="row"><span><b>${esc(m.name)}</b><br><small>${esc(m.start_date)}${m.end_date && m.end_date !== m.start_date ? ` – ${esc(m.end_date)}` : ""}${m.location ? ` · ${esc(m.location)}` : ""}${m.session_time ? ` · ${esc(m.session_time)}` : ""}</small></span></div>`).join("") : `<p class="muted">Nothing on the calendar right now.</p>`}
<h2>${esc(S.results)}</h2>${results}`);
});

function html(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · AthleteOrbit</title>
<style>body{margin:0;background:#FBF7F2;color:#16213E;font:16px/1.5 system-ui,-apple-system,sans-serif}main{max-width:620px;margin:0 auto;padding:20px 16px 40px}header{display:flex;gap:14px;align-items:center;border-top:5px solid;padding:16px;background:#16213E;color:#fff;border-radius:18px}header small{color:#F4C95D;font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.04em}h1{margin:2px 0 0;font:700 28px Georgia,serif}h2{font-size:18px;margin:22px 0 8px}.ph{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#FF6B5B;color:#fff;display:grid;place-items:center;font-weight:800;font-size:24px;flex:none}.card{background:#fff;border-radius:16px;padding:14px;margin:0 0 10px;box-shadow:0 1px 2px rgba(0,0,0,.05)}.top{display:flex;justify-content:space-between;gap:10px}.top small,.row small{display:block;color:#7B8197;font-size:13px}.aa{font:700 24px Georgia,serif;text-align:right}.aa small{font:600 12px system-ui;color:#B4531B}.ev{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}.ev span{background:#FBF7F2;border-radius:10px;padding:6px;text-align:center;font-weight:700}.ev small{display:block;font-weight:500;color:#7B8197;font-size:11px}.row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #ECE6DD}.muted{color:#7B8197}footer{margin-top:28px;text-align:center;color:#7B8197;font-size:13px}footer a{color:#E5523F}</style></head>
<body><main>${body}<footer>Shared privately by the family with AthleteOrbit · <a href="${esc((process.env.APP_URL || "/").replace(/\/$/, ""))}/welcome">Track your athlete's season</a></footer></main></body></html>`;
}
