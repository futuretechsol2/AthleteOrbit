import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { SPORTS, SPORT_NAMES, skillsForChild, nextLevel, levelsFor, sportOf } from "../src/data/sports.js";

process.env.ANTHROPIC_API_KEY = "t";
const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
let T, claude, reply;
beforeEach(() => {
  T = {
    profiles: [{ id: "u1", email: "a@x.com", subscription_status: "active", subscription_tier: "pro", subscription_tier: "pro" }],
    gymnasts: [
      { id: "s1", user_id: "u1", name: "Zoe", program: "Other", sport: "Swimming", level: "Novice" },
      { id: "t1", user_id: "u1", name: "Dev", program: "Other", sport: "Tennis", level: "Green ball" },
      { id: "g1", user_id: "u1", name: "Maya", program: "WAG", sport: "Gymnastics", level: "Level 5" },
    ],
    stats: [{ user_id: "u1", gymnast_id: "s1", event_date: "2026-10-11", event_name: "Fall Classic", metric: "50 Free", value: 35.9, unit: "sec" }],
    skill_status: [{ user_id: "u1", gymnast_id: "s1", skill_key: "Swimming|Novice|Starts|Dive from the block", status: "Have it" }],
    scores: [], meets: [], coach_notes: [{ user_id: "u1", gymnast_id: "s1", noted_on: "2026-10-01", body: "Keep head down on breath" }], goals: [], ai_usage: [], ai_notes: [],
  };
  deps._sb = fakeSupabase(T, { tok: { id: "u1", email: "a@x.com" } }); deps.supabase = () => deps._sb;
  claude = []; reply = "ok";
  deps.fetch = async (u, init) => { claude.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ content: [{ type: "text", text: reply }] }) }; };
});

test("catalog: every sport and activity, each with levels, skills, metrics and packing", () => {
  assert.deepEqual(SPORT_NAMES, ["Gymnastics", "Swimming", "Cheer & Dance", "Soccer", "Basketball", "Tennis", "Volleyball", "Baseball & Softball", "Martial Arts", "Music & Performing Arts", "Academics & STEM"]);
  for (const s of SPORT_NAMES.slice(1)) {
    const c = SPORTS[s];
    assert.ok(c.levels.length >= 4 && c.metrics.length >= 3 && c.packing.length >= 8, s);
    for (const lvl of c.levels) assert.ok(Object.keys(c.skills[lvl] || {}).length, `${s} ${lvl} has skills`);
  }
  assert.equal(nextLevel({ program: "Other", sport: "Tennis", level: "Orange ball" }), "Green ball");
  assert.equal(levelsFor("Gymnastics", "MAG")[0], "Level 1");
  assert.equal(skillsForChild({ program: "Other", sport: "Swimming", level: "Novice" })[0].key.split("|")[0], "Swimming");
  assert.equal(sportOf({ program: "WAG" }), "Gymnastics");
});

test("AI coach speaks the child's sport and sees swim times, skills, coach notes", async () => {
  await call(ROUTES["ai/coach"], { token: "tok", body: { gymnastId: "s1", messages: [{ role: "user", content: "How do we drop time?" }] } });
  const sys = claude[0].system;
  assert.match(sys, /The sport is Swimming/); assert.match(sys, /age-group swim coach/);
  assert.match(sys, /50 Free 35.9 sec/); assert.match(sys, /Starts - Dive from the block: Have it/); assert.match(sys, /Keep head down on breath/);
  assert.doesNotMatch(sys, /WAG/);
});

test("level plan follows the sport", async () => {
  await call(ROUTES["ai/readiness"], { token: "tok", body: { gymnastId: "t1" } });
  assert.match(claude[0].system, /junior tennis coach/);
  assert.match(claude[0].messages[0].content, /Next level: Yellow ball \/ tournaments/);
  assert.match(claude[0].messages[0].content, /Kick or slice second serve/);
});

test("swim results sheet: times converted and cleaned", async () => {
  reply = '{"event_name":"Fall Splash","event_date":"2026-11-22","results":[{"metric":"50 Free","value":"34.91","unit":"sec","place":3},{"metric":"100 IM","value":82.4,"unit":"sec"},{"metric":"junk"}],"confidence":"high","notes":""}';
  const r = await call(ROUTES["ai/scoresheet"], { token: "tok", body: { image: IMG, sport: "Swimming", nameHint: "Zoe" } });
  assert.equal(r.status, 200); assert.equal(r.json.results.length, 2); assert.equal(r.json.results[0].value, 34.91); assert.equal(r.json.results[0].place, 3);
  assert.match(claude[0].system, /time in SECONDS/);
  const nope = await call(ROUTES["ai/scoresheet"], { token: "tok", body: { image: IMG, sport: "Soccer" } });
  assert.equal(nope.status, 400);
});
