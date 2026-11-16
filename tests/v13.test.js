import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { meetForDate } from "../src/lib/media.js";
import { printTotal, PRINTS } from "../src/data/prints.js";
import { SPORT_NAMES } from "../src/data/sports.js";
import { hasFeature } from "../src/data/plans.js";

let T, mails, made, labCalls, ai;
beforeEach(() => {
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "hi@athleteorbit.org", APP_URL: "https://athleteorbit.org", ANTHROPIC_API_KEY: "k", LINK_SECRET: "s", BUSINESS_NAME: "FT", BUSINESS_ADDRESS: "1 Main", PRODIGI_API_KEY: "sandbox_x", STRIPE_WEBHOOK_SECRET: "whsec" });
  delete process.env.PRINT_SKU_BOOK; delete process.env.TICKET_FEE_CENTS;
  mails = []; made = null; labCalls = []; ai = [];
  const future = "2027-06-01T00:00:00Z";
  T = {
    profiles: [
      { id: "own", email: "owner@gym.com", account_type: "gym", gym_name: "Apex", full_name: "Olga" },
      { id: "p1", email: "dad@x.com", full_name: "Dan Dad", club_id: "c1", subscription_status: "active", subscription_tier: "basic" },
      { id: "p2", email: "mom@x.com", full_name: "Mia Mom", subscription_status: "active", subscription_tier: "pro" },
      { id: "p3", email: "kate@x.com", full_name: "Kate", subscription_status: "active", subscription_tier: "basic" },
      { id: "org", email: "meet@host.com", full_name: "Meet Host", subscription_status: "active", subscription_tier: "basic" },
    ],
    clubs: [{ id: "c1", name: "Apex Gymnastics", code: "APEX-1", owner_id: "own", seats: 50, active_until: future, sport: "Gymnastics" }, { id: "c2", name: "Queen City Gym", code: "QC-9", owner_id: "x", seats: 50, active_until: future }],
    club_roster: [
      { id: "r1", club_id: "c1", name: "Maya Patel", level: "Level 5", gender: "F", program: "WAG", sport: "Gymnastics" },
      { id: "r2", club_id: "c2", name: "Maya Johnson", level: "Level 3", gender: "F", program: "WAG", sport: "Gymnastics", parent_email: "mom@x.com" },
      { id: "r3", club_id: "c1", name: "Ruby Stone", level: "Level 4", gender: "F", program: "WAG", sport: "Gymnastics" },
    ],
    gymnasts: [{ id: "g1", user_id: "p1", name: "Leo", level: "Level 4", program: "MAG", gender: "M" }, { id: "g2", user_id: "p2", name: "Zoe", level: "Level 3", program: "WAG", gender: "F" }],
    club_meets: [{ id: "cm1", club_id: "c1", name: "Snowflake", start_date: "2026-12-05", levels: [], status: "published" }],
    meets: [{ id: "m1", user_id: "p1", gymnast_id: "g1", name: "Snowflake", start_date: "2026-12-05", club_meet_id: "cm1" }, { id: "m2", user_id: "p2", gymnast_id: "g2", name: "Fall Cup", start_date: "2026-10-10" }],
    roster_requests: [], photos: [], print_orders: [], meet_listings: [], ticket_orders: [], tickets: [], ai_usage: [], usage: [], ai_notes: [],
  };
  const users = Object.fromEntries(T.profiles.map((p) => [p.id, { id: p.id, email: p.email }]));
  deps.supabase = () => fakeSupabase(T, users);
  deps.now = () => new Date("2026-11-13T15:00:00Z");
  deps.fetch = async (url, o) => {
    if (String(url).includes("sendgrid")) { mails.push(JSON.parse(o.body)); return { ok: true, status: 202, text: async () => "" }; }
    if (String(url).includes("prodigi")) { labCalls.push({ url, body: o?.body ? JSON.parse(o.body) : null, key: o?.headers?.["X-API-Key"] }); return { ok: true, status: 202, json: async () => ({ outcome: "Created", data: { id: "ord_123" } }) }; }
    if (String(url).includes("anthropic")) { const b = JSON.parse(o.body); ai.push(b); return { ok: true, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "**Night before** pasta" }] }) }; }
    throw new Error("unexpected " + url);
  };
  let acct = { charges_enabled: false, details_submitted: false };
  deps.stripe = () => ({
    checkout: { sessions: { create: async (p) => { made = p; return { id: "cs_test_prints_1", url: "https://checkout.test/s" }; } } },
    accounts: { create: async () => ({ id: "acct_1" }), retrieve: async () => acct },
    accountLinks: { create: async () => ({ url: "https://connect.test/onboard" }) },
    webhooks: { constructEvent: () => deps._event },
    _ready: () => { acct = { charges_enabled: true, details_submitted: true }; },
  });
});

test("every activity is in the catalog; video check and family assistant are gone; photos in Basic", () => {
  assert.ok(SPORT_NAMES.includes("Martial Arts") && SPORT_NAMES.includes("Music & Performing Arts") && SPORT_NAMES.includes("Academics & STEM"));
  assert.equal(ROUTES["ai/video"], undefined); assert.equal(ROUTES["ai/family"], undefined);
  assert.equal(hasFeature("basic", "photos"), true); assert.equal(hasFeature("basic", "seasonBook"), false); assert.equal(hasFeature("pro", "seasonBook"), true);
});

test("find your athlete across gyms: short names only, your gym first, gym name filter", async () => {
  const r = await call(ROUTES["roster/find"], { method: "GET", token: "p3", url: "/api/roster/find?q=maya" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.results.map((x) => `${x.name}|${x.gym}`).sort(), ["Maya J.|Queen City Gym", "Maya P.|Apex Gymnastics"]);
  assert.doesNotMatch(JSON.stringify(r.json), /Patel|Johnson|parent_email|mom@x/);
  const mine = await call(ROUTES["roster/find"], { method: "GET", token: "p1", url: "/api/roster/find?q=maya" });
  assert.equal(mine.json.results[0].gym, "Apex Gymnastics"); assert.equal(mine.json.results[0].myGym, true);
  const f = await call(ROUTES["roster/find"], { method: "GET", token: "p3", url: "/api/roster/find?q=maya&gym=queen" }); assert.equal(f.json.results.length, 1);
  assert.equal((await call(ROUTES["roster/find"], { method: "GET", token: "p3", url: "/api/roster/find?q=m" })).json.results.length, 0);
  assert.equal((await call(ROUTES["roster/find"], { method: "GET", url: "/api/roster/find?q=maya" })).status, 401);
});

test("linking: email on roster → instant; gym code → instant; otherwise the gym approves", async () => {
  // Email matches the roster: linked + joined straight away, existing "Zoe" untouched, new "Maya" created.
  let r = await call(ROUTES["roster/request"], { token: "p2", body: { rosterId: "r2" } });
  assert.equal(r.json.linked, true, JSON.stringify(r.json)); assert.equal(T.profiles[2].club_id, "c2");
  assert.ok(T.gymnasts.find((g) => g.user_id === "p2" && g.roster_id === "r2" && g.name === "Maya"));
  // No email match, wrong code → error; right code → linked.
  assert.equal((await call(ROUTES["roster/request"], { token: "p3", body: { rosterId: "r1", code: "NOPE" } })).status, 400);
  r = await call(ROUTES["roster/request"], { token: "p3", body: { rosterId: "r1", code: "apex-1" } });
  assert.equal(r.json.linked, true); assert.equal(T.profiles[3].club_id, "c1");
  // Already in another gym → must leave first.
  assert.equal((await call(ROUTES["roster/request"], { token: "p2", body: { rosterId: "r3", code: "APEX-1" } })).status, 409);
  // Request path: owner is emailed, approves, parent joins + is linked + emailed.
  r = await call(ROUTES["roster/request"], { token: "org", body: { rosterId: "r3" } });
  assert.equal(r.json.requested, true); assert.equal(mails.at(-1).personalizations[0].to[0].email, "owner@gym.com");
  await call(ROUTES["roster/request"], { token: "org", body: { rosterId: "r3" } }); assert.equal(T.roster_requests.length, 1, "no duplicate requests");
  const list = await call(ROUTES["club/roster-requests"], { method: "GET", token: "own" });
  assert.equal(list.json.requests[0].athlete, "Ruby Stone"); assert.equal(list.json.requests[0].email, "meet@host.com");
  assert.equal((await call(ROUTES["club/roster-requests"], { method: "GET", token: "p1" })).status, 403);
  const ap = await call(ROUTES["club/roster-requests"], { token: "own", body: { id: list.json.requests[0].id, approve: true } });
  assert.equal(ap.json.approved, true); assert.equal(T.profiles[4].club_id, "c1"); assert.ok(T.gymnasts.find((g) => g.user_id === "org" && g.roster_id === "r3"));
  assert.equal(mails.at(-1).personalizations[0].to[0].email, "meet@host.com");
});

test("photos: upload links are per-family; save, list, team sharing only within the same gym event", async () => {
  const u = await call(ROUTES["photos/upload-url"], { token: "p1", body: { count: 3 } });
  assert.equal(u.json.uploads.length, 3); assert.ok(u.json.uploads.every((x) => x.path.startsWith("p1/") && x.path.endsWith(".jpg")));
  // Can't save someone else's path.
  assert.equal((await call(ROUTES.photos, { token: "p2", body: { items: [{ path: u.json.uploads[0].path, gymnastId: "g2" }] } })).status, 400);
  assert.equal((await call(ROUTES.photos, { token: "p1", body: { items: [{ path: "p1/../../x.jpg", gymnastId: "g1" }] } })).status, 400);
  const s = await call(ROUTES.photos, { token: "p1", body: { items: [{ path: u.json.uploads[0].path, gymnastId: "g1", meetId: "m1", shared: true, taken_at: "2026-12-05T10:31:00", width: 3000, height: 2000 }, { path: u.json.uploads[1].path, gymnastId: "g1", meetId: "m1", width: 900, height: 600 }] } });
  assert.equal(s.json.saved, 2); assert.equal(T.photos[0].club_meet_id, "cm1"); assert.equal(T.photos[0].shared, true); assert.equal(T.photos[1].shared, false);
  const mine = await call(ROUTES.photos, { method: "GET", token: "p1", url: "/api/photos?gymnast=g1" });
  assert.equal(mine.json.photos.length, 2); assert.match(mine.json.photos[0].url, /^https:\/\/store\/photos\/p1\//);
  // A teammate at the same gym event sees only the shared one.
  T.gymnasts.push({ id: "g9", user_id: "p3", name: "Ava" }); T.profiles[3].club_id = "c1"; T.meets.push({ id: "m9", user_id: "p3", gymnast_id: "g9", name: "Snowflake", start_date: "2026-12-05", club_meet_id: "cm1" });
  const team = await call(ROUTES.photos, { method: "GET", token: "p3", url: "/api/photos" });
  assert.equal(team.json.photos.length, 1); assert.equal(team.json.photos[0].mine, false); assert.equal(team.json.photos[0].gymnast_id, null);
  // Not in that gym → nothing.
  assert.equal((await call(ROUTES.photos, { method: "GET", token: "p2", url: "/api/photos" })).json.photos.length, 0);
  // Edit + delete own only.
  const id = T.photos[1].id;
  assert.equal((await call(ROUTES.photos, { token: "p3", body: { remove: id } })).status, 404);
  await call(ROUTES.photos, { token: "p1", body: { update: { id, caption: "First clean beam!" } } }); assert.equal(T.photos[1].caption, "First clean beam!");
  await call(ROUTES.photos, { token: "p1", body: { remove: id } }); assert.equal(T.photos.length, 1); assert.deepEqual(T._removed, [u.json.uploads[1].path]);
});

test("print order: priced from the catalog, too-small photos refused, paid order goes to the lab once", async () => {
  T.photos.push({ id: "ph1", user_id: "p1", gymnast_id: "g1", path: "p1/aaaa.jpg", width: 3000, height: 2000 }, { id: "ph2", user_id: "p1", gymnast_id: "g1", path: "p1/bbbb.jpg", width: 1300, height: 860 }, { id: "ph3", user_id: "p2", gymnast_id: "g2", path: "p2/cccc.jpg", width: 3000, height: 2000 });
  assert.equal((await call(ROUTES["photos/order"], { token: "p1", body: { items: [{ photoId: "ph2", product: "p8x10", qty: 1 }] } })).status, 400, "1300px is too small for 8x10");
  assert.equal((await call(ROUTES["photos/order"], { token: "p1", body: { items: [{ photoId: "ph3", product: "p4x6", qty: 1 }] } })).status, 404, "another family's private photo");
  const r = await call(ROUTES["photos/order"], { token: "p1", body: { items: [{ photoId: "ph1", product: "p8x10", qty: 2 }, { photoId: "ph2", product: "p4x6", qty: 3 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(made.shipping_address_collection.allowed_countries[0], "US");
  const t = printTotal([{ product: "p8x10", qty: 2 }, { product: "p4x6", qty: 3 }]); assert.equal(t.total, 22.94);
  assert.equal(made.line_items.reduce((a, l) => a + l.quantity * l.price_data.unit_amount, 0), Math.round(t.total * 100));
  assert.equal(T.print_orders[0].status, "pending");
  deps._event = { type: "checkout.session.completed", data: { object: { id: "cs_test_prints_1", payment_status: "paid", metadata: { kind: "prints", print_order: T.print_orders[0].id }, customer_details: { email: "dad@x.com", name: "Dan Dad" },
    shipping_details: { name: "Dan Dad", address: { line1: "1 Main St", city: "Concord", state: "NC", postal_code: "28027", country: "US" } } } } };
  await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  assert.equal(labCalls.filter((c) => c.body).length, 1, "sent to the lab once");
  const lab = labCalls.find((c) => c.body);
  assert.match(lab.url, /api\.prodigi\.com\/v5\/orders$/); assert.equal(lab.key, "sandbox_x");
  assert.equal(lab.body.recipient.address.postalOrZipCode, "28027"); assert.equal(lab.body.items.length, 2); assert.equal(lab.body.items[0].quantity, 2);
  assert.equal(lab.body.items[0].sku, PRINTS.p8x10.sku); assert.match(lab.body.items[0].assets[0].url, /exp=604800/);
  assert.equal(T.print_orders[0].status, "sent"); assert.equal(T.print_orders[0].lab_order_id, "ord_123");
  delete process.env.PRODIGI_API_KEY;
  const off = await call(ROUTES["photos/order"], { token: "p1", body: { items: [{ photoId: "ph1", product: "p4x6", qty: 1 }] } });
  assert.equal(off.status, 501); assert.equal(off.json.code, "prints_off");
  process.env.PRODIGI_API_KEY = "sandbox_x";
  assert.equal((await call(ROUTES["photos/order"], { token: "p1", body: { items: [{ product: "book", qty: 1, path: "p1/books/aaaa.pdf" }] } })).status, 400, "book SKU not configured");
});

test("photos are sorted into the event by the day they were taken", () => {
  const meets = [{ id: "a", start_date: "2026-12-05", end_date: "2026-12-06" }, { id: "b", start_date: "2027-01-16" }];
  assert.equal(meetForDate(meets, "2026-12-06T18:02:11").id, "a");
  assert.equal(meetForDate(meets, "2027-01-15T20:00:00").id, "b", "travel day before counts");
  assert.equal(meetForDate(meets, "2026-11-20T10:00:00"), null);
});

test("organizers run their own events: create, get paid first, sell, attendees, live update, door lookup", async () => {
  const c = await call(ROUTES["tickets/organizer"], { token: "org", body: { name: "Queen City Classic", start_date: "2027-01-23", location: "Charlotte, NC", sessions: ["Session 1 · Sat 8:00 AM"], ticket_types: [{ name: "Adult", price: 15 }], status: "draft", platform_pct: 25, buyer_fee_cents: 900 } });
  assert.equal(c.status, 200, JSON.stringify(c.json)); const L = T.meet_listings[0];
  assert.equal(L.owner_id, "org"); assert.equal(L.platform_pct, 0, "organizer keeps 100%"); assert.equal(L.buyer_fee_cents, 150); assert.equal(L.organizer_email, "meet@host.com");
  const sell = await call(ROUTES["tickets/organizer"], { token: "org", body: { id: L.id, name: "Queen City Classic", start_date: "2027-01-23", ticket_types: [{ name: "Adult", price: 15 }], status: "on_sale" } });
  assert.equal(sell.status, 409); assert.equal(sell.json.code, "payouts");
  const con = await call(ROUTES["tickets/organizer-connect"], { token: "org", body: { id: L.id } }); assert.equal(con.json.url, "https://connect.test/onboard"); assert.equal(L.stripe_account, "acct_1");
  assert.equal((await call(ROUTES["tickets/organizer-connect"], { token: "p1", body: { id: L.id } })).status, 404, "not your event");
  deps.stripe()._ready();
  assert.equal((await call(ROUTES["tickets/organizer"], { token: "org", body: { id: L.id, name: "Queen City Classic", start_date: "2027-01-23", ticket_types: [{ name: "Adult", price: 15 }], status: "on_sale" } })).status, 200);
  assert.equal(L.status, "on_sale");
  // Two buyers.
  T.ticket_orders.push({ id: "o1", listing_id: L.id, buyer_name: "Jen Brooks", buyer_email: "jen@x.com", status: "paid", tickets_cents: 3000, fee_cents: 300, created_at: "2026-11-01" }, { id: "o2", listing_id: L.id, buyer_name: "Carlos Ortiz", buyer_email: "carlos@x.com", status: "paid", tickets_cents: 1500, fee_cents: 150, created_at: "2026-11-02" });
  T.tickets.push({ id: "t1", order_id: "o1", listing_id: L.id, type_name: "Adult", code: "AAAA2222" }, { id: "t2", order_id: "o1", listing_id: L.id, type_name: "Adult", code: "BBBB3333" }, { id: "t3", order_id: "o2", listing_id: L.id, type_name: "Adult", code: "CCCC4444" });
  const list = await call(ROUTES["tickets/organizer"], { method: "GET", token: "org" });
  assert.equal(list.json.listings[0].sold, 3); assert.equal(list.json.listings[0].gross_cents, 4500); assert.match(list.json.listings[0].door_url, /\/door\/.+\?k=/);
  assert.equal((await call(ROUTES["tickets/organizer"], { method: "GET", token: "p1" })).json.listings.length, 0);
  const at = await call(ROUTES["tickets/attendees"], { method: "GET", token: "org", url: `/api/tickets/attendees?id=${L.id}` });
  assert.deepEqual(at.json.attendees.map((a) => `${a.name}:${a.tickets}`), ["Carlos Ortiz:1", "Jen Brooks:2"]);
  // Live update reaches every buyer once and shows on the public page.
  const up = await call(ROUTES["tickets/update"], { token: "org", body: { id: L.id, text: "Session 1 is running 30 minutes late." } });
  assert.equal(up.json.emailed, 2); assert.match(mails.map((m) => m.subject).join(), /Update: Queen City Classic/);
  assert.equal((await call(ROUTES["tickets/update"], { token: "org", body: { id: L.id, text: "Another one" } })).status, 429);
  const pub = await call(ROUTES["tickets/listing"], { method: "GET", url: `/api/tickets/listing?id=${L.id}` });
  assert.equal(pub.json.listing.updates[0].text, "Session 1 is running 30 minutes late."); assert.equal(pub.json.listing.door_key, undefined);
  // Door: find by name, check in from the result; bad key refused.
  const k = L.door_key || "dk"; L.door_key = k;
  const ds = await call(ROUTES["tickets/door-search"], { body: { l: L.id, k, q: "jen" } });
  assert.equal(ds.json.results[0].tickets.length, 2);
  assert.equal((await call(ROUTES["tickets/door-search"], { body: { l: L.id, k: "wrong", q: "jen" } })).status, 403);
  assert.equal((await call(ROUTES["tickets/checkin"], { body: { l: L.id, k, code: ds.json.results[0].tickets[0].code } })).json.ok, true);
});

test("nutrition tab: focused food plans saved with their own title", async () => {
  T.gymnasts.push({ id: "g5", user_id: "p2", name: "Ivy", level: "Level 5", program: "WAG" });
  const r = await call(ROUTES["ai/tips"], { token: "p2", body: { gymnastId: "g5", kind: "nutrition", focus: "meetday" } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.match(ai[0].system, /meet-day food plan|Pack this cooler/);
  assert.match(T.ai_notes[0].title, /^Event-day food plan: Ivy/);
  await call(ROUTES["ai/tips"], { token: "p2", body: { gymnastId: "g5", kind: "nutrition", focus: "nonsense" } });
  assert.match(ai[1].system, /Everyday fueling/);
});
