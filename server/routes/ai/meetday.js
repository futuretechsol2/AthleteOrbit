// Meet day: when to arrive, a motivation tip and a nutrition tip for the parent.
// Pro (and the free trial) get tips written by the AI coach for this child and this meet; other plans get curated tips.
import { handler, readJson, requireUser, tierOf, gymnastContext, callClaude, extractJson, SAFETY_RULES, deps, HttpError, todayIn } from "../../lib.js";
import { hasFeature } from "../../../src/data/plans.js";
import { sportOf, conf } from "../../../src/data/sports.js";
import { curatedTips, arriveBy, mapsLink } from "../../../src/data/meetday.js";

const SYSTEM = (sport) => `You are ${conf(sport).coach}. It is ${conf(sport).event.toLowerCase()} day. Write for the PARENT, warm and short.
Return ONLY JSON: {"motivation": string, "nutrition": string, "focus": string}
- motivation: 1-2 sentences the parent can say to their child today, about effort and enjoyment, never about scores or winning.
- nutrition: 1-2 sentences of practical food and water timing for today (kid-friendly foods, no supplements, no calories, no weight talk).
- focus: one short, safe cue tied to this child's recent coach notes or goals (or a general one if none).
${SAFETY_RULES}`;

export async function meetDayTips({ userId, profile, g, meet }) {
  const sport = sportOf(g), today = todayIn();
  const base = { arrive: arriveBy(meet.session_time), maps: mapsLink(meet), sport, event: conf(sport).event };
  const curated = { ...base, ...curatedTips(sport, `${meet.id}${today}`), focus: null, ai: false };
  if (!hasFeature(tierOf(profile), "coach") || !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) return curated;
  const sb = deps.supabase(), title = `Meet day: ${meet.name} ${today}`;
  const { data: saved } = await sb.from("ai_notes").select("*").eq("user_id", userId).eq("gymnast_id", g.id).eq("title", title).maybeSingle();
  if (saved) { try { return { ...base, ...JSON.parse(saved.body), ai: true }; } catch {} }
  try {
    const context = await gymnastContext(userId, g);
    const t = await callClaude({ system: SYSTEM(sport), maxTokens: 400, messages: [{ role: "user", content: `${context}\n\nToday: ${meet.name}${meet.location ? ` in ${meet.location}` : ""}${meet.session_time ? `, session ${meet.session_time}` : ""}.` }] });
    const j = extractJson(t);
    const tips = { motivation: String(j.motivation || curated.motivation).slice(0, 400), nutrition: String(j.nutrition || curated.nutrition).slice(0, 400), focus: j.focus ? String(j.focus).slice(0, 200) : null };
    await sb.from("ai_notes").insert({ user_id: userId, gymnast_id: g.id, kind: "meetday", title, body: JSON.stringify(tips) });
    return { ...base, ...tips, ai: true };
  } catch { return curated; }
}

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const { meetId } = await readJson(req);
  const sb = deps.supabase();
  const { data: meet } = await sb.from("meets").select("*").eq("id", meetId).eq("user_id", user.id).maybeSingle();
  if (!meet) throw new HttpError(404, "Meet not found.");
  const { data: g } = await sb.from("gymnasts").select("*").eq("id", meet.gymnast_id).eq("user_id", user.id).maybeSingle();
  if (!g) throw new HttpError(404, "Child not found.");
  return meetDayTips({ userId: user.id, profile, g, meet });
});
