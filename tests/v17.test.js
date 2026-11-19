// v17.2: families can hide an athlete from public name search.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { isHidden } from "../server/routes/live.js";

let T;
beforeEach(() => {
  T = {
    profiles: [{ id: "p1", email: "mom@x.com", subscription_status: "active", subscription_tier: "basic" }],
    gymnasts: [{ id: "k1", user_id: "p1", name: "Maya", level: "Level 5", program: "WAG", club: "Tidal Gym", hide_search: false }],
    meet_listings: [{ id: "M1", owner_id: "p1", name: "Queen City Classic", sport: "Gymnastics", start_date: "2026-11-14", location: "Charlotte, NC", status: "draft", ticket_types: [], sessions: [], updates: [], live_enabled: true, live_status: "live", branding: {}, sponsors: [] }],
    live_scores: [
      { id: "s1", listing_id: "M1", source: "official", name: "Maya Patel", gym: "Tidal Gym", level: "Level 5", scores: {}, aa: 37.1 },
      { id: "s2", listing_id: "M1", source: "official", name: "Maya Brown", gym: "Other Gym", level: "Level 5", scores: {}, aa: 36.0 },
    ], live_follows: [], scores: [],
  };
  deps.supabase = () => fakeSupabase(T, { p1: { id: "p1", email: "mom@x.com" } });
  deps.now = () => new Date("2026-11-14T16:00:00Z");
});

test("hidden athlete no longer appears in public name search; others still do", async () => {
  let r = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?q=maya" });
  assert.deepEqual(r.json.athletes.map((a) => a.name).sort(), ["Maya Brown", "Maya Patel"]);
  Object.assign(T.gymnasts[0], { hide_search: true, search_name: "Maya Patel" });
  r = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?q=maya" });
  assert.deepEqual(r.json.athletes.map((a) => a.name), ["Maya Brown"], "only the hidden Maya disappears");
  r = await call(ROUTES["live/list"], { method: "GET", url: "/api/live/list?q=patel" });
  assert.equal(r.json.athletes.length, 0);
});

test("isHidden matching: full name, last initial, first name + gym; never hides other gyms' kids by first name alone", () => {
  const H = (name, club = "") => [{ name: name.toLowerCase(), club: club.toLowerCase() }];
  assert.ok(isHidden({ name: "Maya Patel", gym: "X" }, H("maya patel")));
  assert.ok(isHidden({ name: "Maya P.", gym: "" }, H("maya patel")));
  assert.ok(isHidden({ name: "Maya", gym: "Tidal Gym" }, H("maya", "tidal gym")));
  assert.ok(!isHidden({ name: "Maya", gym: "Other Gym" }, H("maya", "tidal gym")));
  assert.ok(!isHidden({ name: "Maya Brown", gym: "Tidal Gym" }, H("maya patel")));
  assert.ok(!isHidden({ name: "Maya Smith", gym: "Other" }, H("maya")), "first name only + no club never hides");
  assert.ok(!isHidden({ name: "Maya P.", gym: "Other Gym" }, H("maya patel", "tidal gym")), "same initial at another gym stays");
});

test("sign-up: the confirmation link in the email still works (no later update cancels it)", async () => {
  const mails = []; Object.assign(process.env, { SENDGRID_API_KEY: "sg", EMAIL_FROM: "hi@athleteorbit.org", APP_URL: "https://athleteorbit.org" }); delete process.env.SMTP_HOST; delete process.env.EMAIL_CONFIRM;
  deps.fetch = async (url, o) => { if (String(url).includes("sendgrid")) { mails.push(JSON.parse(o.body)); return { ok: true, status: 202, text: async () => "" }; } throw new Error("unexpected " + url); };
  const tokenIn = (m) => /token_hash=([\w]+)/.exec(JSON.stringify(m))[1];
  // 1) brand-new family
  let r = await call(ROUTES["auth/register"], { body: { email: "fresh@x.com", password: "Gymnast2026", username: "freshdad", full_name: "Fresh Dad", adult: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(tokenIn(mails.at(-1)), T._valid.new1, "the emailed link is the one Supabase still holds");
  // 2) signing up again on an old, never-confirmed account (new password wins, and the new link works)
  T.profiles.push({ id: "old1", email: "old@x.com", username: "olddad", _unconfirmed: true, created_at: "2026-11-01T00:00:00Z" });
  r = await call(ROUTES["auth/register"], { body: { email: "old@x.com", password: "NewPass2026", username: "olddad", full_name: "Old Dad", adult: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(T._passwords.old1, "NewPass2026");
  assert.equal(tokenIn(mails.at(-1)), T._valid.old1, "link made after the password update");
});
