// v20: Coach OS — attendance, results history & trends, score-sheet reading, evaluations/plans with parent visibility,
// AI drafts and assistant grounded in the coach's data, command center, parent portal.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { analyze, matchName } from "../server/routes/coach.js";

let T, ai;
beforeEach(() => {
  Object.assign(process.env, { APP_URL: "https://athleteorbit.org", ANTHROPIC_API_KEY: "k", AI_PROVIDER: "anthropic" });
  ai = [];
  deps.fetch = async (url, o) => { if (String(url).includes("anthropic")) { const body = JSON.parse(o.body); ai.push(body); return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: deps.aiReply(body) }] }) }; } throw new Error("unexpected " + url); };
  deps.aiReply = () => "{}";
  T = {
    profiles: [{ id: "coach", email: "c@x.com", account_type: "gym" }, { id: "mom", email: "m@x.com", club_id: "c1", subscription_status: "active" }, { id: "dad", email: "d@x.com", club_id: "c1", subscription_status: "trialing" }, { id: "other", email: "o@x.com", account_type: "gym" }],
    clubs: [{ id: "c1", name: "Carolina Flips", code: "CAROLI-ABC123", owner_id: "coach", sport: "Gymnastics" }, { id: "c2", name: "Other", owner_id: "other" }],
    club_roster: [
      { id: "maya", club_id: "c1", name: "Maya Patel", level: "Level 4", gender: "F", group_name: "L4 Team" },
      { id: "zara", club_id: "c1", name: "Zara Moore", level: "Level 4", gender: "F", group_name: "L4 Team" },
      { id: "liam", club_id: "c1", name: "Liam Ortiz", level: "Level 4", gender: "M" },
    ],
    gymnasts: [{ id: "g1", user_id: "mom", name: "Maya", roster_id: "maya" }],
    coach_attendance: [], coach_results: [], coach_feedback: [], club_meets: [], club_messages: [], ai_usage: [],
  };
  deps.supabase = () => fakeSupabase(T, Object.fromEntries(T.profiles.map((p) => [p.id, { id: p.id, email: p.email }])));
  deps.now = () => new Date("2026-11-20T15:00:00Z");
});
const meet = (rid, name, date, s) => ({ roster_id: rid, meet_name: name, meet_date: date, scores: s });

test("analyze: per-event best, change, weakest event and trend (higher is better; times lower is better)", () => {
  const a = analyze([{ meet_date: "2026-10-01", scores: { Vault: 9.0, Bars: 8.5, Beam: 9.1, Floor: 9.0 } }, { meet_date: "2026-11-01", scores: { Vault: 9.3, Bars: 8.4, Beam: 9.2, Floor: 9.1 } }], "Gymnastics");
  assert.equal(a.events.Vault.best, 9.3); assert.equal(a.events.Bars.change, -0.1); assert.equal(a.weakest, "Bars"); assert.equal(a.improving, true);
  const s = analyze([{ meet_date: "2026-10-01", scores: { Time: 35.2 } }, { meet_date: "2026-11-01", scores: { Time: 34.1 } }], "Swimming");
  assert.equal(s.events.Time.best, 34.1); assert.equal(s.improving, true);
});

test("attendance: roll call saves, re-marks, clears; another coach can't touch it", async () => {
  let r = await call(ROUTES["coach/attendance"], { token: "coach", body: { day: "2026-11-20", marks: [{ roster_id: "maya", status: "present" }, { roster_id: "zara", status: "absent" }, { roster_id: "nope", status: "present" }] } });
  assert.equal(r.json.saved, 2);
  await call(ROUTES["coach/attendance"], { token: "coach", body: { day: "2026-11-20", marks: [{ roster_id: "zara", status: "late" }] } });
  const g = await call(ROUTES["coach/attendance"], { method: "GET", token: "coach", url: "/api/coach/attendance?day=2026-11-20" });
  assert.deepEqual(g.json.athletes.map((a) => a.status), [null, "present", "late"]); // sorted: Liam, Maya, Zara
  await call(ROUTES["coach/attendance"], { token: "coach", body: { day: "2026-11-20", marks: [{ roster_id: "zara", status: null }] } });
  assert.equal(T.coach_attendance.length, 1);
  assert.equal((await call(ROUTES["coach/attendance"], { token: "coach", body: { day: "2026-12-25", marks: [] } })).status, 400, "no future days");
  assert.equal((await call(ROUTES["coach/attendance"], { token: "other", body: { day: "2026-11-20", marks: [{ roster_id: "maya", status: "absent" }] } })).json.saved, 0);
  assert.equal((await call(ROUTES["coach/attendance"], { method: "GET", token: "mom", url: "/api/coach/attendance" })).status, 403);
});

test("results: only the athlete's own events are kept; re-saving a meet updates it; history + PBs on the profile", async () => {
  await call(ROUTES["coach/results"], { token: "coach", body: { rows: [meet("maya", "Turkey Invitational", "2026-11-14", { Vault: "9.3", Bars: 9.05, Beam: 9.425, Floor: 9.275, Rings: 9 })] } });
  await call(ROUTES["coach/results"], { token: "coach", body: { rows: [meet("maya", "Fall Classic", "2026-10-10", { Vault: 9.0, Bars: 9.2, Beam: 9.0, Floor: 9.1 })] } });
  await call(ROUTES["coach/results"], { token: "coach", body: { rows: [meet("maya", "Turkey Invitational", "2026-11-14", { Vault: 9.35, Bars: 9.05, Beam: 9.425, Floor: 9.275 })] } });
  assert.equal(T.coach_results.length, 2);
  assert.ok(!("Rings" in T.coach_results[0].scores), "women's events only");
  const p = await call(ROUTES["coach/athlete"], { method: "GET", token: "coach", url: "/api/coach/athlete?id=maya" });
  assert.deepEqual(p.json.events, ["Vault", "Bars", "Beam", "Floor"]);
  assert.deepEqual(p.json.results.map((x) => x.meet_name), ["Fall Classic", "Turkey Invitational"]);
  assert.equal(p.json.results[1].aa, 37.1);
  assert.equal(p.json.analysis.events.Bars.change, -0.15); assert.equal(p.json.analysis.events.Vault.pbLast, true);
  assert.equal(p.json.athlete.family_linked, true);
  assert.equal((await call(ROUTES["coach/athlete"], { method: "GET", token: "other", url: "/api/coach/athlete?id=maya" })).status, 404);
});

test("score sheet photo: AI reads it, names are matched to the roster, nothing saved until the coach confirms", async () => {
  deps.aiReply = () => JSON.stringify({ meet_name: "Turkey Invitational", meet_date: "2026-11-14", level: "Level 4", rows: [{ name: "Ava Ruiz", gym: "Queen City", scores: { Vault: 9.35 }, aa: 37.25, place: 1 }, { name: "Maya Patel", gym: "Carolina Flips", scores: { Vault: 9.3, Bars: 9.05 }, aa: 37.05, place: 2 }, { name: "ZARA MOORE", scores: { Vault: 9 }, place: 4 }] });
  const r = await call(ROUTES["coach/scorecard"], { token: "coach", body: { image: "data:image/png;base64,iVBORw0KGgo=" } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.mine, 2);
  assert.deepEqual(r.json.rows.map((x) => x.roster_id), [null, "maya", "zara"]);
  assert.equal(T.coach_results.length, 0);
  assert.equal(ai[0].messages[0].content[0].type, "image");
  assert.equal((await call(ROUTES["coach/scorecard"], { token: "coach", body: { image: "data:text/html;base64,xx" } })).status, 400);
  assert.equal(matchName("Maya P.", T.club_roster)?.id, "maya");
});

test("evaluations & plans: private by default; parents see only what the coach publishes to parents", async () => {
  await call(ROUTES["coach/notes"], { token: "coach", body: { roster_id: "maya", kind: "evaluation", ratings: { Technique: 4, Consistency: 7, Bogus: 3 }, strengths: "Beam confidence", weaknesses: "Kip timing" } });
  assert.deepEqual(T.coach_feedback[0].ratings, { Technique: 4, Consistency: 5 }); assert.equal(T.coach_feedback[0].visibility, "private");
  const p = await call(ROUTES["coach/notes"], { token: "coach", body: { roster_id: "maya", kind: "plan", visibility: "parent", plan: { focus: "Bars kip", target: "Kip in 3 of 5 turns", review_date: "2026-12-20", goals: [{ text: "Glide swings x10", drills: "Strap bar" }] } } });
  assert.equal(T.coach_feedback[1].status, "draft");
  let fam = await call(ROUTES["coach/family"], { method: "GET", token: "mom", url: "/api/coach/family?gymnast=g1" });
  assert.equal(fam.json.feedback.length, 0, "private evaluation and draft plan stay hidden");
  await call(ROUTES["coach/notes"], { token: "coach", body: { id: p.json.id, status: "published" } });
  fam = await call(ROUTES["coach/family"], { method: "GET", token: "mom", url: "/api/coach/family?gymnast=g1" });
  assert.equal(fam.json.feedback.length, 1); assert.equal(fam.json.feedback[0].plan.focus, "Bars kip"); assert.equal(fam.json.gym, "Carolina Flips");
  assert.equal((await call(ROUTES["coach/family"], { method: "GET", token: "dad", url: "/api/coach/family?gymnast=g1" })).json.linked, false, "not their athlete");
  assert.equal((await call(ROUTES["coach/notes"], { token: "other", body: { id: p.json.id, status: "archived" } })).status, 404);
});

test("AI plan draft & assistant use the coach's data, return drafts, and flag what's missing", async () => {
  await call(ROUTES["coach/results"], { token: "coach", body: { rows: [meet("maya", "Fall Classic", "2026-10-10", { Vault: 9.0, Bars: 8.6, Beam: 9.0, Floor: 9.1 })] } });
  deps.aiReply = () => JSON.stringify({ focus: "Bars", current: "8.6", target: "9.0", review_date: "2026-12-28", goals: [{ text: "Cast to horizontal", drills: "Panel cast drill" }], missing: "Only one meet recorded" });
  const d = await call(ROUTES["coach/draft"], { token: "coach", body: { roster_id: "maya", kind: "plan", observations: "Kip is late" } });
  assert.equal(d.json.draft.plan.focus, "Bars"); assert.equal(d.json.missing, "Only one meet recorded");
  assert.equal(T.coach_feedback.length, 0, "drafts are not saved automatically");
  assert.match(JSON.stringify(ai.at(-1).messages), /Kip is late/); assert.match(ai.at(-1).system, /medical/);
  deps.aiReply = () => JSON.stringify({ answer: "- Zara missed 3 practices", athletes: ["zara", "ghost"], missing: null });
  const a = await call(ROUTES["coach/ask"], { token: "coach", body: { question: "Who missed practices?" } });
  assert.deepEqual(a.json.athletes, ["zara"]);
});

test("command center: counts, attention list, improved athletes, ambassador numbers", async () => {
  for (const d of ["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12"]) await call(ROUTES["coach/attendance"], { token: "coach", body: { day: d, marks: [{ roster_id: "zara", status: "absent" }, { roster_id: "maya", status: "present" }] } });
  await call(ROUTES["coach/results"], { token: "coach", body: { rows: [meet("maya", "A", "2026-10-01", { Vault: 9, Bars: 9, Beam: 9, Floor: 9 }), meet("maya", "B", "2026-11-01", { Vault: 9.2, Bars: 9.1, Beam: 9.1, Floor: 9.2 })] } });
  const d = await call(ROUTES["coach/dashboard"], { method: "GET", token: "coach" });
  assert.equal(d.json.counts.athletes, 3);
  assert.ok(d.json.attention.find((x) => x.id === "zara").why.some((w) => /missed 4/.test(w)));
  assert.equal(d.json.improved[0].id, "maya");
  assert.equal(d.json.attendance.rate14, 50);
  const amb = await call(ROUTES["coach/ambassador"], { method: "GET", token: "coach" });
  assert.deepEqual([amb.json.families, amb.json.paying, amb.json.trialing], [2, 1, 1]);
});

test("a partial result (fewer events) doesn't count as a drop", () => {
  const a = analyze([{ meet_date: "2026-10-01", scores: { Floor: 9, Vault: 9, Rings: 9 } }, { meet_date: "2026-11-01", scores: { Floor: 9.1, Vault: 9.2 } }], "Gymnastics");
  assert.equal(a.trend, null); assert.equal(a.bigDrop, false);
});
