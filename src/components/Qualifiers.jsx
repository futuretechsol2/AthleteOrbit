import React, { useEffect, useState } from "react";
import { db } from "../lib/db.js";
import { Button, Field, Sheet, ErrorNote, fmt } from "../ui.jsx";

// Qualifying-score tracker: the parent enters the target (State meet AA, a move-up score, a swim cut)
// and the app checks it against every logged result. options: [[metric, label, better]]
export default function Qualifiers({ gymnast, options, bestOf, locked, onLocked, examples }) {
  const [rows, setRows] = useState(null); const [add, setAdd] = useState(false);
  const load = () => db.list("qualifiers", { gymnast_id: gymnast.id }).then(setRows).catch(() => setRows([]));
  useEffect(() => { if (!locked) load(); }, [gymnast.id, locked]);
  if (locked) return (
    <button className="card qual-locked" onClick={onLocked}><b>🎯 Qualifying-score tracker</b><span className="small muted">Set the State, Regionals or move-up score and see how close {gymnast.name} is after every meet.</span><span className="lock">Plus</span></button>
  );
  if (!rows) return null;
  return (
    <section className="card">
      <div className="card-head"><h3>🎯 Qualifying scores</h3><button className="link" onClick={() => setAdd(true)}>＋ Add</button></div>
      {!rows.length && <p className="muted small">Add a target like {examples} — we check it against every result.</p>}
      {rows.map((q) => {
        const best = bestOf(q.metric, q.better);
        const lower = q.better === "lower";
        const hit = best != null && (lower ? best <= Number(q.target) : best >= Number(q.target));
        const gap = best == null ? null : Math.abs(Number(q.target) - best);
        const pct = best == null ? 0 : hit ? 1 : lower ? Math.max(0, Math.min(1, Number(q.target) / best)) : Math.max(0, Math.min(1, best / Number(q.target)));
        const label = options.find((o) => o[0] === q.metric)?.[1] || q.metric;
        return (
          <div key={q.id} className={`qual ${hit ? "hit" : ""}`}>
            <div className="qual-top">
              <div className="grow"><b>{q.name}</b><small className="muted"> · {label} {lower ? "≤" : "≥"} {fmt.num(q.target)}{q.by_date ? ` · by ${fmt.date(q.by_date)}` : ""}</small></div>
              {hit ? <span className="pill pill-completed">Qualified ✓</span> : best == null ? <span className="pill">No result yet</span> : <span className="pill pill-warn">{fmt.num(gap)} to go</span>}
              <button className="icon-btn sm" aria-label="Remove target" onClick={async () => { await db.remove("qualifiers", q.id); load(); }}>✕</button>
            </div>
            <div className="stat-bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
            {best != null && <small className="muted">Best so far: {fmt.num(best)}</small>}
          </div>
        );
      })}
      {add && <QualForm gymnast={gymnast} options={options} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load(); }} />}
    </section>
  );
}

function QualForm({ gymnast, options, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", metric: options[0]?.[0] || "", target: "", by_date: "" }); const [err, setErr] = useState(null);
  const opt = options.find((o) => o[0] === f.metric);
  async function save(e) {
    e.preventDefault();
    let t = String(f.target).trim();
    if (t.includes(":")) { const [m, s2] = t.split(":"); t = Number(m) * 60 + Number(s2); }
    if (!f.name.trim() || isNaN(Number(t)) || t === "") return setErr(new Error("Add a name and a number (times can be 1:05.30)."));
    try { await db.insert("qualifiers", { gymnast_id: gymnast.id, name: f.name.trim().slice(0, 80), metric: f.metric, target: Number(t), better: opt?.[2] || "higher", by_date: f.by_date || null }); onSaved(); } catch (e2) { setErr(e2); }
  }
  return (
    <Sheet title="Add a qualifying score" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <Field label="What is it for?"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="State meet, Regionals, move up to Level 6…" required autoFocus /></Field>
        <div className="grid2">
          <Field label="Score type"><select value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label={opt?.[2] === "lower" ? "Time needed (or faster)" : "Score needed"} hint="Check the current number with your coach or the meet packet"><input inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} required /></Field>
        </div>
        <Field label="Deadline (optional)"><input type="date" value={f.by_date} onChange={(e) => setF({ ...f, by_date: e.target.value })} /></Field>
        <ErrorNote error={err} />
        <Button className="wide">Save target</Button>
      </form>
    </Sheet>
  );
}
