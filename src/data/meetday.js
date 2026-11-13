// Meet-day helpers shared by the app and the morning email: when to arrive, and a motivation +
// nutrition tip for the parent. Pro families get AI-personalized tips; everyone else gets these.
import { conf } from "./sports.js";

const MOTIVATION = {
  all: [
    "Tell them one thing you love watching them do — not a score to chase.",
    "Say \"I love watching you\" before warm-ups. That's the whole pep talk.",
    "Nerves mean they care. Three slow breaths in the car resets the body.",
    "Pick one focus word together (\"tight\", \"smooth\", \"fast\") and leave the rest to the coach.",
    "Whatever happens today, the car ride home is for snacks and stories, not replays.",
    "Remind them: the goal is to do what they do in practice, one turn at a time.",
  ],
  Gymnastics: ["Every routine starts with a salute and a smile — judges notice confidence.", "One wobble is one moment. Stick the next skill."],
  Swimming: ["Race your lane, not the swimmer next to you.", "Fast is relaxed: loose shoulders behind the block."],
  "Cheer & Dance": ["Sell it to the back row — energy and faces count.", "Trust your team; you've hit this routine a hundred times."],
  Soccer: ["Win your first touch, then the next.", "Talk on the field — loud teams play calm."],
  Basketball: ["Next play mentality: a miss is already history.", "Defense and hustle are 100% in your control."],
  Tennis: ["Play the point in front of you.", "Same routine between every point: breathe, bounce, decide."],
};
const NUTRITION = {
  all: [
    "Familiar breakfast 2–3 hours before: oatmeal or a bagel with peanut butter, fruit and water. Nothing new today.",
    "Pack a water bottle and sip all day — thirst shows up late.",
    "Small snacks between events: banana, pretzels, crackers or a granola bar. Skip heavy, greasy or very sugary food.",
    "After competing: a recovery snack within an hour — chocolate milk, a turkey sandwich or yogurt and fruit.",
    "Bring two extra snacks; sessions run long and concession lines are slow.",
  ],
  Gymnastics: ["Light, easy-to-digest food before warm-ups — a full stomach makes bars and flips uncomfortable."],
  Swimming: ["Between races: small carb snacks and water; sessions can last hours."],
  "Cheer & Dance": ["Eat 2–3 hours before the routine; a small snack 45 minutes before if it's a long wait."],
  Soccer: ["Orange slices and water at half-time are classic for a reason: quick carbs and fluid."],
  Basketball: ["A small carb snack and water 30–60 minutes before tip-off."],
  Tennis: ["Bring bananas and an electrolyte drink for long matches in the heat."],
};
const pick = (arr, seed) => { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr.at(h % arr.length); };

export function curatedTips(sport, seed) {
  const m = [...(MOTIVATION[sport] || []), ...MOTIVATION.all], n = [...(NUTRITION[sport] || []), ...NUTRITION.all];
  return { motivation: pick(m, `${seed}m`), nutrition: pick(n, `${seed}n`) };
}

// "Sat 8:00 AM", "8am", "13:30", "Session 2 - 10:15 am" → minutes after midnight (or null).
export function parseTime(text) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i.exec(String(text || ""));
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] || 0); const ap = (m[3] || "").toLowerCase();
  if (!m[2] && !ap) return null;
  if (ap.startsWith("p") && h < 12) h += 12;
  if (ap.startsWith("a") && h === 12) h = 0;
  return h > 23 || min > 59 ? null : h * 60 + min;
}
export const fmtTime = (mins) => { const h = Math.floor(mins / 60), m = mins % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

// Arrive ~45 min before the session for check-in and warm-ups (gyms often set an earlier report time).
export function arriveBy(sessionTime, early = 45) {
  const t = parseTime(sessionTime);
  return t == null ? null : fmtTime(Math.max(0, t - early));
}
export const mapsLink = (meet) => (meet.location || meet.host ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([meet.host, meet.location].filter(Boolean).join(", "))}` : null);
export const isMeetDay = (meet, today) => meet.status !== "Skipped" && meet.start_date <= today && (meet.end_date || meet.start_date) >= today;
export const eventWord = (sport) => conf(sport).event.toLowerCase();
