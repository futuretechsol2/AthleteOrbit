// v16: live scores for every sport, past results, admin-run meets, clear payout errors, Solo plan.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps, connectError, dbError } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { parseResults, rankRows, fmtScore, parseTime, toCsv, formatOf } from "../src/data/live.js";
import { hasFeature, athleteLimit, TIERS, TIER_ORDER } from "../src/data/plans.js";
import { SPORTS } from "../src/data/sports.js";

let T;
beforeEach(() => {
  Object.assign(process.env, { APP_URL: "https://athleteorbit.org", LINK_SECRET: "s", ADMIN_EMAILS: "boss@athleteorbit.org" });
  delete process.env.SENDGRID_API_KEY;
  T = {
    profiles: [{ id: "org", email: "coach@club.com", subscription_status: "active", subscription_tier: "basic" }, { id: "boss", email: "boss@athleteorbit.org" }, { id: "p1", email: "mom@x.com", subscription_status: "active", subscription_tier: "solo", club_id: "c1" }],
    clubs: [{ id: "c1", name: "Concord FC" }],
    gymnasts: [{ id: "k1", user_id: "p1", name: "Ava", level: "U10", sport: "Soccer", program: "Other" }],
    meet_listings: [
      { id: "S1", owner_id: "org", name: "Carolina Fall Cup", sport: "Soccer", start_date: "2026-11-14", status: "draft", ticket_types: [], sessions: [], updates: [], live_enabled: false, live_status: "off", branding: {}, sponsors: [] },
      { id: "W1", owner_id: "org", name: "Turkey Trot", sport: "Swimming", start_date: "2026-11-01", status: "draft", ticket_types: [], sessions: [], updates: [], live_enabled: true, live_status: "final", branding: {}, sponsors: [] },
      { id: "A1", owner_id: null, name: "Admin Meet", sport: "Gymnastics", start_date: "2026-12-01", status: "draft", ticket_types: [], sessions: [], updates: [], live_enabled: false, live_status: "off", branding: {}, sponsors: [] },
    ],
    live_scores: [], live_follows: [], scores: [],
  };
  const users = Object.fromEntries(T.profiles.map((p) => [p.id, { id: p.id, email: p.email }]));
  deps.supabase = () => fakeSupabase(T, users);
  deps.now = () => new Date("2026-11-14T16:00:00Z");
});

test("sport formats: race times rank lowest first, games aren't ranked, judged scores", () => {
  assert.equal(formatOf("Swimming"), "timed"); assert.equal(formatOf("Soccer"), "match"); assert.equal(formatOf("Cheer & Dance"), "judged");
  assert.equal(parseTime("1:05.32"), 65.32); assert.equal(fmtScore(65.32, "Swimming"), "1:05.32"); assert.equal(fmtScore(31.9, "Swimming"), "31.90");
  const sw = parseResults("Name,Team,Age group,Event,Time\nZoe,Tidal,9-10,50 Free,32.41\nBea,Waves,9-10,50 Free,31.90", { sport: "Swimming" });
  assert.deepEqual(rankRows(sw.rows, "Swimming")[0].rows.map((r) => [r.name, r.rank]), [["Bea", 1], ["Zoe", 2]]);
  const m = parseResults("Age group,Field,Time,Home,Away,Home score,Away score,Status\nU10,Field 2,9:00 AM,Concord FC,Charlotte SC,3,2,Final", { sport: "Soccer" });
  assert.deepEqual(m.problems, []); assert.equal(m.rows[0].status, "Final"); assert.equal(m.rows[0].session, "9:00 AM");
  assert.match(toCsv(m.rows, "Soccer"), /Concord FC,Charlotte SC,3,2,Final/);
});

test("organizer posts a soccer game; it updates in place; public page shows it", async () => {
  let r = await call(ROUTES["live/post"], { token: "org", body: { id: "S1", rows: [{ name: "Concord FC", gym: "Charlotte SC", level: "U10", division: "Field 2", status: "1st half", scores: { Home: "1", Away: "0" } }] } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.added, 1);
  r = await call(ROUTES["live/post"], { token: "org", body: { id: "S1", rows: [{ name: "Concord FC", gym: "Charlotte SC", level: "U10", status: "Final", scores: { Home: 3, Away: 2 } }] } });
  assert.equal(r.json.updated, 1); assert.equal(T.live_scores.length, 1);
  assert.deepEqual(T.live_scores[0].scores, { Home: 3, Away: 2 }); assert.equal(T.live_scores[0].status, "Final"); assert.equal(T.live_scores[0].aa, null);
  const pub = await call(ROUTES["live/meet"], { method: "GET", url: "/api/live/meet?id=S1" });
  assert.equal(pub.json.rows[0].status, "Final");
});

test("swim times accept 1:05.32 and store seconds", async () => {
  const r = await call(ROUTES["live/post"], { token: "org", body: { id: "W1", rows: [{ name: "Zoe", gym: "Tidal", level: "9-10", division: "100 IM", scores: { Time: "1:21.75" } }] } });
  assert.equal(r.status, 200); assert.equal(T.live_scores[0].aa, 81.75);
});

test("parent reports their team's game score", async () => {
  await call(ROUTES["live/manage"], { token: "org", body: { id: "S1", live_enabled: true } });
  const r = await call(ROUTES["live/report"], { token: "p1", body: { id: "S1", gymnastId: "k1", home: "Concord FC U10", away: "Matthews Magic", status: "Final", scores: { Home: 2, Away: 2 }, share: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const row = T.live_scores.find((x) => x.source === "parent"); assert.equal(row.name, "Concord FC U10"); assert.equal(row.gym, "Matthews Magic");
  assert.equal((await call(ROUTES["live/report"], { token: "p1", body: { id: "S1", gymnastId: "k1", scores: { Home: 1 } } })).status, 400, "needs the other team");
});

test("live list: sport filter and past results", async () => {
  await call(ROUTES["live/manage"], { token: "org", body: { id: "S1", live_enabled: true } });
  const all = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list" });
  assert.deepEqual(all.json.meets.map((m) => m.id), ["S1"]); assert.deepEqual(all.json.past.map((m) => m.id), ["W1"]);
  const sw = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?sport=Swimming" });
  assert.equal(sw.json.meets.length + sw.json.past.length, 1);
});

test("admins can run live scores for meets they added; others can't", async () => {
  assert.equal((await call(ROUTES["live/manage"], { token: "org", body: { id: "A1", live_enabled: true } })).status, 404);
  const r = await call(ROUTES["live/manage"], { token: "boss", body: { id: "A1", live_enabled: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(T.meet_listings[2].live_enabled, true);
});

test("payout link and database errors explain themselves", () => {
  const e = connectError({ type: "StripeInvalidRequestError", message: "You can only create new accounts if you've signed up for Connect" });
  assert.equal(e.status, 503); assert.match(e.message, /Connect/);
  assert.match(dbError({ code: "42703", message: "column live_enabled does not exist" }).message, /schema\.sql/);
  assert.equal(dbError({ code: "22P02", message: "invalid input syntax for type uuid" }).status, 404);
});

test("Solo plan: $15.99, Basic features, 1 athlete; Growing Up works without a sport", () => {
  assert.deepEqual(TIER_ORDER, ["solo", "basic", "pro"]); assert.equal(TIERS.solo.prices.monthly, 15.99);
  assert.equal(hasFeature("solo", "liveFollow"), true); assert.equal(hasFeature("solo", "coach"), false); assert.equal(athleteLimit("solo"), 1); assert.equal(athleteLimit("basic"), 6);
  assert.ok(SPORTS["Growing Up"].everyday); assert.equal(SPORTS["Growing Up"].levels.length, 5);
});

test("confirm-email sign-up: if the confirmation email can't be sent, no account is left behind and the message is clear", async () => {
  const { register } = await import("../server/routes/auth/email.js");
  delete process.env.EMAIL_CONFIRM;
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "support@athleteorbit.org" });
  deps.fetch = async () => ({ ok: false, status: 403, text: async () => "credits exceeded" });
  const r = await call(register, { body: { email: "newmom@x.com", password: "Gymnast2026", username: "newmom", full_name: "New Mom", adult: true } });
  assert.equal(r.status, 503); assert.equal(r.json.code, "email_failed"); assert.match(r.json.error, /wasn't created/);
  assert.ok(T._deleted?.length, "half-made account removed"); assert.ok(!T._confirmed, "never auto-confirmed");
  // a whole team on one Wi-Fi: 10 different families from the same IP all get through
  deps.fetch = async () => ({ ok: true, status: 202, text: async () => "" });
  for (let i = 0; i < 10; i++) assert.equal((await call(register, { headers: { "x-forwarded-for": "9.9.9.9" }, body: { email: `fam${i}@x.com`, password: "Gymnast2026", username: `fam_${i}`, full_name: "Fam", adult: true } })).status, 200);
  delete process.env.SENDGRID_API_KEY;
});

test("instant sign-up (default): account ready at once, welcome email optional, one email = one login", async () => {
  const { register } = await import("../server/routes/auth/email.js");
  process.env.EMAIL_CONFIRM = "off";
  // email not even configured: sign-up still works
  delete process.env.SENDGRID_API_KEY;
  let r = await call(register, { body: { email: "fresh@x.com", password: "Gymnast2026", username: "fresh_mom", full_name: "Fresh Mom", adult: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.confirmed, true); assert.deepEqual(T._confirmed.at(-1)[1], { email_confirm: true });
  // mail configured but Gmail-bound mail failing: still instant
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "support@athleteorbit.org" });
  deps.fetch = async () => ({ ok: false, status: 403, text: async () => "nope" });
  r = await call(register, { body: { email: "fresh2@x.com", password: "Gymnast2026", username: "fresh_dad", full_name: "Fresh Dad", adult: true } });
  assert.equal(r.json.confirmed, true);
  // existing email -> no second account, app signs in with the typed password or offers Log in / Reset
  T.profiles.push({ id: "old", email: "taken@x.com" });
  r = await call(register, { body: { email: "taken@x.com", password: "Gymnast2026", username: "second_acct", full_name: "Dup", adult: true } });
  assert.equal(r.status, 200); assert.equal(r.json.exists, true); assert.ok(!r.json.confirmed);
  delete process.env.SENDGRID_API_KEY;
});

test("log-in finishes an account whose confirmation email never arrived (right password only)", async () => {
  const login = (await import("../server/routes/auth/login.js")).default;
  process.env.EMAIL_CONFIRM = "off";
  T.profiles.push({ id: "stuck", email: "stuck@x.com", username: "stuckmom" });
  const confirmed = new Set();
  deps.supabaseAnon = () => ({ auth: { signInWithPassword: async ({ email, password }) => {
    if (password !== "Right2026") return { data: null, error: { message: "Invalid login credentials" } };
    if (!confirmed.has(email)) return { data: null, error: { message: "Email not confirmed" } };
    return { data: { session: { access_token: "a", refresh_token: "r" } }, error: null };
  } } });
  const fake = deps.supabase; deps.supabase = () => { const c = fake(); c.auth.admin.updateUserById = async () => { confirmed.add("stuck@x.com"); return { data: {}, error: null }; }; return c; };
  assert.equal((await call(login, { body: { identifier: "stuck@x.com", password: "Wrong2026" } })).status, 401, "wrong password stays out");
  assert.equal(confirmed.size, 0);
  const ok = await call(login, { body: { identifier: "stuckmom", password: "Right2026" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.access_token, "a");
});

test("live search finds athletes by name (+ gym, meet or city) across meets; parent-reported stays private", async () => {
  T.meet_listings[1].location = "Charlotte, NC";
  T.live_scores.push(
    { id: "a1", listing_id: "W1", source: "official", name: "Maya Patel", gym: "Tidal Waves", level: "9-10", division: "50 Free", scores: { Time: 32.1 }, aa: 32.1, place: 1 },
    { id: "a2", listing_id: "S1", source: "official", name: "Maya Patel", gym: "Tidal Waves", level: "U10", scores: {}, aa: null },
    { id: "a3", listing_id: "W1", source: "parent", name: "Maya Secret", gym: "Tidal Waves", level: "9-10", scores: { Time: 40 }, aa: 40 },
    { id: "a4", listing_id: "W1", source: "official", name: "Ava Tidal", gym: "Other Club", level: "9-10", scores: { Time: 35 }, aa: 35 });
  await call(ROUTES["live/manage"], { token: "org", body: { id: "S1", live_enabled: true } });
  let r = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?q=maya" });
  assert.equal(r.json.athletes.length, 1); assert.equal(r.json.athletes[0].results.length, 2, "both meets");
  assert.ok(!JSON.stringify(r.json).includes("Maya Secret"), "parent-reported never public");
  r = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?q=maya%20charlotte" });
  assert.deepEqual(r.json.athletes[0].results.map((x) => x.meetId), ["W1"], "city narrows to that meet");
  r = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?q=tidal" });
  assert.deepEqual(r.json.athletes.map((a) => a.name), ["Ava Tidal"], "gym-only words don't list every athlete; names do");
  r = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?q=maya&sport=Soccer" });
  assert.deepEqual(r.json.athletes[0].results.map((x) => x.meetId), ["S1"]);
});

test("profile/save: saves sports for the signed-in parent only; clear errors", async () => {
  T.profiles.find((p) => p.id === "p1").sports = ["Soccer"];
  let r = await call(ROUTES["profile/save"], { token: "p1", body: { sports: ["Soccer", "Swimming", "Not A Sport"], subscription_tier: "pro" } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.deepEqual(r.json.profile.sports, ["Soccer", "Swimming"]);
  assert.equal(T.profiles.find((p) => p.id === "p1").subscription_tier, "solo", "can't change own plan");
  assert.equal((await call(ROUTES["profile/save"], { body: { sports: ["Soccer"] } })).status, 401, "no sign-in → clear 401");
  assert.equal((await call(ROUTES["profile/save"], { token: "p1", body: { avatar: "javascript:alert(1)" } })).status, 400);
  assert.equal((await call(ROUTES["profile/save"], { token: "p1", body: {} })).status, 400);
});

test("a login whose profile row was deleted gets it rebuilt automatically (no 'couldn't find your profile')", async () => {
  T.profiles = T.profiles.filter((p) => p.id !== "p1");          // someone deleted the row in the table editor
  const r = await call(ROUTES["profile/save"], { token: "p1", body: { sports: ["Gymnastics"] } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.deepEqual(r.json.profile.sports, ["Gymnastics"]);
  const row = T.profiles.find((p) => p.id === "p1"); assert.ok(row?.username?.length >= 3); assert.equal(row.email, "mom@x.com");
  // and the username never collides
  T.profiles = T.profiles.filter((p) => p.id !== "p1"); T.profiles.push({ id: "zz", email: "z@x.com", username: row.username });
  assert.equal((await call(ROUTES["me"], { token: "p1", method: "GET" })).status, 200);
  assert.notEqual(T.profiles.find((p) => p.id === "p1").username, row.username);
});

test("sign-up with an email that never confirmed: confirmation email is sent again (nobody is let in)", async () => {
  const { register } = await import("../server/routes/auth/email.js");
  delete process.env.EMAIL_CONFIRM;
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "support@athleteorbit.org" });
  const mails = []; deps.fetch = async (u, o) => { mails.push(JSON.parse(o.body)); return { ok: true, status: 202, text: async () => "" }; };
  T.profiles.push({ id: "un1", email: "pending@x.com", username: "pending1", _unconfirmed: true });
  const r = await call(register, { body: { email: "pending@x.com", password: "Gymnast2026", username: "pending2", full_name: "P", adult: true } });
  assert.deepEqual(r.json, { sent: true }); assert.match(mails.at(-1).subject, /Confirm your email/);
  assert.ok(!T._confirmed, "not auto-confirmed");
  delete process.env.SENDGRID_API_KEY;
});

test("signing up again before confirming: the NEW password and username are the ones that work after confirming", async () => {
  const { register } = await import("../server/routes/auth/email.js");
  delete process.env.EMAIL_CONFIRM;
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "support@athleteorbit.org" });
  deps.fetch = async () => ({ ok: true, status: 202, text: async () => "" });
  T.profiles.push({ id: "old-unconf", email: "again@x.com", username: "first_try", _unconfirmed: true });
  // same username as before is allowed (it's their own); new password typed today
  const r = await call(register, { body: { email: "again@x.com", password: "NewPass2026", username: "first_try", full_name: "Again Parent", adult: true } });
  assert.deepEqual(r.json, { sent: true }, JSON.stringify(r.json));
  assert.equal(T._passwords["old-unconf"], "NewPass2026", "today's password is set on the account");
  // a different new username is applied too
  await call(register, { body: { email: "again@x.com", password: "NewPass2027", username: "second_try", full_name: "Again Parent", adult: true } });
  assert.equal(T.profiles.find((p) => p.id === "old-unconf").username, "second_try"); assert.equal(T._passwords["old-unconf"], "NewPass2027");
  // but a CONFIRMED account's password is never changed by the sign-up form
  T.profiles.push({ id: "conf1", email: "real@x.com", username: "realuser" });
  await call(register, { body: { email: "real@x.com", password: "Hijack2026", username: "hijacker", full_name: "X", adult: true } });
  assert.ok(!T._passwords?.conf1, "confirmed account untouched"); assert.equal(T.profiles.find((p) => p.id === "conf1").username, "realuser");
  delete process.env.SENDGRID_API_KEY;
});
