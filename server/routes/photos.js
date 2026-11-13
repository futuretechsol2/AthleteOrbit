// Meet photos: every family keeps their own photos sorted into each event. Shared photos are seen only by
// families of the same gym at the same competition. Prints and printed Season Books are made by a print lab
// (Prodigi) and shipped to the family's door after they pay with Stripe.
import crypto from "node:crypto";
import { handler, readJson, requireUser, requireFeature, useQuota, deps, env, HttpError, sendEmail, emailEnabled, emailLayout, esc } from "../lib.js";
import { PRINTS, printTotal } from "../../src/data/prints.js";

const BUCKET = "photos";
const appUrl = () => env("APP_URL").replace(/\/$/, "");
const store = () => deps.supabase().storage.from(BUCKET);
const str = (v, n = 140) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const okPath = (userId, p, kind = "") => typeof p === "string" && p.startsWith(`${userId}/${kind}`) && /^[A-Za-z0-9_-]+\/(books\/)?[a-f0-9-]+\.(jpg|pdf)$/.test(p);
// Print lab API (Prodigi v5). The key carries its environment: "sandbox_…" for testing, "live_…" for real orders.
export const PRODIGI = process.env.PRODIGI_API_URL || "https://api.prodigi.com/v5";
export async function checkSkus() {
  const out = {};
  for (const k of Object.keys(PRINTS)) {
    const sku = skuFor(k); if (!sku) { out[k] = "not set"; continue; }
    try { const r = await deps.fetch(`${PRODIGI}/catalogue/variants/${encodeURIComponent(sku)}`, { headers: { "X-API-Key": process.env.PRODIGI_API_KEY } }); out[k] = r.ok ? "ok" : `unknown product code ${sku}`; } catch { out[k] = "couldn't check"; }
  }
  return out;
}
export const printsEnabled = () => !!process.env.PRODIGI_API_KEY;
export const skuFor = (product) => process.env[PRINTS[product].env] || PRINTS[product].sku;

async function sign(paths, seconds = 3600) {
  if (!paths.length) return {};
  const { data } = await store().createSignedUrls(paths, seconds);
  return Object.fromEntries((data || []).map((x) => [x.path, x.signedUrl]));
}

// Step 1: get one-time upload links (photos go straight from the phone to storage, full size, for prints).
export const uploadUrl = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "photos");
  const b = await readJson(req);
  const n = Math.max(1, Math.min(20, Number(b.count) || 1));
  const kind = b.kind === "book" ? "books/" : "";
  if (!kind) await useQuota(user.id, "photos", n);
  const out = [];
  for (let i = 0; i < (kind ? 1 : n); i++) {
    const path = `${user.id}/${kind}${crypto.randomUUID()}.${kind ? "pdf" : "jpg"}`;
    const { data, error } = await store().createSignedUploadUrl(path);
    if (error) throw new HttpError(503, "Photo storage isn't set up yet.");
    out.push({ path, token: data.token });
  }
  return { uploads: out };
});

// Step 2: save the photo's details. Also list, edit and delete.
export const photos = handler(["GET", "POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const sb = deps.supabase();
  if (req.method === "POST") {
    requireFeature(profile, "photos");
    const b = await readJson(req);
    if (b.remove) {
      const { data: p } = await sb.from("photos").select("*").eq("id", b.remove).eq("user_id", user.id).maybeSingle();
      if (!p) throw new HttpError(404, "Photo not found.");
      await sb.from("photos").delete().eq("id", p.id); await store().remove([p.path]);
      return { removed: true };
    }
    if (b.update?.id) {
      const { data: p } = await sb.from("photos").select("*").eq("id", b.update.id).eq("user_id", user.id).maybeSingle();
      if (!p) throw new HttpError(404, "Photo not found.");
      const meet = b.update.meetId !== undefined ? await ownMeet(sb, user.id, b.update.meetId) : undefined;
      await sb.from("photos").update({ ...(b.update.caption !== undefined ? { caption: str(b.update.caption) } : {}), ...(b.update.shared !== undefined ? { shared: !!b.update.shared } : {}),
        ...(meet !== undefined ? { meet_id: meet?.id || null, club_meet_id: meet?.club_meet_id || null, gymnast_id: meet?.gymnast_id || p.gymnast_id } : {}) }).eq("id", p.id);
      return { ok: true };
    }
    const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [b];
    const saved = [];
    for (const it of items) {
      if (!okPath(user.id, it.path)) throw new HttpError(400, "Upload the photo first.");
      const { data: g } = await sb.from("gymnasts").select("id").eq("id", it.gymnastId).eq("user_id", user.id).maybeSingle();
      if (!g) throw new HttpError(400, "Pick the athlete for this photo.");
      const meet = it.meetId ? await ownMeet(sb, user.id, it.meetId) : null;
      const rec = { user_id: user.id, gymnast_id: g.id, meet_id: meet?.id || null, club_meet_id: meet?.club_meet_id || null, path: it.path, caption: str(it.caption), shared: !!it.shared && !!meet?.club_meet_id,
        taken_at: /^\d{4}-\d{2}-\d{2}/.test(it.taken_at || "") ? it.taken_at.slice(0, 19) : null, width: Math.round(Number(it.width) || 0) || null, height: Math.round(Number(it.height) || 0) || null };
      const { error } = await sb.from("photos").insert(rec); if (error) throw error;
      saved.push(rec.path);
    }
    return { saved: saved.length };
  }
  const u = new URL(req.url || "/", "http://x");
  const gid = u.searchParams.get("gymnast"), mid = u.searchParams.get("meet");
  let { data: own } = await sb.from("photos").select("*").eq("user_id", user.id);
  own = (own || []).filter((p) => (!gid || p.gymnast_id === gid) && (!mid || p.meet_id === mid));
  // Teammates' shared photos from the same competitions (same gym).
  let team = [];
  if (profile.club_id) {
    const { data: ms } = await sb.from("meets").select("id,club_meet_id,gymnast_id").eq("user_id", user.id);
    const cms = [...new Set((ms || []).filter((m) => m.club_meet_id && (!gid || m.gymnast_id === gid) && (!mid || m.id === mid)).map((m) => m.club_meet_id))];
    if (cms.length) { const { data } = await sb.from("photos").select("*").in("club_meet_id", cms); team = (data || []).filter((p) => p.shared && p.user_id !== user.id); }
  }
  const all = [...own, ...team].sort((a, b) => ((a.taken_at || a.created_at) < (b.taken_at || b.created_at) ? 1 : -1)).slice(0, 400);
  const urls = await sign(all.map((p) => p.path));
  return { printsEnabled: printsEnabled(), bookPrintable: printsEnabled() && !!skuFor("book"), photos: all.map((p) => ({ id: p.id, url: urls[p.path], mine: p.user_id === user.id, gymnast_id: p.user_id === user.id ? p.gymnast_id : null, meet_id: p.user_id === user.id ? p.meet_id : (own.find(() => false), null), club_meet_id: p.club_meet_id, caption: p.caption, shared: p.shared, taken_at: p.taken_at, width: p.width, height: p.height, created_at: p.created_at })) };
});
async function ownMeet(sb, userId, id) {
  if (!id) return null;
  const { data } = await sb.from("meets").select("id,club_meet_id,gymnast_id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(400, "That event isn't on your calendar.");
  return data;
}

// Order prints or a printed Season Book: pay with Stripe (shipping address collected there), then the lab prints and ships.
export const order = handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "photos");
  if (!printsEnabled()) throw Object.assign(new HttpError(501, "Printing isn't switched on yet. You can download your photos and Season Book meanwhile."), { code: "prints_off" });
  const b = await readJson(req);
  const sb = deps.supabase();
  const lines = [];
  for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 100)) {
    const product = PRINTS[it.product] ? it.product : null, qty = Math.max(0, Math.min(50, Math.floor(Number(it.qty) || 0)));
    if (!product || !qty) continue;
    if (product === "book") {
      if (!skuFor("book")) throw new HttpError(400, "Printed books aren't available yet — download the PDF instead.");
      if (!okPath(user.id, it.path, "books/")) throw new HttpError(400, "Make the Season Book first.");
      lines.push({ product, qty, path: it.path, title: str(it.title, 80) });
      continue;
    }
    const { data: p } = await sb.from("photos").select("*").eq("id", it.photoId).maybeSingle();
    if (!p || (p.user_id !== user.id && !p.shared)) throw new HttpError(404, "One of the photos isn't available.");
    if (p.width && p.height && Math.max(p.width, p.height) < PRINTS[product].minPx) throw new HttpError(400, `One photo is too small for a sharp ${PRINTS[product].name}. Pick a smaller size.`);
    lines.push({ product, qty, photo_id: p.id, path: p.path });
  }
  if (!lines.length) throw new HttpError(400, "Choose at least one print.");
  const t = printTotal(lines);
  const id = crypto.randomUUID();
  await sb.from("print_orders").insert({ id, user_id: user.id, items: lines, total_cents: Math.round(t.total * 100), status: "pending" });
  const grouped = {};
  for (const l of lines) grouped[l.product] = (grouped[l.product] || 0) + l.qty;
  const line_items = Object.entries(grouped).map(([k, qty]) => ({ quantity: qty, price_data: { currency: "usd", unit_amount: Math.round(PRINTS[k].price * 100), product_data: { name: PRINTS[k].name } } }));
  if (t.ship) line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(t.ship * 100), product_data: { name: "Shipping (US)" } } });
  const s = await deps.stripe().checkout.sessions.create({ mode: "payment", line_items, customer_email: user.email || undefined, shipping_address_collection: { allowed_countries: ["US"] },
    metadata: { kind: "prints", print_order: id, user_id: user.id }, success_url: `${appUrl()}/?page=photos&printed=1`, cancel_url: `${appUrl()}/?page=photos` });
  await sb.from("print_orders").update({ stripe_session: s.id }).eq("id", id);
  return { url: s.url };
});

// From the Stripe webhook after payment: send the order to the print lab. Safe to call twice.
export async function fulfillPrints(s) {
  const sb = deps.supabase();
  const { data: o } = await sb.from("print_orders").select("*").eq("id", s.metadata?.print_order).maybeSingle();
  if (!o || o.status !== "pending") return o?.id || null;
  const ship = s.shipping_details || s.collected_information?.shipping_details || s.customer_details || {};
  const a = ship.address || {};
  const urls = await sign(o.items.map((l) => l.path), 7 * 86400);
  const body = { submit: true, merchantReference: o.id, shippingMethod: "budget",
    recipient: { name: ship.name || s.customer_details?.name || "Customer", email: s.customer_details?.email || undefined,
      address: { line1: a.line1, line2: a.line2 || undefined, postalOrZipCode: a.postal_code, countryCode: a.country || "US", townOrCity: a.city, stateOrCounty: a.state } },
    items: o.items.map((l) => ({ sku: skuFor(l.product), quantity: l.qty, sizing: "fillPrintArea", assets: [{ printArea: "default", url: urls[l.path] }] })) };
  let status = "sent", lab = null, problem = null;
  try {
    const r = await deps.fetch(`${PRODIGI}/orders`, { method: "POST", headers: { "X-API-Key": process.env.PRODIGI_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { status = "needs_attention"; problem = JSON.stringify(j).slice(0, 500); } else lab = j.data?.id || j.order?.id || null;
  } catch (e) { status = "needs_attention"; problem = e.message; }
  await sb.from("print_orders").update({ status, lab_order_id: lab, paid_at: deps.now().toISOString(), problem }).eq("id", o.id);
  const { data: p } = await sb.from("profiles").select("email").eq("id", o.user_id).maybeSingle();
  if (p?.email && emailEnabled()) await sendEmail({ to: p.email, subject: "Your prints are on the way to the lab", html: emailLayout({ title: "Thanks for your order",
    body: `<p>We sent ${o.items.reduce((x, l) => x + l.qty, 0)} item(s) to our print lab. Prints usually arrive in 5–8 business days.</p><p style="color:#7B8197;font-size:13px">Order ${esc(o.id.slice(0, 8))}</p>` }) }).catch(() => {});
  if (status !== "sent" && emailEnabled() && process.env.SUPPORT_INBOX_EMAIL) await sendEmail({ to: process.env.SUPPORT_INBOX_EMAIL, subject: `Print order needs attention ${o.id.slice(0, 8)}`, html: emailLayout({ title: "Print lab rejected an order", body: `<p>${esc(problem || "")}</p>` }) }).catch(() => {});
  return o.id;
}

export const mineOrders = handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const { data } = await deps.supabase().from("print_orders").select("*").eq("user_id", user.id);
  return { orders: (data || []).filter((o) => o.status !== "pending").sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((o) => ({ id: o.id, status: o.status, total_cents: o.total_cents, items: o.items.reduce((x, l) => x + l.qty, 0), created_at: o.created_at })) };
});
