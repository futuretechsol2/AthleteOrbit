// Family-wide helpers shared by the app and the server (AI assistant, alerts).

// Gymnastics season runs Aug 1 to Jul 31; "2026-27" covers Aug 2026 to Jul 2027.
export function seasonOf(ymd) {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7));
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export function seasonRange(season) {
  const start = Number(season.slice(0, 4));
  return { from: `${start}-08-01`, to: `${start + 1}-07-31` };
}
export function seasonsAround(ymd, back = 2) {
  const cur = Number(seasonOf(ymd).slice(0, 4));
  return Array.from({ length: back + 2 }, (_, i) => cur + 1 - i).map((s) => `${s}-${String((s + 1) % 100).padStart(2, "0")}`);
}

export function spendSummary(costs, season, gymnasts = []) {
  const { from, to } = seasonRange(season);
  const rows = costs.filter((c) => c.spent_on >= from && c.spent_on <= to);
  const sum = (arr) => Math.round(arr.reduce((a, c) => a + Number(c.amount || 0), 0) * 100) / 100;
  const byCategory = {}, byChild = {};
  for (const c of rows) {
    byCategory[c.category] = (byCategory[c.category] || 0) + Number(c.amount || 0);
    const who = gymnasts.find((g) => g.id === c.gymnast_id)?.name || "Shared";
    byChild[who] = (byChild[who] || 0) + Number(c.amount || 0);
  }
  return { season, total: sum(rows), unpaid: sum(rows.filter((c) => !c.paid)), byCategory, byChild, count: rows.length };
}

// Budget lines: family total (no child, no category), per child, per category, or both.
export function budgetStatus(budgets, costs, season) {
  const { from, to } = seasonRange(season);
  const inSeason = costs.filter((c) => c.spent_on >= from && c.spent_on <= to);
  return budgets.filter((b) => b.season === season).map((b) => {
    const spent = inSeason.filter((c) => (!b.gymnast_id || c.gymnast_id === b.gymnast_id) && (!b.category || c.category === b.category))
      .reduce((a, c) => a + Number(c.amount || 0), 0);
    return { ...b, spent: Math.round(spent * 100) / 100, pct: b.amount > 0 ? spent / b.amount : 0 };
  });
}

const overlaps = (a1, a2, b1, b2) => a1 <= (b2 || b1) && b1 <= (a2 || a1);

// Two kids at different meets on the same day, or a meet on top of a family event.
export function findConflicts(meets, events, gymnasts, fromDate) {
  const name = (id) => gymnasts.find((g) => g.id === id)?.name || "Family";
  const live = meets.filter((m) => m.status !== "Skipped" && (m.end_date || m.start_date) >= fromDate);
  const out = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.gymnast_id !== b.gymnast_id && overlaps(a.start_date, a.end_date, b.start_date, b.end_date) && (a.location || "") !== (b.location || "")) {
      out.push({ date: a.start_date > b.start_date ? a.start_date : b.start_date, kind: "meet-meet",
        text: `${name(a.gymnast_id)} at ${a.name}${a.location ? ` (${a.location})` : ""} and ${name(b.gymnast_id)} at ${b.name}${b.location ? ` (${b.location})` : ""}` });
    }
  }
  for (const m of live) for (const e of events) {
    if ((e.end_date || e.start_date) < fromDate) continue;
    if (overlaps(m.start_date, m.end_date, e.start_date, e.end_date)) {
      out.push({ date: m.start_date > e.start_date ? m.start_date : e.start_date, kind: "meet-event",
        text: `${name(m.gymnast_id)}'s ${m.name} overlaps "${e.title}"${e.gymnast_id ? ` (${name(e.gymnast_id)})` : ""}` });
    }
  }
  return out.sort((a, b) => (a.date > b.date ? 1 : -1));
}

// Personal records per metric for other-sport stats.
export function personalRecords(stats) {
  const best = {};
  for (const s of stats) {
    const cur = best[s.metric];
    const better = s.better === "lower" ? (v, c) => v < c : (v, c) => v > c;
    if (!cur || better(Number(s.value), Number(cur.value))) best[s.metric] = s;
  }
  return best;
}

export function fmtValue(v, unit) {
  const n = Number(v);
  if (unit === "sec" && n >= 60) { const m = Math.floor(n / 60); return `${m}:${(n - m * 60).toFixed(2).padStart(5, "0")}`; }
  return `${Number.isInteger(n) ? n : n.toFixed(2)}${unit && unit !== "sec" ? ` ${unit}` : unit === "sec" ? "s" : ""}`;
}
