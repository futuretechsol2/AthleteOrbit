import React, { useEffect, useState } from "react";
import { db } from "../lib/db.js";
import { skillsForChild, sportOf } from "../data/sports.js";
import { Button, Field, Sheet, ErrorNote, Empty, fmt, today } from "../ui.jsx";
import Skills from "./Skills.jsx";

// Progress = skills checklist (gymnastics) + goals + coach notes (every sport).
export default function Progress(props) {
  const { gymnast, can, upgrade } = props;
  const has = sportOf(gymnast) === "Gymnastics" || skillsForChild(gymnast).length > 0;
  const [tab, setTab] = useState(props.params?.tab || (has ? "skills" : "goals"));
  useEffect(() => { setTab(props.params?.tab || (has ? "skills" : "goals")); }, [gymnast.id, props.params]);
  const tabs = [...(has ? [["skills", "Skills"]] : []), ["practice", "Practice"], ["goals", "Goals"], ["notes", "Coach notes"]];
  if (can && !can("skills")) return <Empty icon="✅" title="Skills, goals & coach notes need a plan" text={`Track every skill by ${"level"}, set goals with dates and keep the coach's notes in one place — the AI coach uses them too.`} action={<Button onClick={() => upgrade("skills")}>See plans</Button>} />;
  return (
    <div className="stack">
      <div className="chips">{tabs.map(([k, l]) => <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "skills" ? <Skills {...props} /> : tab === "practice" ? <Practice gymnast={gymnast} /> : tab === "goals" ? <Goals gymnast={gymnast} /> : <Notes gymnast={gymnast} />}
    </div>
  );
}

const GOAL_HINT = { Gymnastics: "Back walkover on beam", Swimming: "Break 35s in the 50 free", "Cheer & Dance": "Standing back tuck by spring", Soccer: "Score with the weaker foot", Basketball: "70% at the free-throw line", Tennis: "60% first serves in" };

function Goals({ gymnast }) {
  const [rows, setRows] = useState(null); const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [err, setErr] = useState(null);
  const load = () => db.list("goals", { gymnast_id: gymnast.id }).then(setRows);
  useEffect(() => { load(); }, [gymnast.id]);
  if (!rows) return <div className="skeleton" />;
  const open = rows.filter((g) => !g.done), done = rows.filter((g) => g.done);
  async function add(e) {
    e.preventDefault(); if (!title.trim()) return;
    try { await db.insert("goals", { gymnast_id: gymnast.id, title: title.trim().slice(0, 140), target_date: date || null }); setTitle(""); setDate(""); load(); } catch (e2) { setErr(e2); }
  }
  const toggle = async (g) => { await db.update("goals", g.id, { done: !g.done }); load(); };
  return (
    <div className="stack">
      <div className="page-head"><h1>Goals</h1><span className="muted">{done.length}/{rows.length} reached</span></div>
      <form className="card form" onSubmit={add}>
        <Field label="New goal"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={GOAL_HINT[sportOf(gymnast)]} /></Field>
        <div className="row"><input type="date" className="grow" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Target date" /><Button disabled={!title.trim()}>Add goal</Button></div>
        <ErrorNote error={err} />
      </form>
      {[...open, ...done].map((g) => {
        const days = g.target_date ? fmt.daysUntil(g.target_date) : null;
        return (
          <div key={g.id} className="card goal">
            <label className="check grow"><input type="checkbox" checked={g.done} onChange={() => toggle(g)} /><span className={g.done ? "struck" : ""}>{g.title}</span></label>
            {g.target_date && !g.done && <span className={`pill ${days < 0 ? "pill-warn" : ""}`}>{days < 0 ? "Past due" : `by ${fmt.date(g.target_date)}`}</span>}
            {g.done && <span className="pill pill-completed">Done ★</span>}
            <button className="icon-btn sm" aria-label="Delete goal" onClick={async () => { await db.remove("goals", g.id); load(); }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

function Notes({ gymnast }) {
  const [rows, setRows] = useState(null); const [edit, setEdit] = useState(null);
  const load = () => db.list("coach_notes", { gymnast_id: gymnast.id }).then(setRows);
  useEffect(() => { load(); }, [gymnast.id]);
  if (!rows) return <div className="skeleton" />;
  return (
    <div className="stack">
      <div className="page-head"><h1>Coach notes</h1><Button onClick={() => setEdit({})}>＋ Add</Button></div>
      {gymnast.coach_name && <p className="muted small">Coach: <b>{gymnast.coach_name}</b>{gymnast.coach_phone ? ` · ${gymnast.coach_phone}` : ""}{gymnast.coach_email ? ` · ${gymnast.coach_email}` : ""}</p>}
      {!rows.length && <p className="muted">Write down what the coach says after practice or a meet. The AI coach uses these notes too.</p>}
      {rows.map((n) => (
        <button key={n.id} className="card note-card" onClick={() => setEdit(n)}>
          <p className="muted small">{fmt.date(n.noted_on)} · {n.source}</p><p className="pre">{n.body}</p>
        </button>
      ))}
      {edit && <NoteForm gymnast={gymnast} row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function NoteForm({ gymnast, row, onClose, onSaved }) {
  const [f, setF] = useState({ noted_on: row.noted_on || today(), source: row.source || "Coach", body: row.body || "" }); const [err, setErr] = useState(null);
  return (
    <Sheet title={row.id ? "Edit note" : "Add coach note"} onClose={onClose}>
      <form className="form" onSubmit={async (e) => { e.preventDefault(); try { const rec = { ...f, gymnast_id: gymnast.id }; row.id ? await db.update("coach_notes", row.id, rec) : await db.insert("coach_notes", rec); onSaved(); } catch (e2) { setErr(e2); } }}>
        <div className="grid2">
          <Field label="Date"><input type="date" value={f.noted_on} onChange={(e) => setF({ ...f, noted_on: e.target.value })} /></Field>
          <Field label="From"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{["Coach", "Practice", "Competition", "Parent"].map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Note"><textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required placeholder="What the coach said after practice" /></Field>
        <ErrorNote error={err} />
        <div className="row end">{row.id && <Button type="button" kind="danger" onClick={async () => { await db.remove("coach_notes", row.id); onSaved(); }}>Delete</Button>}<Button>Save</Button></div>
      </form>
    </Sheet>
  );
}

const KINDS = ["Practice", "Private lesson", "Conditioning", "Competition", "Rest day"];
const AREAS = ["Wrist", "Elbow", "Shoulder", "Back", "Hip", "Knee", "Ankle", "Foot", "Head", "Other"];
const ENERGY = ["😫", "😕", "🙂", "😃", "🤩"];
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

// Training hours, energy and pain. Repeated pain is flagged so parents get it checked early.
export function painFlag(logs) {
  const recent = logs.filter((l) => l.practiced_on >= dayOffset(7) && Number(l.pain) >= 3);
  return recent.length >= 2 || logs.some((l) => l.practiced_on >= dayOffset(7) && Number(l.pain) >= 6) ? recent : null;
}

function Practice({ gymnast }) {
  const [rows, setRows] = useState(null); const [f, setF] = useState({ practiced_on: today(), minutes: 180, kind: "Practice", energy: 4, pain: 0, pain_area: "", notes: "" }); const [err, setErr] = useState(null); const [saved, setSaved] = useState(false);
  const load = () => db.list("practice_logs", { gymnast_id: gymnast.id }).then(setRows);
  useEffect(() => { load(); }, [gymnast.id]);
  if (!rows) return <div className="skeleton" />;
  const week = rows.filter((r) => r.practiced_on >= dayOffset(6));
  const hours = (list) => Math.round(list.reduce((a, r) => a + Number(r.minutes || 0), 0) / 6) / 10;
  const weeks = [3, 2, 1, 0].map((w) => { const from = dayOffset(w * 7 + 6), to = dayOffset(w * 7); return { label: w ? `${w}w ago` : "This week", h: hours(rows.filter((r) => r.practiced_on >= from && r.practiced_on <= to)) }; });
  const max = Math.max(1, ...weeks.map((w) => w.h));
  const flag = painFlag(rows);
  async function add(e) {
    e.preventDefault(); setErr(null);
    const rec = { gymnast_id: gymnast.id, practiced_on: f.practiced_on, minutes: f.kind === "Rest day" ? 0 : Number(f.minutes) || 0, kind: f.kind, energy: Number(f.energy), pain: Number(f.pain), pain_area: Number(f.pain) > 0 ? f.pain_area || null : null, notes: f.notes.trim() || null };
    try { await db.insert("practice_logs", rec); setSaved(true); setTimeout(() => setSaved(false), 1500); setF({ ...f, notes: "", pain: 0, pain_area: "" }); load(); } catch (e2) { setErr(e2); }
  }
  return (
    <div className="stack">
      <div className="page-head"><h1>Practice</h1><span className="muted">{hours(week)} h this week</span></div>
      {flag && <div className="card pain-flag"><b>⚠️ {gymnast.name} reported pain {flag.length > 1 ? `${flag.length} times` : ""} this week</b><p className="small">{[...new Set(flag.map((l) => l.pain_area).filter(Boolean))].join(", ") || "Area not noted"}. Pain that keeps coming back is worth checking with a doctor or physical therapist before it becomes an injury — and tell the coach.</p></div>}
      <section className="card">
        <h3>Weekly hours</h3>
        <div className="bars">{weeks.map((w) => <div key={w.label} className="bar-col"><div className="bar" style={{ height: `${Math.round((w.h / max) * 100)}%` }}><b>{w.h}</b></div><small>{w.label}</small></div>)}</div>
      </section>
      <form className="card form" onSubmit={add}>
        <h3>Log today</h3>
        <div className="chips">{KINDS.map((k) => <button type="button" key={k} className={`chip ${f.kind === k ? "on" : ""}`} onClick={() => setF({ ...f, kind: k })}>{k}</button>)}</div>
        <div className="grid2">
          <Field label="Date"><input type="date" value={f.practiced_on} onChange={(e) => setF({ ...f, practiced_on: e.target.value })} /></Field>
          {f.kind !== "Rest day" && <Field label="Minutes"><input inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></Field>}
        </div>
        <Field label="Energy"><div className="energy">{ENERGY.map((e, i) => <button type="button" key={i} className={Number(f.energy) === i + 1 ? "on" : ""} onClick={() => setF({ ...f, energy: i + 1 })} aria-label={`Energy ${i + 1} of 5`}>{e}</button>)}</div></Field>
        <Field label={`Any pain? ${f.pain}/10`}><input type="range" min="0" max="10" value={f.pain} onChange={(e) => setF({ ...f, pain: e.target.value })} /></Field>
        {Number(f.pain) > 0 && <Field label="Where?"><div className="chips">{AREAS.map((a) => <button type="button" key={a} className={`chip ${f.pain_area === a ? "on" : ""}`} onClick={() => setF({ ...f, pain_area: a })}>{a}</button>)}</div></Field>}
        <Field label="Notes (optional)"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} placeholder="New skill on bars, coach said…" /></Field>
        <ErrorNote error={err} />
        <Button className="wide">{saved ? "Saved ✓" : "Save log"}</Button>
      </form>
      {[...rows].reverse().slice(0, 14).map((r) => (
        <div key={r.id} className="card list-row">
          <div className="grow"><b>{r.kind}{r.minutes ? ` · ${Math.round(r.minutes / 6) / 10} h` : ""}</b><p className="muted small">{fmt.date(r.practiced_on)}{r.energy ? ` · ${ENERGY[r.energy - 1]}` : ""}{r.notes ? ` · ${r.notes}` : ""}</p></div>
          {Number(r.pain) > 0 && <span className={`pill ${r.pain >= 3 ? "pill-warn" : ""}`}>Pain {r.pain}/10{r.pain_area ? ` · ${r.pain_area}` : ""}</span>}
          <button className="icon-btn sm" aria-label="Delete log" onClick={async () => { await db.remove("practice_logs", r.id); load(); }}>✕</button>
        </div>
      ))}
      <p className="muted small center">For awareness only — not medical advice. Ongoing pain, swelling or a pop/snap means see a doctor.</p>
    </div>
  );
}
