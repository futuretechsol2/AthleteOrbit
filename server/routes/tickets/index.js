// Meet tickets: families buy spectator tickets in the app and skip the line at the door.
// The organizer gets the ticket money (automatically through Stripe Connect when their account is linked);
// AthleteOrbit keeps a small service fee per ticket (+ an optional % agreed with the organizer).
import crypto from "node:crypto";
import { handler, readJson, requireUser, deps, env, HttpError, sendEmail, emailLayout, esc, signToken, checkToken, todayIn } from "../../lib.js";

const PUBLIC = "id,name,host,location,sport,start_date,end_date,sessions,ticket_types,buyer_fee_cents,status";
const pick = (l, keys = PUBLIC) => Object.fromEntries(keys.split(",").map((k) => [k, l[k] ?? null]));
const appUrl = () => env("APP_URL").replace(/\/$/, "");
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from(crypto.randomBytes(8), (b) => ALPHA[b % ALPHA.length]).join("");
export const orderLink = (id) => `${appUrl()}/my-tickets/${id}?t=${signToken(`tix:${id}`)}`;
const cents = (n) => Math.round(Number(n) * 100);
const money = (c) => `$${(c / 100).toFixed(2)}`;

async function loadListing(id) {
  if (!id || typeof id !== "string") throw new HttpError(400, "Missing meet.");
  const { data } = await deps.supabase().from("meet_listings").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "We couldn't find that meet.");
  return data;
}
async function optionalUser(req) {
  if (!(req.headers.authorization || "").startsWith("Bearer ")) return null;
  try { return (await requireUser(req)).user; } catch { return null; }
}

// Price a cart: [{typeId, qty}] → line items + totals. Throws on anything invalid.
export function priceCart(listing, items) {
  const types = Array.isArray(listing.ticket_types) ? listing.ticket_types : [];
  const lines = [];
  for (const it of Array.isArray(items) ? items : []) {
    const t = types.find((x) => x.id === it.typeId); const qty = Math.floor(Number(it.qty));
    if (!t || !(qty > 0)) continue;
    if (qty > 20) throw new HttpError(400, "Up to 20 tickets per type in one order.");
    lines.push({ type: t, qty, unit: cents(t.price) });
  }
  const count = lines.reduce((a, l) => a + l.qty, 0);
  if (!count) throw new HttpError(400, "Pick at least one ticket.");
  if (count > 30) throw new HttpError(400, "Up to 30 tickets per order.");
  const tickets = lines.reduce((a, l) => a + l.unit * l.qty, 0);
  const fee = (listing.buyer_fee_cents ?? 150) * count;
  const platform = Math.round(tickets * Number(listing.platform_pct || 0) / 100);
  return { lines, count, tickets, fee, platform, total: tickets + fee };
}

export const listing = handler(["GET"], async (req) => {
  const id = new URL(req.url || "/", "http://x").searchParams.get("id");
  const l = await loadListing(id);
  if (l.status === "draft") throw new HttpError(404, "Tickets for this meet aren't on sale yet.");
  return { listing: pick(l) };
});

// Meets with tickets on sale (used when a parent adds a meet: "Find this meet").
export const search = handler(["GET"], async (req) => {
  const q = (new URL(req.url || "/", "http://x").searchParams.get("q") || "").toLowerCase().trim();
  const { data } = await deps.supabase().from("meet_listings").select("*").eq("status", "on_sale").gte("start_date", todayIn());
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const rows = (data || []).filter((l) => !words.length || words.every((w) => `${l.name} ${l.host || ""} ${l.location || ""}`.toLowerCase().includes(w)))
    .sort((a, b) => (a.start_date > b.start_date ? 1 : -1)).slice(0, 20);
  return { listings: rows.map((l) => pick(l)) };
});

export const checkout = handler(["POST"], async (req) => {
  const body = await readJson(req);
  const l = await loadListing(body.listingId);
  if (l.status !== "on_sale") throw new HttpError(409, "Tickets for this meet aren't on sale right now.");
  if ((l.end_date || l.start_date) < todayIn()) throw new HttpError(409, "This meet is over.");
  const cart = priceCart(l, body.items);
  const sessions = Array.isArray(l.sessions) ? l.sessions : [];
  const session = sessions.length ? (sessions.includes(body.session) ? body.session : null) : null;
  if (sessions.length && !session) throw new HttpError(400, "Pick a session.");
  const user = await optionalUser(req);
  const email = String(body.email || user?.email || "").trim().slice(0, 200);
  const name = String(body.name || "").trim().slice(0, 80);
  const line_items = cart.lines.map((x) => ({ quantity: x.qty, price_data: { currency: "usd", unit_amount: x.unit, product_data: { name: `${l.name} — ${x.type.name}`, description: session || undefined } } }));
  if (cart.fee) line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: cart.fee, product_data: { name: "Service fee", description: "Skip-the-line mobile tickets" } } });
  const s = await deps.stripe().checkout.sessions.create({
    mode: "payment", line_items,
    ...(email.includes("@") ? { customer_email: email } : {}),
    ...(l.stripe_account ? { payment_intent_data: { application_fee_amount: cart.fee + cart.platform, transfer_data: { destination: l.stripe_account } } } : {}),
    metadata: { kind: "tickets", listing_id: l.id, session: session || "", user_id: user?.id || "", buyer_name: name, items: JSON.stringify(cart.lines.map((x) => [x.type.id, x.qty])) },
    success_url: `${appUrl()}/tickets/${l.id}?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/tickets/${l.id}`,
  });
  return { url: s.url };
});

// Called from the Stripe webhook when a ticket checkout completes. Safe to call twice.
export async function fulfillTickets(s) {
  const sb = deps.supabase();
  const { data: dup } = await sb.from("ticket_orders").select("id").eq("stripe_session", s.id);
  if (dup?.length) return dup[0].id;
  const l = await loadListing(s.metadata.listing_id);
  let pairs = []; try { pairs = JSON.parse(s.metadata.items || "[]"); } catch {}
  const cart = priceCart(l, pairs.map(([typeId, qty]) => ({ typeId, qty })));
  const email = s.customer_details?.email || s.customer_email || null;
  await sb.from("ticket_orders").insert({ listing_id: l.id, user_id: s.metadata.user_id || null, buyer_email: email, buyer_name: s.metadata.buyer_name || s.customer_details?.name || null,
    stripe_session: s.id, tickets_cents: cart.tickets, fee_cents: cart.fee, platform_cents: cart.platform, status: "paid" });
  const { data: rows } = await sb.from("ticket_orders").select("id").eq("stripe_session", s.id);
  const orderId = rows[0].id;
  const codes = [];
  for (const x of cart.lines) for (let i = 0; i < x.qty; i++) {
    const code = newCode(); codes.push([x.type.name, code]);
    await sb.from("tickets").insert({ order_id: orderId, listing_id: l.id, type_name: x.type.name, session_label: s.metadata.session || null, code });
  }
  if (email) await sendEmail({ to: email, subject: `Your tickets: ${l.name}`, html: emailLayout({ title: `You're in — ${l.name}`,
    body: `<p>${esc(l.start_date)}${l.location ? ` · ${esc(l.location)}` : ""}${s.metadata.session ? `<br>${esc(s.metadata.session)}` : ""}</p>
<p><a href="${esc(orderLink(orderId))}" style="color:#E5523F;font-weight:bold">Show my tickets (QR codes)</a></p>
<p>Show the QR code or the code at the door to skip the line:</p><ul>${codes.map(([t, c]) => `<li>${esc(t)}: <b style="font-family:monospace;font-size:16px">${c}</b></li>`).join("")}</ul>
<p style="color:#7B8197;font-size:13px">Questions about the meet? Contact ${esc(l.organizer_name || "the meet organizer")}${l.organizer_email ? ` (${esc(l.organizer_email)})` : ""}.</p>` }) }).catch(() => {});
  return orderId;
}

async function orderView(orderId) {
  const sb = deps.supabase();
  const { data: o } = await sb.from("ticket_orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) throw new HttpError(404, "Order not found.");
  const [{ data: t }, l] = await Promise.all([sb.from("tickets").select("*").eq("order_id", o.id), loadListing(o.listing_id)]);
  return { listing: pick(l), order: { id: o.id, buyer_name: o.buyer_name, status: o.status, total_cents: o.tickets_cents + o.fee_cents, created_at: o.created_at },
    tickets: (t || []).map((x) => ({ code: x.code, type_name: x.type_name, session_label: x.session_label, used_at: x.used_at })) };
}

export const order = handler(["GET"], async (req) => {
  const u = new URL(req.url || "/", "http://x"); const id = u.searchParams.get("o");
  if (!id || !checkToken(`tix:${id}`, u.searchParams.get("t"))) throw new HttpError(403, "This ticket link isn't valid.");
  return orderView(id);
});

// Right after paying: the return page asks for the order of its Stripe session.
export const paid = handler(["GET"], async (req) => {
  const sid = new URL(req.url || "/", "http://x").searchParams.get("session_id");
  if (!sid || !/^cs_[A-Za-z0-9_]{8,200}$/.test(sid)) throw new HttpError(400, "Missing payment.");
  const { data } = await deps.supabase().from("ticket_orders").select("id").eq("stripe_session", sid);
  return data?.length ? { link: orderLink(data[0].id) } : { pending: true };
});

export const mine = handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const sb = deps.supabase();
  const [{ data: a }, { data: b }] = await Promise.all([sb.from("ticket_orders").select("*").eq("user_id", user.id), user.email ? sb.from("ticket_orders").select("*").eq("buyer_email", user.email) : { data: [] }]);
  const seen = new Set(); const out = [];
  for (const o of [...(a || []), ...(b || [])]) {
    if (seen.has(o.id)) continue; seen.add(o.id);
    const l = await loadListing(o.listing_id).catch(() => null);
    if (l) out.push({ id: o.id, link: orderLink(o.id), listing: pick(l), created_at: o.created_at });
  }
  return { orders: out.sort((x, y) => (x.listing.start_date > y.listing.start_date ? 1 : -1)) };
});

// Door staff: listing id + door key from the link the organizer gets. No account needed.
async function doorListing(id, key) {
  const l = await loadListing(id);
  const a = Buffer.from(String(l.door_key)), b = Buffer.from(String(key || ""));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, "This door link isn't valid.");
  return l;
}
export const door = handler(["GET"], async (req) => {
  const u = new URL(req.url || "/", "http://x");
  const l = await doorListing(u.searchParams.get("l"), u.searchParams.get("k"));
  const { data: t } = await deps.supabase().from("tickets").select("id,used_at,type_name").eq("listing_id", l.id);
  return { listing: pick(l), sold: (t || []).length, checkedIn: (t || []).filter((x) => x.used_at).length };
});
export const checkin = handler(["POST"], async (req) => {
  const body = await readJson(req);
  const l = await doorListing(body.l, body.k);
  const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const sb = deps.supabase();
  const { data: t } = await sb.from("tickets").select("*").eq("listing_id", l.id).eq("code", code).maybeSingle();
  if (!t) return { ok: false, reason: "not_found" };
  const { data: o } = await sb.from("ticket_orders").select("status,buyer_name").eq("id", t.order_id).maybeSingle();
  if (o?.status === "refunded") return { ok: false, reason: "refunded" };
  if (t.used_at) return { ok: false, reason: "used", used_at: t.used_at, type_name: t.type_name };
  const now = deps.now().toISOString();
  await sb.from("tickets").update({ used_at: now }).eq("id", t.id);
  return { ok: true, type_name: t.type_name, session_label: t.session_label, buyer_name: o?.buyer_name || null };
});

// Tell families about a meet whose tickets are on sale: parents who have this meet on their calendar
// (linked, or same dates and a similar name) and families of the gyms listed as attending. Each family once.
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "meet", "invitational", "classic", "cup"].includes(w));
export function similar(a, b) {
  const A = new Set(words(a)), B = words(b);
  if (!A.size || !B.length) return false;
  const hit = B.filter((w) => A.has(w)).length;
  return hit / Math.min(A.size, B.length) >= 0.5;
}
export async function notifyListing(listingId) {
  const sb = deps.supabase();
  const l = await loadListing(listingId);
  if (l.status !== "on_sale") return { notified: 0, skipped: "not on sale" };
  const end = l.end_date || l.start_date;
  const { data: meets } = await sb.from("meets").select("*").gte("start_date", l.start_date);
  const users = new Map();
  for (const m of meets || []) {
    if (m.start_date > end) continue;
    const linked = m.listing_id === l.id || (!m.listing_id && similar(l.name, m.name));
    if (!linked) continue;
    if (m.listing_id !== l.id) await sb.from("meets").update({ listing_id: l.id }).eq("id", m.id);
    users.set(m.user_id, m);
  }
  if ((l.club_codes || []).length) {
    const { data: clubs } = await sb.from("clubs").select("id,code").in("code", l.club_codes);
    const ids = (clubs || []).map((c) => c.id);
    if (ids.length) { const { data: fams } = await sb.from("profiles").select("id").in("club_id", ids); for (const f of fams || []) if (!users.has(f.id)) users.set(f.id, null); }
  }
  const { data: done } = await sb.from("listing_notices").select("user_id").eq("listing_id", l.id);
  const already = new Set((done || []).map((d) => d.user_id));
  const link = `${appUrl()}/tickets/${l.id}?utm_source=ticket_email`;
  const prices = (l.ticket_types || []).map((t) => `${esc(t.name)} $${Number(t.price).toFixed(2).replace(/\.00$/, "")}`).join(" · ");
  let notified = 0;
  for (const [uid] of users) {
    if (already.has(uid)) continue;
    const { data: p } = await sb.from("profiles").select("email,email_reminders").eq("id", uid).maybeSingle();
    await sb.from("listing_notices").insert({ listing_id: l.id, user_id: uid });
    if (!p?.email || p.email_reminders === false) continue;
    await sendEmail({ to: p.email, subject: `Tickets on sale: ${l.name} — skip the line`, html: emailLayout({ title: `Get your tickets for ${l.name}`,
      body: `<p>${esc(l.start_date)}${l.location ? ` · ${esc(l.location)}` : ""}</p>${prices ? `<p>${prices}</p>` : ""}<p>Buy now in AthleteOrbit, then show the QR code at the door — no waiting at the ticket table.</p><p><a href="${esc(link)}" style="color:#E5523F;font-weight:bold">Buy tickets</a></p>` }) }).catch(() => {});
    notified++;
  }
  await sb.from("meet_listings").update({ notified_at: deps.now().toISOString() }).eq("id", l.id);
  return { notified, families: users.size };
}
