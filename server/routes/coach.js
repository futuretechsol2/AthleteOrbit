// Coach OS: everything a coach does with her athletes in one place — roll call, meet results (typed or read from a
// photo of the score sheet), event-by-event history, evaluations, development plans, progress reports, and an
// assistant that answers questions from the coach's own data. Parents only ever see what the coach publishes.
import { handler, readJson, requireUser, deps, HttpError, todayIn, callClaude, extractJson, imageBlock, useQuota } from "../lib.js";
const aiReady = () => !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
import { eventsFor, lowerBetter, totalOf } from "../../src/data/live.js";
import { analyze, num } from "../../src/data/coach.js";
export { analyze };

const str = (v, n = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = ["present", "absent", "late", "excused"];
const VIS = ["private", "staff", "parent"];
const KINDS = ["note", "evaluation", "plan", "report"];
export const RATINGS = ["Technique", "Strength & flexibility", "Consistency", "Training effort", "Competition mindset"];

async function myClub(userId) {
  const { data } = await deps.supabase().from("clubs").select("*").eq("owner_id", userId);
  if (!data?.[0]) throw new HttpError(403, "This is for coach and gym accounts.");
  return data[0];
}
async function rosterOf(club) {
  const { data } = await deps.supabase().from("club_roster").select("*").eq("club_id", club.id);
  return (data || []).sort((a, b) => (a.level || "").localeCompare(b.level || "", undefined, { numeric: true }) || a.name.localeCompare(b.name));
}
const sportOf = (r, club) => r.sport || club.sport || "Gymnastics";
const daysAgo = (n) => { const d = new Date(deps.now()); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function loadAll(club) {
  const sb = deps.supabase();
  const [roster, { data: att }, { data: res }, { data: notes }] = await Promise.all([
    rosterOf(club),
    sb.from("coach_attendance").select("*").eq("club_id", club.id).gte("day", daysAgo(60)),
    sb.from("coach_results").select("*").eq("club_id", club.id),
    sb.from("coach_feedback").select("*").eq("club_id", club.id),
  ]);
  return { roster, att: att || [], res: res || [], notes: notes || [] };
}
function attendanceStats(att, rosterId, since) {
  const mine = att.filter((a) => a.roster_id === rosterId && a.day >= since);
  const missed = mine.filter((a) => a.status === "absent").length;
  const counted = mine.filter((a) => a.status !== "excused").length;
  return { marked: mine.length, missed, rate: counted ? Math.round((mine.filter((a) => a.status === "present" || a.status === "late").length / counted) * 100) : null };
}
function athleteSummary(club, r, all) {
  const sport = sportOf(r, club);
  const results = all.res.filter((x) => x.roster_id === r.id);
  const a = analyze(results, sport);
  const att = attendanceStats(all.att, r.id, daysAgo(30));
  const evals = all.notes.filter((n) => n.roster_id === r.id && n.kind === "evaluation").sort((x, y) => (x.created_at > y.created_at ? -1 : 1));
  const plan = all.notes.find((n) => n.roster_id === r.id && n.kind === "plan" && n.status !== "archived");
  return { id: r.id, name: r.name, level: r.level, group: r.group_name, sport, gender: r.gender, meets: results.length, last_total: a.totals.at(-1) ?? null, trend: a.trend, improving: a.improving, declining: a.declining, bigDrop: a.bigDrop, weakest: a.weakest,
    attendance: att, last_eval: evals[0]?.created_at || null, plan: plan ? { id: plan.id, status: plan.status, review: plan.plan?.review_date || null } : null };
}
function attentionReasons(s, today) {
  const why = [];
  if (s.attendance.missed >= 3) why.push(`missed ${s.attendance.missed} practices in 30 days`);
  if (s.bigDrop) why.push(`total down ${Math.abs(s.trend)} at the last meet`);
  if (!s.last_eval || s.last_eval.slice(0, 10) < daysAgo(60)) why.push(s.last_eval ? "no evaluation in 60+ days" : "never evaluated");
  if (s.plan?.review && s.plan.review <= today) why.push("plan review is due");
  return why;
}

// ---------- Command center ----------
export const dashboard = handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  const sb = deps.supabase(), today = todayIn();
  const all = await loadAll(club);
  const sums = all.roster.map((r) => athleteSummary(club, r, all));
  const todayAtt = all.att.filter((a) => a.day === today);
  const last14 = all.att.filter((a) => a.day >= daysAgo(14) && a.status !== "excused");
  const [{ data: meets }, { data: msgs }] = await Promise.all([
    sb.from("club_meets").select("id,name,start_date,location,levels,status").eq("club_id", club.id).gte("start_date", today),
    sb.from("club_messages").select("id,sender,read_by_gym").eq("club_id", club.id),
  ]);
  const attention = sums.map((s) => ({ ...s, why: attentionReasons(s, today) })).filter((s) => s.why.some((w) => !/evaluat/.test(w)) || s.why.length >= 2)
    .sort((a, b) => b.why.length - a.why.length).slice(0, 8);
  const improved = sums.filter((s) => s.improving).sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend)).slice(0, 5);
  const groups = [...new Set(all.roster.map((r) => r.group_name || r.level).filter(Boolean))];
  return {
    club: { name: club.name, sport: club.sport || "Gymnastics", code: club.code },
    counts: { athletes: all.roster.length, groups: groups.length, meets: (meets || []).filter((m) => m.status !== "suggested").length,
      pendingEvals: sums.filter((s) => !s.last_eval || s.last_eval.slice(0, 10) < daysAgo(60)).length,
      unread: (msgs || []).filter((m) => m.sender === "family" && !m.read_by_gym).length,
      drafts: all.notes.filter((n) => n.status === "draft").length },
    attendance: { today: { marked: todayAtt.length, present: todayAtt.filter((a) => a.status === "present" || a.status === "late").length },
      rate14: last14.length ? Math.round((last14.filter((a) => a.status === "present" || a.status === "late").length / last14.length) * 100) : null },
    upcoming: (meets || []).filter((m) => m.status !== "suggested").sort((a, b) => (a.start_date > b.start_date ? 1 : -1)).slice(0, 4),
    attention: attention.map(({ id, name, level, why }) => ({ id, name, level, why })),
    improved: improved.map(({ id, name, level, trend }) => ({ id, name, level, trend })),
    milestones: sums.filter((s) => s.plan?.review && s.plan.review >= today && s.plan.review <= daysAgo(-14)).map(({ id, name, plan }) => ({ id, name, review: plan.review })),
  };
});

// ---------- Athletes list with summaries ----------
export const athletes = handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  const all = await loadAll(club);
  return { athletes: all.roster.map((r) => athleteSummary(club, r, all)), ratings: RATINGS };
});

// ---------- One athlete: everything ----------
export const athlete = handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  const id = new URL(req.url || "/", "http://x").searchParams.get("id");
  const all = await loadAll(club);
  const r = all.roster.find((x) => x.id === id);
  if (!r) throw new HttpError(404, "Athlete not found.");
  const sport = sportOf(r, club);
  const results = all.res.filter((x) => x.roster_id === r.id).sort((a, b) => (a.meet_date > b.meet_date ? 1 : -1));
  const { data: fams } = await deps.supabase().from("gymnasts").select("id").eq("roster_id", r.id);
  return {
    athlete: { ...athleteSummary(club, r, all), parent_email: r.parent_email, family_linked: !!fams?.length },
    events: eventsFor(sport, r.gender), lowerBetter: lowerBetter(sport),
    results: results.map((x) => ({ id: x.id, meet_name: x.meet_name, meet_date: x.meet_date, level: x.level, scores: x.scores || {}, aa: x.aa ?? totalOf(x.scores, sport), place: x.place, source: x.source })),
    analysis: analyze(results, sport),
    attendance: { last30: attendanceStats(all.att, r.id, daysAgo(30)), history: all.att.filter((a) => a.roster_id === r.id).sort((a, b) => (a.day > b.day ? -1 : 1)).slice(0, 40).map(({ day, status }) => ({ day, status })) },
    notes: all.notes.filter((n) => n.roster_id === r.id).sort((a, b) => (a.created_at > b.created_at ? -1 : 1)),
    ratings: RATINGS,
  };
});

// ---------- Attendance ----------
// GET ?day=YYYY-MM-DD → roster with today's marks. POST { day, marks: [{ roster_id, status }] }.
export const attendance = handler(["GET", "POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  const sb = deps.supabase();
  if (req.method === "GET") {
    const sp = new URL(req.url || "/", "http://x").searchParams; const day = DAY.test(sp.get("day") || "") ? sp.get("day") : todayIn();
    const roster = await rosterOf(club);
    const { data } = await sb.from("coach_attendance").select("*").eq("club_id", club.id).eq("day", day);
    const { data: recent } = await sb.from("coach_attendance").select("*").eq("club_id", club.id).gte("day", daysAgo(30));
    const by = new Map((data || []).map((a) => [a.roster_id, a.status]));
    return { day, athletes: roster.map((r) => ({ id: r.id, name: r.name, level: r.level, group: r.group_name, status: by.get(r.id) || null, last30: attendanceStats(recent || [], r.id, daysAgo(30)) })) };
  }
  const b = await readJson(req);
  if (!DAY.test(b.day || "")) throw new HttpError(400, "Pick a practice day.");
  if (b.day > daysAgo(-1)) throw new HttpError(400, "You can't take attendance for a future day.");
  const ids = new Set((await rosterOf(club)).map((r) => r.id));
  const marks = (Array.isArray(b.marks) ? b.marks : []).filter((m) => ids.has(m.roster_id)).slice(0, 500);
  for (const m of marks) {
    if (m.status === null) { await sb.from("coach_attendance").delete().eq("club_id", club.id).eq("roster_id", m.roster_id).eq("day", b.day); continue; }
    if (!STATUS.includes(m.status)) continue;
    const { error } = await sb.from("coach_attendance").upsert({ club_id: club.id, roster_id: m.roster_id, day: b.day, status: m.status }, { onConflict: "roster_id,day" });
    if (error) throw error;
  }
  return { saved: marks.length };
});

// ---------- Results ----------
// POST { rows: [{ roster_id, meet_name, meet_date, level, scores: {Vault: 9.1, …}, place }] } | { remove: id }
export const results = handler(["GET", "POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  const sb = deps.supabase();
  if (req.method === "GET") {
    const { data } = await sb.from("coach_results").select("*").eq("club_id", club.id);
    const meets = [...new Map((data || []).map((x) => [`${x.meet_date}|${x.meet_name}`, { meet_name: x.meet_name, meet_date: x.meet_date }])).values()].sort((a, b) => (a.meet_date > b.meet_date ? -1 : 1));
    return { meets, results: data || [] };
  }
  const b = await readJson(req);
  if (b.remove) { await sb.from("coach_results").delete().eq("id", b.remove).eq("club_id", club.id); return { removed: true }; }
  const roster = await rosterOf(club), byId = new Map(roster.map((r) => [r.id, r]));
  let saved = 0;
  for (const row of (Array.isArray(b.rows) ? b.rows : []).slice(0, 300)) {
    const r = byId.get(row.roster_id); if (!r) continue;
    const meet = str(row.meet_name, 120), date = DAY.test(row.meet_date || "") ? row.meet_date : null;
    if (!meet || !date) throw new HttpError(400, "Each result needs a meet name and date.");
    const allowed = eventsFor(sportOf(r, club), r.gender);
    const scores = {}; for (const e of allowed) { const v = num(row.scores?.[e]); if (v != null && v >= 0 && v < 10000) scores[e] = v; }
    if (!Object.keys(scores).length && num(row.aa) == null) continue;
    const rec = { club_id: club.id, roster_id: r.id, meet_name: meet, meet_date: date, level: str(row.level, 40) || r.level, scores, aa: num(row.aa) ?? totalOf(scores, sportOf(r, club)), place: num(row.place), source: ["scorecard", "manual"].includes(row.source) ? row.source : "manual", updated_at: deps.now().toISOString() };
    const { error } = await sb.from("coach_results").upsert(rec, { onConflict: "roster_id,meet_name,meet_date" }); if (error) throw error;
    saved++;
  }
  return { saved };
});

// Score sheet photo → rows matched to the roster. Nothing is saved: the coach checks and edits, then saves.
const SHEET = `You read youth sports competition score sheets (gymnastics, cheer, swim, etc.) from a photo or scan.
Return ONLY JSON: {"meet_name": string|null, "meet_date": "YYYY-MM-DD"|null, "level": string|null, "rows":[{"name": string, "gym": string|null, "scores": {"<event>": number}, "aa": number|null, "place": number|null}]}
Rules: copy exactly what is printed; never guess a number you cannot read (leave it out). Event names for women's gymnastics: Vault, Bars, Beam, Floor; men's: Floor, Pommel, Rings, Vault, P-Bars, High Bar. For swimming times use seconds. "aa" = all-around / total.`;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
export function matchName(name, roster) {
  const n = norm(name); if (!n) return null;
  const exact = roster.find((r) => norm(r.name) === n); if (exact) return exact;
  const [f, ...rest] = n.split(" "), l = rest.at(-1);
  const cands = roster.filter((r) => { const [rf, ...rr] = norm(r.name).split(" "); return rf === f && (!l || !rr.length || rr.at(-1)?.[0] === l[0]); });
  return cands.length === 1 ? cands[0] : null;
}
export const scorecard = handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  if (!aiReady()) throw new HttpError(503, "Reading score sheets isn't switched on yet.");
  const b = await readJson(req);
  await useQuota(user.id, "scoresheet");
  if (!/^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/.test(b.image || "")) throw new HttpError(400, "Upload a photo (JPG/PNG) or PDF of the score sheet.");
  const text = await callClaude({ system: SHEET, maxTokens: 3000, messages: [{ role: "user", content: [imageBlock(b.image), { type: "text", text: "Read every athlete's results on this score sheet." }] }] });
  let j; try { j = extractJson(text); } catch { throw new HttpError(422, "We couldn't read that sheet. Try a sharper, straight-on photo."); }
  const roster = await rosterOf(club);
  const rows = (Array.isArray(j?.rows) ? j.rows : []).slice(0, 300).map((x) => {
    const m = matchName(x.name, roster);
    return { name: str(x.name, 80), gym: str(x.gym, 80), scores: Object.fromEntries(Object.entries(x.scores || {}).map(([k, v]) => [k, num(v)]).filter(([, v]) => v != null)), aa: num(x.aa), place: num(x.place), roster_id: m?.id || null, matched: m?.name || null };
  }).filter((x) => x.name);
  return { meet_name: str(j?.meet_name, 120), meet_date: DAY.test(j?.meet_date || "") ? j.meet_date : null, level: str(j?.level, 40), rows, mine: rows.filter((x) => x.roster_id).length };
});

// ---------- Notes, evaluations, plans, reports ----------
// POST { roster_id, kind, visibility, body, ratings, strengths, weaknesses, next_steps, plan, status } | { id, …patch } | { remove: id }
export const notes = handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  const sb = deps.supabase();
  const b = await readJson(req);
  if (b.remove) { await sb.from("coach_feedback").delete().eq("id", b.remove).eq("club_id", club.id); return { removed: true }; }
  const clean = (x) => {
    const o = {};
    if (x.visibility !== undefined) o.visibility = VIS.includes(x.visibility) ? x.visibility : "private";
    if (x.body !== undefined) o.body = str(x.body, 4000);
    if (x.strengths !== undefined) o.strengths = str(x.strengths, 1000);
    if (x.weaknesses !== undefined) o.weaknesses = str(x.weaknesses, 1000);
    if (x.next_steps !== undefined) o.next_steps = str(x.next_steps, 1000);
    if (x.status !== undefined) o.status = ["draft", "published", "archived"].includes(x.status) ? x.status : "draft";
    if (x.ratings !== undefined) o.ratings = Object.fromEntries(RATINGS.map((k) => [k, Math.max(0, Math.min(5, Math.round(Number(x.ratings?.[k]) || 0)))]).filter(([, v]) => v > 0));
    if (x.plan !== undefined) {
      const p = x.plan || {};
      o.plan = { focus: str(p.focus, 200), current: str(p.current, 300), target: str(p.target, 300), review_date: DAY.test(p.review_date || "") ? p.review_date : null,
        goals: (Array.isArray(p.goals) ? p.goals : []).slice(0, 12).map((g) => ({ text: str(g.text, 300), drills: str(g.drills, 400), done: !!g.done })).filter((g) => g.text) };
    }
    return o;
  };
  if (b.id) {
    const { data: n } = await sb.from("coach_feedback").select("*").eq("id", b.id).eq("club_id", club.id).maybeSingle();
    if (!n) throw new HttpError(404, "Note not found.");
    const patch = { ...clean(b), updated_at: deps.now().toISOString() };
    if (patch.status === "published" && n.status !== "published") patch.published_at = deps.now().toISOString();
    await sb.from("coach_feedback").update(patch).eq("id", n.id);
    return { saved: true };
  }
  const roster = await rosterOf(club);
  if (!roster.some((r) => r.id === b.roster_id)) throw new HttpError(404, "Athlete not found.");
  if (!KINDS.includes(b.kind)) throw new HttpError(400, "Pick note, evaluation, plan or report.");
  const rec = { club_id: club.id, roster_id: b.roster_id, kind: b.kind, author_id: user.id, visibility: "private", status: b.kind === "note" || b.kind === "evaluation" ? "published" : "draft", ...clean(b) };
  if (rec.status === "published") rec.published_at = deps.now().toISOString();
  if (!rec.body && !rec.plan && !rec.strengths && !rec.weaknesses && !Object.keys(rec.ratings || {}).length) throw new HttpError(400, "Write something first.");
  const { data, error } = await sb.from("coach_feedback").insert(rec).select("id").maybeSingle(); if (error) throw error;
  return { saved: true, id: data?.id };
});

// ---------- AI: draft plan / progress report / answer questions — always drafts, always from the coach's data ----------
function athleteFacts(club, r, all) {
  const sport = sportOf(r, club);
  const res = all.res.filter((x) => x.roster_id === r.id).sort((a, b) => (a.meet_date > b.meet_date ? 1 : -1));
  const ev = all.notes.filter((n) => n.roster_id === r.id && (n.kind === "evaluation" || n.kind === "note")).slice(-6);
  return { name: r.name, level: r.level, sport, attendance30: attendanceStats(all.att, r.id, daysAgo(30)),
    results: res.map((x) => ({ meet: x.meet_name, date: x.meet_date, scores: x.scores, total: x.aa ?? totalOf(x.scores, sport), place: x.place })),
    analysis: analyze(res, sport), coach_feedback: ev.map((n) => ({ date: n.created_at?.slice(0, 10), kind: n.kind, ratings: n.ratings, strengths: n.strengths, weaknesses: n.weaknesses, next_steps: n.next_steps, note: n.body })) };
}
const SAFE = "Never diagnose injuries or give medical, nutrition or weight advice; if notes mention pain or injury, say the athlete should see a medical professional and keep the plan within the coach's judgment. Base every statement on the data given; when data is missing, say what is missing instead of guessing.";
export const draft = handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  if (!aiReady()) throw new HttpError(503, "AI drafting isn't switched on yet.");
  const b = await readJson(req);
  await useQuota(user.id, "coach");
  const all = await loadAll(club);
  const r = all.roster.find((x) => x.id === b.roster_id); if (!r) throw new HttpError(404, "Athlete not found.");
  const facts = athleteFacts(club, r, all), obs = str(b.observations, 1500);
  if (b.kind === "report") {
    const text = await callClaude({ system: `You write short, warm, specific progress reports from a youth sports coach to a parent. 120-180 words, plain language, no jargon, no rankings against teammates. Mention attendance only if notable. ${SAFE} Return ONLY JSON {"body": string}.`, maxTokens: 700,
      messages: [{ role: "user", content: `Athlete data: ${JSON.stringify(facts)}\nCoach's extra observations: ${obs || "none"}` }] });
    let j; try { j = extractJson(text); } catch { throw new HttpError(502, "Try again in a moment."); }
    return { draft: { kind: "report", body: str(j.body, 4000), visibility: "parent" } };
  }
  const text = await callClaude({ system: `You help a youth sports coach draft an individual development plan. ${SAFE} Use the athlete's weakest event/area from the data and the coach's observations. Return ONLY JSON {"focus": string, "current": string, "target": string, "review_date": "YYYY-MM-DD" (4-6 weeks from ${todayIn()}), "goals": [{"text": weekly goal, "drills": 1-2 specific drills}] (3-5 goals), "missing": string|null (data that would make the plan better)}`, maxTokens: 1200,
    messages: [{ role: "user", content: `Athlete data: ${JSON.stringify(facts)}\nCoach's observations: ${obs || "none"}` }] });
  let j; try { j = extractJson(text); } catch { throw new HttpError(502, "Try again in a moment."); }
  return { draft: { kind: "plan", plan: { focus: str(j.focus, 200), current: str(j.current, 300), target: str(j.target, 300), review_date: DAY.test(j.review_date || "") ? j.review_date : daysAgo(-35), goals: (j.goals || []).slice(0, 6).map((g) => ({ text: str(g.text, 300), drills: str(g.drills, 400), done: false })).filter((g) => g.text) } }, missing: str(j.missing, 400) };
});

export const ask = handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  if (!aiReady()) throw new HttpError(503, "The assistant isn't switched on yet.");
  const b = await readJson(req);
  const q = str(b.question, 500); if (!q) throw new HttpError(400, "Ask a question.");
  await useQuota(user.id, "coach");
  const all = await loadAll(club);
  const data = all.roster.slice(0, 150).map((r) => { const f = athleteFacts(club, r, all); return { id: r.id, name: f.name, level: f.level, group: r.group_name, attendance30: f.attendance30, results: f.results.slice(-4), latest_eval: f.coach_feedback.filter((n) => n.kind === "evaluation").at(-1) || null }; });
  const text = await callClaude({ system: `You are the assistant inside a coach's athlete-management app. Answer the coach's question using ONLY the team data provided (today is ${todayIn()}). Be brief and concrete: name athletes and the numbers behind each conclusion. Say clearly when the data can't answer something and what to record to answer it. Never invent results. ${SAFE} Return ONLY JSON {"answer": string (markdown-free, short paragraphs or "- " lines), "athletes": [ids of athletes you named], "missing": string|null}`, maxTokens: 1200,
    messages: [{ role: "user", content: `Team data: ${JSON.stringify(data)}\n\nCoach's question: ${q}` }] });
  let j; try { j = extractJson(text); } catch { return { answer: text.slice(0, 3000), athletes: [], missing: null }; }
  const ids = new Set(all.roster.map((r) => r.id));
  return { answer: str(j.answer, 4000), athletes: (j.athletes || []).filter((x) => ids.has(x)), missing: str(j.missing, 500) };
});

// ---------- Coach ambassador: families in the coach's program and what they'd earn ----------
export const ambassador = handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const club = await myClub(user.id);
  const { data: fams } = await deps.supabase().from("profiles").select("id,subscription_status,subscription_plan,created_at").eq("club_id", club.id);
  const paying = (fams || []).filter((f) => f.subscription_status === "active");
  return { code: club.code, families: (fams || []).length, trialing: (fams || []).filter((f) => f.subscription_status === "trialing").length, paying: paying.length, rate: 0.1 };
});

// ---------- Parent portal: only what the coach published as parent-visible, plus the athlete's results ----------
export const family = handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const sb = deps.supabase();
  const gid = new URL(req.url || "/", "http://x").searchParams.get("gymnast");
  const { data: g } = await sb.from("gymnasts").select("*").eq("id", gid).eq("user_id", user.id).maybeSingle();
  if (!g?.roster_id) return { linked: false };
  const { data: r } = await sb.from("club_roster").select("*").eq("id", g.roster_id).maybeSingle();
  if (!r) return { linked: false };
  const { data: club } = await sb.from("clubs").select("name,sport").eq("id", r.club_id).maybeSingle();
  const [{ data: ns }, { data: res }] = await Promise.all([
    sb.from("coach_feedback").select("*").eq("roster_id", r.id).eq("visibility", "parent").eq("status", "published"),
    sb.from("coach_results").select("*").eq("roster_id", r.id),
  ]);
  const sport = r.sport || club?.sport || "Gymnastics";
  const rs = (res || []).sort((a, b) => (a.meet_date > b.meet_date ? 1 : -1));
  return { linked: true, gym: club?.name || null, events: eventsFor(sport, r.gender),
    results: rs.map((x) => ({ meet_name: x.meet_name, meet_date: x.meet_date, scores: x.scores || {}, aa: x.aa, place: x.place })), analysis: analyze(rs, sport),
    feedback: (ns || []).sort((a, b) => ((a.published_at || a.created_at) > (b.published_at || b.created_at) ? -1 : 1)).map((n) => ({ id: n.id, kind: n.kind, date: (n.published_at || n.created_at || "").slice(0, 10), body: n.body, strengths: n.strengths, weaknesses: n.weaknesses, next_steps: n.next_steps, ratings: n.ratings, plan: n.plan })) };
});
