import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";

let T, sent;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "t"; process.env.APP_URL = "https://app.test"; delete process.env.AI_PROVIDER;
  const today = new Date().toISOString().slice(0, 10);
  T = {
    profiles: [{ id: "p", email: "p@x.com", subscription_status: "active", subscription_tier: "plus" }, { id: "b", email: "b@x.com", subscription_status: "active", subscription_tier: "basic" },
      { id: "x", email: "x@x.com", subscription_status: "active", subscription_tier: "pro" }],
    gymnasts: [{ id: "gp", user_id: "p", name: "Maya", program: "WAG", level: "Level 5", club: "Demo Gym", photo: "data:image/jpeg;base64,AAA" },
      { id: "gb", user_id: "b", name: "Ana", program: "WAG", level: "Level 4" }, { id: "gx", user_id: "x", name: "Zoe", program: "Other", sport: "Swimming", level: "Novice" }],
    scores: [{ user_id: "p", gymnast_id: "gp", meet_name: "Fall <Classic>", meet_date: "2026-09-14", vault: 9.1, bars: 8.6, beam: 8.9, floor: 9.0, aa_place: 2 }],
    stats: [], meets: [{ user_id: "p", gymnast_id: "gp", name: "Turkey Inv", start_date: "2099-11-22", location: "Raleigh, NC", status: "Registered", hotel_confirmation: "SECRET123" }],
    costs: [{ user_id: "p", gymnast_id: "gp", amount: 999, description: "Tuition" }],
    practice_logs: [{ user_id: "x", gymnast_id: "gx", practiced_on: today, minutes: 90, pain: 4, pain_area: "Shoulder" }], qualifiers: [{ user_id: "x", gymnast_id: "gx", name: "Champs cut", metric: "50 Free", target: 33.49, better: "lower" }],
    skill_status: [], coach_notes: [], goals: [], ai_usage: [], ai_notes: [], clubs: [],
  };
  deps._sb = fakeSupabase(T, { tp: { id: "p", email: "p@x.com" }, tb: { id: "b", email: "b@x.com" }, tx: { id: "x", email: "x@x.com" } }); deps.supabase = () => deps._sb;
  sent = [];
  deps.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ content: [{ type: "text", text: "ok" }] }) }; };
});

test("share link: Plus only; page shows scores + upcoming, hides costs/hotel, escapes HTML", async () => {
  let r = await call(ROUTES["share/link"], { token: "tb", body: { gymnastId: "gb" } }); assert.equal(r.status, 402); assert.equal(r.json.upgrade, "plus");
  r = await call(ROUTES["share/link"], { token: "tp", body: { gymnastId: "gp" } });
  assert.equal(r.status, 200); const key = new URL(r.json.url).searchParams.get("k"); assert.ok(key.length >= 20);
  const page = await call(ROUTES.share, { method: "GET", url: `/api/share?k=${key}` });
  const html = page.json.html;
  assert.match(html, /Maya's season/); assert.match(html, /Fall &lt;Classic&gt;/); assert.match(html, /35\.600/); assert.match(html, /Turkey Inv/); assert.match(html, /noindex/);
  assert.doesNotMatch(html, /SECRET123/); assert.doesNotMatch(html, /999/);
  r = await call(ROUTES["share/link"], { token: "tp", body: { gymnastId: "gp", enable: false } }); assert.equal(r.json.url, null);
  const off = await call(ROUTES.share, { method: "GET", url: `/api/share?k=${key}` }); assert.match(off.json.html, /no longer shared/);
});

test("share page pauses if the family's plan lapses; bad keys rejected", async () => {
  const r = await call(ROUTES["share/link"], { token: "tp", body: { gymnastId: "gp" } }); const key = new URL(r.json.url).searchParams.get("k");
  T.profiles[0].subscription_status = "canceled";
  let p = await call(ROUTES.share, { method: "GET", url: `/api/share?k=${key}` }); assert.match(p.json.html, /paused/);
  p = await call(ROUTES.share, { method: "GET", url: `/api/share?k=x` }); assert.match(p.json.html, /isn't valid/);
});

test("AI coach sees training hours, pain flags and qualifying targets", async () => {
  await call(ROUTES["ai/coach"], { token: "tx", body: { gymnastId: "gx", messages: [{ role: "user", content: "hi" }] } });
  const sys = sent[0].system;
  assert.match(sys, /1\.5 hours/); assert.match(sys, /Pain reported 1 time/); assert.match(sys, /Shoulder/); assert.match(sys, /Champs cut: 50 Free ≤ 33\.49/);
});
