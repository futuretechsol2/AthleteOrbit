// Live scores: which events each athlete competes, all-around totals, rankings, and reading results files
// exported from meet scoring software (CSV or tab-separated, any common column names).
export const GYM_EVENTS = { F: ["Vault", "Bars", "Beam", "Floor"], M: ["Floor", "Pommel", "Rings", "Vault", "P-Bars", "High Bar"] };
export const eventsFor = (sport, gender) => (sport && sport !== "Gymnastics" ? ["Score"] : GYM_EVENTS[gender === "M" ? "M" : "F"]);
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
export const totalOf = (scores) => { const v = Object.values(scores || {}).map(num).filter((n) => n != null); return v.length ? Math.round(v.reduce((a, n) => a + n, 0) * 1000) / 1000 : null; };
export const fmtScore = (n, sport) => (n == null ? "–" : sport && sport !== "Gymnastics" ? String(n) : Number(n).toFixed(3));
export const athleteKey = (r) => `${String(r.name || "").trim().toLowerCase()}|${String(r.gym || "").trim().toLowerCase()}`;

// Group rows into flights (session + level + division + girls/boys) and rank by all-around (ties share a place).
export function rankRows(rows) {
  const groups = {};
  for (const r of rows) {
    const k = [r.session || "", r.level || "", r.division || "", r.gender || ""].join("|");
    (groups[k] ||= { key: k, session: r.session || "", level: r.level || "", division: r.division || "", gender: r.gender || null, rows: [] }).rows.push({ ...r, aa: r.aa ?? totalOf(r.scores) });
  }
  for (const g of Object.values(groups)) {
    g.rows.sort((a, b) => (b.aa ?? -1) - (a.aa ?? -1) || a.name.localeCompare(b.name));
    let place = 0, prev = null;
    g.rows.forEach((r, i) => { if (r.aa !== prev) place = i + 1; prev = r.aa; r.rank = r.place || (r.aa == null ? null : place); });
    // Event places too, for "1st on beam" badges.
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
  level: ["level", "lvl", "division level", "group"], division: ["division", "age", "age group", "age division", "div", "flight"],
  session: ["session", "sess", "session #", "session number"], gender: ["gender", "sex", "program", "discipline"],
  Vault: ["vault", "vt", "vlt"], Bars: ["bars", "ub", "uneven bars", "bar"], Beam: ["beam", "bb", "balance beam", "bm"], Floor: ["floor", "fx", "flr", "floor exercise"],
  Pommel: ["pommel", "ph", "pommel horse", "pom"], Rings: ["rings", "sr", "still rings", "rg"], "P-Bars": ["p-bars", "pbars", "pb", "parallel bars", "p bars"], "High Bar": ["high bar", "hb", "highbar", "horizontal bar"],
  Score: ["score", "points", "result", "total score"], aa: ["aa", "all around", "all-around", "allaround", "total", "aa score"], place: ["place", "aa place", "rank", "pl"],
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
  const problems = [];
  if (col.name == null && (col.first == null || col.last == null)) problems.push("Couldn't find a Name column (or First and Last).");
  const evCols = ["Vault", "Bars", "Beam", "Floor", "Pommel", "Rings", "P-Bars", "High Bar", "Score"].filter((e) => col[e] != null);
  if (!evCols.length && col.aa == null) problems.push("Couldn't find any score columns (Vault, Bars, Beam, Floor… or Score).");
  if (problems.length) return { rows: [], problems };
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = splitLine(line, sep), get = (k) => (col[k] != null ? c[col[k]] : "");
    const name = (col.name != null ? get("name") : `${get("first")} ${get("last")}`).replace(/\s+/g, " ").trim();
    if (!name || name.length < 2) continue;
    const g = String(get("gender") || defaults.gender || "").toUpperCase();
    const gender = /^(M|MALE|BOY|BOYS|MAG|MEN)/.test(g) ? "M" : /^(F|FEMALE|GIRL|GIRLS|WAG|WOMEN|XCEL)/.test(g) ? "F" : (evCols.some((e) => ["Pommel", "Rings", "P-Bars", "High Bar"].includes(e)) && !evCols.includes("Beam") ? "M" : defaults.gender || (sport === "Gymnastics" ? "F" : null));
    const scores = {};
    for (const e of evCols) { const v = num(get(e)); if (v != null) scores[e] = v; }
    const lvl = String(get("level") || defaults.level || "").trim();
    rows.push({ name, gym: get("gym") || defaults.gym || "", level: /^\d{1,2}$/.test(lvl) ? `Level ${lvl}` : lvl, division: get("division") || defaults.division || "", session: get("session") || defaults.session || "", gender: sport === "Gymnastics" ? gender : null,
      scores, aa: num(get("aa")) ?? totalOf(scores), place: num(get("place")) || null });
  }
  if (!rows.length) problems.push("No athlete rows found under the header.");
  return { rows, problems };
}
// Results → CSV (Live Scoring Pro export).
export function toCsv(rows, sport) {
  const evs = sport && sport !== "Gymnastics" ? ["Score"] : ["Vault", "Bars", "Beam", "Floor", "Pommel", "Rings", "P-Bars", "High Bar"];
  const used = evs.filter((e) => rows.some((r) => r.scores?.[e] != null));
  const q = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
  const head = ["Session", "Level", "Division", "Gender", "Name", "Gym", ...used, "AA", "Place"];
  const flat = rankRows(rows).flatMap((g) => g.rows);
  return [head.join(","), ...flat.map((r) => [r.session, r.level, r.division, r.gender, r.name, r.gym, ...used.map((e) => r.scores?.[e] ?? ""), r.aa ?? "", r.rank ?? ""].map(q).join(","))].join("\n");
}
