import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps, signToken } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import router, { ROUTES } from "../api/router.js";

Object.assign(process.env, { ANTHROPIC_API_KEY: "test", APP_URL: "https://app.test", CRON_SECRET: "cron", LINK_SECRET: "link",
  SENDGRID_API_KEY: "sg", EMAIL_FROM: "hello@gympath.test", SUPPORT_INBOX_EMAIL: "team@gympath.test", ADMIN_EMAILS: "boss@gympath.test",
  BOOKING_AID: "12345", STRIPE_PRICE_CLUB: "price_club", BUSINESS_ADDRESS: "1 Main St, Concord NC", APP_TIMEZONE: "America/New_York" });
delete process.env.SMS_ENABLED;

let T, emails, sms, claude;
const NOW = new Date("2026-11-08T14:00:00Z"); // Nov 8 2026, 9am New York
beforeEach(() => {
  T = {
    profiles: [
      { id: "u1", email: "mom@x.com", subscription_status: "trialing", subscription_tier: "pro", email_reminders: true, sms_reminders: true, phone: "+17045550100", home_airport: "CLT" },
      { id: "u2", email: "dad@x.com", subscription_status: "none", email_reminders: false },
      { id: "boss", email: "boss@gympath.test", subscription_status: "none" },
    ],
    gymnasts: [{ id: "g1", user_id: "u1", name: "Maya", program: "WAG", level: "Level 5" }, { id: "g2", user_id: "u2", name: "Leo", program: "MAG", level: "Level 6" }],
    meets: [
      { id: "m7", user_id: "u1", gymnast_id: "g1", name: "Turkey Invitational", location: "Raleigh, NC", start_date: "2026-11-15", status: "Registered", session_time: "Sat 8:00 AM", checklist: [] },
      { id: "m1", user_id: "u1", gymnast_id: "g1", name: "Local Open", location: "Concord, NC", start_date: "2026-11-09", status: "Paid", checklist: [{ text: "Grips", done: false }, { text: "Leo", done: true }] },
      { id: "dl", user_id: "u1", gymnast_id: "g1", name: "State Meet", location: "Greensboro, NC", start_date: "2027-03-01", entry_deadline: "2026-11-15", status: "Planned", checklist: [] },
      { id: "skip", user_id: "u1", gymnast_id: "g1", name: "Skipped Meet", start_date: "2026-11-15", status: "Skipped", checklist: [] },
      { id: "off", user_id: "u2", gymnast_id: "g2", name: "Opted out", start_date: "2026-11-15", status: "Registered", checklist: [] },
    ],
    reminders_sent: [], clubs: [], support_messages: [], ai_usage: [], ai_notes: [], scores: [], skill_status: [],
  };
  deps._sb = fakeSupabase(T, { tok1: { id: "u1", email: "mom@x.com" }, tok2: { id: "u2", email: "dad@x.com" }, tokB: { id: "boss", email: "boss@gympath.test" } });
  deps.supabase = () => deps._sb;
  deps.now = () => NOW;
  emails = []; sms = []; claude = [];
  deps.fetch = async (url, init) => {
    if (url.includes("sendgrid")) { emails.push(JSON.parse(init.body)); return { ok: true, text: async () => "" }; }
    if (url.includes("twilio")) { sms.push(init.body); return { ok: true }; }
    claude.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ content: [{ type: "text", text: "Drafted text" }] }) };
  };
});
const html = (e) => e.content[1].value;

test("router sends paths to the right handler and 404s unknown", async () => {
  assert.ok(Object.keys(ROUTES).length >= 17);
  const r = await call(router, { url: "/api/router?path=nope" });
  assert.equal(r.status, 404);
  const ok = await call(router, { url: "/api/router?path=me", method: "GET", token: "tok1" });
  assert.equal(ok.json.pro, true);
});

test("cron needs the secret", async () => {
  const r = await call(ROUTES["cron/reminders"], { method: "GET" });
  assert.equal(r.status, 401);
});

test("daily reminders: 7-day, 1-day, deadline; skips opted-out and skipped meets; never twice", async () => {
  const r = await call(ROUTES["cron/reminders"], { method: "GET", headers: { authorization: "Bearer cron" } });
  assert.equal(r.status, 200); assert.equal(r.json.today, "2026-11-08");
  assert.equal(r.json.sent, 3);
  const subjects = emails.map((e) => e.subject).sort();
  assert.deepEqual(subjects, ["Entry deadline in 7 days: State Meet", "Maya's meet is in 7 days: Turkey Invitational", "Maya's meet is tomorrow: Local Open"]);
  const seven = emails.find((e) => e.subject.includes("Turkey"));
  assert.match(html(seven), /booking\.com\/searchresults\.html\?ss=Raleigh%2C%20NC&amp;checkin=2026-11-14&amp;checkout=2026-11-16/);
  assert.match(html(seven), /aid=12345/); assert.match(html(seven), /Flights from CLT/);
  assert.match(html(seven), /1 Main St, Concord NC/);
  assert.ok(seven.headers["List-Unsubscribe"].includes(`t=${signToken("u1")}`));
  const tomorrow = emails.find((e) => e.subject.includes("tomorrow"));
  assert.match(html(tomorrow), /Still to pack/); assert.match(html(tomorrow), /Grips/); assert.doesNotMatch(html(tomorrow), /<li>Leo/);
  assert.equal(sms.length, 0, "texts stay off until SMS_ENABLED");
  emails = [];
  const again = await call(ROUTES["cron/reminders"], { method: "GET", headers: { authorization: "Bearer cron" } });
  assert.equal(again.json.sent, 0); assert.equal(emails.length, 0);
});

test("texts go out once SMS is switched on", async () => {
  Object.assign(process.env, { SMS_ENABLED: "true", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+19805550000" });
  await call(ROUTES["cron/reminders"], { method: "GET", headers: { authorization: "Bearer cron" } });
  assert.equal(sms.length, 3); assert.match(new URLSearchParams(sms[0]).get("Body"), /Reply STOP/);
  delete process.env.SMS_ENABLED;
});

test("unsubscribe link turns off reminder emails; forged link fails", async () => {
  const bad = await call(ROUTES.unsubscribe, { method: "GET", url: "/api/router?path=unsubscribe&u=u1&t=forged" });
  assert.equal(bad.status, 400);
  await call(ROUTES.unsubscribe, { method: "GET", url: `/api/router?path=unsubscribe&u=u1&t=${signToken("u1")}` });
  assert.equal(T.profiles[0].email_reminders, false);
});

test("AI trip plan uses meet, dates and home; saved to notes", async () => {
  const r = await call(ROUTES["ai/trip"], { token: "tok1", body: { meetId: "m7" } });
  assert.equal(r.status, 200);
  const prompt = claude[0].messages[0].content;
  assert.match(prompt, /Raleigh, NC/); assert.match(prompt, /2026-11-14 to 2026-11-16/); assert.match(prompt, /CLT/);
  assert.match(claude[0].system, /trampoline/);
  assert.equal(T.ai_notes[0].kind, "trip");
  const other = await call(ROUTES["ai/trip"], { token: "tok1", body: { meetId: "off" } });
  assert.equal(other.status, 404);
  const free = await call(ROUTES["ai/trip"], { token: "tok2", body: { meetId: "off" } });
  assert.equal(free.status, 402);
});

test("gym plan: purchase webhook creates code + emails owner; families join; seats and expiry enforced", async () => {
  let evt;
  deps._stripe = { webhooks: { constructEvent: () => evt } }; deps.stripe = () => deps._stripe;
  process.env.STRIPE_WEBHOOK_SECRET = "w"; process.env.CLUB_SEATS = "1";
  evt = { type: "customer.subscription.created", data: { object: { id: "sub_c", status: "active", customer: "cus_c", current_period_end: Math.floor(NOW / 1000) + 365 * 86400,
    metadata: { kind: "club", club_name: "Axcelerate Gymnastics", supabase_user_id: "u1" }, items: { data: [] } } } };
  const w = await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  assert.equal(w.status, 200);
  assert.equal(T.clubs.length, 1); const code = T.clubs[0].code; assert.match(code, /^AXCELE-[0-9A-F]{6}$/);
  assert.equal(T.profiles[0].subscription_status, "trialing", "club purchase doesn't change parent's own plan");
  assert.match(emails[0].subject, new RegExp(code));
  const j = await call(ROUTES["club/join"], { token: "tok2", body: { code: code.toLowerCase() } });
  assert.equal(j.status, 200); assert.equal(T.profiles[1].club_id, T.clubs[0].id);
  const me = await call(ROUTES.me, { method: "GET", token: "tok2" });
  assert.equal(me.json.pro, true); assert.equal(me.json.club.name, "Axcelerate Gymnastics");
  const full = await call(ROUTES["club/join"], { token: "tok1", body: { code } });
  assert.equal(full.status, 409);
  evt = { ...evt, type: "customer.subscription.deleted" };
  await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  deps.now = () => new Date(NOW.getTime() + 1000);
  const after = await call(ROUTES.me, { method: "GET", token: "tok2" });
  assert.equal(after.json.pro, false);
  delete process.env.CLUB_SEATS;
});

test("club checkout uses the club price and tags the subscription", async () => {
  let made;
  deps._stripe = { customers: { create: async () => ({ id: "cus_n" }) }, checkout: { sessions: { create: async (p) => { made = p; return { url: "https://stripe.test/c" }; } } } };
  deps.stripe = () => deps._stripe;
  const r = await call(ROUTES["club/checkout"], { token: "tok2", body: { clubName: "Cabarrus Gym" } });
  assert.equal(r.json.url, "https://stripe.test/c");
  assert.equal(made.line_items[0].price, "price_club"); assert.equal(made.subscription_data.metadata.kind, "club");
});

test("contact us: saves, emails team with AI draft, auto-replies, blocks spam bots", async () => {
  const bot = await call(ROUTES["support/send"], { body: { email: "a@b.com", message: "buy now", website: "spam.com" } });
  assert.equal(bot.status, 200); assert.equal(T.support_messages.length, 0);
  const bad = await call(ROUTES["support/send"], { body: { email: "nope", message: "Hello there" } });
  assert.equal(bad.status, 400);
  const r = await call(ROUTES["support/send"], { body: { name: "Priya", email: "priya@x.com", phone: "704-555-0101", topic: "Billing", message: "How do I switch to yearly?" } });
  assert.equal(r.status, 200);
  assert.equal(T.support_messages[0].ai_draft, "Drafted text");
  const toTeam = emails.find((e) => e.personalizations[0].to[0].email === "team@gympath.test");
  assert.equal(toTeam.reply_to.email, "priya@x.com"); assert.match(html(toTeam), /Suggested reply/); assert.match(html(toTeam), /704-555-0101/);
  assert.ok(emails.find((e) => e.personalizations[0].to[0].email === "priya@x.com"));
});

test("team inbox: admins only; reply emails the parent and marks answered", async () => {
  T.support_messages.push({ id: "s1", email: "priya@x.com", topic: "Billing", message: "Help", status: "open", created_at: NOW.toISOString() });
  const no = await call(ROUTES["admin/support"], { method: "GET", token: "tok1" });
  assert.equal(no.status, 403);
  const list = await call(ROUTES["admin/support"], { method: "GET", token: "tokB" });
  assert.equal(list.json.messages.length, 1);
  await call(ROUTES["admin/support"], { token: "tokB", body: { id: "s1", reply: "Go to More > Manage billing." } });
  assert.equal(T.support_messages[0].status, "answered");
  assert.equal(emails.at(-1).personalizations[0].to[0].email, "priya@x.com");
});
