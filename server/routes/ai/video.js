import { handler, readJson, requireUser, requireFeature, useQuota, loadGymnast, callClaude, imageBlock, SAFETY_RULES, deps, HttpError } from "../../lib.js";

import { sportOf, conf } from "../../../src/data/sports.js";
const SYSTEM = (sport) => `You are ${conf(sport).coach}, reviewing still frames taken in order from a short ${sport.toLowerCase()} practice or ${conf(sport).event.toLowerCase()} video.
Give feedback a parent can share with the coach. Format in short Markdown:
**What looks good** (2-3 bullets)
**Top 3 things to improve** - for each: what you see in which frame, why it matters (typical deduction or safety), and one drill idea to ask the coach about
**What it costs** - for judged sports, likely deductions you can see (clearly labeled as estimates); for timed or scored sports, where time, power or accuracy is being lost
**Ask the coach** - 1-2 questions
Be honest: frames can miss key moments, camera angle can mislead. Say what you cannot judge. Do not invent a numeric score.
Comment only on technique. Never comment on the athlete's body, weight or appearance.
${SAFETY_RULES}`;

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "video");
  const body = await readJson(req);
  const frames = Array.isArray(body.frames) ? body.frames : [];
  if (frames.length < 2 || frames.length > 10) throw new HttpError(400, "Send between 2 and 10 frames from the video.");
  const blocks = frames.map(imageBlock);
  const g = await loadGymnast(user.id, body.gymnastId);
  await useQuota(user.id, "video");
  const event = String(body.event || "").slice(0, 40);
  const skill = String(body.skill || "").slice(0, 120);
  const notes = String(body.notes || "").slice(0, 500);
  const content = [];
  blocks.forEach((b, i) => { content.push({ type: "text", text: `Frame ${i + 1} of ${blocks.length}` }); content.push(b); });
  const sport = g ? sportOf(g) : "Gymnastics";
  content.push({ type: "text", text: `Sport: ${sport}. Athlete: ${g ? g.level : "level unknown"}. Event: ${event || "unknown"}. Skill or routine: ${skill || "not specified"}. Parent notes: ${notes || "none"}.` });
  const feedback = await callClaude({ system: SYSTEM(sport), messages: [{ role: "user", content }], maxTokens: 1100 });
  if (g) {
    await deps.supabase().from("ai_notes").insert({ user_id: user.id, gymnast_id: g.id, kind: "video",
      title: `${event || "Video"}${skill ? ` - ${skill}` : ""}`, body: feedback });
  }
  return { feedback };
});
