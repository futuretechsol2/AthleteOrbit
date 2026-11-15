// Athlete recruiting page: a shareable page for older athletes — highlights, best scores, videos, graduation year.
// Private until a parent publishes it. Included in Pro; Basic families can add it for $49/year.
import crypto from "node:crypto";
import { handler, readJson, requireUser, deps, env, HttpError, tierOf } from "../lib.js";
import { hasFeature } from "../../src/data/plans.js";

const appUrl = () => env("APP_URL").replace(/\/$/, "");
export const PAGE_CENTS = () => Number(process.env.ATHLETE_PAGE_PRICE_CENTS || 4900);
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|hudl\.com|drive\.google\.com)$/i;
const videoUrl = (v) => { try { const u = new URL(String(v || "").trim()); return u.protocol === "https:" && VIDEO_HOSTS.test(u.hostname) ? u.toString().slice(0, 300) : null; } catch { return null; } };
const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);
const canPublish = (profile, page) => hasFeature(tierOf(profile), "recruitPage") || (page?.paid_until && new Date(page.paid_until) > deps.now());

export const page = handler(["GET", "POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const sb = deps.supabase();
  if (req.method === "GET") {
    const gid = new URL(req.url || "/", "http://x").searchParams.get("gymnast");
    const { data: p } = await sb.from("athlete_pages").select("*").eq("gymnast_id", gid).eq("user_id", user.id).maybeSingle();
    return { page: p || null, canPublish: canPublish(profile, p), price: PAGE_CENTS() / 100, url: p ? `${appUrl()}/a/${p.slug}` : null };
  }
  const b = await readJson(req);
  const { data: g } = await sb.from("gymnasts").select("*").eq("id", b.gymnastId).eq("user_id", user.id).maybeSingle();
  if (!g) throw new HttpError(404, "Athlete not found.");
  const { data: old } = await sb.from("athlete_pages").select("*").eq("gymnast_id", g.id).maybeSingle();
  const display = str(b.display_name, 60) || g.name;
  let slug = old?.slug;
  if (!slug) {
    const base = slugify(display) || "athlete";
    slug = base;
    for (let i = 0; i < 20; i++) { const { data: taken } = await sb.from("athlete_pages").select("id").eq("slug", slug).maybeSingle(); if (!taken) break; slug = `${base}-${crypto.randomBytes(2).toString("hex")}`; }
  }
  const published = !!b.published;
  if (published && !canPublish(profile, old)) throw Object.assign(new HttpError(402, "Publishing a recruiting page is included in Pro, or add it to Basic for $49/year."), { code: "recruit_page", upgrade: "recruitPage" });
  const { data: ownPhotos } = await sb.from("photos").select("id").eq("user_id", user.id);
  const okPhotos = new Set((ownPhotos || []).map((p) => p.id));
  const rec = { user_id: user.id, gymnast_id: g.id, slug, display_name: display, published, bio: str(b.bio, 1200) || null, grad_year: Number.isInteger(Number(b.grad_year)) && b.grad_year >= 2024 && b.grad_year <= 2045 ? Number(b.grad_year) : null,
    highlights: (Array.isArray(b.highlights) ? b.highlights : []).map((h) => str(h, 140)).filter(Boolean).slice(0, 10),
    videos: (Array.isArray(b.videos) ? b.videos : []).map((v) => ({ title: str(v.title, 80) || "Video", url: videoUrl(v.url) })).filter((v) => v.url).slice(0, 8),
    photo_ids: (Array.isArray(b.photo_ids) ? b.photo_ids : []).filter((id) => okPhotos.has(id)).slice(0, 8), show_scores: b.show_scores !== false, contact_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.contact_email || "") ? b.contact_email.trim().slice(0, 120) : null,
    updated_at: deps.now().toISOString() };
  if (old) await sb.from("athlete_pages").update(rec).eq("id", old.id);
  else { const { error } = await sb.from("athlete_pages").insert({ id: crypto.randomUUID(), ...rec }); if (error) throw error; }
  return { slug, url: `${appUrl()}/a/${slug}`, published };
});

// Public page (no sign-in). Only published pages; shows only what the parent chose.
export const publicPage = handler(["GET"], async (req) => {
  const slug = new URL(req.url || "/", "http://x").searchParams.get("slug");
  if (!slug || !/^[a-z0-9-]{1,48}$/.test(slug)) throw new HttpError(404, "Page not found.");
  const sb = deps.supabase();
  const { data: p } = await sb.from("athlete_pages").select("*").eq("slug", slug).maybeSingle();
  if (!p || !p.published) throw new HttpError(404, "This page isn't published.");
  const { data: g } = await sb.from("gymnasts").select("*").eq("id", p.gymnast_id).maybeSingle();
  if (!g) throw new HttpError(404, "Page not found.");
  let best = null, recent = [];
  if (p.show_scores) {
    const { data: sc } = await sb.from("scores").select("*").eq("gymnast_id", g.id);
    const ev = ["vault", "bars", "beam", "floor", "pommel", "rings", "pbars", "highbar"];
    const rows = (sc || []).map((s) => ({ ...s, aa: ev.reduce((a, k) => a + (Number(s[k]) || 0), 0) }));
    best = Object.fromEntries(ev.map((k) => [k, Math.max(0, ...rows.map((r) => Number(r[k]) || 0))]).filter(([, v]) => v > 0));
    if (rows.length) best.aa = Math.max(...rows.map((r) => r.aa));
    recent = rows.sort((a, b) => (a.meet_date < b.meet_date ? 1 : -1)).slice(0, 8).map((r) => ({ meet: r.meet_name, date: r.meet_date, level: r.level, aa: Math.round(r.aa * 1000) / 1000, place: r.aa_place || null }));
  }
  let photos = [];
  if (p.photo_ids?.length) {
    const { data: ph } = await sb.from("photos").select("*").in("id", p.photo_ids);
    const paths = (ph || []).filter((x) => x.user_id === p.user_id).map((x) => x.path);
    if (paths.length) { const { data } = await sb.storage.from("photos").createSignedUrls(paths, 3600); photos = (data || []).map((x) => x.signedUrl); }
  }
  return { athlete: { name: p.display_name, sport: g.sport || "Gymnastics", level: g.level, club: g.club, grad_year: p.grad_year, bio: p.bio, highlights: p.highlights || [], videos: p.videos || [], photos, best, recent, contact_email: p.contact_email } };
});

export const pageCheckout = handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const b = await readJson(req);
  const sb = deps.supabase();
  const { data: p } = await sb.from("athlete_pages").select("*").eq("gymnast_id", b.gymnastId).eq("user_id", user.id).maybeSingle();
  if (!p) throw new HttpError(400, "Save the page first.");
  const s = await deps.stripe().checkout.sessions.create({ mode: "payment", customer_email: user.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: PAGE_CENTS(), product_data: { name: `Athlete recruiting page — ${p.display_name} (1 year)` } } }],
    metadata: { kind: "athlete_page", page_id: p.id, user_id: user.id }, success_url: `${appUrl()}/?page=more&recruit=1`, cancel_url: `${appUrl()}/?page=more` });
  return { url: s.url };
});
export async function fulfillAthletePage(s) {
  const sb = deps.supabase();
  const { data: p } = await sb.from("athlete_pages").select("*").eq("id", s.metadata?.page_id).maybeSingle();
  if (!p) return;
  const from = p.paid_until && new Date(p.paid_until) > deps.now() ? new Date(p.paid_until) : deps.now();
  await sb.from("athlete_pages").update({ paid_until: new Date(from.getTime() + 365 * 86400000).toISOString() }).eq("id", p.id);
}
