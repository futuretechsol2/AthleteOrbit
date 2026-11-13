import { handler, readJson, requireUser, requireFeature, useQuota, callClaude, imageBlock, extractJson, HttpError } from "../../lib.js";
import { SPORTS } from "../../../src/data/sports.js";

// Swimming results / cheer & dance score sheets come back as a list of results.
export const OTHER = (sport) => `You read photos of youth ${sport.toLowerCase()} results: heat sheets with final times, results printouts, score sheets and award slips.
Return ONLY a JSON object, no prose:
{"event_name": string|null, "event_date": "YYYY-MM-DD"|null,
 "results": [{"metric": string, "value": number, "unit": string, "place": integer|null}],
 "confidence": "high"|"medium"|"low", "notes": string}
Rules: ${sport === "Swimming" ? 'metric is the swim event like "50 Free", "100 IM" (short names: Free, Back, Breast, Fly, IM); value is the final time in SECONDS (1:05.30 = 65.3); unit "sec". Ignore seed times and splits.' : 'metric is "Routine score" (unit "pts"), and "Deductions" (unit "pts") if shown; put the placement in place.'}
If several athletes appear, use the row matching the name hint if given; otherwise the first, and say so in notes. Never guess a number you cannot read; leave it out.`;

export const SYSTEM = `You read photos of gymnastics meet score sheets, award slips and results printouts.
Return ONLY a JSON object, no prose, with this shape:
{"meet_name": string|null, "meet_date": "YYYY-MM-DD"|null, "level": string|null,
 "vault": number|null, "bars": number|null, "beam": number|null, "floor": number|null,
 "pommel": number|null, "rings": number|null, "pbars": number|null, "highbar": number|null,
 "aa_place": integer|null, "confidence": "high"|"medium"|"low", "notes": string}
Rules: bars = uneven bars (women), pbars = parallel bars (men), highbar = high bar. Use final event scores, not start values or individual judge scores.
If several gymnasts appear, use the row matching the name hint if given; otherwise the first row, and say so in notes. Never guess a number you cannot read: use null.`;

export const EV = ["vault", "bars", "beam", "floor", "pommel", "rings", "pbars", "highbar"];

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "snap");
  const body = await readJson(req);
  const img = imageBlock(body.image);
  const sport = SPORTS[body.sport] && body.sport !== "Gymnastics" ? body.sport : "Gymnastics";
  if (!SPORTS[sport].photoImport) throw new HttpError(400, `Photo import isn't available for ${sport} yet.`);
  await useQuota(user.id, "scoresheet");
  const hint = typeof body.nameHint === "string" ? body.nameHint.slice(0, 60) : "";
  if (sport !== "Gymnastics") {
    const t = await callClaude({ system: OTHER(sport), maxTokens: 700,
      messages: [{ role: "user", content: [img, { type: "text", text: `Athlete name hint: ${hint || "none"}. Read the results.` }] }] });
    const j = extractJson(t);
    const out = cleanOther(j, sport);
    if (!out.results.length) throw new HttpError(422, "Couldn't find any results in that photo. Try a clearer, straight-on photo.");
    return out;
  }
  const text = await callClaude({
    system: SYSTEM, maxTokens: 600,
    messages: [{ role: "user", content: [img, { type: "text", text: `Program: ${body.program || "unknown"}. Gymnast name hint: ${hint || "none"}. Read the scores.` }] }],
  });
  const out = cleanGym(extractJson(text));
  if (EV.every((k) => out[k] === null)) throw new HttpError(422, "Couldn't find any scores in that photo. Try a clearer, straight-on photo.");
  return { scores: out };
});

const str = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const int = (v) => (Number.isInteger(Number(v)) && v !== null && v !== "" ? Number(v) : null);
const score = (v, max = 20) => { const n = Number(v); return v === null || v === undefined || v === "" || isNaN(n) || n < 0 || n > max ? null : Math.round(n * 1000) / 1000; };

export function cleanGym(j) {
  const out = { meet_name: str(j.meet_name), meet_date: date(j.meet_date), level: str(j.level), aa_place: int(j.aa_place),
    confidence: ["high", "medium", "low"].includes(j.confidence) ? j.confidence : "low", notes: str(j.notes) || "" };
  for (const k of EV) out[k] = score(j[k]);
  return out;
}
export function cleanOther(j, sport) {
  const results = (Array.isArray(j.results) ? j.results : []).map((r) => ({ metric: str(r.metric), value: score(r.value, 100000), unit: str(r.unit) || (sport === "Swimming" ? "sec" : "pts"), place: int(r.place) }))
    .filter((r) => r.metric && r.value !== null).slice(0, 20);
  return { results, event_name: str(j.event_name), event_date: date(j.event_date), confidence: ["high", "medium", "low"].includes(j.confidence) ? j.confidence : "low", notes: str(j.notes) || "" };
}
