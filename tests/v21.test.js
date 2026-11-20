// v21: four roles with strict boundaries; gym operations (classes/waitlists, staff schedule, tuition billing with
// online payment to the gym, reports, targeted email); coach skills + practice plans; meet organizer suite.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import webhook from "../server/routes/billing/webhook.js";
import { buildRotation } from "../server/routes/org.js";

let T, mails, checkout;
beforeEach(() => {
  mails = []; checkout = [];
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "hi@athleteorbit.org", APP_URL: "https://athleteorbit.org", STRIPE_WEBHOOK_SECRET: "whsec" }); delete process.env.SMTP_HOST;
  deps.fetch = async (url, o) => { if (String(url).includes("sendgrid")) { mails.push(JSON.parse(o.body)); return { ok: true, status: 202, text: async () => "" }; } throw new Error("unexpected " + url); };
  deps.stripe = () => ({ checkout: { sessions: { create: async (x) => { checkout.push(x); return { id: `cs_${checkout.length}`, url: `https://stripe/cs_${checkout.length}` }; } } },
    accounts: { create: async () => ({ id: "acct_gym" }), retrieve: async () => ({ charges_enabled: false }) }, accountLinks: { create: async () => ({ url: "https://stripe/onboard" }) },
    webhooks: { constructEvent: () => deps._evt } });
  T = {
    profiles: [{ id: "owner", email: "owner@gym.com", account_type: "gym" }, { id: "coach", email: "coach@x.com", account_type: "coach" }, { id: "org", email: "org@meet.com", account_type: "organizer" }, { id: "mom", email: "mom@x.com", account_type: "parent", club_id: "c1" }],
    clubs: [{ id: "c1", name: "Carolina Flips", code: "CF-1", owner_id: "owner", plan: "trial" }, { id: "c2", name: "Coach Kim's Team", code: "CK-1", owner_id: "coach", plan: "trial" }],
    club_roster: [{ id: "maya", club_id: "c1", name: "Maya Patel", level: "Level 4", gender: "F", parent_email: "old@x.com" }, { id: "zara", club_id: "c1", name: "Zara Moore", level: "Level 4", gender: "F", parent_email: "zara.mom@x.com" }, { id: "ella", club_id: "c1", name: "Ella Brooks", level: "Level 5", gender: "F" }, { id: "k1", club_id: "c2", name: "Kid One", level: "Level 3", gender: "F" }],
    gymnasts: [{ id: "g1", user_id: "mom", name: "Maya", roster_id: "maya" }],
    gym_classes: [], class_enrollments: [], gym_staff: [], staff_shifts: [], gym_invoices: [], coach_attendance: [], coach_skills: [], practice_plans: [], coach_results: [], coach_feedback: [],
    meet_listings: [{ id: "L1", owner_id: "org", name: "Queen City Classic", location: "Charlotte", updates: [] }], meet_entries: [], meet_sessions: [], meet_officials: [], ticket_orders: [{ listing_id: "L1", buyer_email: "fan@x.com", status: "paid" }],
  };
  deps.supabase = () => fakeSupabase(T, Object.fromEntries(T.profiles.map((p) => [p.id, { id: p.id, email: p.email }])));
  deps.now = () => new Date("2026-11-20T15:00:00Z");
});
const as = (who, route, body, method) => call(ROUTES[route], method === "GET" ? { method: "GET", token: who, url: `/api/${route}${body ? "?" + new URLSearchParams(body) : ""}` } : { token: who, body });

test("role boundaries: parents, coaches and organizers can't open the gym owner's business tools", async () => {
  for (const r of ["gym/classes", "gym/staff", "gym/invoices", "gym/reports"]) {
    assert.equal((await as("mom", r, null, "GET")).status, 403, `parent → ${r}`);
    assert.equal((await as("coach", r, null, "GET")).status, 403, `coach → ${r}`);
    assert.equal((await as("org", r, null, "GET")).status, 403, `organizer → ${r}`);
    assert.equal((await as("owner", r, null, "GET")).status, 200, `owner → ${r}`);
  }
  assert.equal((await as("coach", "coach/athletes", null, "GET")).status, 200, "coach runs their own team");
  assert.equal((await as("coach", "coach/athletes", null, "GET")).json.athletes.length, 1, "…and sees only their own athletes");
  assert.equal((await as("org", "coach/athletes", null, "GET")).status, 403, "organizer has no team");
  assert.equal((await as("mom", "org/entries", { id: "L1" }, "GET")).status, 403);
  assert.equal((await as("owner", "org/entries", { id: "L1" }, "GET")).status, 404, "another organizer's meet");
  assert.equal((await as("mom", "tickets/organizer", { name: "X", start_date: "2027-01-01" })).status, 403, "parents can't sell tickets");
  assert.equal((await as("org", "tickets/organizer", { name: "Winter Cup", start_date: "2027-01-09" })).status, 200, "organizers can");
});

test("classes: capacity fills, the rest waitlist, a drop promotes the first in line and emails the family", async () => {
  await as("owner", "gym/classes", { name: "L4 Team", level: "Level 4", days: ["Mon", "Wed", "Funday"], start_time: "16:00", end_time: "18:00", capacity: 1, monthly_fee_cents: 18500 });
  const c = T.gym_classes[0]; assert.deepEqual(c.days, ["Mon", "Wed"]);
  assert.equal((await as("owner", "gym/classes", { class_id: c.id, enroll: "maya" })).json.status, "enrolled");
  T.class_enrollments[0].created_at = "2026-11-01T00:00:00Z";
  assert.equal((await as("owner", "gym/classes", { class_id: c.id, enroll: "zara" })).json.status, "waitlist");
  const d = await as("owner", "gym/classes", { class_id: c.id, drop: "maya" });
  assert.deepEqual(d.json.promoted, ["zara"]);
  assert.match(mails.at(-1).subject, /a spot opened in L4 Team/); assert.equal(mails.at(-1).personalizations[0].to[0].email, "zara.mom@x.com");
  const list = await as("owner", "gym/classes", null, "GET");
  assert.deepEqual(list.json.classes[0].enrolled.map((a) => a.name), ["Zara Moore"]);
  assert.equal((await as("owner", "gym/classes", { class_id: c.id, enroll: "k1" })).status, 404, "another gym's athlete");
});

test("staff schedule: weekly hours and pay; double-booking is refused", async () => {
  await as("owner", "gym/staff", { name: "Jen Brooks", role: "Head coach", pay_rate_cents: 2500 });
  const s = T.gym_staff[0];
  await as("owner", "gym/staff", { shift: { staff_id: s.id, day: "2026-11-23", start_time: "16:00", end_time: "20:00" } });
  const clash = await as("owner", "gym/staff", { shift: { staff_id: s.id, day: "2026-11-23", start_time: "19:00", end_time: "21:00" } });
  assert.equal(clash.status, 409);
  await as("owner", "gym/staff", { shift: { staff_id: s.id, day: "2026-11-25", start_time: "16:30", end_time: "18:00" } });
  const w = await as("owner", "gym/staff", { week: "2026-11-25" }, "GET");
  assert.equal(w.json.week, "2026-11-23"); assert.equal(w.json.staff[0].hours, 5.5); assert.equal(w.json.staff[0].pay_cents, 13750);
});

test("tuition: bill a level, family sees the balance and pays online straight to the gym (1% on the free plan), webhook marks it paid", async () => {
  const r = await as("owner", "gym/invoices", { level: "Level 4", description: "December tuition", amount_cents: 18500, due_date: "2026-12-01" });
  assert.equal(r.json.created, 2); assert.equal(r.json.emailed, 2);
  const maya = T.gym_invoices.find((i) => i.athlete_name === "Maya Patel");
  assert.equal(maya.family_email, "mom@x.com", "the linked family's account email wins over the roster email");
  let fam = await as("mom", "family/billing", null, "GET");
  assert.equal(fam.json.balance, 18500); assert.equal(fam.json.invoices[0].payable, false, "gym hasn't connected payments yet");
  assert.equal((await as("mom", "family/pay", { id: maya.id })).status, 409);
  const conn = await as("owner", "gym/connect", {}); assert.equal(conn.json.url, "https://stripe/onboard"); assert.equal(T.clubs[0].stripe_account, "acct_gym");
  const pay = await as("mom", "family/pay", { id: maya.id });
  assert.equal(pay.status, 200, JSON.stringify(pay.json));
  assert.equal(checkout[0].payment_intent_data.transfer_data.destination, "acct_gym"); assert.equal(checkout[0].payment_intent_data.application_fee_amount, 185);
  assert.equal((await as("mom", "family/pay", { id: T.gym_invoices.find((i) => i.athlete_name === "Zara Moore").id })).status, 404, "not her invoice");
  deps._evt = { type: "checkout.session.completed", data: { object: { metadata: { kind: "gym_invoice", invoice_id: maya.id }, payment_status: "paid", amount_total: 18500, customer_email: "mom@x.com" } } };
  await call(webhook, { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  assert.equal(maya.status, "paid"); assert.equal(maya.paid_via, "card"); assert.equal(maya.platform_fee_cents, 185);
  T.clubs[0].plan = "yearly"; T.clubs[0].active_until = "2027-11-01T00:00:00Z";
  await as("owner", "gym/invoices", { roster_id: "ella", description: "Leo", amount_cents: 6000, send: false });
  const leo = T.gym_invoices.at(-1); leo.family_email = "mom@x.com";
  await as("mom", "family/pay", { id: leo.id });
  assert.equal(checkout.at(-1).payment_intent_data.application_fee_amount, undefined, "no platform fee on a paid gym plan");
  const rep = await as("owner", "gym/reports", null, "GET");
  assert.equal(rep.json.finance.months.at(-1).collected, 18500); assert.equal(rep.json.finance.outstanding, 18500 + 6000);
  await as("owner", "gym/invoices", { mark: leo.id, status: "paid", via: "cash" });
  assert.equal(leo.paid_via, "cash");
});

test("targeted email reaches only the chosen level's families", async () => {
  const p = await as("owner", "gym/email", { level: "Level 4", subject: "Leo day", body: "Wear the red leo.", preview: true });
  assert.equal(p.json.recipients, 2);
  await as("owner", "gym/email", { level: "Level 5", subject: "Leo day", body: "x" });
  assert.equal(mails.length, 0, "Ella has no family email");
});

test("coach skills and practice plans", async () => {
  const g = await as("coach", "coach/skills", { roster: "k1" }, "GET");
  assert.ok(g.json.athletes[0].skills.length > 3, "Level 3 skills listed from the sport catalog");
  const sk = g.json.athletes[0].skills[0].skill;
  await as("coach", "coach/skills", { roster_id: "k1", skill: sk, status: "competition" });
  assert.equal((await as("coach", "coach/skills", { roster: "k1" }, "GET")).json.athletes[0].skills[0].status, "competition");
  assert.equal((await as("coach", "coach/skills", { roster_id: "maya", skill: sk, status: "learning" })).status, 404, "not their athlete");
  const p = await as("coach", "coach/practice", { title: "Tuesday L3", is_template: true, blocks: [{ minutes: 15, station: "Warm-up", drills: "Jog, stretch" }, { minutes: 0, station: "Bars", drills: "Casts" }, {}] });
  assert.equal(T.practice_plans[0].blocks.length, 2); assert.equal(T.practice_plans[0].blocks[1].minutes, 10, "blank minutes default to 10");
  assert.ok(p.json.id);
});

test("meet organizer: registration with a free-plan cap, verification, sessions with rotations, officials, one update to everyone, Meet Pro", async () => {
  const rows = Array.from({ length: 48 }, (_, i) => ({ gym_name: ["Carolina Flips", "Queen City Flyers", "Tidal Gym"][i % 3], athlete_name: `Athlete ${i}`, level: i % 2 ? "Level 4" : "Level 3", member_number: i === 5 ? "" : `${1000 + i}` }));
  assert.equal((await as("org", "org/entries", { id: "L1", rows })).json.added, 48);
  const over = await as("org", "org/entries", { id: "L1", rows: [{ gym_name: "X", athlete_name: "A" }, { gym_name: "X", athlete_name: "B" }, { gym_name: "X", athlete_name: "C" }] });
  assert.equal(over.status, 402); assert.equal(over.json.code, "meet_pro");
  await as("org", "org/entries", { id: "L1", rows: [{ gym_name: "Carolina Flips", athlete_name: "Athlete 0", level: "Level 3" }] });
  let e = await as("org", "org/entries", { id: "L1" }, "GET");
  assert.equal(e.json.entries.filter((x) => x.duplicate).length, 2, "duplicate entry flagged");
  assert.deepEqual(e.json.entries.find((x) => x.athlete_name === "Athlete 5").missing, ["member #"]);
  assert.equal((await as("org", "org/entries", { id: "L1", verifyAll: true })).json.verified, 49);
  await as("org", "org/sessions", { id: "L1", name: "Session 1", day: "2027-01-09", start_time: "8:00 AM", levels: ["Level 3"] });
  const s = (await as("org", "org/sessions", { id: "L1" }, "GET")).json;
  assert.deepEqual(s.unassigned, ["Level 4"]); assert.equal(s.sessions[0].athletes, 25);
  const rot = await as("org", "org/sessions", { id: "L1", rotate: s.sessions[0].id });
  assert.equal(rot.json.rotation.length, 4);
  for (const round of rot.json.rotation) assert.equal(new Set(round.stations.flatMap((x) => x.squad)).size, 3, "every gym somewhere every round");
  await as("org", "org/officials", { id: "L1", name: "Pat Judge", email: "pat@judges.org", role: "Judge", session_id: s.sessions[0].id, station: "Beam" });
  assert.equal((await as("org", "org/officials", { id: "L1", notify: true })).json.sent, 1);
  assert.match(JSON.stringify(mails.at(-1)), /Judge.*Beam.*Session 1/);
  const ann = await as("org", "org/announce", { id: "L1", text: "Session 1 starts 15 minutes late", officials: true, emails: "coach@gym.com, bad" });
  assert.equal(ann.json.sent, 3); assert.equal(T.meet_listings[0].updates[0].text, "Session 1 starts 15 minutes late");
  const pro = await as("org", "org/plan", {}); assert.match(pro.json.url, /stripe/); assert.equal(checkout.at(-1).metadata.kind, "meet_pro");
  deps._evt = { type: "checkout.session.completed", data: { object: { metadata: { kind: "meet_pro", user_id: "org" }, payment_status: "paid", amount_total: 19900 } } };
  await call(webhook, { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  assert.equal(T.profiles.find((p) => p.id === "org").organizer_plan, "pro");
  assert.equal((await as("org", "org/entries", { id: "L1", rows: [{ gym_name: "X", athlete_name: "A" }, { gym_name: "X", athlete_name: "B" }, { gym_name: "X", athlete_name: "C" }] })).json.added, 3, "Meet Pro: no cap");
});

test("rotation balances squads", () => {
  const r = buildRotation([{ name: "A", count: 8 }, { name: "B", count: 6 }, { name: "C", count: 5 }, { name: "D", count: 3 }, { name: "E", count: 2 }]);
  assert.deepEqual(r[0].stations.map((s) => s.athletes), [8, 6, 5, 5]);
  assert.deepEqual(r[1].stations.map((s) => s.event), ["Vault", "Bars", "Beam", "Floor"]);
});
