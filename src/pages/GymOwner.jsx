import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, DEMO } from "../lib/db.js";
import { PLANS, termLabel } from "../data/plans.js";
import { parseRoster, levelsLabel, levelKey } from "../data/levels.js";
import PlanPicker from "../components/PlanPicker.jsx";
import { Button, Field, Sheet, Empty, ErrorNote, Spinner, fmt } from "../ui.jsx";
import { openExternal } from "./More.jsx";
import { SchedulePhoto, CompEdit, Thread, safeUrl } from "./Center.jsx";

const TABS = [["home", "Overview", "⌂"], ["roster", "Roster", "👥"], ["schedule", "Schedule", "🗓"], ["messages", "Messages", "💬"], ["posts", "Announce", "📣"]];

// Home for gym-owner accounts: roster, season schedule, messages and announcements for every family.
export default function GymOwner({ profile, me, go, refresh, params }) {
  const [clubs, setClubs] = useState(null); const [err, setErr] = useState(null); const [tab, setTab] = useState(params?.tab || "home");
  const load = () => api("club/mine", null, "GET").then((r) => setClubs(r.clubs || [])).catch((e) => { setErr(e); setClubs([]); });
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params?.tab) setTab(params.tab); }, [params]);
  if (!clubs) return <Spinner label="Loading your gym…" />;
  const club = clubs[0];
  const daysLeft = club?.active_until ? Math.ceil((new Date(club.active_until) - Date.now()) / 86400000) : null;
  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">Gym account</p>
        <h1>{club?.name || profile.gym_name || "Your gym"}</h1>
        <p className="hero-sub">{club ? `${club.families} of ${club.seats} families joined · ${club.plan === "trial" ? `free trial, ${Math.max(0, daysLeft)} days left` : `${termLabel(club.plan || "yearly")} plan`}` : "Set up once. Every family gets their own athlete's season, reminders and a direct line to you."}</p>
      </section>
      <ErrorNote error={err} />
      {!club ? <StartGym profile={profile} onStarted={() => { load(); refresh?.(); }} /> : (
        <>
          <div className="chips gym-tabs" role="tablist">{TABS.map(([k, l, i]) => <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}><span aria-hidden>{i}</span> {l}{k === "messages" && me?.unread_messages ? <span className="badge inline">{me.unread_messages}</span> : null}</button>)}</div>
          {tab === "home" && <Overview club={club} setTab={setTab} daysLeft={daysLeft} profile={profile} />}
          {tab === "roster" && <Roster club={club} />}
          {tab === "schedule" && <Schedule me={me} />}
          {tab === "messages" && <Inbox onRead={refresh} />}
          {tab === "posts" && <Announcements club={club} />}
        </>
      )}
    </div>
  );
}

function StartGym({ profile, onStarted }) {
  const [name, setName] = useState(profile.gym_name || ""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [pay, setPay] = useState(false);
  return (
    <>
      <section className="card form">
        <h3>Start free for 30 days</h3>
        <ul className="perks">
          <li><b>Upload your roster once</b> — parents just find their athlete, no typing</li>
          <li><b>Snap your season schedule</b> — each family sees only their level's competitions</li>
          <li><b>Hosts, websites and session times</b> found online and sent to the right families</li>
          <li><b>Messages and announcements</b> in one place instead of group texts</li>
        </ul>
        <Field label="Gym or club name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apex Gymnastics" /></Field>
        <Button className="wide" disabled={busy || name.trim().length < 2} onClick={async () => { setBusy(true); setErr(null); try { await api("club/trial", { clubName: name }); onStarted(); } catch (e) { setErr(e); setBusy(false); } }}>{busy ? "Setting up…" : "Start my gym — no card needed"}</Button>
        <ErrorNote error={err} />
        <button className="link center" onClick={() => setPay(true)}>Skip the trial and choose a plan</button>
      </section>
      {pay && <Sheet title="Gym plan" onClose={() => setPay(false)}><BuyPlan name={name} /></Sheet>}
    </>
  );
}

function BuyPlan({ name: initial = "" }) {
  const [term, setTerm] = useState("yearly"); const [name, setName] = useState(initial); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  return (
    <div className="form">
      <ul className="perks">{PLANS.gym.features.map((f) => <li key={f}>{f}</li>)}</ul>
      <PlanPicker kind="gym" value={term} onChange={setTerm} compact />
      <Field label="Gym or booster club name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Button className="wide" disabled={busy || name.trim().length < 2 || DEMO} onClick={async () => { setBusy(true); setErr(null); try { const { url } = await api("club/checkout", { clubName: name, plan: term }); openExternal(url); } catch (e) { setErr(e); setBusy(false); } }}>{busy ? "Opening secure checkout…" : "Continue to payment"}</Button>
      {DEMO && <p className="muted small center">Checkout is switched off in demo mode.</p>}
      <p className="muted small center">Renews automatically; cancel anytime.</p>
      <ErrorNote error={err} />
    </div>
  );
}

function Overview({ club, setTab, daysLeft, profile }) {
  const base = (import.meta.env.VITE_APP_URL || location.origin).replace(/\/$/, "");
  const link = `${base}/register?gym=${club.code}`;
  const [qr, setQr] = useState(""); const [copied, setCopied] = useState(""); const [pay, setPay] = useState(false);
  const [counts, setCounts] = useState(null);
  useEffect(() => { QRCode.toDataURL(link, { width: 360, margin: 1, color: { dark: "#16213E", light: "#FFFFFF" } }).then(setQr).catch(() => {}); }, [link]);
  useEffect(() => { Promise.all([api("club/roster", null, "GET"), api("club/schedule", null, "GET")]).then(([r, s]) => setCounts({ roster: r.roster.length, meets: s.competitions.length })).catch(() => {}); }, []);
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 2000); } catch {} };
  const steps = [["roster", "Upload your roster", counts?.roster > 0, counts?.roster ? `${counts.roster} athletes` : "Paste from a spreadsheet — 2 minutes"], ["schedule", "Add the season schedule", counts?.meets > 0, counts?.meets ? `${counts.meets} competitions` : "Take a photo of the schedule you hand out"], ["invite", "Invite your families", club.families > 0, club.families ? `${club.families} joined` : "Share the code, link or flyer below"]];
  return (
    <>
      {club.plan === "trial" && <button className="trial-bar static" onClick={() => setPay(true)}>🎁 {daysLeft > 0 ? `${daysLeft} days left in your free trial` : "Your free trial has ended"} · <u>Choose a gym plan</u></button>}
      <section className="card">
        <h3>Get set up</h3>
        {steps.map(([k, title, done, sub], i) => (
          <button key={k} className="list-row setup-row" onClick={() => (k === "invite" ? document.getElementById("invite")?.scrollIntoView({ behavior: "smooth" }) : setTab(k))}>
            <span className={`step-dot ${done ? "done" : ""}`} aria-hidden>{done ? "✓" : i + 1}</span><span className="grow"><b>{title}</b><p className="muted small">{sub}</p></span><span aria-hidden>›</span>
          </button>
        ))}
      </section>
      <section className="card share" id="invite">
        <h3>Invite your families</h3>
        <div className="share-row">
          {qr && <img src={qr} alt="QR code to join" className="share-qr" />}
          <div className="grow"><p className="muted small">Gym code</p><p className="gym-code mono">{club.code}</p><Button kind="ghost" onClick={() => copy(club.code, "code")}>{copied === "code" ? "Copied" : "Copy code"}</Button></div>
        </div>
        <Field label="Sign-up link (code included)"><input readOnly value={link} onFocus={(e) => e.target.select()} /></Field>
        <div className="row">
          <Button onClick={() => copy(`${club.name} now uses AthleteOrbit. Sign up, find your athlete, and you'll see only their competitions with session times and reminders — plus announcements and messages with us: ${link}`, "msg")}>{copied === "msg" ? "Copied" : "Copy message for parents"}</Button>
          <a className="btn btn-ghost" href={`/flyer?gym=${encodeURIComponent(club.code)}&name=${encodeURIComponent(club.name)}`} target="_blank" rel="noreferrer">Printable flyer</a>
        </div>
        <p className="muted small">{club.active_until ? `Active until ${fmt.date(club.active_until.slice(0, 10))}.` : ""} Families in your gym get AthleteOrbit Basic included.</p>
      </section>
      {pay && <Sheet title="Gym plan" onClose={() => setPay(false)}><BuyPlan name={club.name || profile.gym_name} /></Sheet>}
    </>
  );
}

function Roster({ club }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null); const [add, setAdd] = useState(false); const [q, setQ] = useState(""); const [level, setLevel] = useState(""); const [edit, setEdit] = useState(null); const [msg, setMsg] = useState("");
  const load = () => api("club/roster", null, "GET").then((r) => setRows(r.roster)).catch(setErr);
  useEffect(() => { load(); }, []);
  if (!rows) return err ? <ErrorNote error={err} /> : <Spinner label="Loading roster…" />;
  const levels = [...new Set(rows.map((r) => r.level).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const shown = rows.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (!level || levelKey(r.level) === levelKey(level)));
  const linked = rows.filter((r) => r.families > 0).length;
  return (
    <>
      <div className="stats two">
        <div className="stat"><span className="stat-value">{rows.length}</span><span className="stat-label">Athletes on roster</span></div>
        <div className="stat"><span className="stat-value">{linked}</span><span className="stat-label">Linked to a parent</span></div>
      </div>
      <LinkRequests onChange={load} />
      {msg && <p className="note note-ok">{msg}</p>}
      <Button className="wide" onClick={() => setAdd(true)}>＋ Add athletes (paste or upload a list)</Button>
      {!rows.length ? <Empty icon="👥" title="No athletes yet" text="Paste your roster from a spreadsheet. Parents then just search for their athlete — level, girls/boys and the season schedule are already there." /> : (
        <section className="card form">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search roster by name" />
          <div className="chips">{["", ...levels].map((l) => <button key={l || "all"} className={`chip ${level === l ? "on" : ""}`} onClick={() => setLevel(l)}>{l || `All (${rows.length})`}</button>)}</div>
          {shown.map((r) => (
            <button key={r.id} className="list-row" onClick={() => setEdit(r)}>
              <span className="grow"><b>{r.name}</b><p className="muted small">{r.level || "No level"} · {r.gender === "M" ? "Boys" : r.gender === "F" ? "Girls" : "—"}{r.group_name ? ` · ${r.group_name}` : ""}</p></span>
              {r.families > 0 ? <span className="pill pill-me">✓ Parent linked</span> : <span className="pill pill-off">Not linked yet</span>}
            </button>
          ))}
          {!shown.length && <p className="muted center">No athletes match.</p>}
        </section>
      )}
      {add && <RosterAdd onClose={() => setAdd(false)} onDone={(r) => { setAdd(false); setMsg(`${r.added} athletes added${r.skipped ? `, ${r.skipped} already on the roster` : ""}${r.linked ? ` · ${r.linked} linked to parents by email` : ""}.`); load(); }} />}
      {edit && <RosterEdit row={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </>
  );
}

// Parents who found their athlete by name and asked to link (no gym code, email didn't match the roster).
function LinkRequests({ onChange }) {
  const [rows, setRows] = useState([]); const [err, setErr] = useState(null);
  const load = () => api("club/roster-requests", null, "GET").then((r) => setRows(r.requests || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!rows.length) return null;
  const act = async (id, approve) => { setErr(null); try { await api("club/roster-requests", { id, approve }); setRows(rows.filter((r) => r.id !== id)); onChange?.(); } catch (e) { setErr(e); } };
  return (
    <section className="card requests">
      <h3>🙋 {rows.length} parent{rows.length === 1 ? "" : "s"} asked to link</h3>
      {rows.map((r) => <div key={r.id} className="list-row"><span className="grow"><b>{r.parent}</b><small className="muted"> · {r.email}</small><p className="small">wants to follow <b>{r.athlete}</b>{r.level ? ` (${r.level})` : ""}</p></span><span className="row tight"><Button kind="ghost" onClick={() => act(r.id, false)}>Decline</Button><Button onClick={() => act(r.id, true)}>Approve</Button></span></div>)}
      <ErrorNote error={err} />
    </section>
  );
}

function RosterAdd({ onClose, onDone }) {
  const [text, setText] = useState(""); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const file = useRef(null);
  const rows = parseRoster(text);
  return (
    <Sheet title="Add athletes" onClose={onClose}>
      <div className="form">
        <p className="muted">One athlete per line: <b>Name, Level, Girl or Boy</b>. Add the parent's email at the end to link them automatically when they sign up.</p>
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Maya Patel, Level 5, Girl, parent@email.com\nLiam Ortiz, Level 4, Boy\nMila Park, Xcel Gold, Girl"} aria-label="Roster list" />
        <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
        <button className="link" onClick={() => file.current?.click()}>Or upload a .csv file from Excel or Google Sheets</button>
        {rows.length > 0 && (
          <div className="card preview">
            <b>{rows.length} athletes ready</b>
            {rows.slice(0, 5).map((r, i) => <p key={i} className="small">{r.name} · {r.level || <span className="warn-text">no level</span>} · {r.gender === "M" ? "Boy" : r.gender === "F" ? "Girl" : <span className="muted">girl (default)</span>}{r.parent_email ? ` · ${r.parent_email}` : ""}</p>)}
            {rows.length > 5 && <p className="muted small">…and {rows.length - 5} more</p>}
          </div>
        )}
        <ErrorNote error={err} />
        <Button className="wide" disabled={busy || !rows.length} onClick={async () => { setBusy(true); setErr(null); try { onDone(await api("club/roster", { rows })); } catch (e) { setErr(e); setBusy(false); } }}>{busy ? "Adding…" : `Add ${rows.length || ""} athletes`}</Button>
      </div>
    </Sheet>
  );
}

function RosterEdit({ row, onClose, onDone }) {
  const [f, setF] = useState({ name: row.name, level: row.level || "", gender: row.gender || "F", parent_email: row.parent_email || "", group: row.group_name || "" }); const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async (body) => { setErr(null); try { await api("club/roster", body); onDone(); } catch (e) { setErr(e); } };
  return (
    <Sheet title="Edit athlete" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); send({ update: { id: row.id, ...f } }); }}>
        <Field label="Name"><input value={f.name} onChange={set("name")} required /></Field>
        <div className="grid2"><Field label="Level" hint="Changing the level updates their competitions"><input value={f.level} onChange={set("level")} /></Field><Field label="Girls / boys"><select value={f.gender} onChange={set("gender")}><option value="F">Girls</option><option value="M">Boys</option></select></Field></div>
        <Field label="Parent email (optional)"><input type="email" value={f.parent_email} onChange={set("parent_email")} /></Field>
        <ErrorNote error={err} />
        <div className="row end"><Button type="button" kind="danger" onClick={() => window.confirm(`Remove ${row.name} from the roster?`) && send({ remove: row.id })}>Remove</Button><Button>Save</Button></div>
      </form>
    </Sheet>
  );
}

function Schedule({ me }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null); const [snap, setSnap] = useState(false); const [edit, setEdit] = useState(null); const [busy, setBusy] = useState("");
  const load = () => api("club/schedule", null, "GET").then((r) => setRows(r.competitions)).catch(setErr);
  useEffect(() => { load(); }, []);
  if (!rows) return err ? <ErrorNote error={err} /> : <Spinner label="Loading schedule…" />;
  const act = async (id, body) => { setBusy(id); setErr(null); try { await api(body.clubMeetId ? "club/lookup" : "club/schedule", body); await load(); } catch (e) { setErr(e); } setBusy(""); };
  return (
    <>
      <button className="card snap-cta" onClick={() => setSnap(true)}>
        <span className="snap-art sm" aria-hidden><span>📄</span><i>→</i><span>🗓️</span></span>
        <span className="grow"><b>Add the season from a photo</b><small>Upload the schedule you already hand out. Each family sees only their level's meets.</small></span><span aria-hidden>›</span>
      </button>
      <button className="link center" onClick={() => setEdit({ name: "", start_date: "", levels: [], gender: null, sessions: [] })}>Or add one competition by hand</button>
      <ErrorNote error={err} />
      {!rows.length && <Empty icon="🗓️" title="No competitions yet" text="Once published, every family's calendar fills in with only their athlete's competitions — and we look online for the host, website and session times." />}
      {rows.map((m) => {
        const site = safeUrl(m.website);
        return (
          <article key={m.id} className={`card comp ${m.status === "suggested" ? "suggested" : ""}`}>
            <div className="card-head"><h3>{m.name}</h3><span className="pill">{m.athletes} athlete{m.athletes === 1 ? "" : "s"}</span></div>
            <p className="muted small">{fmt.date(m.start_date)}{m.end_date && m.end_date !== m.start_date ? ` – ${fmt.date(m.end_date)}` : ""}{m.location ? ` · ${m.location}` : ""}</p>
            <div className="row tight"><span className={`pill ${m.gender === "M" ? "pill-boy" : m.gender === "F" ? "pill-girl" : ""}`}>{levelsLabel(m)}</span>{m.status === "suggested" && <span className="pill pill-warn">Sent by a parent — not published</span>}</div>
            {(m.host || m.venue || site || (m.sessions || []).length > 0) && (
              <div className="found">
                {m.host && <p><small>Host</small> {m.host}</p>}
                {m.venue && <p><small>Venue</small> {m.venue}</p>}
                {site && <p><small>Website</small> <a href={site} target="_blank" rel="noopener noreferrer">{new URL(site).hostname.replace(/^www\./, "")} ↗</a></p>}
                {(m.sessions || []).map((s, i) => <p key={i}><small>{(s.levels || []).join(", ") || "Session"}</small> {s.text}</p>)}
              </div>
            )}
            {m.info_checked_at && !(m.sessions || []).length && <p className="muted small">Checked online {fmt.date(String(m.info_checked_at).slice(0, 10))} · no session times posted yet. We check daily.</p>}
            <div className="row">
              {m.status === "suggested" ? <Button disabled={busy === m.id} onClick={() => act(m.id, { publish: m.id })}>Publish to families</Button>
                : me?.web_lookup !== false && (busy === m.id ? <Spinner label="Searching the web…" /> : <Button kind="ghost" onClick={() => act(m.id, { clubMeetId: m.id })}>🔎 {m.info_checked_at ? "Check again" : "Find host & times online"}</Button>)}
              <button className="link" onClick={() => setEdit(m)}>Edit</button>
              <button className="link danger" onClick={() => window.confirm(`Remove ${m.name} from every family's calendar?`) && act(m.id, { remove: m.id })}>Remove</button>
            </div>
          </article>
        );
      })}
      {snap && <SchedulePhoto mode="owner" onClose={() => setSnap(false)} onDone={() => { setSnap(false); load(); }} />}
      {edit && <CompEdit full row={edit} onClose={() => setEdit(null)} onSave={async (r) => { setEdit(null); await act(r.id || "new", r.id ? { update: r } : { add: [r] }); }} />}
    </>
  );
}

function Inbox({ onRead }) {
  const [threads, setThreads] = useState(null); const [open, setOpen] = useState(null); const [err, setErr] = useState(null);
  const load = () => api("club/messages", null, "GET").then((r) => setThreads(r.threads || [])).catch(setErr);
  useEffect(() => { load(); }, []);
  if (!threads) return err ? <ErrorNote error={err} /> : <Spinner label="Loading messages…" />;
  if (!threads.length) return <Empty icon="💬" title="No messages yet" text="Parents can ask about practice times, meets or fees from their app. Messages arrive here and in your email." />;
  return (
    <>
      <section className="card">
        {threads.map((t) => (
          <button key={t.family_id} className="list-row" onClick={() => setOpen(t)}>
            <span className="grow"><b>{t.name}</b>{t.athletes ? <span className="muted small"> · {t.athletes}</span> : null}<p className={`small clip ${t.unread ? "" : "muted"}`}>{t.last.sender === "gym" ? "You: " : ""}{t.last.body}</p></span>
            {t.unread > 0 ? <span className="badge inline">{t.unread}</span> : <span aria-hidden>›</span>}
          </button>
        ))}
      </section>
      {open && <Sheet title={open.name} onClose={() => { setOpen(null); load(); onRead?.(); }}><Thread familyId={open.family_id} /></Sheet>}
    </>
  );
}

function Announcements({ club }) {
  const [f, setF] = useState({ title: "", body: "", email: true }); const [err, setErr] = useState(null); const [done, setDone] = useState(null); const [busy, setBusy] = useState(false); const [list, setList] = useState([]);
  const load = () => api("club/home", null, "GET").then((r) => setList(r.announcements || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <>
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); setDone(null); try { const r = await api("club/announce", { clubCode: club.code, ...f }); setDone(r); setF({ title: "", body: "", email: true }); load(); } catch (e2) { setErr(e2); } setBusy(false); }}>
        <h3>Announcement to every family</h3>
        <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required placeholder="Practice schedule for Thanksgiving week" /></Field>
        <Field label="Message" hint="Long messages get a short summary at the top, so parents see the key dates first."><textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required /></Field>
        <label className="check"><input type="checkbox" checked={f.email} onChange={(e) => setF({ ...f, email: e.target.checked })} /> Also email every family</label>
        <ErrorNote error={err} />
        {done && <p className="note note-ok"><b>Posted.</b> Every family sees an alert in the app{done.emailed ? ` and ${done.emailed} got it by email` : ""}.{done.summary ? ` Summary shown to parents: “${done.summary}”` : ""}</p>}
        <Button className="wide" disabled={busy}>{busy ? "Posting…" : "Send to all families"}</Button>
      </form>
      {list.length > 0 && <h2 className="section">Sent</h2>}
      {list.map((a) => <article key={a.id} className="card post"><p className="muted small">{fmt.date(a.created_at.slice(0, 10))}</p><h3>{a.title}</h3>{a.summary && <p className="post-sum"><b>In short:</b> {a.summary}</p>}<p className="pre">{a.body}</p></article>)}
    </>
  );
}
