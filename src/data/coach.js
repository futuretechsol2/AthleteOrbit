// Shared by the server and the app (and the demo): how a coach's results are read.
import { lowerBetter, totalOf } from "./live.js";

export const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.:-]/g, "")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
export const RATINGS = ["Technique", "Strength & flexibility", "Consistency", "Training effort", "Competition mindset"];

// Per-event history, personal bests and trend for one athlete's results (oldest → newest).
export function analyze(results, sport) {
  const lower = lowerBetter(sport);
  const rows = [...results].sort((a, b) => (a.meet_date > b.meet_date ? 1 : -1));
  const events = [...new Set(rows.flatMap((r) => Object.keys(r.scores || {})))];
  const better = (a, b) => (lower ? a < b : a > b);
  const ev = {};
  for (const e of events) {
    const vals = rows.map((r) => num(r.scores?.[e])).filter((v) => v != null);
    if (!vals.length) continue;
    const best = vals.reduce((m, v) => (better(v, m) ? v : m));
    const last = vals.at(-1), prev = vals.at(-2);
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
    ev[e] = { best, last, change: prev != null ? Math.round((last - prev) * 1000) / 1000 : null, avg: Math.round(avg * 1000) / 1000, meets: vals.length, pbLast: vals.length > 1 && last === best };
  }
  const tot = rows.map((r) => r.aa ?? totalOf(r.scores, sport)).filter((v) => v != null);
  // compare totals only between meets with the same events entered (a partial sheet isn't a "drop")
  const full = rows.filter((r) => (r.aa ?? totalOf(r.scores, sport)) != null);
  const nEv = (r) => Object.keys(r.scores || {}).length;
  const comparable = full.length >= 2 && nEv(full.at(-1)) === nEv(full.at(-2));
  const trend = comparable ? Math.round((tot.at(-1) - tot.at(-2)) * 1000) / 1000 : null;
  // the event furthest below the athlete's own average across events (relative), when she has 2+ meets
  let weakest = null;
  if (!lower && rows.length >= 2) { const avgs = Object.entries(ev).map(([e, x]) => [e, x.avg]); if (avgs.length > 1) weakest = avgs.sort((a, b) => a[1] - b[1])[0][0]; }
  const declining = trend != null && (lower ? trend > 0 : trend < 0);
  // a drop worth a coach's attention: at least 0.5% of the total (≈0.18 on a 36 all-around), not rounding noise
  const bigDrop = declining && Math.abs(trend) >= Math.max(0.1, Math.abs(tot.at(-2) || 0) * 0.005);
  return { events: ev, totals: tot, trend, weakest, improving: trend != null && (lower ? trend < 0 : trend > 0), declining, bigDrop };
}

