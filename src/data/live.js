// Live scores: which events each athlete competes, all-around totals, rankings, and reading results files
// exported from meet scoring software (CSV or tab-separated, any common column names).
export const GYM_EVENTS = { F: ["Vault", "Bars", "Beam", "Floor"], M: ["Floor", "Pommel", "Rings", "Vault", "P-Bars", "High Bar"] };
// How each sport is scored: per-event gymnastics scores, a race time (lower wins), a judged score, or a game/match.
export const SPORT_FORMAT = { Gymnastics: "gym", Swimming: "timed", "Track & Field": "timed", Soccer: "match", Basketball: "match", Tennis: "match", Volleyball: "match", "Baseball & Softball": "match", Football: "match", Hockey: "match", Lacrosse: "match" };
export const formatOf = (sport) => SPORT_FORMAT[sport || "Gymnastics"] || "judged";
export const LABELS = {
  gym: { event: "meet", who: "athlete", group: "Level", sub: "Division", total: "AA", add: "Add my athlete's score" },
  timed: { event: "meet", who: "swimmer", group: "Age group", sub: "Event", total: "Time", add: "Add my athlete's time" },
  judged: { event: "competition", who: "athlete", group: "Level / division", sub: "Category", total: "Score", add: "Add my athlete's score" },
  match: { event: "tournament", who: "team", group: "Age group", sub: "Field / round", total: "", add: "Add our game score" },
};
export const labelsFor = (sport) => LABELS[formatOf(sport)];
export const eventsFor = (sport, gender) => { const f = formatOf(sport); return f === "gym" ? GYM_EVENTS[gender === "M" ? "M" : "F"] : f === "timed" ? ["Time"] : f === "match" ? ["Home", "Away"] : ["Score"]; };
export const lowerBetter = (sport) => formatOf(sport) === "timed";
// "1:05.32" or "65.32" → 65.32 seconds
export const parseTime = (v) => { const t = String(v ?? "").trim(); if (!t) return null; if (t.includes(":")) { const [m, s] = t.split(":"); const n = Number(m) * 60 + Number(s); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; } const n = Number(t.replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
export const fmtTime = (sec) => { const n = Number(sec); if (!Number.isFinite(n)) return "–"; if (n < 60) return n.toFixed(2); const m = Math.floor(n / 60); return `${m}:${(n - m * 60).toFixed(2).padStart(5, "0")}`; };
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
export const totalOf = (scores, sport) => { const f = formatOf(sport); if (f === "match") return null; const v = Object.values(scores || {}).map(num).filter((n) => n != null); return v.length ? Math.round(v.reduce((a, n) => a + n, 0) * 1000) / 1000 : null; };
export const fmtScore = (n, sport) => { if (n == null || n === "") return "–"; const f = formatOf(sport); return f === "gym" ? Number(n).toFixed(3) : f === "timed" ? fmtTime(n) : String(n); };
export const matchLine = (r) => `${r.name} ${r.scores?.Home ?? "–"} – ${r.scores?.Away ?? "–"} ${r.gym}`;
export const athleteKey = (r) => `${String(r.name || "").trim().toLowerCase()}|${String(r.gym || "").trim().toLowerCase()}`;

// Group rows into flights (session + level + division + girls/boys) and rank by all-around (ties share a place).
export function rankRows(rows, sport = "Gymnastics") {
  const f = formatOf(sport), groups = {};
  for (const r of rows) {
    // Games are grouped by age group only (field/round is shown on each game); races by age group + event.
    const k = (f === "match" ? [r.level || ""] : [r.session || "", r.level || "", r.division || "", r.gender || ""]).join("|");
    (groups[k] ||= { key: k, session: f === "match" ? "" : r.session || "", level: r.level || "", division: f === "match" ? "" : r.division || "", gender: r.gender || null, rows: [] }).rows.push({ ...r, aa: r.aa ?? totalOf(r.scores, sport) });
  }
  if (f === "match") {
    for (const g of Object.values(groups)) g.rows.sort((a, b) => String(a.session || "").localeCompare(String(b.session || ""), undefined, { numeric: true }) || String(a.updated_at || "").localeCompare(String(b.updated_at || "")));
    return Object.values(groups).sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true }));
  }
  const low = f === "timed";
  for (const g of Object.values(groups)) {
    g.rows.sort((a, b) => (low ? (a.aa ?? 1e9) - (b.aa ?? 1e9) : (b.aa ?? -1) - (a.aa ?? -1)) || a.name.localeCompare(b.name));
    let place = 0, prev = null;
    g.rows.forEach((r, i) => { if (r.aa !== prev) place = i + 1; prev = r.aa; r.rank = r.place || (r.aa == null ? null : place); });
    // Event places too, for "1st on beam" badges.
    if (f !== "gym") continue;
    const evs = [...new Set(g.rows.flatMap((r) => Object.keys(r.scores || {})))];
    for (const ev of evs) {
      const sorted = g.rows.filter((r) => num(r.scores?.[ev]) != null).sort((a, b) => num(b.scores[ev]) - num(a.scores[ev]));
      let p = 0, pv = null; sorted.forEach((r, i) => { const v = num(r.scores[ev]); if (v !== pv) p = i + 1; pv = v; (r.eventPlace ||= {})[ev] = p; });
    }
  }
  return Object.values(groups).sort((a, b) => a.session.localeCompare(b.session, undefined, { numeric: true }) || a.level.localeCompare(b.level, undefined, { numeric: true }) || a.division.localeCompare(b.division, undefined, { numeric: true }) || String(a.gender).localeCompare(String(b.gender)));
}

// Results file → rows. Header names vary by scoring program; these cover the common ones.
const ALIASES = {
  name: ["name", "athlete", "gymnast", "competitor", "athlete name", "gymnast name", "full name"],
  first: ["first", "first name", "firstname", "fname"], last: ["last", "last name", "lastname", "lname"],
  gym: ["gym", "team", "club", "school", "team name", "club name"],
  level: ["level", "lvl", "division level", "group"], division: ["division", "age", "age group", "age division", "div", "flight", "event", "event name", "field", "round", "category"],
  session: ["session", "sess", "session #", "session number", "heat", "game time"], kickoff: ["kickoff", "start", "start time", "tip off"], gender: ["gender", "sex", "program", "discipline"],
  Vault: ["vault", "vt", "vlt"], Bars: ["bars", "ub", "uneven bars", "bar"], Beam: ["beam", "bb", "balance beam", "bm"], Floor: ["floor", "fx", "flr", "floor exercise"],
  Pommel: ["pommel", "ph", "pommel horse", "pom"], Rings: ["rings", "sr", "still rings", "rg"], "P-Bars": ["p-bars", "pbars", "pb", "parallel bars", "p bars"], "High Bar": ["high bar", "hb", "highbar", "horizontal bar"],
  Score: ["score", "points", "result", "total score", "final score"], Time: ["time", "final time", "swim time", "race time", "finals time", "seed time"],
  home: ["home", "home team", "team 1", "team a"], away: ["away", "away team", "visitor", "visitors", "team 2", "team b", "opponent"],
  Home: ["home score", "score 1", "home pts", "home goals", "team 1 score"], Away: ["away score", "score 2", "away pts", "away goals", "team 2 score", "visitor score"], status: ["status", "period", "state"], aa: ["aa", "all around", "all-around", "allaround", "total", "aa score"], place: ["place", "aa place", "rank", "pl"],
};
function splitLine(line, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === sep && !q) { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out.map((s) => s.trim());
}
export function parseResults(text, { sport = "Gymnastics", defaults = {} } = {}) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], problems: ["Paste the header row and at least one athlete."] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase().replace(/[^a-z0-9#\- ]/g, "").trim());
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) col[k] = i; }
  const problems = [], f = formatOf(sport);
  // Outside gymnastics, "age group" is the main grouping (U10, 9-10) and "event"/"field" is the sub-group.
  if (f !== "gym") { const ag = head.findIndex((h) => ["age group", "age", "age division", "agegroup"].includes(h)); if (ag >= 0 && col.level == null) { col.level = ag; if (col.division === ag) { const ev = head.findIndex((h, i) => i !== ag && ["event", "event name", "field", "round", "category", "division", "div", "flight"].includes(h)); if (ev >= 0) col.division = ev; else delete col.division; } } }
  if (f === "match") {
    if (col.home == null || col.away == null) problems.push("Couldn't find Home and Away team columns.");
    if (col.Home == null && col.Away == null) problems.push("Couldn't find Home score and Away score columns.");
  } else if (col.name == null && (col.first == null || col.last == null)) problems.push("Couldn't find a Name column (or First and Last).");
  const evCols = f === "gym" ? ["Vault", "Bars", "Beam", "Floor", "Pommel", "Rings", "P-Bars", "High Bar", "Score"].filter((e) => col[e] != null) : f === "timed" ? ["Time", "Score"].filter((e) => col[e] != null).slice(0, 1) : f === "match" ? ["Home", "Away"].filter((e) => col[e] != null) : ["Score"].filter((e) => col[e] != null);
  if (f !== "match" && !evCols.length && col.aa == null) problems.push(f === "timed" ? "Couldn't find a Time column." : f === "gym" ? "Couldn't find any score columns (Vault, Bars, Beam, Floor… or Score)." : "Couldn't find a Score column.");
  if (problems.length) return { rows: [], problems };
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = splitLine(line, sep), get = (k) => (col[k] != null ? c[col[k]] : "");
    const name = (f === "match" ? get("home") : col.name != null ? get("name") : `${get("first")} ${get("last")}`).replace(/\s+/g, " ").trim();
    if (!name || name.length < 2) continue;
    const g = String(get("gender") || defaults.gender || "").toUpperCase();
    const gender = /^(M|MALE|BOY|BOYS|MAG|MEN)/.test(g) ? "M" : /^(F|FEMALE|GIRL|GIRLS|WAG|WOMEN|XCEL)/.test(g) ? "F" : (evCols.some((e) => ["Pommel", "Rings", "P-Bars", "High Bar"].includes(e)) && !evCols.includes("Beam") ? "M" : defaults.gender || (sport === "Gymnastics" ? "F" : null));
    const scores = {};
    if (f === "timed") { const v = parseTime(get(evCols[0] || "aa")); if (v != null) scores.Time = v; }
    else for (const e of evCols) { const v = num(get(e)); if (v != null) scores[e] = v; }
    const lvl = String(get("level") || defaults.level || "").trim();
    rows.push({ name, gym: f === "match" ? get("away").trim() : get("gym") || defaults.gym || "", level: f === "gym" && /^\d{1,2}$/.test(lvl) ? `Level ${lvl}` : lvl, division: get("division") || defaults.division || "", session: get("session") || (f === "match" ? get("Time") || get("kickoff") : "") || defaults.session || "", gender: f === "gym" ? gender : null,
      status: get("status") || defaults.status || "", scores, aa: f === "match" ? null : f === "timed" ? scores.Time ?? null : num(get("aa")) ?? totalOf(scores, sport), place: num(get("place")) || null });
  }
  if (!rows.length) problems.push("No athlete rows found under the header.");
  return { rows, problems };
}
// Results → CSV (Live Scoring Pro export).
export function toCsv(rows, sport) {
  const f = formatOf(sport);
  if (f === "match") {
    const q = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
    return [["Age group", "Field / round", "Time", "Home", "Away", "Home score", "Away score", "Status"].join(","), ...rows.map((r) => [r.level, r.division, r.session, r.name, r.gym, r.scores?.Home, r.scores?.Away, r.status].map(q).join(","))].join("\n");
  }
  const evs = f === "timed" ? ["Time"] : f === "judged" ? ["Score"] : ["Vault", "Bars", "Beam", "Floor", "Pommel", "Rings", "P-Bars", "High Bar"];
  const used = evs.filter((e) => rows.some((r) => r.scores?.[e] != null));
  const q = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
  const head = ["Session", "Level", "Division", "Gender", "Name", "Gym", ...used, f === "gym" ? "AA" : "Total", "Place"];
  const flat = rankRows(rows, sport).flatMap((g) => g.rows);
  return [head.join(","), ...flat.map((r) => [r.session, r.level, r.division, r.gender, r.name, r.gym, ...used.map((e) => r.scores?.[e] ?? ""), r.aa ?? "", r.rank ?? ""].map(q).join(","))].join("\n");
}
