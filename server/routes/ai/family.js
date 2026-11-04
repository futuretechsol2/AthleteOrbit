// Family sports assistant: answers questions across every child, the budget, costs and the calendar.
import { handler, readJson, requireUser, requireFeature, useQuota, callClaude, deps, SAFETY_RULES, HttpError, todayIn, addDays } from "../../lib.js";
import { seasonOf, spendSummary, budgetStatus, findConflicts } from "../../../src/data/family.js";
import { allAround } from "../../../src/data/skills.js";

const SYSTEM = `You are the AthleteOrbit family sports assistant. You help a busy parent with money, schedules and preparation for all of their kids' sports.
Answer from the family data below. Do the arithmetic carefully and show the key numbers. If the data doesn't contain the answer, say what's missing and where in the app to add it.
Keep answers short: a direct answer first, then up to 5 bullets. Use dollar amounts with no cents unless needed.
${SAFETY_RULES}`;

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "family");
  const body = await readJson(req);
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length || msgs.at(-1).role !== "user") throw new HttpError(400, "Ask a question first.");
  while (msgs[0].role !== "user") msgs.shift();
  await useQuota(user.id, "family");
  const context = await familyContext(user.id);
  const reply = await callClaude({ system: `${SYSTEM}\n\n--- Family data (today is ${todayIn()}) ---\n${context}`, messages: msgs, maxTokens: 900 });
  return { reply };
});

export async function familyContext(userId) {
  const sb = deps.supabase();
  const today = todayIn(), season = seasonOf(today), horizon = addDays(today, 120);
  const q = (t) => sb.from(t).select("*").eq("user_id", userId);
  const [g, m, c, b, e, sc, go, st] = await Promise.all([q("gymnasts"), q("meets"), q("costs"), q("budgets"), q("family_events"), q("scores"), q("goals"), q("stats")]);
  const kids = g.data || [], meets = m.data || [], costs = c.data || [], events = e.data || [];
  const name = (id) => kids.find((k) => k.id === id)?.name || "Shared";
  const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  const spend = spendSummary(costs, season, kids);
  const lines = [];
  lines.push(`Children: ${kids.map((k) => `${k.name} (${k.program === "Other" ? k.sport : `gymnastics ${k.program}`} ${k.level}${k.club ? `, ${k.club}` : ""}${k.coach_name ? `, coach ${k.coach_name}` : ""})`).join("; ") || "none yet"}.`);
  lines.push(`Season ${season} spending: total ${money(spend.total)}, unpaid ${money(spend.unpaid)}.`);
  lines.push(`By child: ${Object.entries(spend.byChild).map(([k, v]) => `${k} ${money(v)}`).join(", ") || "none"}.`);
  lines.push(`By category: ${Object.entries(spend.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${money(v)}`).join(", ") || "none"}.`);
  const unpaid = costs.filter((x) => !x.paid);
  if (unpaid.length) lines.push(`Unpaid items: ${unpaid.map((x) => `${x.description || x.category} ${money(x.amount)} (${name(x.gymnast_id)}, ${x.spent_on})`).join("; ")}.`);
  const bs = budgetStatus(b.data || [], costs, season);
  if (bs.length) lines.push(`Budgets ${season}: ${bs.map((x) => `${x.gymnast_id ? name(x.gymnast_id) : "Family"}${x.category ? ` ${x.category}` : " total"} ${money(x.spent)} of ${money(x.amount)} (${Math.round(x.pct * 100)}%)`).join("; ")}.`);
  const up = meets.filter((x) => x.start_date >= today && x.start_date <= horizon && x.status !== "Skipped").sort((a, b) => (a.start_date > b.start_date ? 1 : -1));
  lines.push(up.length ? `Upcoming meets:\n${up.map((x) => {
    const list = Array.isArray(x.checklist) ? x.checklist : [];
    const actual = costs.filter((k) => k.meet_id === x.id).reduce((a, k) => a + Number(k.amount), 0);
    return `- ${x.start_date}${x.end_date ? `–${x.end_date}` : ""}: ${name(x.gymnast_id)} at ${x.name}${x.location ? ` in ${x.location}` : ""}, status ${x.status}${x.session_time ? `, session ${x.session_time}` : ""}${x.entry_deadline ? `, entry deadline ${x.entry_deadline}` : ""}, hotel ${x.hotel_name ? `booked (${x.hotel_name})` : "not recorded"}, packed ${list.filter((i) => i.done).length}/${list.length}${list.length ? ` (still to pack: ${list.filter((i) => !i.done).map((i) => i.text).slice(0, 6).join(", ")})` : ""}, estimated cost ${x.estimated_cost ? money(x.estimated_cost) : "not set"}, spent so far ${money(actual)}`;
  }).join("\n")}` : "No upcoming meets in the next 4 months.");
  const fe = events.filter((x) => (x.end_date || x.start_date) >= today && x.start_date <= horizon);
  if (fe.length) lines.push(`Family calendar: ${fe.map((x) => `${x.start_date}${x.end_date ? `–${x.end_date}` : ""} ${x.title}${x.gymnast_id ? ` (${name(x.gymnast_id)})` : ""}`).join("; ")}.`);
  const conflicts = findConflicts(meets, events, kids, today);
  lines.push(conflicts.length ? `Conflicts found: ${conflicts.map((x) => `${x.date}: ${x.text}`).join("; ")}.` : "No calendar conflicts found.");
  for (const k of kids) {
    const s = (sc.data || []).filter((x) => x.gymnast_id === k.id).sort((a, b) => (a.meet_date > b.meet_date ? -1 : 1)).slice(0, 3);
    if (s.length) lines.push(`${k.name} recent all-around: ${s.map((x) => `${x.meet_date} ${x.meet_name} ${allAround(x)}`).join("; ")}.`);
    const t = (st.data || []).filter((x) => x.gymnast_id === k.id).slice(-5);
    if (t.length) lines.push(`${k.name} recent stats: ${t.map((x) => `${x.event_date} ${x.metric} ${x.value}${x.unit ? ` ${x.unit}` : ""}`).join("; ")}.`);
    const gl = (go.data || []).filter((x) => x.gymnast_id === k.id && !x.done);
    if (gl.length) lines.push(`${k.name} open goals: ${gl.map((x) => x.title + (x.target_date ? ` by ${x.target_date}` : "")).join("; ")}.`);
  }
  return lines.join("\n");
}
