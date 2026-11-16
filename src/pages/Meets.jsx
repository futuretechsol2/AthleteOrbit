import React, { useEffect, useState } from "react";
import { db, api } from "../lib/db.js";
import { MEET_STATUSES } from "../data/skills.js";
import { defaultPacking } from "../data/packing.js";
import { conf, sportOf } from "../data/sports.js";
import { travelLinks, tripDates } from "../data/travel.js";
import { Button, Field, Sheet, Empty, ErrorNote, Spinner, Markdown, fmt, today } from "../ui.jsx";
import { CostForm } from "./Costs.jsx";
import { FindListing } from "./Tickets.jsx";
import { SchedulePhoto, MeetInfo } from "./Center.jsx";
import { CalendarSync } from "./Calendar.jsx";

const TRAVEL_CFG = {
  bookingAid: import.meta.env.VITE_BOOKING_AID,
  hotelsUrl: import.meta.env.VITE_TRAVEL_HOTELS_URL,
  flightsUrl: import.meta.env.VITE_TRAVEL_FLIGHTS_URL,
};

export default function Meets({ gymnast, gymnasts, params, profile, can, upgrade, refresh, go, me }) {
  const [rows, setRows] = useState(null); const [edit, setEdit] = useState(null); const [open, setOpen] = useState(null); const [snap, setSnap] = useState(false);
  const load = () => db.list("meets", { gymnast_id: gymnast.id }).then((r) => { setRows(r); return r; });
  useEffect(() => { if (params?.snap) { if (can("schedule")) setSnap(true); else upgrade("schedule"); } }, [params]);
  useEffect(() => { load().then((r) => { if (params?.meetId) { const m = r.find((x) => x.id === params.meetId); if (m) setOpen(m); } }); }, [gymnast.id, params]);
  if (!rows) return <div className="skeleton" />;
  const S = conf(sportOf(gymnast)), ev = S.event.toLowerCase();
  const t = today();
  const upcoming = rows.filter((m) => m.start_date >= t);
  const past = rows.filter((m) => m.start_date < t).reverse();
  return (
    <div className="stack">
      <div className="page-head"><h1>{S.events}</h1><Button onClick={() => setEdit({})}>＋ Add</Button></div>
      <button className="card snap-cta" onClick={() => (can("schedule") ? setSnap(true) : upgrade("schedule"))}>
        <span className="snap-art sm" aria-hidden><span>📄</span><i>→</i><span>🗓️</span></span>
        <span className="grow"><b>Add the whole season from a photo</b><small>Snap your gym's schedule — only {gymnast.name}'s level is added, with host, website and session times.</small></span><span aria-hidden>›</span>
      </button>
      {!rows.length && <Empty icon="🗓️" title={`No ${S.events.toLowerCase()} on the calendar`} text={`Add the season's ${S.events.toLowerCase()} to get reminders, a packing list and a trip planner for each one.`} action={<Button onClick={() => setEdit({})}>Add a {ev}</Button>} />}
      {upcoming.length > 0 && <h2 className="section">Upcoming</h2>}
      {upcoming.map((m) => <MeetCard key={m.id} m={m} onClick={() => setOpen(m)} />)}
      {past.length > 0 && <h2 className="section">Past</h2>}
      {past.map((m) => <MeetCard key={m.id} m={m} past onClick={() => setOpen(m)} />)}
      {rows.length > 0 && <CalendarSync can={can} upgrade={upgrade} />}
      {snap && <SchedulePhoto mode="parent" gymnasts={gymnasts} inGym={!!me?.club} onClose={() => setSnap(false)} onDone={() => { setSnap(false); load(); refresh?.(); }} />}
      {open && <MeetDetail me={me} meet={open} gymnast={gymnast} profile={profile} can={can} upgrade={upgrade} go={go} refresh={refresh}
        onEdit={() => { setEdit(open); setOpen(null); }} onClose={() => { setOpen(null); load(); }} />}
      {edit && <MeetForm gymnast={gymnast} row={edit} onClose={() => setEdit(null)} onSaved={async (saved) => { setEdit(null); const r = await load(); const m = r.find((x) => x.id === saved?.id); if (m) setOpen(m); }} />}
    </div>
  );
}

function MeetCard({ m, past, onClick }) {
  const days = fmt.daysUntil(m.start_date);
  const deadline = m.entry_deadline ? fmt.daysUntil(m.entry_deadline) : null;
  const deadlineSoon = deadline !== null && deadline >= 0 && deadline <= 7 && m.status === "Planned";
  const list = Array.isArray(m.checklist) ? m.checklist : [];
  return (
    <button className={`card meet-card ${past ? "past" : ""} ${!past && days <= 14 ? "soon" : ""}`} onClick={onClick}>
      <div className="countdown small-cd">{past ? <span>Done</span> : <><strong>{days}</strong><span>days</span></>}</div>
      <div className="grow">
        <h3>{m.name}</h3>
        <p className="muted small">{fmt.date(m.start_date)}{m.location ? ` · ${m.location}` : ""}{m.host ? ` · ${m.host}` : ""}</p>
        {m.session_time && !past && <p className="small session-line">🕐 {m.session_time}</p>}
        <div className="row tight">
          {deadlineSoon && <span className="pill pill-warn">Entry deadline in {deadline} day{deadline === 1 ? "" : "s"}</span>}
          {m.club_meet_id && <span className="pill pill-me">From your gym</span>}
          {!past && list.length > 0 && <span className="pill">Packed {list.filter((i) => i.done).length}/{list.length}</span>}
        </div>
      </div>
      <span className={`pill pill-${m.status.toLowerCase()}`}>{m.status}</span>
    </button>
  );
}

function MeetDetail({ me, meet, gymnast, profile, can, upgrade, go, refresh, onEdit, onClose }) {
  const past = meet.start_date < today();
  const [costs, setCosts] = useState([]); const [addCost, setAddCost] = useState(false);
  const loadCosts = () => db.list("costs").then((r) => setCosts(r.filter((c) => c.meet_id === meet.id))).catch(() => {});
  useEffect(() => { loadCosts(); }, [meet.id]);
  const spent = costs.reduce((a, c) => a + Number(c.amount), 0);
  const [tab, setTab] = useState(past ? "money" : "pack");
  const days = fmt.daysUntil(meet.start_date);
  return (
    <Sheet title={meet.name} onClose={onClose}>
      <div className="meet-sum">
        {!past && <div className="countdown"><strong>{days}</strong><span>days</span></div>}
        <div className="grow">
          <p><b>{fmt.date(meet.start_date)}{meet.end_date && meet.end_date !== meet.start_date ? ` – ${fmt.date(meet.end_date)}` : ""}</b></p>
          <p className="muted small">{[meet.session_time, meet.host, meet.location].filter(Boolean).join(" · ") || "Add session time and location in Details"}</p>
        </div>
        <span className={`pill pill-${meet.status.toLowerCase()}`}>{meet.status}</span>
      </div>
      <MeetInfo meet={meet} me={me} can={can} upgrade={upgrade} />
      {past && <button className="card find-cta" onClick={() => go?.("photos")}><span className="find-icon" aria-hidden>📸</span><span className="grow"><b>Photos from this event</b><small>Add them, share with teammates, order prints</small></span><span aria-hidden>›</span></button>}
      {!past && meet.listing_id && <a className="card pull-btn wide-pull tix-cta" href={`/tickets/${meet.listing_id}`}><span aria-hidden>🎟️</span><b>Buy tickets — skip the line at the door</b></a>}
      {past && sportOf(gymnast) === "Gymnastics" && <button className="card pull-btn wide-pull" onClick={() => { onClose(); can("onlineScores") ? go("scores", { online: true }) : upgrade("onlineScores"); }}><span aria-hidden>🌐</span><b>Get scores from MeetScoresOnline</b>{!can("onlineScores") && <span className="lock">Basic</span>}</button>}
      <div className="chips">
        {[["pack", "Packing list"], ["trip", can("trip") ? "Trip & hotels" : "Trip & hotels 🔒"], ["money", "Costs"], ["details", "Details"]].map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => (k === "details" ? onEdit() : setTab(k))}>{l}</button>
        ))}
      </div>
      {tab === "pack" ? <Packing meet={meet} gymnast={gymnast} /> : tab === "money" ? (
        <div className="stack">
          <div className="stats two">
            <div className="stat"><span className="stat-value">{meet.estimated_cost ? fmt.money(meet.estimated_cost) : "–"}</span><span className="stat-label">Estimated trip cost</span></div>
            <div className={`stat ${meet.estimated_cost && spent > meet.estimated_cost ? "warn" : ""}`}><span className="stat-value">{fmt.money(spent)}</span><span className="stat-label">Spent so far</span></div>
          </div>
          {costs.map((c) => <div key={c.id} className="card list-row"><div className="grow"><b>{c.description || c.category}</b><p className="muted small">{fmt.date(c.spent_on)} · {c.category}</p></div><div className="right"><b>{fmt.money(c.amount)}</b>{!c.paid && <span className="pill pill-warn">Unpaid</span>}</div></div>)}
          {!costs.length && <p className="muted small">Add the entry fee, hotel, flights and gas for this event to see the real trip cost.</p>}
          <Button className="wide" onClick={() => setAddCost(true)}>＋ Add a cost for this event</Button>
          {!meet.estimated_cost && <button className="link center" onClick={onEdit}>Set an estimated cost in Details</button>}
          {addCost && <CostForm gymnasts={[gymnast]} meets={[meet]} row={{ gymnast_id: gymnast.id, meet_id: meet.id, category: "Meet entry fee", description: meet.name }} onClose={() => setAddCost(false)} onSaved={() => { setAddCost(false); loadCosts(); }} />}
        </div>
      ) : can("trip") ? <Trip meet={meet} profile={profile} refresh={refresh} /> : <Empty icon="🧳" title="Trip & hotel planner is in Pro" text="Hotel and flight search for the event dates, your booking details in one place, and an AI trip plan built around session time." action={<Button onClick={() => upgrade("trip")}>See Pro</Button>} />}
    </Sheet>
  );
}

function Packing({ meet, gymnast }) {
  const [items, setItems] = useState(() => (Array.isArray(meet.checklist) && meet.checklist.length ? meet.checklist : defaultPacking(gymnast)));
  const [text, setText] = useState(""); const [err, setErr] = useState(null);
  async function save(next) {
    setItems(next); setErr(null);
    try { await db.update("meets", meet.id, { checklist: next }); meet.checklist = next; } catch (e) { setErr(e); }
  }
  const done = items.filter((i) => i.done).length;
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head"><h3>Packed {done} of {items.length}</h3>{done > 0 && <button className="link" onClick={() => save(items.map((i) => ({ ...i, done: false })))}>Reset</button>}</div>
        <div className="stat-bar"><i style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></div>
        {items.map((it, i) => (
          <div key={i} className="pack-row">
            <label className="check grow"><input type="checkbox" checked={!!it.done} onChange={() => save(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} /><span className={it.done ? "struck" : ""}>{it.text}</span></label>
            <button className="icon-btn sm" aria-label={`Remove ${it.text}`} onClick={() => save(items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <form className="row add-item" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { save([...items, { text: text.trim().slice(0, 80), done: false }]); setText(""); } }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item" aria-label="Add packing item" />
          <Button kind="ghost">Add</Button>
        </form>
      </div>
      <ErrorNote error={err} />
      <p className="muted small center">Unpacked items are included in the reminder email 2 days and 1 day before.</p>
    </div>
  );
}

function Trip({ meet, profile, refresh }) {
  const d = tripDates(meet);
  const [depart, setDepart] = useState(d.depart); const [ret, setRet] = useState(d.return);
  const [origin, setOrigin] = useState(profile?.home_airport || profile?.home_city || "");
  const [adults, setAdults] = useState(2); const [kids, setKids] = useState(1);
  const [plan, setPlan] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  useEffect(() => {
    db.list("ai_notes", { gymnast_id: meet.gymnast_id }).then((r) => { const n = r.find((x) => x.kind === "trip" && x.title === `Trip plan: ${meet.name}`); if (n) setPlan(n.body); }).catch(() => {});
  }, [meet.id]);
  if (!meet.location) return <Empty icon="📍" title="Add the city first" text="Open Details and add the city and state to see hotels, flights and a trip plan." />;
  const links = travelLinks({ dest: meet.location, origin, depart, ret, adults, children: kids }, TRAVEL_CFG);
  async function aiPlan() {
    setBusy(true); setErr(null);
    try { const r = await api("ai/trip", { meetId: meet.id }); setPlan(r.plan); } catch (e) { setErr(e); }
    setBusy(false);
  }
  async function saveHome() {
    if (!origin.trim()) return;
    const isCode = /^[A-Za-z]{3}$/.test(origin.trim());
    try { await db.updateProfile(isCode ? { home_airport: origin.trim().toUpperCase() } : { home_city: origin.trim() }); refresh?.(); } catch {}
  }
  return (
    <div className="stack">
      {meet.hotel_name && (
        <div className="card note-ok hotel-card">
          <b>🏨 {meet.hotel_name}</b>
          <span className="small">{meet.hotel_address || ""}{meet.hotel_confirmation ? ` · Confirmation ${meet.hotel_confirmation}` : ""}</span>
        </div>
      )}
      <div className="card">
        <div className="grid2">
          <Field label="Arrive"><input type="date" value={depart} onChange={(e) => setDepart(e.target.value)} /></Field>
          <Field label="Leave"><input type="date" value={ret} onChange={(e) => setRet(e.target.value)} /></Field>
        </div>
        <div className="grid3">
          <Field label="From (city or airport)"><input value={origin} onChange={(e) => setOrigin(e.target.value)} onBlur={saveHome} placeholder="CLT" /></Field>
          <Field label="Adults"><input inputMode="numeric" value={adults} onChange={(e) => setAdults(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} /></Field>
          <Field label="Kids"><input inputMode="numeric" value={kids} onChange={(e) => setKids(Math.max(0, Math.min(8, Number(e.target.value) || 0)))} /></Field>
        </div>
      </div>
      <div className="links">
        {links.map((l) => (
          <a key={l.kind} className="card link-card" href={l.url} target="_blank" rel="noopener noreferrer sponsored">
            <span className="link-icon" aria-hidden>{{ hotel: "🏨", map: "📍", flight: "✈️", drive: "🚗" }[l.kind]}</span>
            <span className="grow"><b>{l.label}</b><small className="muted">{l.note}</small></span><span aria-hidden>↗</span>
          </a>
        ))}
      </div>
      <p className="muted small">Tip: book refundable rates as soon as the event is confirmed, and ask your gym about the host's hotel block. Some links may earn {`AthleteOrbit`} a small commission at no cost to you.</p>
      <div className="card">
        <div className="card-head"><h3>Trip plan & family time</h3></div>
        {plan ? <Markdown text={plan} /> : <p className="muted">A short itinerary built around the session time, plus family-friendly things to do nearby and a vacation add-on idea.</p>}
        {busy ? <Spinner label="Planning the trip…" /> : <Button className="wide" kind={plan ? "ghost" : "primary"} onClick={aiPlan}>{plan ? "Write a new plan" : "Plan this trip with AI"}</Button>}
        <ErrorNote error={err} />
      </div>
    </div>
  );
}

function MeetForm({ gymnast, row, onClose, onSaved }) {
  const [f, setF] = useState({ name: row.name || "", host: row.host || "", location: row.location || "", start_date: row.start_date || "", end_date: row.end_date || "",
    session_time: row.session_time || "", status: row.status || "Planned", entry_deadline: row.entry_deadline || "", notes: row.notes || "",
    hotel_name: row.hotel_name || "", hotel_address: row.hotel_address || "", hotel_confirmation: row.hotel_confirmation || "", estimated_cost: row.estimated_cost ?? "", results_url: row.results_url || "", listing_id: row.listing_id || null });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    const rec = { ...f, gymnast_id: gymnast.id, estimated_cost: f.estimated_cost === "" ? null : Number(f.estimated_cost) };
    if (rec.estimated_cost !== null && isNaN(rec.estimated_cost)) return setErr(new Error("Estimated cost should be a number, like 450."));
    for (const k of ["end_date", "entry_deadline", "host", "location", "session_time", "notes", "hotel_name", "hotel_address", "hotel_confirmation", "results_url", "listing_id"]) if (!rec[k]) rec[k] = null;
    if (rec.results_url && !/^https:\/\/([a-z0-9-]+\.)*(meetscoresonline|scorecatonline|myusagym)\.com\//i.test(rec.results_url)) return setErr(new Error("Results link should be a MeetScoresOnline (or ScoreCat / MyUSAGym) page."));
    try { const saved = row.id ? await db.update("meets", row.id, rec) : await db.insert("meets", { ...rec, checklist: defaultPacking(gymnast) }); onSaved(saved); } catch (e2) { setErr(e2); }
  }
  return (
    <Sheet title={`${row.id ? "Edit" : "Add"} ${conf(sportOf(gymnast)).event.toLowerCase()}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {!row.id && !f.listing_id && <FindListing onPick={(l) => setF({ ...f, name: l.name, host: l.host || "", location: l.location || "", start_date: l.start_date, end_date: l.end_date || "", listing_id: l.id })} />}
        {f.listing_id && <p className="note note-ok">🎟️ Linked to the official meet — you can buy skip-the-line tickets from this meet.</p>}
        <Field label={`${conf(sportOf(gymnast)).event} name`}><input value={f.name} onChange={set("name")} required /></Field>
        <div className="grid2">
          <Field label="Start date"><input type="date" value={f.start_date} onChange={set("start_date")} required /></Field>
          <Field label="End date"><input type="date" value={f.end_date} onChange={set("end_date")} /></Field>
        </div>
        <div className="grid2">
          <Field label="Host gym"><input value={f.host} onChange={set("host")} /></Field>
          <Field label="City, State" hint="Used for hotels, flights and the trip plan"><input value={f.location} onChange={set("location")} placeholder="Raleigh, NC" /></Field>
        </div>
        <div className="grid2">
          <Field label="Session / report time"><input value={f.session_time} onChange={set("session_time")} placeholder="Sat 8:00 AM" /></Field>
          <Field label="Status"><select value={f.status} onChange={set("status")}>{MEET_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Entry deadline" hint="We'll email a reminder 7 and 2 days before while it's Planned"><input type="date" value={f.entry_deadline} onChange={set("entry_deadline")} /></Field>
        <Field label="Estimated trip cost ($)" hint="Entry, hotel, travel and food together"><input inputMode="decimal" value={f.estimated_cost} onChange={set("estimated_cost")} placeholder="450" /></Field>
        <details className="more-fields" open={!!f.hotel_name}>
          <summary>Hotel booking</summary>
          <div className="form">
            <Field label="Hotel"><input value={f.hotel_name} onChange={set("hotel_name")} placeholder="Hampton Inn Raleigh" /></Field>
            <div className="grid2">
              <Field label="Confirmation #"><input value={f.hotel_confirmation} onChange={set("hotel_confirmation")} /></Field>
              <Field label="Address"><input value={f.hotel_address} onChange={set("hotel_address")} /></Field>
            </div>
          </div>
        </details>
        {sportOf(gymnast) === "Gymnastics" && <Field label="Online results link (optional)" hint="MeetScoresOnline page for this meet. we check it after the meet and bring in the scores for you."><input type="url" inputMode="url" value={f.results_url} onChange={set("results_url")} placeholder="https://www.meetscoresonline.com/…" /></Field>}
        <Field label="Notes"><textarea rows={2} value={f.notes} onChange={set("notes")} placeholder="Hotel block, leo color, carpool…" /></Field>
        <ErrorNote error={err} />
        <div className="row end">
          {row.id && <Button type="button" kind="danger" onClick={async () => { if (window.confirm("Delete this meet?")) { await db.remove("meets", row.id); onSaved(null); } }}>Delete</Button>}
          <Button>Save</Button>
        </div>
      </form>
    </Sheet>
  );
}
