// v19: Floor Music — level-wide + per-athlete music, girls only, meet music table (organizer / private link / gym).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { deskKey } from "../server/routes/music.js";

let T;
beforeEach(() => {
  Object.assign(process.env, { APP_URL: "https://athleteorbit.org", LINK_SECRET: "s" });
  T = {
    profiles: [{ id: "gymowner", email: "g@x.com", account_type: "gym" }, { id: "org", email: "o@x.com", account_type: "gym" }, { id: "mom", email: "m@x.com", club_id: "c1" }, { id: "solo", email: "s@x.com" }],
    clubs: [{ id: "c1", name: "Carolina Flips", code: "CAROLI-ABC123", owner_id: "gymowner" }, { id: "c2", name: "Queen City Flyers", code: "QUEENC-XYZ789", owner_id: "other" }],
    club_roster: [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, club_id: "c1", name: `Girl ${i}`, level: "Level 3", program: "WAG", gender: "F", sport: "Gymnastics" })),
      { id: "maya", club_id: "c1", name: "Maya Patel", level: "Level 4", program: "WAG", gender: "F", sport: "Gymnastics" },
      { id: "liam", club_id: "c1", name: "Liam Ortiz", level: "Level 4", program: "MAG", gender: "M", sport: "Gymnastics" },
      { id: "ava", club_id: "c2", name: "Ava Ruiz", level: "Level 3", program: "WAG", gender: "F", sport: "Gymnastics" },
    ],
    gymnasts: [{ id: "g1", user_id: "mom", name: "Maya", roster_id: "maya", level: "Level 4", program: "WAG", sport: "Gymnastics" }, { id: "g2", user_id: "solo", name: "Ella", level: "Level 5", program: "WAG", sport: "Gymnastics" }, { id: "g3", user_id: "solo", name: "Leo", level: "Level 5", program: "MAG", sport: "Gymnastics" }],
    floor_music: [], meet_listings: [{ id: "L1", owner_id: "org", name: "Holiday Flip Invitational", club_codes: ["CAROLI-ABC123"], attending_gyms: ["Carolina Flips", "Tidal Gym"] }],
  };
  deps.supabase = () => fakeSupabase(T, Object.fromEntries(T.profiles.map((p) => [p.id, { id: p.id, email: p.email }])));
});
const up = async (who, body = { type: "audio/mpeg", size: 3e6 }) => (await call(ROUTES["music/upload-url"], { token: who, body })).json.path;

test("one upload for Level 3 gives all 10 girls their music; boys never get floor music", async () => {
  const path = await up("gymowner");
  const r = await call(ROUTES.music, { token: "gymowner", body: { level: "Level 3", path, title: "Level 3 floor 2026-27", duration: 72 } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.athletes, 10);
  const g = await call(ROUTES.music, { method: "GET", token: "gymowner", url: "/api/music" });
  assert.equal(g.json.athletes.filter((a) => a.music?.title === "Level 3 floor 2026-27").length, 10);
  assert.ok(!g.json.athletes.some((a) => a.name === "Liam Ortiz"), "boys are not listed");
  assert.deepEqual(g.json.levels.map((l) => [l.level, l.girls]), [["Level 3", 10], ["Level 4", 1]]);
  assert.match(g.json.desk_url, /\/music\/gym-c1\?k=/);
});

test("an athlete's own routine music overrides her level's music, and replacing deletes the old file", async () => {
  await call(ROUTES.music, { token: "gymowner", body: { level: "Level 4", path: await up("gymowner"), title: "L4 team music" } });
  const p1 = await up("gymowner");
  await call(ROUTES.music, { token: "gymowner", body: { roster_id: "maya", path: p1, title: "Maya — Firebird" } });
  const p2 = await up("gymowner");
  await call(ROUTES.music, { token: "gymowner", body: { roster_id: "maya", path: p2, title: "Maya — Firebird (cut)" } });
  assert.ok(T._removed.includes(p1));
  const g = await call(ROUTES.music, { method: "GET", token: "gymowner", url: "/api/music" });
  assert.equal(g.json.athletes.find((a) => a.name === "Maya Patel").music.title, "Maya — Firebird (cut)");
  // Maya's mom sees the gym's music on her profile
  const fam = await call(ROUTES.music, { method: "GET", token: "mom", url: "/api/music?gymnast=g1" });
  assert.equal(fam.json.music.title, "Maya — Firebird (cut)"); assert.equal(fam.json.from, "Carolina Flips");
  // can't attach music to a boy or to another gym's athlete
  assert.equal((await call(ROUTES.music, { token: "gymowner", body: { roster_id: "liam", path: await up("gymowner") } })).status, 404);
  assert.equal((await call(ROUTES.music, { token: "gymowner", body: { roster_id: "ava", path: await up("gymowner") } })).status, 404);
});

test("families whose gym isn't on AthleteOrbit add their own girl's music; not for boys", async () => {
  const path = await up("solo", { type: "audio/x-m4a", size: 1e6 });
  assert.match(path, /\.m4a$/);
  await call(ROUTES.music, { token: "solo", body: { gymnast_id: "g2", path, title: "Ella floor" } });
  assert.equal((await call(ROUTES.music, { method: "GET", token: "solo", url: "/api/music?gymnast=g2" })).json.music.title, "Ella floor");
  assert.equal((await call(ROUTES.music, { method: "GET", token: "solo", url: "/api/music?gymnast=g3" })).json.eligible, false);
  assert.equal((await call(ROUTES.music, { token: "mom", body: { gymnast_id: "g2", path } })).status, 404, "not your athlete");
  assert.equal((await call(ROUTES["music/upload-url"], { token: "solo", body: { type: "video/mp4", name: "x.mp4" } })).status, 400);
  assert.equal((await call(ROUTES["music/upload-url"], { token: "solo", body: { type: "audio/mpeg", size: 30e6 } })).status, 400);
});

test("meet music table: attending gyms' girls with signed music links — organizer, private link, nobody else", async () => {
  await call(ROUTES.music, { token: "gymowner", body: { level: "Level 3", path: await up("gymowner"), title: "L3" } });
  const org = await call(ROUTES["music/desk"], { method: "GET", token: "org", url: "/api/music/desk?id=L1" });
  assert.equal(org.status, 200, JSON.stringify(org.json));
  assert.equal(org.json.counts.athletes, 11); assert.equal(org.json.counts.ready, 10);
  assert.match(org.json.athletes.find((a) => a.name === "Girl 0").music.url, /^https:\/\/store\/music\/.+exp=43200/);
  assert.deepEqual(org.json.notOnApp, ["Tidal Gym"]);
  const vol = await call(ROUTES["music/desk"], { method: "GET", url: `/api/music/desk?id=L1&k=${deskKey("L1")}` });
  assert.equal(vol.status, 200);
  assert.equal((await call(ROUTES["music/desk"], { method: "GET", url: "/api/music/desk?id=L1&k=bad" })).status, 401);
  assert.equal((await call(ROUTES["music/desk"], { method: "GET", token: "mom", url: "/api/music/desk?id=L1" })).status, 403);
  // a gym's own table (home meet / practice)
  assert.equal((await call(ROUTES["music/desk"], { method: "GET", token: "gymowner", url: "/api/music/desk?id=gym-c1" })).json.counts.athletes, 11);
  assert.equal((await call(ROUTES["music/desk"], { method: "GET", token: "org", url: "/api/music/desk?id=gym-c1" })).status, 403);
  // organizer's event list hands out the music table link
  const list = await call(ROUTES["tickets/organizer"], { method: "GET", token: "org" });
  assert.match(list.json.listings[0].music_url, /\/music\/L1\?k=/);
});
