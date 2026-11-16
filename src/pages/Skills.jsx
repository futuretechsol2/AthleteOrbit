import React, { useEffect, useState } from "react";
import { db } from "../lib/db.js";
import { SKILL_STATUSES } from "../data/skills.js";
import { skillsForChild, levelsFor, sportOf, conf } from "../data/sports.js";

const NEXT = Object.fromEntries(SKILL_STATUSES.map((s, i) => [s, SKILL_STATUSES[(i + 1) % SKILL_STATUSES.length]]));

export default function Skills({ gymnast }) {
  const [level, setLevel] = useState(gymnast.level);
  const [st, setSt] = useState(null);
  useEffect(() => { setLevel(gymnast.level); }, [gymnast.id, gymnast.level]);
  useEffect(() => { db.list("skill_status", { gymnast_id: gymnast.id }).then((r) => setSt(Object.fromEntries(r.map((x) => [x.skill_key, x.status])))); }, [gymnast.id]);
  if (!st) return <div className="skeleton" />;
  const sport = sportOf(gymnast), S = conf(sport);
  const list = skillsForChild(gymnast, level);
  const levels = levelsFor(sport, gymnast.program) || [];
  const events = [...new Set(list.map((s) => s.event))];
  const done = (k) => ["Have it", "Competed"].includes(st[k]);
  const pct = list.length ? Math.round((list.filter((s) => done(s.key)).length / list.length) * 100) : 0;

  async function cycle(key) {
    const next = NEXT[st[key] || "Not started"];
    setSt({ ...st, [key]: next });
    try { await db.setSkill(gymnast.id, key, next); } catch { setSt((p) => ({ ...p, [key]: st[key] })); }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Skills</h1>
        <select className="compact" value={level} onChange={(e) => setLevel(e.target.value)} aria-label={S.level}>
          {(levels.includes(level) ? levels : [level, ...levels]).map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      {!list.length && <p className="muted">No checklist for this {S.level.toLowerCase()} yet. Pick another one above, or use Goals to track what the coach is working on.</p>}
      <section className="card">
        <div className="card-head"><h3>{level} readiness</h3><b className="big">{pct}%</b></div>
        <div className="stat-bar big-bar"><i style={{ width: `${pct}%` }} /></div>
        <p className="muted small">Tap a skill to move it along: Not started → Learning → Drill → Have it → Competed.</p>
      </section>
      {events.map((ev) => {
        const items = list.filter((s) => s.event === ev);
        const n = items.filter((s) => done(s.key)).length;
        return (
          <section key={ev} className="card">
            <div className="card-head"><h3>{ev}</h3><span className="muted small">{n}/{items.length}</span></div>
            {items.map((s) => {
              const v = st[s.key] || "Not started";
              return (
                <button key={s.key} className="skill" onClick={() => cycle(s.key)}>
                  <span>{s.skill}</span>
                  <span className={`status s-${v.replace(" ", "-").toLowerCase()}`}>{v}</span>
                </button>
              );
            })}
          </section>
        );
      })}
      <p className="muted small center">Typical skills to help parents follow progress — not an official curriculum. Your coach decides readiness and level moves.</p>
    </div>
  );
}
