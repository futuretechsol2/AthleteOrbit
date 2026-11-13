// Who goes to which competition: match a competition's levels and girls/boys to an athlete.
// Shared by the app (previews) and the server (building each family's schedule).
import { sportOf } from "./sports.js";

// "Level 4", "L4", "lvl 4", "4" → "l4" · "Xcel Gold", "gold" → "x-gold" · anything else → letters and digits only.
export function levelKey(s) {
  const t = String(s || "").toLowerCase();
  const x = /(bronze|silver|gold|platinum|diamond|sapphire)/.exec(t);
  if (x) return `x-${x[1]}`;
  const n = /(?:level|lvl|\bl)\s*\.?\s*(\d{1,2})\b/.exec(t) || /^\s*(\d{1,2})\s*$/.exec(t);
  if (n) return `l${Number(n[1])}`;
  return t.replace(/[^a-z0-9]/g, "");
}
// Girls/boys: stored on the athlete, or implied by the gymnastics program.
export const genderOf = (a) => a?.gender || (a?.program === "MAG" ? "M" : a?.program === "WAG" || a?.program === "Xcel" ? "F" : null);
export function parseGender(v) {
  const t = String(v || "").trim().toLowerCase();
  if (/^(f|g|girl|girls|female|women|woman|wag|w)$/.test(t)) return "F";
  if (/^(m|b|boy|boys|male|men|man|mag)$/.test(t)) return "M";
  return null;
}
// Does this competition apply to this athlete? Empty levels = every level; no gender = everyone.
export function meetMatches(meet, athlete) {
  if (meet.sport && sportOf(athlete) !== meet.sport) return false;
  const g = genderOf(athlete);
  if (meet.gender && g && meet.gender !== g) return false;
  const levels = Array.isArray(meet.levels) ? meet.levels.filter(Boolean) : [];
  if (!levels.length) return true;
  const mine = levelKey(athlete.level);
  return levels.some((l) => levelKey(l) === mine);
}
// The session line for this athlete, when the meet has published sessions: [{levels, gender, text}].
export function sessionFor(meet, athlete) {
  const list = Array.isArray(meet.sessions) ? meet.sessions.filter((s) => s && s.text) : [];
  if (!list.length) return null;
  const hit = list.find((s) => (s.levels || []).length && meetMatches({ levels: s.levels, gender: s.gender || null }, athlete));
  if (hit) return hit.text;
  const open = list.filter((s) => !(s.levels || []).length && (!s.gender || !genderOf(athlete) || s.gender === genderOf(athlete)));
  return open.length === 1 ? open[0].text : null;
}
export const levelsLabel = (m) => `${m.gender === "F" ? "Girls · " : m.gender === "M" ? "Boys · " : ""}${(m.levels || []).length ? m.levels.join(", ") : "All levels"}`;
// "Maya Patel" → "Maya P." (what other parents see when searching the roster).
export const shortName = (name) => { const p = String(name || "").trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p.at(-1)[0].toUpperCase()}.` : p[0] || ""; };

// Roster pasted from a spreadsheet or typed: one athlete per line — Name, Level, Girl/Boy, parent email (any order after the name).
// Works with commas, tabs or semicolons; a header line is skipped.
export function parseRoster(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const cells = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
    if (!cells.length) continue;
    if (/^(athlete|name|first|gymnast|student)\b/i.test(cells[0]) && cells.some((c) => /level|group/i.test(c))) continue;
    const row = { name: cells[0] };
    // "Last, First" exported with two name columns: second cell is a plain word and a level follows.
    let rest = cells.slice(1);
    if (rest.length >= 2 && /^[A-Za-z'’.-]+$/.test(rest[0]) && !parseGender(rest[0]) && !/^(bronze|silver|gold|platinum|diamond|sapphire|team|pre-?team)$/i.test(rest[0])) { row.name = `${cells[0]} ${rest[0]}`; rest = rest.slice(1); }
    for (const c of rest) {
      if (/@/.test(c)) row.parent_email = c;
      else if (parseGender(c) && !row.gender) row.gender = parseGender(c);
      else if (/^(wag|mag|xcel)$/i.test(c)) row.program = c;
      else if (!row.level) row.level = /^\d{1,2}$/.test(c) ? `Level ${c}` : c;
      else if (!row.group) row.group = c;
    }
    if (row.name.length >= 2) out.push(row);
  }
  return out;
}
