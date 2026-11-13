import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { meetMatches, sessionFor, levelKey, shortName } from "../src/data/levels.js";
import { runLookups, cleanRosterRow } from "../server/routes/club/center.js";

let T, mails, ai;
const png = "data:image/png;base64,iVBORw0KGgo=";
beforeEach(() => {
  Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "hi@athleteorbit.org", APP_URL: "https://athleteorbit.org", ANTHROPIC_API_KEY: "k", LINK_SECRET: "s", BUSINESS_NAME: "FT", BUSINESS_ADDRESS: "1 Main" });
  delete process.env.AI_PROVIDER; delete process.env.OPENAI_API_KEY;
  mails = []; ai = [];
  T = {
    profiles: [
      { id: "own", email: "owner@gym.com", account_type: "gym", gym_name: "Apex", subscription_status: "none", full_name: "Olga Owner" },
      { id: "p1", email: "dad@x.com", full_name: "Dan Dad", club_id: "c1", subscription_status: "none" },
      { id: "p2", email: "mom@x.com", full_name: "Mia Mom", club_id: "c1", subscription_status: "none" },
      { id: "p3", email: "solo@x.com", full_name: "Sam Solo", subscription_status: "active", subscription_tier: "basic" },
    ],
    clubs: [{ id: "c1", name: "Apex Gymnastics", code: "APEX-1", owner_id: "own", seats: 50, active_until: "2027-06-01T00:00:00Z", sport: "Gymnastics" }],
    gymnasts: [
      { id: "g1", user_id: "p1", name: "Leo", level: "Level 4", program: "MAG", gender: "M" },
      { id: "g2", user_id: "p1", name: "Ava", level: "Level 8", program: "WAG", gender: "F" },
      { id: "g3", user_id: "p2", name: "Zoe", level: "Level 4", program: "WAG", gender: "F" },
      { id: "g4", user_id: "p3", name: "Kai", level: "Level 5", program: "MAG", gender: "M" },
    ],
    club_roster: [], club_meets: [], club_messages: [], club_announcements: [], meets: [], ai_usage: [], usage: [],
  };
  const users = { own: { id: "own", email: "owner@gym.com" }, p1: { id: "p1", email: "dad@x.com" }, p2: { id: "p2", email: "mom@x.com" }, p3: { id: "p3", email: "solo@x.com" }, new: { id: "new", email: "new@x.com" } };
  deps.supabase = () => fakeSupabase(T, users);
  deps.now = () => new Date("2026-11-11T15:00:00Z");
  deps.fetch = async (url, o) => {
    if (String(url).includes("sendgrid")) { mails.push(JSON.parse(o.body)); return { ok: true, status: 202, text: async () => "" }; }
    if (String(url).includes("anthropic")) { const b = JSON.parse(o.body); ai.push(b); return { ok: true, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: typeof ai.reply === "function" ? ai.reply(b) : ai.reply }] }) }; }
    throw new Error("unexpected fetch " + url);
  };
});
const SCHEDULE = [
  { name: "Boys Blackjack Invite", start_date: "2026-12-05", location: "Charlotte, NC", levels: ["Level 4", "Level 5"], gender: "M" },
  { name: "Snowflake Classic", start_date: "2026-12-12", end_date: "2026-12-13", location: "Raleigh, NC", levels: ["Level 3", "Level 4"], gender: "F" },
  { name: "Queen City Optionals", start_date: "2027-01-16", levels: ["Level 8", "Level 9"], gender: "F" },
  { name: "Team Banquet Meet", start_date: "2027-02-06", levels: [], gender: null },
];

test("matching: level and girls/boys decide who sees a competition", () => {
  const boy4 = { level: "Level 4", program: "MAG" }, girl4 = { level: "4", program: "WAG" }, girl8 = { level: "Level 8", gender: "F" };
  assert.equal(levelKey("Lvl 4"), levelKey("level 4")); assert.notEqual(levelKey("Level 4"), levelKey("Level 14"));
  assert.equal(meetMatches(SCHEDULE[0], boy4), true); assert.equal(meetMatches(SCHEDULE[0], girl4), false, "girl never sees a boys meet");
  assert.equal(meetMatches(SCHEDULE[1], girl4), true); assert.equal(meetMatches(SCHEDULE[1], boy4), false); assert.equal(meetMatches(SCHEDULE[1], girl8), false, "wrong level");
  assert.equal(meetMatches(SCHEDULE[3], boy4) && meetMatches(SCHEDULE[3], girl8), true, "no levels listed = whole team");
  assert.equal(sessionFor({ sessions: [{ levels: ["Level 4"], gender: "F", text: "Sat 8 AM" }, { levels: ["Level 4"], gender: "M", text: "Sun 2 PM" }] }, boy4), "Sun 2 PM");
  assert.equal(shortName("Leo Martinez"), "Leo M.");
});

test("sign-up email comes from our server with a link that opens the app", async () => {
  const r = await call(ROUTES["auth/register"], { body: { email: "New@X.com", password: "abc12345", username: "newdad", full_name: "New Dad" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(mails.length, 1); assert.equal(mails[0].personalizations[0].to[0].email, "new@x.com");
  assert.match(JSON.stringify(mails[0]), /https:\/\/athleteorbit\.org\/confirm\?token_hash=hash123&amp;type=signup|https:\/\/athleteorbit\.org\/confirm\?token_hash=hash123&type=signup/);
  assert.doesNotMatch(JSON.stringify(mails[0]), /vercel|supabase\.co/);
  const dup = await call(ROUTES["auth/register"], { body: { email: "dad@x.com", password: "abc12345", username: "another", full_name: "Dan" } });
  assert.equal(dup.status, 409);
  const weak = await call(ROUTES["auth/register"], { body: { email: "a@b.co", password: "short", username: "okname", full_name: "A" } });
  assert.equal(weak.status, 400);
  const rs = await call(ROUTES["auth/reset"], { body: { email: "nobody@x.com" } });
  assert.equal(rs.status, 200); assert.equal(mails.length, 1, "unknown email: same answer, no mail");
  await call(ROUTES["auth/reset"], { body: { email: "dad@x.com" } });
  assert.match(JSON.stringify(mails[1]), /type=recovery/);
  delete process.env.SENDGRID_API_KEY;
  const off = await call(ROUTES["auth/register"], { body: { email: "z@x.com", password: "abc12345", username: "zzz1", full_name: "Z" } });
  assert.equal(off.status, 501); assert.equal(off.json.code, "email_off");
});

test("gym starts a free 30-day trial; roster upload; parents find and claim by name or level", async () => {
  T.clubs = []; T.profiles[1].club_id = null; T.profiles[2].club_id = null;
  const t = await call(ROUTES["club/trial"], { token: "own", body: { clubName: "Apex Gymnastics" } });
  assert.equal(t.status, 200, JSON.stringify(t.json)); assert.match(t.json.code, /^APEXGY-/);
  assert.equal((await call(ROUTES["club/trial"], { token: "own", body: { clubName: "Again" } })).status, 409);
  const up = await call(ROUTES["club/roster"], { token: "own", body: { rows: [
    { name: "Leo Martinez", level: "Level 4", gender: "boy", parent_email: "DAD@x.com" }, { name: "Ava Martinez", level: "Level 8", gender: "Girl" },
    { name: "Zoe Chen", level: "Level 4", gender: "F" }, { name: "Mila Park", level: "Xcel Gold" }, { name: "", level: "Level 2" }, { name: "Zoe Chen", level: "level 4", gender: "F" }] } });
  assert.equal(up.json.added, 4); assert.equal(T.club_roster.find((r) => r.name === "Leo Martinez").program, "MAG"); assert.equal(T.club_roster.find((r) => r.name === "Mila Park").program, "Xcel");
  assert.equal((await call(ROUTES["club/roster"], { token: "p1", body: { rows: [{ name: "X" }] } })).status, 403, "parents can't edit the roster");
  // Parent joins with the code: the athlete listed with his email is linked automatically (existing "Leo" profile reused).
  const j = await call(ROUTES["club/join"], { token: "p1", body: { code: t.json.code } });
  assert.equal(j.json.linked, 1); assert.equal(T.gymnasts.filter((g) => g.user_id === "p1").length, 2); assert.ok(T.gymnasts.find((g) => g.id === "g1").roster_id);
  const s = await call(ROUTES["club/roster-search"], { method: "GET", token: "p1", url: "/api/club/roster-search?q=mart" });
  assert.deepEqual(s.json.results.map((r) => r.name), ["Ava M.", "Leo M."]); assert.equal(s.json.results[1].mine, true);
  const byLevel = await call(ROUTES["club/roster-search"], { method: "GET", token: "p1", url: "/api/club/roster-search?level=Level%204" });
  assert.equal(byLevel.json.results.length, 2); assert.ok(byLevel.json.levels.includes("Xcel Gold"));
  const c = await call(ROUTES["club/roster-claim"], { token: "p1", body: { rosterId: s.json.results[0].id } });
  assert.equal(c.json.linked, true); assert.equal(T.gymnasts.filter((g) => g.user_id === "p1").length, 2, "Ava's existing profile linked, not duplicated");
  assert.equal((await call(ROUTES["club/roster-search"], { method: "GET", token: "p3", url: "/x" })).status, 403);
  assert.equal(cleanRosterRow({ name: "Bo", level: "U10", gender: "boys" }, "Soccer").program, null);
});

test("schedule photo → each athlete only gets their own level's and gender's competitions", async () => {
  ai.reply = JSON.stringify({ sport: "Gymnastics", competitions: [...SCHEDULE, { name: "No date" }, { name: "Bad", start_date: "Dec 5" }] });
  const read = await call(ROUTES["club/schedule-read"], { token: "own", body: { image: png } });
  assert.equal(read.status, 200, JSON.stringify(read.json)); assert.equal(read.json.competitions.length, 4);
  assert.match(ai[0].system, /today is 2026-11-11/); assert.equal(ai[0].messages[0].content[0].type, "image");
  const save = await call(ROUTES["club/schedule"], { token: "own", body: { add: read.json.competitions } });
  assert.equal(save.json.saved, 4);
  const names = (gid) => T.meets.filter((m) => m.gymnast_id === gid).map((m) => m.name).sort();
  assert.deepEqual(names("g1"), ["Boys Blackjack Invite", "Team Banquet Meet"], "boy L4");
  assert.deepEqual(names("g2"), ["Queen City Optionals", "Team Banquet Meet"], "girl L8");
  assert.deepEqual(names("g3"), ["Snowflake Classic", "Team Banquet Meet"], "girl L4");
  assert.deepEqual(names("g4"), [], "not in this gym");
  assert.ok(T.meets[0].checklist.length > 3 && T.meets[0].status === "Planned");
  assert.equal((await call(ROUTES["club/schedule"], { token: "own", body: { add: read.json.competitions } })).json.saved, 0, "no duplicates");
  assert.equal(T.meets.length, 6);
  const list = await call(ROUTES["club/schedule"], { method: "GET", token: "own" });
  assert.equal(list.json.competitions[0].families, 1);
  // Level change on the roster moves the athlete to the right meets.
  T.club_roster.push({ id: "r3", club_id: "c1", name: "Zoe Chen", level: "Level 4", program: "WAG", gender: "F", sport: "Gymnastics" }); T.gymnasts[2].roster_id = "r3";
  await call(ROUTES["club/roster"], { token: "own", body: { update: { id: "r3", name: "Zoe Chen", level: "Level 8", gender: "F" } } });
  assert.deepEqual(names("g3"), ["Queen City Optionals", "Team Banquet Meet"]);
  // Removing a competition removes the upcoming copies.
  await call(ROUTES["club/schedule"], { token: "own", body: { remove: T.club_meets.find((m) => m.name === "Team Banquet Meet").id } });
  assert.equal(T.meets.filter((m) => m.name === "Team Banquet Meet").length, 0);
  assert.equal((await call(ROUTES["club/schedule"], { token: "p1", body: { add: SCHEDULE } })).status, 403);
});

test("a parent without a gym can use the photo for their own athlete; trial-ended families are asked to subscribe", async () => {
  const r = await call(ROUTES["club/schedule-apply"], { token: "p3", body: { competitions: SCHEDULE } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.deepEqual(r.json.perAthlete, { Kai: 2 });
  assert.deepEqual(T.meets.map((m) => m.name).sort(), ["Boys Blackjack Invite", "Team Banquet Meet"]);
  assert.equal((await call(ROUTES["club/schedule-apply"], { token: "p3", body: { competitions: SCHEDULE } })).json.added, 0);
  T.profiles[1].club_id = null; T.profiles[1].trial_ends_at = "2026-01-01T00:00:00Z";
  assert.equal((await call(ROUTES["club/schedule-apply"], { token: "p1", body: { competitions: SCHEDULE } })).status, 402);
  // A member can pass the schedule to the gym: saved as a suggestion until the owner publishes it.
  const sh = await call(ROUTES["club/schedule-apply"], { token: "p2", body: { competitions: SCHEDULE, share: true } });
  assert.equal(sh.json.shared, 4); assert.ok(T.club_meets.every((m) => m.status === "suggested"));
  const before = T.meets.filter((m) => m.user_id === "p1").length;
  await call(ROUTES["club/schedule"], { token: "own", body: { publish: T.club_meets[3].id } });
  assert.equal(T.meets.filter((m) => m.user_id === "p2" && m.name === "Team Banquet Meet").length, 1, "linked to the one she already had, not duplicated");
  assert.equal(before, 0);
});

test("online lookup: host, https website and the athlete's own session time; nothing is guessed", async () => {
  await call(ROUTES["club/schedule"], { token: "own", body: { add: SCHEDULE } });
  const cm = T.club_meets.find((m) => m.name === "Snowflake Classic");
  ai.reply = 'Here is what I found. {"found": true, "host": "Triangle Gymnastics", "website": "https://snowflakeclassic.com/2026", "venue": "Raleigh Convention Center", "address": "500 S Salisbury St", "schedule_published": true, "source_url": "http://insecure.example.com", "sessions": [{"levels": ["Level 4"], "gender": "F", "text": "Sat Dec 12 · Session 3 · 1:15 PM"}, {"levels": ["Level 3"], "gender": "F", "text": "Sat Dec 12 · Session 1 · 8:00 AM"}]}';
  const r = await call(ROUTES["club/lookup"], { token: "own", body: { clubMeetId: cm.id } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.found, true);
  assert.equal(ai.at(-1).tools[0].type, "web_search_20250305");
  const zoe = T.meets.find((m) => m.gymnast_id === "g3" && m.name === "Snowflake Classic");
  assert.equal(zoe.session_time, "Sat Dec 12 · Session 3 · 1:15 PM"); assert.equal(zoe.host, "Triangle Gymnastics"); assert.equal(zoe.website, "https://snowflakeclassic.com/2026");
  assert.match(zoe.venue, /Raleigh Convention Center, 500/); assert.equal(zoe.info_source, "https://snowflakeclassic.com/2026", "http source dropped, falls back to website");
  // Not found: only the checked time is stored.
  ai.reply = '{"found": false}';
  const qc = T.club_meets.find((m) => m.name === "Queen City Optionals");
  const r2 = await call(ROUTES["club/lookup"], { token: "own", body: { clubMeetId: qc.id } });
  assert.equal(r2.json.found, false); assert.equal(qc.website ?? null, null); assert.ok(qc.info_checked_at);
  // javascript: and http links are never stored.
  ai.reply = '{"found": true, "host": "X", "website": "javascript:alert(1)", "sessions": [], "schedule_published": false}';
  await call(ROUTES["club/lookup"], { token: "own", body: { clubMeetId: qc.id } });
  assert.equal(qc.website ?? null, null);
  // Parent's own meet.
  T.meets.push({ id: "m9", user_id: "p3", gymnast_id: "g4", name: "Solo Open", start_date: "2026-11-21", status: "Planned" });
  ai.reply = '{"found": true, "host": "Solo Gym", "website": "https://solo.example.com", "schedule_published": true, "sessions": [{"levels": ["Level 5"], "gender": "M", "text": "Sat 9:00 AM"}]}';
  const mine = await call(ROUTES["club/lookup"], { token: "p3", body: { meetId: "m9" } });
  assert.equal(mine.json.session_time, "Sat 9:00 AM");
  assert.equal((await call(ROUTES["club/lookup"], { token: "p1", body: { meetId: "m9" } })).status, 404);
});

test("daily lookups run in small batches and email the family when a session time appears", async () => {
  T.meets.push({ id: "m9", user_id: "p3", gymnast_id: "g4", name: "Solo Open", start_date: "2026-11-21", status: "Planned" }, { id: "m10", user_id: "p3", gymnast_id: "g4", name: "Far Away", start_date: "2027-03-01", status: "Planned" });
  ai.reply = '{"found": true, "host": "Solo Gym", "website": "https://solo.example.com", "schedule_published": true, "sessions": [{"levels": ["Level 5"], "gender": "M", "text": "Sat 9:00 AM"}]}';
  const out = await runLookups({ max: 3 });
  assert.deepEqual(out, { checked: 1, times: 1 }); assert.equal(mails.length, 1); assert.match(mails[0].subject || mails[0].personalizations[0].subject, /Session time posted: Solo Open/);
  assert.deepEqual(await runLookups({ max: 3 }), { checked: 0, times: 0 }, "already has a time — not looked up again");
});

test("messages: parent ↔ gym, emails both ways, unread counts, private per family", async () => {
  const a = await call(ROUTES["club/messages"], { token: "p1", body: { body: "Is practice still on Friday?" } });
  assert.equal(a.status, 200, JSON.stringify(a.json)); assert.equal(mails[0].personalizations[0].to[0].email, "owner@gym.com"); assert.match(JSON.stringify(mails[0]), /Leo \(Level 4\)/);
  assert.equal((await call(ROUTES.me, { method: "GET", token: "own" })).json.unread_messages, 1);
  const inbox = await call(ROUTES["club/messages"], { method: "GET", token: "own" });
  assert.equal(inbox.json.threads.length, 1); assert.equal(inbox.json.threads[0].unread, 1); assert.equal(inbox.json.threads[0].name, "Dan Dad"); assert.equal(inbox.json.threads[0].email, undefined);
  const th = await call(ROUTES["club/messages"], { method: "GET", token: "own", url: "/api/club/messages?family=p1" });
  assert.equal(th.json.messages.length, 1); assert.equal((await call(ROUTES.me, { method: "GET", token: "own" })).json.unread_messages, 0);
  await call(ROUTES["club/messages"], { token: "own", body: { familyId: "p1", body: "Yes — 5 to 8 pm." } });
  assert.equal(mails[1].personalizations[0].to[0].email, "dad@x.com");
  assert.equal((await call(ROUTES.me, { method: "GET", token: "p1" })).json.unread_messages, 1);
  const mine = await call(ROUTES["club/messages"], { method: "GET", token: "p1" });
  assert.deepEqual(mine.json.messages.map((m) => m.sender), ["family", "gym"]);
  assert.equal((await call(ROUTES["club/messages"], { method: "GET", token: "p2" })).json.messages.length, 0, "other families can't read it");
  assert.equal((await call(ROUTES["club/messages"], { token: "own", body: { familyId: "p3", body: "hi" } })).status, 404);
  assert.equal((await call(ROUTES["club/messages"], { token: "p3", body: { body: "hi" } })).status, 403);
});

test("announcements reach every family by email with a short summary; parents see them on My gym", async () => {
  ai.reply = "No practice Nov 26–27. Picture day is Dec 3 at 4 pm — wear the team leotard.";
  const long = "Hello families! ".repeat(20) + "No practice Nov 26-27. Picture day is Dec 3 at 4 pm, wear the team leotard.";
  const r = await call(ROUTES["club/announce"], { token: "own", body: { title: "Thanksgiving week", body: long } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.emailed, 2); assert.match(r.json.summary, /Picture day/);
  assert.match(JSON.stringify(mails[0]), /In short/);
  const h = await call(ROUTES["club/home"], { method: "GET", token: "p2" });
  assert.equal(h.json.club.name, "Apex Gymnastics"); assert.equal(h.json.announcements[0].summary, r.json.summary); assert.deepEqual(h.json.unlinked, ["Zoe"]);
  assert.equal((await call(ROUTES.me, { method: "GET", token: "p2" })).json.last_announcement.title, "Thanksgiving week");
  assert.equal((await call(ROUTES["club/home"], { method: "GET", token: "p3" })).json.club, null);
  const short = await call(ROUTES["club/announce"], { token: "own", body: { title: "Gym closed", body: "Closed Monday." } });
  assert.equal(short.json.summary, null);
});
