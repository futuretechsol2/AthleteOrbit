// Meet organizer workspace: only meets — registration & roster verification, sessions with automatic rotations,
// officials & volunteers, one-tap updates to everyone, plus tickets, door check-in, live scoring and the music table.
import React, { useEffect, useState } from "react";
import { api, DEMO } from "../lib/db.js";
import { Button, Field, Sheet, ErrorNote, Spinner, fmt } from "../ui.jsx";
import { openExternal } from "./More.jsx";
import { roleLabel } from "../data/roles.js";

const MODS = [["overview", "Meet HQ", "🏟️"], ["entries", "Registration", "📝"], ["sessions", "Sessions & rotations", "🔄"], ["officials", "Officials & volunteers", "🧑‍⚖️"], ["update", "Send an update", "📣"]];

export function OrganizerShell({ profile, me, refresh, page, setPage, goBack, banner, Logo, logOut, DemoSwitch, More, Events }) {
  const go = (name, params = null) => setPage({ name, params: params ? { ...params, t: Date.now() } : null });
  const tab = page.name === "home" ? page.params?.tab || "overview" : null;
  const props = { profile, me, refresh, go, params: page.params, gymnasts: [], paid: true, openPaywall: () => {}, can: () => true, upgrade: () => {} };
  const P = page.name === "events" ? Events : page.name === "more" ? More : MeetHQ;
  return (
    <div className="app biz-app">
      <header className="topbar">{page.name !== "home" ? <button className="back-btn" onClick={goBack} aria-label="Back">‹ <span>Back</span></button> : <Logo small />}<span className="who">{profile.gym_name || "Meet organizer"} <small className="role-pill">{roleLabel(profile)}</small></span><button className="link" onClick={() => logOut()}>Log out</button>{DEMO && <DemoSwitch current="organizer" />}</header>
      <nav className="sidebar" aria-label="Main">
        <Logo />
        <p className="side-head">Meet operations</p>
        {MODS.map(([k, l, i]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => go("home", { tab: k })}><span aria-hidden>{i}</span>{l}</button>)}
        <p className="side-head">Meet day</p>
        <button className={page.name === "events" ? "on" : ""} onClick={() => go("events")}><span aria-hidden>🎟️</span>Tickets, live scores & music</button>
        <hr />
        <button className={page.name === "more" ? "on" : ""} onClick={() => go("more")}><span aria-hidden>⚙️</span>Account</button>
        <a className="side-link" href="/faq"><span aria-hidden>❓</span>FAQ</a>
        <button className="sidebar-bottom" onClick={() => logOut()}><span aria-hidden>⎋</span>Log out</button>
      </nav>
      {banner && <div className="banner">{banner}</div>}
      <main className="content"><P key={page.name} {...props} tab={tab} /></main>
      <nav className="tabbar">{[["overview", "HQ", "🏟️"], ["entries", "Entries", "📝"], ["sessions", "Sessions", "🔄"], ["events", "Meet day", "🎟"], ["more", "Account", "≡"]].map(([k, l, i]) => <button key={k} className={tab === k || page.name === k ? "on" : ""} onClick={() => (k === "events" || k === "more" ? go(k) : go("home", { tab: k }))}><span className="tab-icon" aria-hidden>{i}</span>{l}</button>)}</nav>
    </div>
  );
}

function MeetHQ({ tab = "overview", go, me }) {
  const [list, setList] = useState(null); const [err, setErr] = useState(null); const [id, setId] = useState(null); const [plan, setPlan] = useState(null);
  useEffect(() => { api("tickets/organizer", null, "GET").then((r) => { setList(r.listings || []); setId((r.listings || [])[0]?.id || null); }).catch(setErr); api("org/plan", null, "GET").then(setPlan).catch(() => {}); }, []);
  if (!list) return err ? <ErrorNote error={err} /> : <Spinner label="Loading your meets…" />;
  const l = list.find((x) => x.id === id);
  return (
    <div className="stack">
      <section className="hero"><p className="eyebrow">🏟️ Meet organizer</p><h1>{l ? l.name : "Run your meet"}</h1><p className="hero-sub">{l ? `${fmt.date(l.start_date)}${l.location ? ` · ${l.location}` : ""}` : "Registration, sessions & rotations, officials, tickets, live scores and floor music — one place."}</p></section>
      {plan && <PlanCard plan={plan} />}
      {!list.length ? <section className="card"><p>Create your first meet — name, dates and location. Tickets are optional.</p><Button onClick={() => go("events")}>＋ Create a meet</Button></section> : <>
        {list.length > 1 && <div className="chips">{list.map((x) => <button key={x.id} className={`chip ${x.id === id ? "on" : ""}`} onClick={() => setId(x.id)}>{x.name}</button>)}</div>}
        <div className="chips org-tabs">{MODS.map(([k, label, i]) => <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => go("home", { tab: k })}>{i} {label}</button>)}</div>
        {tab === "overview" && <Overview l={l} go={go} />}
        {tab === "entries" && <Entries l={l} />}
        {tab === "sessions" && <Sessions l={l} />}
        {tab === "officials" && <Officials l={l} />}
        {tab === "update" && <Update l={l} />}
      </>}
    </div>
  );
}

function PlanCard({ plan }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (plan.plan === "pro") return <p className="note note-ok">✓ Meet Pro{plan.until ? ` until ${fmt.date(plan.until.slice(0, 10))}` : ""} — unlimited meets, entries and rotations.</p>;
  return (
    <section className="card plan-card">
      <div className="row tight"><span className="grow"><b>Free plan</b><small className="muted"> · tickets, live scores, music table, {plan.free_entries} entries per meet, 1 automatic rotation</small></span>
        <Button className="sm" disabled={busy || DEMO} onClick={async () => { setBusy(true); try { const r = await api("org/plan", {}); if (r.url) openExternal(r.url); } catch (e) { setErr(e); setBusy(false); } }}>{busy ? "…" : `Meet Pro · $${plan.price_cents / 100}/year`}</Button></div>
      <ErrorNote error={err} />
    </section>
  );
}

function Overview({ l, go }) {
  const [c, setC] = useState(null);
  useEffect(() => { Promise.all([api("org/entries", null, "GET", { id: l.id }), api("org/sessions", null, "GET", { id: l.id }), api("org/officials", null, "GET", { id: l.id })]).then(([e, s, o]) => setC({ e, s, o })).catch(() => setC({})); }, [l.id]);
  const copy = (t) => navigator.clipboard.writeText(t).catch(() => {});
  const steps = c?.e ? [
    ["entries", "Registration", c.e.counts.total ? `${c.e.counts.total} athletes from ${c.e.gyms.length} gyms · ${c.e.counts.verified} verified` : "Import entries from each gym", c.e.counts.total > 0 && c.e.counts.pending === 0],
    ["sessions", "Sessions & rotations", c.s.sessions.length ? `${c.s.sessions.length} sessions · ${c.s.sessions.filter((x) => x.rotation).length} with rotations${c.s.unassigned.length ? ` · ${c.s.unassigned.length} levels unassigned` : ""}` : "Group levels into sessions", c.s.sessions.length > 0 && !c.s.unassigned.length],
    ["officials", "Officials & volunteers", c.o.officials.length ? `${c.o.officials.length} people · ${c.o.officials.filter((x) => x.confirmed).length} confirmed` : "Judges, scorers, music, door", c.o.officials.length > 0 && c.o.officials.every((x) => x.confirmed)],
    ["events", "Tickets & door check-in", l.status === "on_sale" ? "On sale" : "Optional — sell online, scan at the door", l.status === "on_sale"],
  ] : [];
  return (
    <div className="stack">
      <section className="card"><h3>Meet checklist</h3>{!c ? <Spinner /> : steps.map(([k, t, sub, done], i) => (
        <button key={k} className="list-row setup-row" onClick={() => (k === "events" ? go("events") : go("home", { tab: k }))}><span className={`step-dot ${done ? "done" : ""}`} aria-hidden>{done ? "✓" : i + 1}</span><span className="grow"><b>{t}</b><p className="muted small">{sub}</p></span><span aria-hidden>›</span></button>))}</section>
      <section className="card"><h3>Meet-day links</h3>
        {[["● Live scores (public, free)", l.live_url], ["✍️ Scorer table (no account)", l.score_url], ["🎵 Floor music table (no account)", l.music_url], ["🚪 Door scanner", l.door_url]].filter(([, u]) => u).map(([t, u]) => (
          <div key={t} className="list-row static"><span className="grow">{t}</span><button className="link small" onClick={() => copy(u)}>Copy</button><a className="link small" href={u} target="_blank" rel="noreferrer">Open</a></div>))}</section>
    </div>
  );
}

// ---------- Registration ----------
const parseEntries = (text) => text.split(/\r?\n/).map((ln) => ln.split(/\t|,/).map((x) => x.trim())).filter((c) => c.length >= 2 && c[0] && c[1] && !/^gym/i.test(c[0])).map(([gym_name, athlete_name, level, member_number, division]) => ({ gym_name, athlete_name, level, member_number, division }));
function Entries({ l }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [paste, setPaste] = useState(null); const [gym, setGym] = useState(""); const [msg, setMsg] = useState("");
  const load = () => api("org/entries", null, "GET", { id: l.id }).then(setD).catch(setErr);
  useEffect(() => { load(); }, [l.id]);
  const act = async (body, note) => { setErr(null); try { const r = await api("org/entries", { id: l.id, ...body }); if (note) setMsg(note(r)); await load(); return true; } catch (e) { setErr(e); return false; } };
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const shown = d.entries.filter((e) => !gym || e.gym_name === gym);
  const issues = d.entries.filter((e) => e.status !== "scratched" && (e.duplicate || e.missing.length)).length;
  return (
    <div className="stack">
      <div className="coach-tiles"><div className="coach-tile"><b>{d.counts.total}{d.limit ? <small>/{d.limit}</small> : null}</b><span>Athletes entered</span></div><div className="coach-tile"><b>{d.counts.verified}</b><span>Verified</span></div><div className="coach-tile"><b className={issues ? "warn-text" : ""}>{issues}</b><span>Need a look</span></div></div>
      <div className="row tight"><Button className="sm" onClick={() => setPaste("")}>＋ Import entries</Button><Button kind="ghost" className="sm" disabled={!d.counts.pending} onClick={() => act({ verifyAll: true }, (r) => `Verified ${r.verified} entries with a level.`)}>✓ Verify all with a level</Button></div>
      {msg && <p className="note note-ok">{msg}</p>}
      <div className="chips">{["", ...d.gyms.map((g) => g.gym)].map((g) => { const x = d.gyms.find((y) => y.gym === g); return <button key={g || "all"} className={`chip ${gym === g ? "on" : ""}`} onClick={() => setGym(g)}>{g || "All gyms"}{x ? ` · ${x.athletes}` : ""}</button>; })}</div>
      <section className="card">{!shown.length ? <p className="muted small">No entries yet. Paste each gym's entry list (from email or a spreadsheet) — we flag duplicates and missing member numbers.</p> : shown.map((e) => (
        <div key={e.id} className={`inv-row ${e.status === "scratched" ? "dim" : ""}`}>
          <span className="grow"><b>{e.athlete_name}</b><small className="muted"> · {e.gym_name} · {e.level || "no level"}{e.member_number ? ` · #${e.member_number}` : ""}</small>
            {(e.duplicate || e.missing.length > 0) && e.status !== "scratched" && <><br /><small className="warn-text">{[e.duplicate && "possible duplicate", e.missing.length && `missing ${e.missing.join(", ")}`].filter(Boolean).join(" · ")}</small></>}</span>
          <label className="check small"><input type="checkbox" checked={e.fee_paid} onChange={(x) => act({ set: e.id, fee_paid: x.target.checked })} /> Paid</label>
          <select aria-label={`${e.athlete_name} status`} value={e.status} onChange={(x) => act({ set: e.id, status: x.target.value })}><option value="pending">Pending</option><option value="verified">Verified</option><option value="scratched">Scratched</option></select>
        </div>))}</section>
      {paste !== null && <Sheet title="Import entries" onClose={() => setPaste(null)}><div className="form">
        <p className="small">One athlete per line: <b>Gym, Athlete name, Level, Member #</b> (paste straight from a spreadsheet).</p>
        <textarea rows={10} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Carolina Flips, Maya Patel, Level 4, 1234567\nQueen City Flyers, Ava Ruiz, Level 4, 7654321"} />
        <p className="muted small">{parseEntries(paste).length} athletes found.</p>
        <Button disabled={!parseEntries(paste).length} onClick={async () => { if (await act({ rows: parseEntries(paste) }, (r) => `Added ${r.added} entries.`)) setPaste(null); }}>Import</Button>
        <ErrorNote error={err} /></div></Sheet>}
      <ErrorNote error={err} />
    </div>
  );
}

// ---------- Sessions & rotations ----------
function Sessions({ l }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [f, setF] = useState(null); const [open, setOpen] = useState(null);
  const load = () => api("org/sessions", null, "GET", { id: l.id }).then(setD).catch(setErr);
  useEffect(() => { load(); }, [l.id]);
  const act = async (body) => { setErr(null); try { await api("org/sessions", { id: l.id, ...body }); await load(); return true; } catch (e) { setErr(e); return false; } };
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  return (
    <div className="stack">
      <div className="row tight"><Button className="sm" onClick={() => setF({ name: `Session ${d.sessions.length + 1}`, day: l.start_date, warmup: "", start_time: "", levels: d.unassigned.slice(0, 2) })}>＋ Session</Button>{d.unassigned.length > 0 && <small className="warn-text">Not in a session yet: {d.unassigned.join(", ")}</small>}</div>
      {d.sessions.map((s) => (
        <section key={s.id} className="card">
          <div className="row tight"><span className="grow"><b>{s.name}</b><small className="muted"> · {s.day ? fmt.date(s.day) : ""}{s.warmup ? ` · warm-up ${s.warmup}` : ""}{s.start_time ? ` · march-in ${s.start_time}` : ""}</small><br /><small>{s.levels.join(", ") || "No levels"} · {s.athletes} athletes</small></span>
            <Button kind="ghost" className="sm" onClick={() => act({ rotate: s.id }).then(() => setOpen(s.id))}>{s.rotation ? "Rebuild rotation" : "🔄 Build rotation"}</Button>
            <button className="link small" onClick={() => setF({ ...s, session: s.id })}>Edit</button></div>
          {s.rotation && (open === s.id || d.sessions.length === 1) && <div className="table-scroll"><table className="cmp rot"><thead><tr><th>Round</th>{s.rotation[0].stations.map((x) => <th key={x.event}>{x.event}</th>)}</tr></thead>
            <tbody>{s.rotation.map((r) => <tr key={r.round}><th>{r.round}</th>{r.stations.map((x) => <td key={x.event}>{x.squad.join(", ") || "Bye"}<br /><small className="muted">{x.athletes} athletes</small></td>)}</tr>)}</tbody></table></div>}
          {s.rotation && open !== s.id && d.sessions.length > 1 && <button className="link small" onClick={() => setOpen(s.id)}>Show rotation</button>}
        </section>))}
      {!d.sessions.length && <p className="muted small center">Group levels into sessions. Build rotation spreads each gym's squads over the four events and rotates them in Olympic order, balancing athletes per station.</p>}
      {f && <Sheet title={f.session ? "Edit session" : "New session"} onClose={() => setF(null)}><form className="form" onSubmit={async (e) => { e.preventDefault(); if (await act(f)) setF(null); }}>
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid2"><Field label="Day"><input type="date" value={f.day || ""} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field><Field label="Warm-up"><input value={f.warmup || ""} onChange={(e) => setF({ ...f, warmup: e.target.value })} placeholder="7:30 AM" /></Field></div>
        <Field label="March-in"><input value={f.start_time || ""} onChange={(e) => setF({ ...f, start_time: e.target.value })} placeholder="8:15 AM" /></Field>
        <p className="small">Levels</p><div className="chips">{d.levels.map((lv) => <button type="button" key={lv} className={`chip ${f.levels.includes(lv) ? "on" : ""}`} onClick={() => setF({ ...f, levels: f.levels.includes(lv) ? f.levels.filter((x) => x !== lv) : [...f.levels, lv] })}>{lv}</button>)}</div>
        <div className="row tight"><Button disabled={!f.name}>Save</Button>{f.session && <Button kind="ghost" onClick={async (e) => { e.preventDefault(); if (await act({ remove: f.session })) setF(null); }}>Delete</Button>}</div><ErrorNote error={err} /></form></Sheet>}
      <ErrorNote error={err} />
    </div>
  );
}

// ---------- Officials & volunteers ----------
const ROLES_O = ["Meet referee", "Judge", "Scorer", "Music", "Flasher", "Runner", "Door / tickets", "Volunteer"];
function Officials({ l }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [f, setF] = useState(null); const [msg, setMsg] = useState("");
  const load = () => api("org/officials", null, "GET", { id: l.id }).then(setD).catch(setErr);
  useEffect(() => { load(); }, [l.id]);
  const act = async (body, note) => { setErr(null); try { const r = await api("org/officials", { id: l.id, ...body }); if (note) setMsg(note(r)); await load(); return true; } catch (e) { setErr(e); return false; } };
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  return (
    <div className="stack">
      <div className="row tight"><Button className="sm" onClick={() => setF({ name: "", email: "", phone: "", role: "Judge", session_id: d.sessions[0]?.id || "", station: "", confirmed: false })}>＋ Person</Button><Button kind="ghost" className="sm" disabled={!d.officials.some((o) => o.email) || DEMO} onClick={() => act({ notify: true }, (r) => `Emailed ${r.sent} people their assignment.`)}>✉️ Email everyone their assignment</Button></div>
      {msg && <p className="note note-ok">{msg}</p>}
      {!!d.byRole.length && <div className="chips">{d.byRole.map((r) => <span key={r.role} className="chip static">{r.role}: {r.confirmed}/{r.count} confirmed</span>)}</div>}
      <section className="card">{!d.officials.length ? <p className="muted small">Add judges, scorers, the music person, flashers, runners and door volunteers — with their session and station.</p> : d.officials.map((o) => (
        <div key={o.id} className="inv-row"><span className="grow"><b>{o.name}</b><small className="muted"> · {o.role}{o.station ? ` · ${o.station}` : ""}{o.session_id ? ` · ${d.sessions.find((s) => s.id === o.session_id)?.name || ""}` : ""}</small></span>
          <label className="check small"><input type="checkbox" checked={o.confirmed} onChange={(e) => act({ official: o.id, ...o, confirmed: e.target.checked })} /> Confirmed</label>
          <button className="link small" onClick={() => setF({ ...o, official: o.id })}>Edit</button></div>))}</section>
      {f && <Sheet title={f.official ? "Edit" : "Add a person"} onClose={() => setF(null)}><form className="form" onSubmit={async (e) => { e.preventDefault(); if (await act(f)) setF(null); }}>
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid2"><Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES_O.map((r) => <option key={r}>{r}</option>)}</select></Field><Field label="Station / event"><input value={f.station || ""} onChange={(e) => setF({ ...f, station: e.target.value })} placeholder="Beam" /></Field></div>
        <Field label="Session"><select value={f.session_id || ""} onChange={(e) => setF({ ...f, session_id: e.target.value })}><option value="">All day</option>{d.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <div className="grid2"><Field label="Email"><input type="email" value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label="Phone"><input value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field></div>
        <div className="row tight"><Button disabled={!f.name}>Save</Button>{f.official && <Button kind="ghost" onClick={async (e) => { e.preventDefault(); if (await act({ remove: f.official })) setF(null); }}>Remove</Button>}</div><ErrorNote error={err} /></form></Sheet>}
      <ErrorNote error={err} />
    </div>
  );
}

// ---------- Updates ----------
function Update({ l }) {
  const [t, setT] = useState(""); const [emails, setEmails] = useState(""); const [off, setOff] = useState(true); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [err, setErr] = useState(null);
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { const r = await api("org/announce", { id: l.id, text: t, emails, officials: off }); setMsg(`Posted on the meet page and emailed ${r.sent} people.`); setT(""); } catch (x) { setErr(x); } setBusy(false); }}>
      <h3>📣 One update to everyone</h3>
      <p className="muted small">Shows on the meet's ticket and live-score pages, and emails every ticket buyer{off ? ", your officials & volunteers" : ""} and any coach emails you add.</p>
      <Field label="Update"><textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="Session 2 is running 20 minutes behind. Warm-up now 12:50." maxLength={500} /></Field>
      <Field label="Also email these coaches (optional)"><input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="coach@gym.com, office@club.org" /></Field>
      <label className="check"><input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} /> Email officials & volunteers too</label>
      <Button disabled={busy || t.trim().length < 3 || DEMO}>{busy ? "Sending…" : "Post & email"}</Button>
      {DEMO && <p className="muted small">Sending is off in the demo.</p>}
      {(l.updates || []).length > 0 && <div><p className="small"><b>Earlier updates</b></p>{l.updates.slice(0, 5).map((u) => <p key={u.at} className="small muted">{new Date(u.at).toLocaleString()} — {u.text}</p>)}</div>}
      {msg && <p className="note note-ok">{msg}</p>}<ErrorNote error={err} />
    </form>
  );
}
