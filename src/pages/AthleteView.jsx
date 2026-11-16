// Athlete view: a read-only screen for kids on a parent's device. They see their own meets, scores, skills,
// goals, photos and Coach G tips, but there is nothing to edit, no messages, no billing and no settings.
// Leaving it needs the parent's 4-digit PIN.
import React, { useEffect, useState } from "react";
import { db, api } from "../lib/db.js";
import { conf, sportOf, skillsForChild, usesScores } from "../data/sports.js";
import { allAround } from "../data/skills.js";
import { Button, Field, Sheet, ErrorNote, Spinner, Markdown, Avatar, fmt } from "../ui.jsx";

const KEY = "ao-athlete-view";
async function hash(pin) {
  const data = new TextEncoder().encode(`athleteorbit:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function athleteViewState() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }

// Parent turns it on (from More).
export function AthleteViewSetup({ kids, onClose }) {
  const [gid, setGid] = useState(kids[0]?.id || ""); const [pin, setPin] = useState(""); const [pin2, setPin2] = useState(""); const [err, setErr] = useState(null);
  async function start(e) {
    e.preventDefault(); setErr(null);
    if (!/^\d{4}$/.test(pin)) return setErr(new Error("Choose a 4-digit PIN."));
    if (pin !== pin2) return setErr(new Error("The PINs don't match."));
    try { localStorage.setItem(KEY, JSON.stringify({ gymnastId: gid, pin: await hash(pin), since: Date.now() })); location.href = "/"; } catch { setErr(new Error("Couldn't turn on Athlete view on this device.")); }
  }
  return (
    <Sheet title="Athlete view for kids" onClose={onClose}>
      <form className="form" onSubmit={start}>
        <p>Hand your phone or tablet to your athlete. They can <b>see</b> their meets, scores, skills, goals, photos and Coach G tips — but can't change anything, message anyone, buy anything or see billing.</p>
        {kids.length > 1 && <Field label="Athlete"><select value={gid} onChange={(e) => setGid(e.target.value)}>{kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>}
        <div className="grid2"><Field label="Parent PIN (4 digits)"><input inputMode="numeric" type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoComplete="off" /></Field>
          <Field label="Repeat PIN"><input inputMode="numeric" type="password" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} autoComplete="off" /></Field></div>
        <p className="muted small">You'll need the PIN to leave Athlete view. It's saved on this device only. Forgot it? Sign out and sign back in from the login page.</p>
        <ErrorNote error={err} />
        <Button className="wide">Start Athlete view</Button>
      </form>
    </Sheet>
  );
}

export default function AthleteView({ gymnast, state }) {
  const [d, setD] = useState(null); const [tab, setTab] = useState("home"); const [exit, setExit] = useState(false);
  const S = conf(sportOf(gymnast));
  useEffect(() => {
    const id = gymnast.id;
    Promise.all([db.list("meets", { gymnast_id: id }), usesScores(gymnast) ? db.list("scores", { gymnast_id: id }) : db.list("stats", { gymnast_id: id }), db.list("skill_status", { gymnast_id: id }), db.list("goals", { gymnast_id: id }), db.list("ai_notes", { gymnast_id: id }).catch(() => []), api("photos", null, "GET", { gymnast: id }).catch(() => ({ photos: [] }))])
      .then(([meets, results, skills, goals, notes, ph]) => setD({ meets, results, skills: Object.fromEntries(skills.map((x) => [x.skill_key, x.status])), goals, notes, photos: ph.photos || [] }));
  }, [gymnast.id]);
  const today = new Date().toISOString().slice(0, 10);
  const tabs = [["home", "⌂", "Home"], ["meets", "🗓", S.events], ["results", "★", S.results], ["skills", "✓", "Skills"], ["photos", "📸", "Photos"]];
  return (
    <div className="athlete-view">
      <header className="av-top"><Avatar src={gymnast.photo} name={gymnast.name} size={38} /><b className="grow">{gymnast.name}'s space</b><button className="av-lock" onClick={() => setExit(true)} aria-label="Leave Athlete view (parent PIN)">🔒 Parent</button></header>
      <main className="content av-main">
        {!d ? <Spinner label="Loading…" /> : tab === "home" ? <AvHome g={gymnast} S={S} d={d} today={today} /> : tab === "meets" ? <AvMeets d={d} today={today} S={S} /> : tab === "results" ? <AvResults g={gymnast} d={d} S={S} /> : tab === "skills" ? <AvSkills g={gymnast} d={d} /> : <AvPhotos d={d} />}
      </main>
      <nav className="tabbar">{tabs.map(([k, i, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><span className="tab-icon" aria-hidden>{i}</span>{l}</button>)}</nav>
      {exit && <ExitPin state={state} onClose={() => setExit(false)} />}
    </div>
  );
}
function ExitPin({ state, onClose }) {
  const [pin, setPin] = useState(""); const [err, setErr] = useState(null); const [tries, setTries] = useState(0);
  async function check(e) {
    e.preventDefault();
    if (tries >= 5) return setErr(new Error("Too many tries. Wait a minute."));
    if ((await hash(pin)) === state.pin) { try { localStorage.removeItem(KEY); } catch {} location.href = "/"; }
    else { setTries(tries + 1); setPin(""); setErr(new Error("That's not the parent PIN.")); if (tries + 1 >= 5) setTimeout(() => setTries(0), 60000); }
  }
  return (
    <Sheet title="Parent PIN" onClose={onClose}>
      <form className="form" onSubmit={check}><p className="muted">Enter the parent PIN to leave Athlete view.</p>
        <input className="pin-input" inputMode="numeric" type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus aria-label="Parent PIN" />
        <ErrorNote error={err} /><Button className="wide" disabled={pin.length !== 4}>Unlock</Button></form>
    </Sheet>
  );
}
function AvHome({ g, S, d, today }) {
  const next = d.meets.filter((m) => m.start_date >= today && m.status !== "Skipped").sort((a, b) => (a.start_date > b.start_date ? 1 : -1))[0];
  const tip = d.notes.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const openGoals = d.goals.filter((x) => !x.done);
  return (
    <div className="stack">
      <section className="hero"><p className="eyebrow">{S.icon} {g.level}</p><h1>Hi {g.name}!</h1><p className="hero-sub">{next ? `${fmt.daysUntil(next.start_date) <= 0 ? "Today" : `${fmt.daysUntil(next.start_date)} days`} until ${next.name}. You've got this!` : "Keep working hard — your next meet will show up here."}</p></section>
      {next && <section className="card"><h3>Next up: {next.name}</h3><p className="muted small">{fmt.date(next.start_date)}{next.location ? ` · ${next.location}` : ""}{next.session_time ? ` · 🕐 ${next.session_time}` : ""}</p>
        {(next.checklist || []).length > 0 && <><b className="small">Packing list</b><ul className="av-check">{next.checklist.map((c, i) => <li key={i} className={c.done ? "done" : ""}>{c.done ? "✓" : "○"} {c.item || c.text || c}</li>)}</ul></>}</section>}
      {openGoals.length > 0 && <section className="card"><h3>🎯 My goals</h3><ul className="av-check">{openGoals.map((x) => <li key={x.id}>○ {x.title}{x.target_date ? <small className="muted"> · by {fmt.date(x.target_date)}</small> : null}</li>)}</ul></section>}
      {tip && <section className="card"><h3>✦ From Coach G</h3><Markdown text={String(tip.body || tip.content || "").slice(0, 900)} /></section>}
    </div>
  );
}
function AvMeets({ d, today, S }) {
  const up = d.meets.filter((m) => m.start_date >= today).sort((a, b) => (a.start_date > b.start_date ? 1 : -1));
  const past = d.meets.filter((m) => m.start_date < today).sort((a, b) => (a.start_date < b.start_date ? 1 : -1)).slice(0, 10);
  const row = (m) => <div key={m.id} className="list-row"><span className="grow"><b>{m.name}</b><small className="muted"> · {fmt.date(m.start_date)}{m.location ? ` · ${m.location}` : ""}</small>{m.session_time && <p className="small session-line">🕐 {m.session_time}</p>}</span></div>;
  return <div className="stack"><h1>{S.events}</h1><section className="card"><h3>Coming up</h3>{up.length ? up.map(row) : <p className="muted">Nothing scheduled yet.</p>}</section>{past.length > 0 && <section className="card"><h3>Done</h3>{past.map(row)}</section>}</div>;
}
function AvResults({ g, d, S }) {
  const rows = d.results.sort((a, b) => ((a.meet_date || a.event_date) < (b.meet_date || b.event_date) ? 1 : -1));
  return <div className="stack"><h1>My {S.results.toLowerCase()}</h1>{!rows.length ? <p className="muted">No results yet.</p> : rows.map((r) => usesScores(g) ? (
    <section key={r.id} className="card"><div className="card-head"><b>{r.meet_name}</b><b>{allAround(r)?.toFixed(3) || "–"}</b></div><p className="muted small">{fmt.date(r.meet_date)}</p>
      <div className="live-events">{[["Vault", r.vault], ["Bars", r.bars], ["Beam", r.beam], ["Floor", r.floor], ["Pommel", r.pommel], ["Rings", r.rings], ["P-Bars", r.pbars], ["High Bar", r.highbar]].filter(([, v]) => v != null && v !== "").map(([k, v]) => <span key={k} className="ev"><small>{k}</small>{Number(v).toFixed(3)}</span>)}</div></section>
  ) : <div key={r.id} className="list-row"><span className="grow"><b>{r.metric}</b><small className="muted"> · {r.event_name || ""} {fmt.date(r.event_date)}</small></span><b>{r.value}{r.unit ? ` ${r.unit}` : ""}</b></div>)}</div>;
}
function AvSkills({ g, d }) {
  const list = skillsForChild(g); const by = {};
  for (const s of list) (by[s.event] ||= []).push(s);
  const have = list.filter((s) => ["Have it", "Competed"].includes(d.skills[s.key])).length;
  return <div className="stack"><h1>My skills</h1><p className="muted">{have} of {list.length} skills for {g.level}. Ask your coach what to work on next!</p>
    {Object.entries(by).map(([ev, items]) => <section key={ev} className="card"><h3>{ev}</h3>{items.map((s) => { const st = d.skills[s.key] || "Not started"; return <div key={s.key} className="list-row"><span className="grow">{s.skill}</span><span className={`pill ${["Have it", "Competed"].includes(st) ? "pill-me" : ""}`}>{st}</span></div>; })}</section>)}</div>;
}
function AvPhotos({ d }) {
  if (!d.photos.length) return <div className="stack"><h1>Photos</h1><p className="muted">No photos yet.</p></div>;
  return <div className="stack"><h1>Photos</h1><div className="photo-grid">{d.photos.map((p) => <div key={p.id} className="photo-tile"><img src={p.url} alt={p.caption || ""} loading="lazy" /></div>)}</div></div>;
}
