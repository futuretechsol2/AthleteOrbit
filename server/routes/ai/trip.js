import { handler, readJson, requireUser, requireFeature, useQuota, callClaude, deps, HttpError } from "../../lib.js";
import { tripDates } from "../../../src/data/travel.js";

const SYSTEM = `You are a family travel planner who has taken many youth sports teams to meets, competitions and tournaments.
Write a SHORT, practical plan in Markdown for a family traveling to a youth sports event:
**Travel plan** - drive or fly (based on distance from home, if given), when to leave, and 2-3 money-saving tips (book refundable rates early, hotel blocks from the meet host, compare nearby suburbs, free breakfast, parking costs).
**Meet-day timeline** - from wake-up to awards, built around the session time if given (arrive 45-60 min before march-in, light breakfast, snacks, leave room for awards).
**Family time nearby** - 2-3 well-known, family-friendly things to do in or near the city, plus one short "vacation add-on" idea if a longer stay makes sense (within about 2 hours). Name only well-known places, and remind them to check hours and tickets.
**Gymnast care** - 2 bullets on sleep, food and keeping the athlete rested before competing.
Keep it under 300 words. Do not invent prices, hotel names, or opening hours. Never suggest activities that could tire or injure the athlete before competing (e.g. trampoline parks, long hikes) until after the meet.`;

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "trip");
  const { meetId } = await readJson(req);
  const sb = deps.supabase();
  const { data: m } = await sb.from("meets").select("*").eq("id", meetId).eq("user_id", user.id).maybeSingle();
  if (!m) throw new HttpError(404, "Meet not found.");
  if (!m.location) throw new HttpError(400, "Add the meet's city and state first.");
  await useQuota(user.id, "trip");
  const { data: g } = await sb.from("gymnasts").select("name,program,level,sport").eq("id", m.gymnast_id).maybeSingle();
  const d = tripDates(m);
  const plan = await callClaude({
    system: SYSTEM, maxTokens: 900,
    messages: [{ role: "user", content: `Meet: ${m.name}${m.host ? ` hosted by ${m.host}` : ""}, in ${m.location}.
Dates: ${m.start_date}${m.end_date ? ` to ${m.end_date}` : ""}. Session / report time: ${m.session_time || "not known yet"}.
Suggested stay: ${d.depart} to ${d.return}. Family home: ${profile.home_city || profile.home_airport || "not given"}.
Athlete: ${g ? `${g.program === "Other" ? g.sport : `gymnastics ${g.program}`} ${g.level}` : "youth athlete"}.` }],
  });
  await sb.from("ai_notes").insert({ user_id: user.id, gymnast_id: m.gymnast_id, kind: "trip", title: `Trip plan: ${m.name}`, body: plan });
  return { plan };
});
