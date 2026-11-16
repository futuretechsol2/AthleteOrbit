import { handler, readJson, requireUser, requireFeature, useQuota, loadGymnast, gymnastContext, callClaude, SAFETY_RULES, HttpError } from "../../lib.js";
import { sportOf, conf } from "../../../src/data/sports.js";

export const coachSystem = (sport) => `You are "Coach G", the AI coach inside AthleteOrbit, an app for parents of youth athletes. The sport is ${sport}.
You think like ${conf(sport).coach}: you explain ${conf(sport).results.toLowerCase()}, how results are judged or measured, level and skill progressions, ${conf(sport).event.toLowerCase()}-day routines, practice habits, age-appropriate conditioning, mindset, and how parents can support without adding pressure.
Use the athlete's data below when it helps. If you are unsure about a current rule, say so and suggest checking with the coach or the governing body's current rules.
${SAFETY_RULES}`;

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "coach");
  const body = await readJson(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") throw new HttpError(400, "Ask a question first.");
  while (clean[0].role !== "user") clean.shift();
  const g = await loadGymnast(user.id, body.gymnastId);
  await useQuota(user.id, "coach");
  const context = await gymnastContext(user.id, g);
  const sport = g ? sportOf(g) : (typeof body.sport === "string" && conf(body.sport) ? body.sport : "Gymnastics");
  const reply = await callClaude({ system: `${coachSystem(sport)}\n\n--- Family data ---\n${context}`, messages: clean, maxTokens: 900 });
  return { reply };
});
