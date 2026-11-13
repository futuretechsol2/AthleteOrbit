import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps, todayIn, signToken } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { priceCart, notifyListing, similar } from "../server/routes/tickets/index.js";
import { runMeetDay } from "../server/routes/cron/meetday.js";
import { runTrialNotices } from "../server/routes/cron/reminders.js";
import { arriveBy, parseTime } from "../src/data/meetday.js";

Object.assign(process.env, { APP_URL: "https://app.test", SENDGRID_API_KEY: "sg", EMAIL_FROM: "hi@athleteorbit.test", LINK_SECRET: "s3cret", ADMIN_EMAILS: "boss@x.com", ANTHROPIC_API_KEY: "k", CRON_SECRET: "c" });
let T, emails, made, ai;
const today = () => todayIn();
const LIST = () => ({ id: "L1", name: "Queen City Invitational", host: "Demo Gym", location: "Charlotte, NC", start_date: today(), end_date: today(), sessions: ["Session 1 · 8:00 AM", "Session 2 · 1:00 PM"],
  ticket_types: [{ id: "adult", name: "Adult day pass", price: 15 }, { id: "kid", name: "Child (6-12)", price: 8 }], buyer_fee_cents: 150, platform_pct: 0, status: "on_sale", door_key: "doorkey123456", club_codes: ["DEMO-1"], stripe_account: "acct_org" });
beforeEach(() => {
  T = {
    profiles: [{ id: "p1", email: "mom@x.com", subscription_status: "active", subscription_tier: "pro", email_reminders: true },
      { id: "p2", email: "dad@x.com", subscription_status: "active", subscription_tier: "basic", email_reminders: true },
      { id: "p3", email: "club@x.com", subscription_status: "none", club_id: "c1" },
      { id: "b", email: "boss@x.com", subscription_status: "none" },
      { id: "t1", email: "trial@x.com", subscription_status: "none", trial_ends_at: new Date(Date.now() + 1.5 * 86400000).toISOString() }],
    clubs: [{ id: "c1", code: "DEMO-1", active_until: new Date(Date.now() + 9e9).toISOString() }],
    gymnasts: [{ id: "g1", user_id: "p1", name: "Maya", program: "WAG", level: "Level 5" }, { id: "g2", user_id: "p2", name: "Zoe", program: "Other", sport: "Swimming", level: "Novice" }],
    meets: [{ id: "m1", user_id: "p1", gymnast_id: "g1", name: "Queen City Invite", start_date: today(), status: "Registered", session_time: "Sat 8:00 AM", location: "Charlotte, NC", checklist: [{ text: "Grips", done: false }] },
      { id: "m2", user_id: "p2", gymnast_id: "g2", name: "Fall Splash", start_date: today(), status: "Registered", session_time: "9am" }],
    meet_listings: [LIST()], ticket_orders: [], tickets: [], listing_notices: [], meetday_sent: [], ai_notes: [], scores: [], stats: [], skill_status: [], coach_notes: [], goals: [], practice_logs: [], qualifiers: [], ai_usage: [],
  };
  deps._sb = fakeSupabase(T, { tp1: { id: "p1", email: "mom@x.com" }, tb: { id: "b", email: "boss@x.com" }, tp2: { id: "p2", email: "dad@x.com" } }); deps.supabase = () => deps._sb;
  emails = []; ai = 0;
  deps.fetch = async (url, init) => {
    if (url.includes("sendgrid")) { emails.push(JSON.parse(init.body)); return { ok: true, text: async () => "" }; }
    ai++; return { ok: true, json: async () => ({ content: [{ type: "text", text: '{"motivation":"You have trained for this, Maya — go have fun.","nutrition":"Oatmeal and banana by 6am; pretzels between rotations.","focus":"Hips square on beam turns."}' }] }) };
  };
  deps.stripe = () => ({ checkout: { sessions: { create: async (p) => { made = p; return { url: "https://checkout.test/s" }; } } } });
});

test("ticket pricing: face value + per-ticket fee + optional organizer cut", () => {
  const c = priceCart({ ...LIST(), platform_pct: 10 }, [{ typeId: "adult", qty: 2 }, { typeId: "kid", qty: 1 }, { typeId: "nope", qty: 3 }]);
  assert.equal(c.count, 3); assert.equal(c.tickets, 3800); assert.equal(c.fee, 450); assert.equal(c.platform, 380); assert.equal(c.total, 4250);
  assert.throws(() => priceCart(LIST(), [{ typeId: "adult", qty: 0 }]), /at least one/);
});

test("public listing hides door key and payout account; search finds it", async () => {
  const r = await call(ROUTES["tickets/listing"], { method: "GET", url: "/api/tickets/listing?id=L1" });
  assert.equal(r.json.listing.name, "Queen City Invitational"); assert.equal(r.json.listing.door_key, undefined); assert.equal(r.json.listing.stripe_account, undefined);
  const s = await call(ROUTES["tickets/search"], { method: "GET", url: "/api/tickets/search?q=queen city" }); assert.equal(s.json.listings.length, 1);
});

test("checkout: organizer paid through Stripe Connect, we keep the fee; session required", async () => {
  let r = await call(ROUTES["tickets/checkout"], { body: { listingId: "L1", items: [{ typeId: "adult", qty: 2 }] } }); assert.equal(r.status, 400); assert.match(r.json.error, /session/);
  r = await call(ROUTES["tickets/checkout"], { body: { listingId: "L1", items: [{ typeId: "adult", qty: 2 }], session: "Session 1 · 8:00 AM", email: "g@x.com", name: "Grandma" } });
  assert.equal(r.status, 200); assert.equal(made.mode, "payment"); assert.equal(made.line_items[0].price_data.unit_amount, 1500); assert.equal(made.line_items[1].price_data.unit_amount, 300);
  assert.equal(made.payment_intent_data.application_fee_amount, 300); assert.equal(made.payment_intent_data.transfer_data.destination, "acct_org");
  T.meet_listings[0].status = "draft"; r = await call(ROUTES["tickets/checkout"], { body: { listingId: "L1", items: [{ typeId: "adult", qty: 1 }], session: "Session 1 · 8:00 AM" } }); assert.equal(r.status, 409);
});

test("webhook issues one ticket per person with codes, emails them, only once; door check-in works", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "w";
  const sess = { id: "cs_test_123456789", payment_status: "paid", customer_details: { email: "g@x.com", name: "Grandma" }, metadata: { kind: "tickets", listing_id: "L1", session: "Session 1 · 8:00 AM", user_id: "", buyer_name: "Grandma", items: JSON.stringify([["adult", 2], ["kid", 1]]) } };
  deps.stripe = () => ({ webhooks: { constructEvent: () => ({ type: "checkout.session.completed", data: { object: sess } }) } });
  await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  assert.equal(T.ticket_orders.length, 1); assert.equal(T.tickets.length, 3); assert.equal(T.ticket_orders[0].tickets_cents, 3800);
  assert.match(emails[0].content.map((c) => c.value).join(" "), new RegExp(T.tickets[0].code));
  const paid = await call(ROUTES["tickets/paid"], { method: "GET", url: "/api/tickets/paid?session_id=cs_test_123456789" }); assert.match(paid.json.link, /my-tickets/);
  const oid = T.ticket_orders[0].id;
  let v = await call(ROUTES["tickets/order"], { method: "GET", url: `/api/tickets/order?o=${oid}&t=bad` }); assert.equal(v.status, 403);
  v = await call(ROUTES["tickets/order"], { method: "GET", url: `/api/tickets/order?o=${oid}&t=${signToken(`tix:${oid}`)}` }); assert.equal(v.json.tickets.length, 3);
  let d = await call(ROUTES["tickets/checkin"], { body: { l: "L1", k: "wrong-key-xxx", code: T.tickets[0].code } }); assert.equal(d.status, 403);
  d = await call(ROUTES["tickets/checkin"], { body: { l: "L1", k: "doorkey123456", code: T.tickets[0].code.toLowerCase() } }); assert.equal(d.json.ok, true);
  d = await call(ROUTES["tickets/checkin"], { body: { l: "L1", k: "doorkey123456", code: T.tickets[0].code } }); assert.equal(d.json.reason, "used");
  d = await call(ROUTES["tickets/checkin"], { body: { l: "L1", k: "doorkey123456", code: "ZZZZZZZZ" } }); assert.equal(d.json.reason, "not_found");
  const s = await call(ROUTES["tickets/door"], { method: "GET", url: "/api/tickets/door?l=L1&k=doorkey123456" }); assert.equal(s.json.sold, 3); assert.equal(s.json.checkedIn, 1);
});

test("families get the ticket link automatically: matching meet + gym families, once each", async () => {
  assert.ok(similar("Queen City Invitational", "Queen City Invite 2026")); assert.ok(!similar("Queen City Invitational", "Fall Splash"));
  const r = await notifyListing("L1");
  assert.equal(r.notified, 2); assert.equal(T.meets[0].listing_id, "L1"); assert.equal(T.meets[1].listing_id, undefined);
  assert.deepEqual(emails.map((e) => e.personalizations[0].to[0].email).sort(), ["club@x.com", "mom@x.com"]);
  assert.match(emails[0].content.map((c) => c.value).join(" "), /tickets\/L1/);
  assert.equal((await notifyListing("L1")).notified, 0, "never twice");
});

test("admin sets up listings (team only); sales summary", async () => {
  let r = await call(ROUTES["admin/listings"], { token: "tp1", method: "GET" }); assert.equal(r.status, 403);
  r = await call(ROUTES["admin/listings"], { token: "tb", body: { name: "Winter Cup", start_date: "2026-12-12", status: "on_sale", ticket_types: [] } }); assert.equal(r.status, 400);
  r = await call(ROUTES["admin/listings"], { token: "tb", body: { name: "Winter Cup", start_date: "2026-12-12", status: "on_sale", ticket_types: [{ name: "Adult", price: 12 }], club_codes: ["demo-1"] } });
  assert.equal(r.status, 200); const w = T.meet_listings.find((l) => l.name === "Winter Cup"); assert.equal(w.ticket_types[0].id, "t1"); assert.deepEqual(w.club_codes, ["DEMO-1"]);
  r = await call(ROUTES["admin/listings"], { token: "tb", method: "GET" }); assert.ok(r.json.listings[0].door_url.includes("/door/"));
});

test("meet day: arrive time; Pro gets AI tips, Basic gets curated; one message per meet", async () => {
  assert.equal(arriveBy("Sat 8:00 AM"), "7:15 AM"); assert.equal(parseTime("9am"), 540); assert.equal(arriveBy("Session 2"), null);
  const r = await runMeetDay();
  assert.equal(r.sent, 2); assert.equal(ai, 1, "AI only for the Pro family");
  const mom = emails.find((e) => e.personalizations[0].to[0].email === "mom@x.com").content.map((c) => c.value).join(" ");
  assert.match(mom, /arrive by 7:15 AM/); assert.match(mom, /go have fun/); assert.match(mom, /Grips/);
  const dad = emails.find((e) => e.personalizations[0].to[0].email === "dad@x.com").content.map((c) => c.value).join(" ");
  assert.match(dad, /8:15 AM/); assert.match(dad, /Fuel:/);
  assert.equal((await runMeetDay()).sent, 0);
  const tips = await call(ROUTES["ai/meetday"], { token: "tp1", body: { meetId: "m1" } }); assert.equal(tips.json.ai, true); assert.equal(ai, 1, "cached");
});

test("trial ending: one reminder 2 days before", async () => {
  emails = [];
  assert.equal((await runTrialNotices()).sent, 1); assert.match(emails[0].subject, /2 days left/); assert.match(emails[0].content.map((c) => c.value).join(" "), /page=plans/);
  assert.equal((await runTrialNotices()).sent, 0);
});
