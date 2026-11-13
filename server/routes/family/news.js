// Headlines from official sports organizations' public news feeds, plus the family's club announcements.
import { handler, requireUser, deps } from "../../lib.js";

export const DEFAULT_FEEDS = { Gymnastics: [{ name: "USA Gymnastics", url: "https://usagym.org/feed/" }] };
const cache = new Map(); // url -> { at, items }

function feeds() {
  try { return process.env.NEWS_FEEDS ? JSON.parse(process.env.NEWS_FEEDS) : DEFAULT_FEEDS; } catch { return DEFAULT_FEEDS; }
}

export function parseFeed(xml, source) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const pick = (b, tag) => { const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(b); return m ? clean(m[1]) : ""; };
  for (const b of blocks.slice(0, 15)) {
    let link = pick(b, "link");
    if (!link) { const m = /<link[^>]*href="([^"]+)"/i.exec(b); link = m ? m[1] : ""; }
    const title = pick(b, "title"), date = pick(b, "pubDate") || pick(b, "published") || pick(b, "updated");
    if (title && /^https?:\/\//.test(link)) items.push({ title, link, date: isNaN(Date.parse(date)) ? null : new Date(date).toISOString(), source });
  }
  return items;
}
function clean(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;/g, "‘")
    .replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

async function load(feed) {
  const hit = cache.get(feed.url), now = deps.now().getTime();
  if (hit && now - hit.at < 3600_000) return hit.items;
  try {
    const r = await deps.fetch(feed.url, { headers: { "user-agent": "AthleteOrbit news reader" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(String(r.status));
    const items = parseFeed(await r.text(), feed.name);
    cache.set(feed.url, { at: now, items });
    return items;
  } catch { return hit?.items || []; }
}

export default handler(["GET"], async (req) => {
  const { user, profile } = await requireUser(req);
  const sb = deps.supabase();
  const { data: kids } = await sb.from("gymnasts").select("program,sport").eq("user_id", user.id);
  const sports = new Set(["Gymnastics", ...(kids || []).filter((k) => k.program === "Other").map((k) => k.sport)]);
  const all = feeds();
  const lists = await Promise.all([...sports].flatMap((s) => (all[s] || []).map(load)));
  const news = lists.flat().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 20);
  let announcements = [];
  const clubIds = [profile.club_id].filter(Boolean);
  const { data: owned } = await sb.from("clubs").select("id").eq("owner_id", user.id);
  for (const c of owned || []) clubIds.push(c.id);
  if (clubIds.length) {
    const { data } = await sb.from("club_announcements").select("*").in("club_id", [...new Set(clubIds)]).order("created_at", { ascending: false }).limit(20);
    announcements = data || [];
  }
  return { news, announcements };
});
