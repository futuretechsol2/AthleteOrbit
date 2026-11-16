import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { parseResults, rankRows, toCsv } from "../src/data/live.js";

let T, mails, made;
beforeEach(() => {
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "support@athleteorbit.org", APP_URL: "https://athleteorbit.org", LINK_SECRET: "s", BUSINESS_NAME: "FutureTech AI", BUSINESS_ADDRESS: "Concord, NC", STRIPE_WEBHOOK_SECRET: "wh", PRODIGI_API_KEY: "sandbox_x" });
  mails = []; made = null;
  T = {
    profiles: [
      { id: "org", email: "meet@host.com", full_name: "Meet Host", subscription_status: "active", subscription_tier: "basic" },
      { id: "p1", email: "dad@x.com", full_name: "Dan", club_id: "c1", subscription_status: "active", subscription_tier: "basic" },
      { id: "p2", email: "mom@x.com", full_name: "Mia", club_id: "c1", subscription_status: "active", subscription_tier: "pro" },
      { id: "p3", email: "far@x.com", full_name: "Far", subscription_status: "canceled", trial_ends_at: "2026-01-01T00:00:00Z" },
    ],
    clubs: [{ id: "c1", name: "Apex Gymnastics", code: "APEX-1", owner_id: "x", seats: 50, active_until: "2027-06-01T00:00:00Z" }],
    gymnasts: [{ id: "g1", user_id: "p1", name: "Maya", level: "Level 5", program: "WAG", gender: "F", sport: "Gymnastics" }, { id: "g2", user_id: "p2", name: "Ella", level: "Level 5", program: "WAG", gender: "F" }, { id: "g3", user_id: "p3", name: "Kai", level: "Level 6", program: "MAG", gender: "M" }],
    meet_listings: [{ id: "L1", owner_id: "org", name: "Queen City Classic", start_date: "2026-11-14", sport: "Gymnastics", status: "draft", ticket_types: [], sessions: ["Session 1"], updates: [], live_enabled: false, live_status: "off", branding: {}, sponsors: [] }],
    live_scores: [], live_follows: [], athlete_pages: [], scores: [], photos: [], print_orders: [],
  };
  const users = Object.fromEntries(T.profiles.map((p) => [p.id, { id: p.id, email: p.email }]));
  deps.supabase = () => fakeSupabase(T, users);
  deps.now = () => new Date("2026-11-14T16:00:00Z");
  deps.fetch = async (url, o) => { if (String(url).includes("sendgrid")) { mails.push(JSON.parse(o.body)); return { ok: true, status: 202, text: async () => "" }; } throw new Error("unexpected " + url); };
  deps.stripe = () => ({ checkout: { sessions: { create: async (p) => { made = p; return { id: "cs_1", url: "https://checkout.test/x" }; } } }, webhooks: { constructEvent: () => deps._event } });
});
const CSV = "Session,Gymnast,Team,Level,Age,VT,UB,BB,FX\n1,Maya Patel,Apex Gymnastics,5,Jr,9.1,8.85,9.2,9.0\n1,Sofia Kim,Queen City,5,Jr,8.9,9.0,9.2,9.0\n1,Liam Ortiz,Carolina Elite,6,Jr,,,,";

test("results file: common scoring-software columns, ranks with ties, CSV export", () => {
  const { rows, problems } = parseResults(CSV);
  assert.deepEqual(problems, []); assert.equal(rows.length, 3); assert.equal(rows[0].level, "Level 5"); assert.equal(rows[0].aa, 36.15);
  const g = rankRows(rows.slice(0, 2)); assert.deepEqual(g[0].rows.map((r) => r.rank), [1, 2]); assert.equal(g[0].rows[1].eventPlace.Beam, 1, "tie on beam shares 1st");
  assert.match(toCsv(rows.slice(0, 2)), /^Session,Level,Division,Gender,Name,Gym,Vault,Bars,Beam,Floor,AA,Place\n1,Level 5,Jr,F,Maya Patel/);
  assert.match(parseResults("foo,bar\n1,2").problems[0], /Name column/);
  const men = parseResults("Name,Gym,FX,PH,SR,VT,PB,HB\nLeo Diaz,Apex,12.1,11,11.5,12.8,11.9,11.2").rows[0];
  assert.equal(men.gender, "M"); assert.equal(Object.keys(men.scores).length, 6);
});

test("organizer posts scores; anyone can watch without an account; updates merge by athlete + session", async () => {
  assert.equal((await call(ROUTES["live/meet"], { method: "GET", url: "/api/live/meet?id=L1" })).status, 404, "not live yet");
  assert.equal((await call(ROUTES["live/post"], { token: "p1", body: { id: "L1", rows: parseResults(CSV).rows } })).status, 404, "not the organizer");
  const r = await call(ROUTES["live/post"], { token: "org", body: { id: "L1", rows: parseResults(CSV).rows } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.added, 3);
  assert.equal(T.meet_listings[0].live_enabled, true); assert.equal(T.meet_listings[0].live_status, "live");
  const pub = await call(ROUTES["live/meet"], { method: "GET", url: "/api/live/meet?id=L1" });
  assert.equal(pub.status, 200); assert.equal(pub.json.rows.length, 3); assert.equal(pub.json.signedIn, false); assert.equal(pub.json.meet.pro, false);
  assert.equal(pub.json.rows.find((x) => x.name === "Liam Ortiz").aa, null);
  // Next rotation: only Liam's vault arrives → merged, not duplicated.
  const r2 = await call(ROUTES["live/post"], { token: "org", body: { id: "L1", rows: [{ name: "liam ortiz", gym: "Carolina Elite", session: "1", gender: "F", scores: { Vault: 9.4, Bars: 25 } }] } });
  assert.equal(r2.json.added, 0); assert.equal(r2.json.updated, 1);
  const liam = T.live_scores.find((x) => x.name.toLowerCase() === "liam ortiz"); assert.deepEqual(liam.scores, { Vault: 9.4 }, "out-of-range 25 dropped");
  const list = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?q=queen" }); assert.equal(list.json.meets[0].now, true);
});

test("parents report their own athlete; team sees it when shared; official scores replace it", async () => {
  await call(ROUTES["live/manage"], { token: "org", body: { id: "L1", live_status: "live" } });
  const r = await call(ROUTES["live/report"], { token: "p1", body: { id: "L1", gymnastId: "g1", session: "1", scores: { Vault: 9.05, Beam: 9.3 }, share: true, saveToScores: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(T.scores[0].vault, 9.05); assert.equal(T.scores[0].meet_name, "Queen City Classic");
  await call(ROUTES["live/report"], { token: "p1", body: { id: "L1", gymnastId: "g1", scores: { Floor: 9.1 }, share: true, saveToScores: true } });
  assert.equal(T.live_scores.length, 1); assert.deepEqual(T.live_scores[0].scores, { Vault: 9.05, Beam: 9.3, Floor: 9.1 }); assert.equal(T.scores.length, 1); assert.equal(T.scores[0].floor, 9.1);
  assert.equal((await call(ROUTES["live/report"], { token: "p1", body: { id: "L1", gymnastId: "g2", scores: { Vault: 9 } } })).status, 400, "not your athlete");
  const mom = await call(ROUTES["live/meet"], { method: "GET", token: "p2", url: "/api/live/meet?id=L1" });
  assert.equal(mom.json.parentRows.length, 1, "teammate sees the shared score"); assert.equal(mom.json.parentRows[0].mine, false); assert.equal(mom.json.parentRows[0].gymnast_id, null);
  assert.equal((await call(ROUTES["live/meet"], { method: "GET", token: "p3", url: "/api/live/meet?id=L1" })).json.parentRows.length, 0, "other teams don't");
  assert.equal((await call(ROUTES["live/meet"], { method: "GET", url: "/api/live/meet?id=L1" })).json.parentRows.length, 0, "never on the public page");
  await call(ROUTES["live/post"], { token: "org", body: { id: "L1", rows: [{ name: "Maya", gym: "Apex Gymnastics", level: "Level 5", session: "1", scores: { Vault: 9.1, Bars: 8.9, Beam: 9.3, Floor: 9.2 } }] } });
  assert.equal((await call(ROUTES["live/meet"], { method: "GET", token: "p1", url: "/api/live/meet?id=L1" })).json.parentRows.length, 0, "official replaced it");
});

test("follow an athlete (Basic) → email when official scores post", async () => {
  await call(ROUTES["live/manage"], { token: "org", body: { id: "L1", live_status: "live" } });
  assert.equal((await call(ROUTES["live/follow"], { token: "p3", body: { id: "L1", name: "Sofia Kim", gym: "Queen City" } })).status, 402, "needs a plan");
  const f = await call(ROUTES["live/follow"], { token: "p1", body: { id: "L1", name: "Sofia Kim", gym: "Queen City" } });
  assert.equal(f.json.following, true);
  const r = await call(ROUTES["live/post"], { token: "org", body: { id: "L1", rows: parseResults(CSV).rows } });
  assert.equal(r.json.notified, 1); assert.match(mails[0].subject || mails[0].personalizations[0].subject, /New scores: Sofia at Queen City Classic/); assert.match(JSON.stringify(mails[0]), /AA 36\.100/);
  assert.equal((await call(ROUTES["live/post"], { token: "org", body: { id: "L1", rows: parseResults(CSV).rows } })).json.notified, 0, "no change, no email");
  assert.equal((await call(ROUTES["live/follow"], { token: "p1", body: { id: "L1", name: "Sofia Kim", gym: "Queen City" } })).json.following, false, "toggle off");
});

test("Live Scoring Pro: $149 checkout, free with ticket sales; branding & sponsors need Pro", async () => {
  const sp = await call(ROUTES["live/manage"], { token: "org", body: { id: "L1", sponsors: [{ name: "Carolina Smiles Dental", url: "https://example.org" }] } });
  assert.equal(sp.status, 402);
  const c = await call(ROUTES["live/pro-checkout"], { token: "org", body: { id: "L1" } });
  assert.equal(c.json.url, "https://checkout.test/x"); assert.equal(made.line_items[0].price_data.unit_amount, 14900); assert.equal(made.metadata.kind, "live_pro");
  deps._event = { type: "checkout.session.completed", data: { object: { payment_status: "paid", metadata: { kind: "live_pro", listing_id: "L1" } } } };
  await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  assert.equal(T.meet_listings[0].live_pro, true);
  const ok = await call(ROUTES["live/manage"], { token: "org", body: { id: "L1", branding: { color: "#6D3FD9", tagline: "Home of the Flyers", logo_url: "javascript:x" }, sponsors: [{ name: "Carolina Smiles Dental", tagline: "Proud sponsor", url: "https://example.org" }, { name: "x" }] } });
  assert.equal(ok.status, 200); assert.equal(T.meet_listings[0].branding.logo_url, null); assert.equal(T.meet_listings[0].sponsors.length, 1);
  // A meet that sells tickets gets Pro free.
  T.meet_listings.push({ id: "L2", owner_id: "org", name: "Tix Meet", start_date: "2026-12-01", status: "on_sale", ticket_types: [{ name: "Adult", price: 15 }], live_enabled: true, live_status: "live", branding: {}, sponsors: [] });
  made = null; const free = await call(ROUTES["live/pro-checkout"], { token: "org", body: { id: "L2" } });
  assert.equal(free.json.pro, true); assert.equal(made, null);
});

test("athlete recruiting page: private until published; Pro or $49/year; public page shows only chosen info", async () => {
  T.scores.push({ id: "s1", user_id: "p1", gymnast_id: "g1", meet_name: "Fall Classic", meet_date: "2026-10-10", level: "Level 5", vault: 9.1, bars: 9, beam: 9.2, floor: 9.3 });
  const save = await call(ROUTES["athlete/page"], { token: "p1", body: { gymnastId: "g1", display_name: "Maya P.", bio: "Level 5, class of 2031", grad_year: 2031, videos: [{ title: "Floor", url: "https://www.youtube.com/watch?v=x" }, { url: "https://evil.example/x" }], highlights: ["1st AA Fall Classic"] } });
  assert.equal(save.status, 200, JSON.stringify(save.json)); assert.equal(save.json.slug, "maya-p"); assert.equal(T.athlete_pages[0].videos.length, 1);
  assert.equal((await call(ROUTES["athlete/public"], { method: "GET", url: "/api/athlete/public?slug=maya-p" })).status, 404, "not published");
  const pub = await call(ROUTES["athlete/page"], { token: "p1", body: { gymnastId: "g1", display_name: "Maya P.", published: true } });
  assert.equal(pub.status, 402, "Basic needs the add-on");
  const co = await call(ROUTES["athlete/page-checkout"], { token: "p1", body: { gymnastId: "g1" } }); assert.equal(made.line_items[0].price_data.unit_amount, 4900);
  deps._event = { type: "checkout.session.completed", data: { object: { payment_status: "paid", metadata: { kind: "athlete_page", page_id: T.athlete_pages[0].id } } } };
  await call(ROUTES["billing/webhook"], { body: Buffer.from("{}"), headers: { "stripe-signature": "x" } });
  assert.equal(T.athlete_pages[0].paid_until.slice(0, 10), "2027-11-14");
  assert.equal((await call(ROUTES["athlete/page"], { token: "p1", body: { gymnastId: "g1", display_name: "Maya P.", published: true, grad_year: 2031, highlights: ["1st AA Fall Classic"], videos: [{ title: "Floor", url: "https://youtu.be/x" }] } })).status, 200);
  const view = await call(ROUTES["athlete/public"], { method: "GET", url: "/api/athlete/public?slug=maya-p" });
  assert.equal(view.json.athlete.name, "Maya P."); assert.equal(view.json.athlete.best.aa, 36.6); assert.equal(view.json.athlete.grad_year, 2031);
  assert.doesNotMatch(JSON.stringify(view.json), /dad@x\.com|"user_id"|Maya"/);
  // Pro includes it.
  assert.equal((await call(ROUTES["athlete/page"], { token: "p2", body: { gymnastId: "g2", published: true } })).status, 200);
});

test("score certificate and poster print orders use a generated card image", async () => {
  const u = await call(ROUTES["photos/upload-url"], { token: "p1", body: { kind: "card" } });
  assert.match(u.json.uploads[0].path, /^p1\/cards\/[a-f0-9-]+\.jpg$/);
  assert.equal((await call(ROUTES["photos/order"], { token: "p1", body: { items: [{ product: "cert8x10", qty: 1, path: "p1/aaaa.jpg" }] } })).status, 400);
  const r = await call(ROUTES["photos/order"], { token: "p1", body: { items: [{ product: "cert8x10", qty: 1, path: u.json.uploads[0].path }, { product: "poster16x20", qty: 1, path: u.json.uploads[0].path }] } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(made.line_items.reduce((a, l) => a + l.quantity * l.price_data.unit_amount, 0), 1499 + 2999 + 599, "plus shipping under $50");
});
