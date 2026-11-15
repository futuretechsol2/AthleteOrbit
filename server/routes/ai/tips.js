// Personal tips for one child: "improve" (technique, drills, mindset) or "nutrition" (food-first fueling for kids).
import { handler, readJson, requireUser, requireFeature, useQuota, loadGymnast, gymnastContext, callClaude, SAFETY_RULES, deps, HttpError } from "../../lib.js";
import { sportOf, conf } from "../../../src/data/sports.js";

export const TIPS_SYSTEM = {
  improve: (sport) => `You are ${conf(sport).coach}. Using this child's ${conf(sport).results.toLowerCase()}, skills, goals and coach notes, write this week's improvement tips for the parent in short Markdown:
**Biggest win this week** - one sentence: the single change most likely to help, and why (cite their data).
**3 improvement tips** - each: what to fix, a simple safe drill or habit (home-safe: flexibility, conditioning, visualization, footwork, ball work), and how to know it's working.
**Mindset** - one tip for confidence or focus.
**Ask the coach** - 2 short questions to take to practice.
Keep it under 250 words.
${SAFETY_RULES}`,
  nutrition: (sport) => `You are a youth sports nutrition educator working alongside ${conf(sport).coach}. Give a parent practical, food-first fueling tips for their child's ${sport.toLowerCase()} training and upcoming ${conf(sport).events.toLowerCase()}, in short Markdown:
**Everyday fueling** - 3 bullets (balanced plate, regular meals and snacks, hydration).
**Before practice / ${conf(sport).event.toLowerCase()}** - timing and 3 easy snack ideas.
**During and after** - drinks and a recovery snack with carbs + protein.
**${conf(sport).event} day plan** - a simple timeline for the next ${conf(sport).event.toLowerCase()} if one is listed, else a typical day.
**Sleep and recovery** - 1-2 bullets.
End with one line: for allergies, medical needs or any weight concern, talk to your pediatrician or a registered sports dietitian.
Keep it under 280 words. Kid-friendly foods, no supplements.
${SAFETY_RULES}`,
};

// Focused food plans from the Nutrition tab.
const FOOD_RULES = `Kid-friendly, budget-friendly foods families can buy at a normal grocery store. No supplements, no calorie counts, no weight talk, no restrictive dieting. End with one line: for allergies, medical needs or any weight concern, talk to your pediatrician or a registered sports dietitian.
${SAFETY_RULES}`;
export const FOCUS_TITLE = { meetday: "Event-day food plan", practice: "Practice-day fueling", week: "Week of meals", hydration: "Hydration & recovery" };
export const FOCUS = {
  meetday: (sport) => `You are a youth sports nutrition educator who knows ${sport.toLowerCase()} ${conf(sport).events.toLowerCase()} well. Write a ${conf(sport).event.toLowerCase()}-day food plan for this child in short Markdown. Use the next ${conf(sport).event.toLowerCase()} and its session/report time if listed (long days and multiple sessions are common).
**Night before** - dinner idea and bedtime.
**Timeline** - wake-up, breakfast, snack before warm-up, between events/sessions, after; with clock times if a time is known.
**Pack this cooler** - 6-8 items.
**Avoid on the day** - 3 bullets.
Under 280 words. ${FOOD_RULES}`,
  practice: (sport) => `You are a youth sports nutrition educator. Write a practice-day fueling guide for this child's ${sport.toLowerCase()} practices in short Markdown: **After school, before practice** (timing + 4 snack ideas), **In the gym bag**, **Late dinner after practice** (3 quick ideas), **Bedtime and sleep**. Under 230 words. ${FOOD_RULES}`,
  week: (sport) => `You are a youth sports nutrition educator. Give a family a simple week of meals for a young ${sport.toLowerCase()} athlete in Markdown: a 7-row table (Day | Dinner | Lunchbox idea), then **Easy snacks to keep on hand** (6 bullets) and **Grocery list** grouped by section. Simple, quick, family meals. Under 320 words. ${FOOD_RULES}`,
  hydration: (sport) => `You are a youth sports nutrition educator. Write a hydration and recovery guide for this ${sport.toLowerCase()} athlete in short Markdown: **How much to drink** (practical cues, not math), **Water or sports drink?**, **Signs of dehydration**, **Recovery after hard days** (food + sleep + rest days). Under 220 words. ${FOOD_RULES}`,
};

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "tips");
  const body = await readJson(req);
  const kind = body.kind === "nutrition" ? "nutrition" : "improve";
  const focus = kind === "nutrition" && FOCUS[body.focus] ? body.focus : null;
  const g = await loadGymnast(user.id, body.gymnastId);
  if (!g) throw new HttpError(400, "Pick a child first.");
  await useQuota(user.id, "tips");
  const sport = sportOf(g);
  const context = await gymnastContext(user.id, g);
  const system = focus ? FOCUS[focus](sport) : TIPS_SYSTEM[kind](sport);
  const tips = await callClaude({ system, maxTokens: 1100, messages: [{ role: "user", content: `${context}\n\nWrite the ${kind === "nutrition" ? "nutrition and fueling" : "improvement"} tips.` }] });
  await deps.supabase().from("ai_notes").insert({ user_id: user.id, gymnast_id: g.id, kind: kind === "nutrition" ? "nutrition" : "tips", title: `${focus ? FOCUS_TITLE[focus] : kind === "nutrition" ? "Nutrition tips" : "Improvement tips"}: ${g.name}`, body: tips });
  return { tips };
});
