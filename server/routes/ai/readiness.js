import { handler, readJson, requireUser, requireFeature, useQuota, loadGymnast, gymnastContext, callClaude, SAFETY_RULES, deps, HttpError } from "../../lib.js";
import { sportOf, conf, skillsForChild, nextLevel } from "../../../src/data/sports.js";

const SYSTEM = (sport) => `You are ${conf(sport).coach} writing a level-up readiness plan for a parent.
Using the skill checklist and scores, write short Markdown:
**Readiness snapshot** - one sentence with an honest estimate (early / building / close / ready) for moving to the next level, and why.
**Strengths** - 2-3 bullets.
**Focus next (4-6 weeks)** - per skill area, the 1-2 skills that matter most, in the order a coach would usually teach them, each with a simple home-safe support idea (flexibility, conditioning, visualization) and what to ask the coach.
**Results focus** - where the next ${conf(sport).event.toLowerCase()} result can improve most, and why.
**Parent support** - 2 bullets.
Remember: only coaches decide level moves; never suggest practicing new skills at home without supervision.
${SAFETY_RULES}`;

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "levelPlan");
  const body = await readJson(req);
  const g = await loadGymnast(user.id, body.gymnastId);
  if (!g) throw new HttpError(400, "Pick a gymnast first.");
  await useQuota(user.id, "readiness");
  const sport = sportOf(g);
  const next = nextLevel(g);
  const nextSkills = next ? skillsForChild(g, next).map((s) => `${s.event}: ${s.skill}`).join("\n") : "Top level reached.";
  const context = await gymnastContext(user.id, g);
  const plan = await callClaude({
    system: SYSTEM(sport), maxTokens: 1300,
    messages: [{ role: "user", content: `${context}\n\nNext level: ${next || "none"}\nTypical skills at the next level:\n${nextSkills}\n\nWrite the readiness plan.` }],
  });
  await deps.supabase().from("ai_notes").insert({ user_id: user.id, gymnast_id: g.id, kind: "readiness", title: `Readiness plan: ${g.level}${next ? ` to ${next}` : ""}`, body: plan });
  return { plan };
});
