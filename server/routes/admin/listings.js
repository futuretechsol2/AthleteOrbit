// Owner dashboard: set up meet ticket listings with organizers, link their Stripe account, notify families.
import { handler, readJson, requireUser, deps, env, HttpError } from "../../lib.js";
import { isAdmin } from "./support.js";
import { notifyListing } from "../tickets/index.js";

async function admin(req) { const { user, profile } = await requireUser(req); if (!isAdmin(user, profile)) throw new HttpError(403, "Team members only."); return user; }
const str = (v, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function cleanListing(b) {
  const types = (Array.isArray(b.ticket_types) ? b.ticket_types : []).map((t, i) => ({ id: str(t.id, 24) || `t${i + 1}`, name: str(t.name, 60), price: Math.round(Number(t.price) * 100) / 100 }))
    .filter((t) => t.name && t.price >= 0 && t.price <= 500);
  const rec = { name: str(b.name), host: str(b.host), location: str(b.location), sport: str(b.sport, 40) || "Gymnastics", start_date: date(b.start_date), end_date: date(b.end_date),
    sessions: (Array.isArray(b.sessions) ? b.sessions : []).map((s) => str(s, 80)).filter(Boolean).slice(0, 20), ticket_types: types,
    buyer_fee_cents: Math.max(0, Math.min(2000, Math.round(Number(b.buyer_fee_cents ?? 150)))), platform_pct: Math.max(0, Math.min(30, Number(b.platform_pct || 0))),
    organizer_name: str(b.organizer_name), organizer_email: str(b.organizer_email, 200), club_codes: (Array.isArray(b.club_codes) ? b.club_codes : []).map((c) => String(c).toUpperCase().trim()).filter(Boolean).slice(0, 50),
    status: ["draft", "on_sale", "closed"].includes(b.status) ? b.status : "draft", notes: str(b.notes, 500) };
  if (!rec.name || !rec.start_date) throw new HttpError(400, "Add the meet name and start date.");
  if (rec.status === "on_sale" && !types.length) throw new HttpError(400, "Add at least one ticket type with a price before selling.");
  return rec;
}

export default handler(["GET", "POST"], async (req) => {
  await admin(req);
  const sb = deps.supabase();
  if (req.method === "POST") {
    const b = await readJson(req);
    const rec = cleanListing(b);
    if (b.id) { const { error } = await sb.from("meet_listings").update(rec).eq("id", b.id); if (error) throw error; return { id: b.id }; }
    const { error } = await sb.from("meet_listings").insert(rec); if (error) throw error;
    const { data } = await sb.from("meet_listings").select("id").eq("name", rec.name).eq("start_date", rec.start_date);
    return { id: data?.at(-1)?.id };
  }
  const [{ data: ls }, { data: orders }, { data: tix }] = await Promise.all([sb.from("meet_listings").select("*"), sb.from("ticket_orders").select("*"), sb.from("tickets").select("listing_id,used_at")]);
  const app = env("APP_URL").replace(/\/$/, "");
  return { listings: (ls || []).sort((a, b) => (a.start_date > b.start_date ? -1 : 1)).map((l) => {
    const os = (orders || []).filter((o) => o.listing_id === l.id && o.status === "paid"), ts = (tix || []).filter((t) => t.listing_id === l.id);
    const gross = os.reduce((a, o) => a + o.tickets_cents, 0), fees = os.reduce((a, o) => a + o.fee_cents + (o.platform_cents || 0), 0);
    return { ...l, sold: ts.length, checkedIn: ts.filter((t) => t.used_at).length, gross_cents: gross, our_cents: fees,
      owed_cents: l.stripe_account ? 0 : gross - os.reduce((a, o) => a + (o.platform_cents || 0), 0),
      public_url: `${app}/tickets/${l.id}`, door_url: `${app}/door/${l.id}?k=${l.door_key}` };
  }) };
});

// Stripe Connect Express: the organizer opens this link, adds their bank, and payouts go to them automatically.
export const connect = handler(["POST"], async (req) => {
  await admin(req);
  const { id } = await readJson(req);
  const sb = deps.supabase(), stripe = deps.stripe();
  const { data: l } = await sb.from("meet_listings").select("*").eq("id", id).maybeSingle();
  if (!l) throw new HttpError(404, "Listing not found.");
  let acct = l.stripe_account;
  if (!acct) {
    const a = await stripe.accounts.create({ type: "express", email: l.organizer_email || undefined, business_profile: { name: l.organizer_name || l.host || undefined }, capabilities: { transfers: { requested: true } } });
    acct = a.id; await sb.from("meet_listings").update({ stripe_account: acct }).eq("id", l.id);
  }
  const app = env("APP_URL").replace(/\/$/, "");
  const link = await stripe.accountLinks.create({ account: acct, type: "account_onboarding", refresh_url: `${app}/?page=admin`, return_url: `${app}/?page=admin` });
  return { url: link.url, account: acct };
});

export const notify = handler(["POST"], async (req) => {
  await admin(req);
  const { id } = await readJson(req);
  return notifyListing(id);
});
