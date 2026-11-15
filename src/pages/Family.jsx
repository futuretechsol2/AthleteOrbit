import React, { useEffect, useState } from "react";
import { loadFamily, buildAlerts } from "../lib/alerts.js";
import { db } from "../lib/db.js";
import { seasonOf, spendSummary, budgetStatus } from "../data/family.js";
import { allAround, PROGRAM_LABEL } from "../data/skills.js";
import { fmt, today, Button, Avatar } from "../ui.jsx";
import { conf, sportOf } from "../data/sports.js";

// Combined family view: every child, the next few weeks, money, and alerts.
export default function Family({ go, pickChild, can, upgrade, me }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadFamily(), db.list("scores"), db.list("stats")])
      .then(([f, scores, stats]) => live && setD({ ...f, scores, stats }))
      .catch(() => live && setD({ gymnasts: [], meets: [], costs: [], budgets: [], events: [], scores: [], stats: [], ann: [] }));
    return () => { live = false; };
  }, []);
  if (!d) return <div className="skeleton" />;
  const t = today(), season = seasonOf(t);
  const alerts = buildAlerts(d, me);
  const spend = spendSummary(d.costs, season, d.gymnasts);
  const total = budgetStatus(d.budgets, d.costs, season).find((b) => !b.gymnast_id && !b.category);
  const name = (id) => d.gymnasts.find((g) => g.id === id)?.name || "Family";
  const upcoming = [
    ...d.meets.filter((m) => (m.end_date || m.start_date) >= t && m.status !== "Skipped").map((m) => ({ date: m.start_date, who: name(m.gymnast_id), title: m.name, where: m.location, kind: "meet", go: () => go("meets", { meetId: m.id }), gid: m.gymnast_id })),
  ].sort((a, b) => (a.date > b.date ? 1 : -1)).slice(0, 6);

  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">Family · all sports · Season {season}</p>
        <h1>{d.gymnasts.map((g) => g.name).join(", ")}</h1>
        <p className="hero-sub">{upcoming.length ? <>Next up: <strong>{upcoming[0].who}</strong> · {upcoming[0].title} · {fmt.date(upcoming[0].date)}</> : "No events on the calendar yet."}</p>
      </section>

      {alerts.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Needs attention</h3><span className="pill pill-warn">{alerts.length}</span></div>
          {alerts.slice(0, 5).map((a, i) => (
            <button key={i} className={`alert-row a-${a.level}`} onClick={() => go(...a.go)}><span aria-hidden>{a.icon}</span><span className="grow">{a.text}</span><span aria-hidden>›</span></button>
          ))}
        </section>
      )}

      <div className="kids">
        {d.gymnasts.map((g) => {
          const last = g.program === "Other"
            ? d.stats.filter((s) => s.gymnast_id === g.id).slice(-1)[0]
            : d.scores.filter((s) => s.gymnast_id === g.id).slice(-1)[0];
          return (
            <button key={g.id} className="card kid" onClick={() => pickChild(g.id)} style={{ "--kid": g.color || undefined }}>
              <Avatar src={g.photo} name={g.name} size={44} />
              <div className="grow">
                <b>{g.name}</b>
                <p className="muted small">{conf(sportOf(g)).icon} {g.program === "Other" ? sportOf(g) : PROGRAM_LABEL[g.program].replace("Gymnastics ", "Gym ")} · {g.level}</p>
                <p className="small">{last ? (g.program === "Other" ? `${last.metric} ${last.value}${last.unit === "sec" ? "s" : ` ${last.unit || ""}`}` : `Latest AA ${fmt.score(allAround(last))}`) : "No results yet"}</p>
              </div>
              <span className="money small">{fmt.money(spend.byChild[g.name] || 0)}</span>
            </button>
          );
        })}
      </div>

      <section className="card" onClick={() => go("costs")} role="button" tabIndex={0}>
        <div className="card-head"><h3>Season spending</h3><span className="link">Costs & budget ›</span></div>
        <div className="money-row"><b className="big">{fmt.money(spend.total)}</b>{total ? <span className="muted"> of {fmt.money(total.amount)} budget</span> : <span className="muted"> · no budget set</span>}</div>
        {total && <div className="stat-bar big-bar"><i className={total.pct >= 1 ? "over" : ""} style={{ width: `${Math.min(100, Math.round(total.pct * 100))}%` }} /></div>}
        {spend.unpaid > 0 && <p className="warn-text small">{fmt.money(spend.unpaid)} unpaid</p>}
      </section>

      <section className="card">
        <div className="card-head"><h3>Coming up</h3><button className="link" onClick={() => go("meets")}>All events ›</button></div>
        {!upcoming.length && <p className="muted">Add events or family plans to see them here.</p>}
        {upcoming.map((u, i) => (
          <button key={i} className="list-row" onClick={u.go}>
            <div className="date-chip"><b>{new Date(`${u.date}T12:00:00`).getDate()}</b><small>{new Date(`${u.date}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</small></div>
            <div className="grow"><b>{u.title}</b><p className="muted small">{u.who}{u.where ? ` · ${u.where}` : ""}</p></div>
            <span className={`pill ${u.kind === "meet" ? "pill-registered" : ""}`}>{u.kind === "meet" ? conf(sportOf(d.gymnasts.find((g) => g.id === u.gid))).event : "Family"}</span>
          </button>
        ))}
      </section>

      <button className="card ask-cta" onClick={() => go("photos")}>
        <span aria-hidden>📸</span>
        <span className="grow"><b>Photos, prints & season books</b><small className="muted">Every child's {""}event photos sorted by date — order prints or a printed season book</small></span>
      </button>
    </div>
  );
}
