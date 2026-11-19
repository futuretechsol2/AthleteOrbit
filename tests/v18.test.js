// v18: QR codes in ticket emails, volunteer scorer link, gym search, meet sign-ups & entry fees.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { fulfillTickets, scorerKey } from "../server/routes/tickets/index.js";

let T, mails;
beforeEach(() => {
  mails = [];
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "hi@athleteorbit.org", APP_URL: "https://athleteorbit.org", LINK_SECRET: "s" }); delete process.env.SMTP_HOST;
  deps.fetch = async (url, o) => { if (String(url).includes("sendgrid")) { mails.push(JSON.parse(o.body)); return { ok: true, status: 202, text: async () => "" }; } throw new Error("unexpected " + url); };
  T = {
    profiles: [{ id: "gymowner", email: "gym@x.com", account_type: "gym", full_name: "Coach Jen" }, { id: "mom", email: "mom@x.com", full_name: "Mom", club_id: "c1" }, { id: "dad", email: "dad@x.com", full_name: "Dad", club_id: "c1" }],
    clubs: [{ id: "c1", name: "Carolina Flips Gymnastics", code: "CAROLI-ABC123", owner_id: "gymowner" }, { id: "c2", name: "Queen City Flyers", code: "QUEENC-XYZ789", owner_id: "other" }],
    gymnasts: [{ id: "g1", user_id: "mom", name: "Maya", last_name: "Patel", level: "Level 4", program: "WAG", sport: "Gymnastics" }, { id: "g2", user_id: "dad", name: "Zara", last_name: "Moore", level: "Level 4", program: "WAG", sport: "Gymnastics" }, { id: "g3", user_id: "dad", name: "Noah", level: "Level 8", program: "WAG", sport: "Gymnastics" }],
    club_meets: [{ id: "cm1", club_id: "c1", name: "Holiday Flip Invitational", start_date: "2026-12-05", levels: ["Level 4"], status: "published", sport: "Gymnastics" }],
    meets: [{ id: "m1", user_id: "mom", gymnast_id: "g1", club_meet_id: "cm1", name: "Holiday Flip Invitational", start_date: "2026-12-05" }],
    meet_rsvps: [], meet_listings: [{ id: "L1", owner_id: "gymowner", name: "AO Test Invitational", start_date: "2026-12-05", sport: "Gymnastics", status: "on_sale", ticket_types: [{ id: "a", name: "Adult", price: 15 }], buyer_fee_cents: 150, door_key: "dk" }],
    ticket_orders: [], tickets: [], live_scores: [], live_follows: [],
  };
  deps.supabase = () => fakeSupabase(T, { gymowner: { id: "gymowner", email: "gym@x.com" }, mom: { id: "mom", email: "mom@x.com" }, dad: { id: "dad", email: "dad@x.com" } });
  deps.now = () => new Date("2026-11-19T15:00:00Z");
});

test("ticket email shows one scannable QR image per ticket", async () => {
  await fulfillTickets({ id: "cs_1", metadata: { listing_id: "L1", items: JSON.stringify([["a", 2]]) }, customer_details: { email: "grandma@x.com", name: "Grandma" } });
  const m = mails.find((x) => x.subject.startsWith("Your tickets"));
  assert.ok(m, "ticket email sent"); assert.equal(m.attachments.length, 2);
  assert.equal(m.attachments[0].disposition, "inline"); assert.equal(m.attachments[0].type, "image/png");
  assert.ok(Buffer.from(m.attachments[0].content, "base64").subarray(1, 4).toString() === "PNG");
  assert.match(m.content[1].value, /cid:qr0/); assert.match(m.content[1].value, /cid:qr1/);
  for (const t of T.tickets) assert.match(m.content[1].value, new RegExp(t.code));
});

test("scorer link: a volunteer posts scores without an account; a wrong key can't", async () => {
  const ok = await call(ROUTES["live/post"], { body: { id: "L1", k: scorerKey("L1"), rows: [{ name: "Maya Patel", gym: "Carolina Flips", level: "4", scores: { Vault: 9.3 } }] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(T.live_scores.length, 1);
  const bad = await call(ROUTES["live/post"], { body: { id: "L1", k: "nope", rows: [{ name: "X Y", scores: { Vault: 9 } }] } });
  assert.equal(bad.status, 403);
  const noKey = await call(ROUTES["live/post"], { body: { id: "L1", rows: [{ name: "X Y", scores: { Vault: 9 } }] } });
  assert.equal(noKey.status, 401);
});

test("gym search finds gyms by name or by code", async () => {
  let r = await call(ROUTES["gyms/search"], { method: "GET", token: "gymowner", url: "/api/gyms/search?q=queen" });
  assert.deepEqual(r.json.gyms, [{ name: "Queen City Flyers", code: "QUEENC-XYZ789" }]);
  r = await call(ROUTES["gyms/search"], { method: "GET", token: "gymowner", url: "/api/gyms/search?q=caroli-abc123" });
  assert.equal(r.json.gyms[0].name, "Carolina Flips Gymnastics");
});

test("meet sign-ups: families answer, the gym sees who's going and who paid, and nudges the rest", async () => {
  // gym sets the entry fee
  await call(ROUTES["club/signups"], { token: "gymowner", body: { meet: "cm1", fee_cents: 9500, fee_due: "2026-11-28" } });
  let s = await call(ROUTES["club/signups"], { method: "GET", token: "gymowner", url: "/api/club/signups?meet=cm1" });
  assert.deepEqual(s.json.athletes.map((a) => a.name), ["Maya Patel", "Zara Moore"], "Level 4 athletes only; Noah (Level 8) isn't expected");
  assert.deepEqual(s.json.counts, { expected: 2, going: 0, notGoing: 0, noAnswer: 2, paid: 0 });
  // Maya's family answers from the meet
  const fam = await call(ROUTES["meet/rsvp"], { token: "mom", body: { meet: "m1", status: "going" } });
  assert.equal(fam.json.rsvp.status, "going"); assert.equal(fam.json.rsvp.fee_cents, 9500); assert.equal(fam.json.rsvp.gym, "Carolina Flips Gymnastics");
  // gym marks Maya paid
  await call(ROUTES["club/signups"], { token: "gymowner", body: { meet: "cm1", gymnast_id: "g1", paid: true } });
  s = await call(ROUTES["club/signups"], { method: "GET", token: "gymowner", url: "/api/club/signups?meet=cm1" });
  assert.deepEqual(s.json.counts, { expected: 2, going: 1, notGoing: 0, noAnswer: 1, paid: 1 });
  assert.equal((await call(ROUTES["meet/rsvp"], { method: "GET", token: "mom", url: "/api/meet/rsvp?meet=m1" })).json.rsvp.paid, true);
  // nudge goes only to the family that hasn't answered
  const n = await call(ROUTES["club/signups"], { token: "gymowner", body: { meet: "cm1", nudge: true } });
  assert.equal(n.json.nudged, 1); assert.equal(mails.at(-1).personalizations[0].to[0].email, "dad@x.com"); assert.match(mails.at(-1).subject, /is Zara competing/);
  // another gym / a parent can't see this gym's sign-ups
  assert.equal((await call(ROUTES["club/signups"], { method: "GET", token: "mom", url: "/api/club/signups?meet=cm1" })).status, 403);
  // a family can't answer for a meet that isn't theirs
  assert.equal((await call(ROUTES["meet/rsvp"], { token: "dad", body: { meet: "m1", status: "going" } })).json.rsvp, null);
});

test("parents can't create events; gym accounts can", async () => {
  const p = await call(ROUTES["tickets/organizer"], { token: "mom", body: { name: "X Meet", start_date: "2027-01-01" } });
  assert.equal(p.status, 403);
  const g = await call(ROUTES["tickets/organizer"], { token: "gymowner", body: { name: "Winter Classic", start_date: "2027-01-10", attending_gyms: ["Queen City Flyers", "Tidal Gym"], club_codes: ["QUEENC-XYZ789", "not a code!"] } });
  assert.equal(g.status, 200, JSON.stringify(g.json));
  const L = T.meet_listings.find((l) => l.name === "Winter Classic");
  assert.deepEqual(L.attending_gyms, ["Queen City Flyers", "Tidal Gym"]); assert.deepEqual(L.club_codes, ["QUEENC-XYZ789"]);
  const list = await call(ROUTES["tickets/organizer"], { method: "GET", token: "gymowner" });
  const e = list.json.listings.find((l) => l.name === "Winter Classic");
  assert.match(e.score_url, /\/score\/.+\?k=/); assert.match(e.share_url, /\/live\//, "not on sale yet → share the free live-scores page");
});

test("scorer link opens the scorer table even before live scores are switched on", async () => {
  T.meet_listings[0].live_enabled = false;
  const no = await call(ROUTES["live/meet"], { method: "GET", url: "/api/live/meet?id=L1" });
  assert.equal(no.status, 404);
  const yes = await call(ROUTES["live/meet"], { method: "GET", url: `/api/live/meet?id=L1&k=${scorerKey("L1")}` });
  assert.equal(yes.status, 200); assert.equal(T.meet_listings[0].live_enabled, true);
});

test("online gym search: gym accounts only, uses web search, keeps only clean results", async () => {
  process.env.ANTHROPIC_API_KEY = "k"; process.env.AI_PROVIDER = "anthropic";
  deps.fetch = async (url) => { if (String(url).includes("anthropic")) return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"gyms":[{"name":"Gymnastics Academy of Charlotte","city":"Charlotte","state":"NC","website":"https://example.com"},{"name":"","city":"x"},{"name":"Bad Link Gym","website":"javascript:alert(1)"}]}' }] }) }; throw new Error("unexpected " + url); };
  const parent = await call(ROUTES["gyms/search"], { method: "GET", token: "mom", url: "/api/gyms/search?q=academy&web=1" });
  assert.equal(parent.status, 403);
  const r = await call(ROUTES["gyms/search"], { method: "GET", token: "gymowner", url: "/api/gyms/search?q=academy&web=1&near=Charlotte" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.online, [{ name: "Gymnastics Academy of Charlotte", city: "Charlotte, NC", website: "https://example.com" }, { name: "Bad Link Gym", city: null, website: null }]);
  delete process.env.ANTHROPIC_API_KEY;
});
