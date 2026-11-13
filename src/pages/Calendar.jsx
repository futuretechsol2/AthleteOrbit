import React, { useEffect, useState } from "react";
import { db, api, DEMO } from "../lib/db.js";
import { findConflicts } from "../data/family.js";
import { Button, Field, Sheet, ErrorNote, fmt, today } from "../ui.jsx";

// One calendar for the whole family: every child's meets, entry deadlines and family events, with clashes flagged.
export default function Calendar({ gymnasts, go, can = () => true, upgrade = () => {} }) {
  const [d, setD] = useState(null); const [edit, setEdit] = useState(null); const [sub, setSub] = useState(false);
  const load = () => Promise.all([db.list("meets"), db.list("family_events")]).then(([meets, events]) => setD({ meets, events }));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="skeleton" />;
  const t = today(), name = (id) => gymnasts.find((g) => g.id === id)?.name || "Family";
  const conflicts = findConflicts(d.meets, d.events, gymnasts, t);
  const clashDays = new Set(conflicts.map((c) => c.date));
  const items = [
    ...d.meets.filter((m) => m.status !== "Skipped").map((m) => ({ date: m.start_date, end: m.end_date, title: m.name, who: name(m.gymnast_id), where: m.location, time: m.session_time, kind: "Meet", onClick: () => go("meets", { meetId: m.id }) })),
    ...d.meets.filter((m) => m.entry_deadline && m.status === "Planned").map((m) => ({ date: m.entry_deadline, title: `Entry deadline: ${m.name}`, who: name(m.gymnast_id), kind: "Deadline", onClick: () => go("meets", { meetId: m.id }) })),
    ...d.events.map((e) => ({ date: e.start_date, end: e.end_date, title: e.title, who: e.gymnast_id ? name(e.gymnast_id) : "Family", where: e.location, time: e.start_time, kind: "Family", onClick: () => setEdit(e) })),
  ].filter((i) => (i.end || i.date) >= t).sort((a, b) => (a.date > b.date ? 1 : -1));
  const months = {};
  for (const i of items) { const k = new Date(`${i.date}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }); (months[k] ||= []).push(i); }
  return (
    <div className="stack">
      <div className="page-head"><h1>Calendar</h1><Button onClick={() => setEdit({})}>＋ Event</Button></div>
      <Button kind="ghost" className="wide" onClick={() => (can("calendarSync") ? setSub(true) : upgrade("calendarSync"))}>📆 Add to Google / Apple calendar{can("calendarSync") ? "" : " · Plus"}</Button>
      {conflicts.length > 0 && (
        <section className="card conflict-card">
          <h3>⚠️ {conflicts.length} clash{conflicts.length > 1 ? "es" : ""}</h3>
          {conflicts.map((c, i) => <p key={i} className="small"><b>{fmt.date(c.date)}:</b> {c.text}</p>)}
        </section>
      )}
      {!items.length && <p className="muted center">Nothing coming up. Add meets for each child, plus practices, recitals, trips and birthdays.</p>}
      {Object.entries(months).map(([m, list]) => (
        <section key={m} className="stack">
          <h2 className="section">{m}</h2>
          {list.map((i, k) => (
            <button key={k} className={`card list-row cal-row ${clashDays.has(i.date) ? "clash" : ""}`} onClick={i.onClick}>
              <div className="date-chip"><b>{new Date(`${i.date}T12:00:00`).getDate()}</b><small>{new Date(`${i.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</small></div>
              <div className="grow"><b>{i.title}</b><p className="muted small">{[i.who, i.time, i.where, i.end && i.end !== i.date ? `to ${fmt.date(i.end)}` : ""].filter(Boolean).join(" · ")}</p></div>
              <span className={`pill pill-${i.kind.toLowerCase()}`}>{i.kind}</span>
            </button>
          ))}
        </section>
      ))}
      {edit && <EventForm gymnasts={gymnasts} row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {sub && <Subscribe onClose={() => setSub(false)} />}
    </div>
  );
}

// The "add to my phone's calendar" button, shown on the Meets page.
export function CalendarSync({ can, upgrade }) {
  const [sub, setSub] = useState(false);
  return <><Button kind="ghost" className="wide" onClick={() => (can("calendarSync") ? setSub(true) : upgrade("calendarSync"))}>📆 Put these on my Google / Apple calendar</Button>{sub && <Subscribe onClose={() => setSub(false)} />}</>;
}

function EventForm({ gymnasts, row, onClose, onSaved }) {
  const [f, setF] = useState({ title: row.title || "", start_date: row.start_date || today(), end_date: row.end_date || "", start_time: row.start_time || "", gymnast_id: row.gymnast_id || "", location: row.location || "", notes: row.notes || "" });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    const rec = { ...f }; for (const k of ["end_date", "start_time", "location", "notes", "gymnast_id"]) if (!rec[k]) rec[k] = null;
    try { row.id ? await db.update("family_events", row.id, rec) : await db.insert("family_events", rec); onSaved(); } catch (e2) { setErr(e2); }
  }
  return (
    <Sheet title={row.id ? "Edit event" : "Add family event"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <Field label="What"><input value={f.title} onChange={set("title")} required placeholder="Recital, practice, vacation, birthday…" /></Field>
        <div className="grid2">
          <Field label="Date"><input type="date" value={f.start_date} onChange={set("start_date")} required /></Field>
          <Field label="Until (optional)"><input type="date" value={f.end_date} onChange={set("end_date")} /></Field>
        </div>
        <div className="grid2">
          <Field label="Time"><input value={f.start_time} onChange={set("start_time")} placeholder="4:30 PM" /></Field>
          <Field label="Who"><select value={f.gymnast_id} onChange={set("gymnast_id")}><option value="">Whole family</option>{gymnasts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        </div>
        <Field label="Where"><input value={f.location} onChange={set("location")} /></Field>
        <ErrorNote error={err} />
        <div className="row end">{row.id && <Button type="button" kind="danger" onClick={async () => { await db.remove("family_events", row.id); onSaved(); }}>Delete</Button>}<Button>Save</Button></div>
      </form>
    </Sheet>
  );
}

function Subscribe({ onClose }) {
  const [l, setL] = useState(null); const [err, setErr] = useState(null); const [copied, setCopied] = useState(false);
  useEffect(() => { api("calendar-link", null, "GET").then(setL).catch(setErr); }, []);
  return (
    <Sheet title="Add to your calendar" onClose={onClose}>
      <p className="muted">Every meet, entry deadline and family event shows up in your phone's calendar and updates on its own.</p>
      {DEMO || l?.demo ? <p className="note note-warn">Calendar links work in the live app.</p> : !l ? <ErrorNote error={err} /> : (
        <div className="stack">
          <a className="btn btn-primary" href={l.google} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
          <a className="btn btn-ghost" href={l.webcal}>Add to Apple / Outlook calendar</a>
          <Field label="Or copy this private link"><input readOnly value={l.url} onFocus={(e) => e.target.select()} /></Field>
          <Button kind="ghost" onClick={async () => { try { await navigator.clipboard.writeText(l.url); setCopied(true); } catch {} }}>{copied ? "Copied" : "Copy link"}</Button>
          <p className="muted small">Keep this link private: anyone with it can see your family's schedule.</p>
        </div>
      )}
    </Sheet>
  );
}
