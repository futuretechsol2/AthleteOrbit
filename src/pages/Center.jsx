// Gym features shared by parents and gym owners:
// the schedule-photo reader, the parent's "My gym" page (posts, messages, find my athlete) and the meet info block.
import React, { useEffect, useRef, useState } from "react";
import { api, db } from "../lib/db.js";
import { resizeImage } from "../lib/media.js";
import { meetMatches, levelsLabel } from "../data/levels.js";
import { Button, Field, Sheet, Empty, ErrorNote, Spinner, fmt } from "../ui.jsx";

export const safeUrl = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null);
const when = (iso) => { const d = new Date(iso), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" }); };
const range = (m) => `${fmt.date(m.start_date)}${m.end_date && m.end_date !== m.start_date ? ` – ${fmt.date(m.end_date)}` : ""}`;

// ---------- 1. Snap the season schedule ----------
// mode "parent": adds each athlete's own competitions to the family's calendar.
// mode "owner": publishes the season for the whole gym; every family sees only their athletes' competitions.
export function SchedulePhoto({ mode = "parent", gymnasts = [], inGym = false, onClose, onDone }) {
  const [step, setStep] = useState("pick"); const [comps, setComps] = useState([]); const [off, setOff] = useState({}); const [err, setErr] = useState(null);
  const [share, setShare] = useState(false); const [result, setResult] = useState(null); const [edit, setEdit] = useState(null);
  const file = useRef(null);
  const kids = gymnasts.filter((g) => (g.sport || "Gymnastics") && g);
  const forWho = (c) => kids.filter((g) => meetMatches(c, g));
  async function read(f) {
    if (!f) return;
    setErr(null); setStep("reading");
    try { const image = await resizeImage(f, 2000, 0.88); const r = await api("club/schedule-read", { image, sport: kids[0]?.sport }); setComps(r.competitions); setStep("review"); }
    catch (e) { setErr(e); setStep("pick"); }
  }
  const picked = comps.filter((c, i) => !off[i] && (mode === "owner" || forWho(c).length || share));
  async function saveAll() {
    setErr(null); setStep("saving");
    try {
      const r = mode === "owner" ? await api("club/schedule", { add: comps.filter((_, i) => !off[i]) }) : await api("club/schedule-apply", { competitions: comps.filter((_, i) => !off[i]), share });
      setResult(r); setStep("done");
    } catch (e) { setErr(e); setStep("review"); }
  }
  return (
    <Sheet title={mode === "owner" ? "Season schedule from a photo" : "Add the season from a photo"} onClose={step === "done" ? () => onDone?.(result) : onClose}>
      {step === "pick" && (
        <div className="stack">
          <div className="snap-hero">
            <div className="snap-art" aria-hidden><span>📄</span><i>→</i><span>🗓️</span></div>
            <h3>{mode === "owner" ? "One photo. Every family's calendar filled in." : "One photo. The whole season on your calendar."}</h3>
            <p className="muted">{mode === "owner" ? "Upload the competition schedule you already hand out. We read every meet, the levels and girls/boys — and each family sees only their own athlete's meets." : "Take a picture of the schedule your gym gave you (paper, email or a screenshot). We add only the competitions for your athlete's level."}</p>
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => read(e.target.files?.[0])} />
          <Button className="wide" onClick={() => file.current?.click()}>📷 Choose or take a photo</Button>
          <ol className="steps small muted"><li>We read names, dates, cities and levels.</li><li>You check the list.</li><li>We look online for the host, website and session times — and remind you before each one.</li></ol>
          <ErrorNote error={err} />
        </div>
      )}
      {step === "reading" && <div className="reading"><Spinner label="Reading your schedule…" /><p className="muted small center">Finding every competition, date and level. About 10 seconds.</p></div>}
      {(step === "review" || step === "saving") && (
        <div className="stack">
          <p className="note note-ok"><b>{comps.length} competitions found.</b> {mode === "owner" ? "Check the levels, then publish." : "Untick anything that's wrong."}</p>
          {comps.map((c, i) => {
            const who = forWho(c), mine = mode === "owner" || who.length > 0;
            return (
              <div key={i} className={`card comp-row ${off[i] || (!mine && !share) ? "dim" : ""}`}>
                <label className="check"><input type="checkbox" checked={!off[i] && (mine || share)} disabled={!mine && !share} onChange={() => setOff({ ...off, [i]: !off[i] })} aria-label={`Include ${c.name}`} /></label>
                <div className="grow">
                  <b>{c.name}</b>
                  <p className="muted small">{range(c)}{c.location ? ` · ${c.location}` : ""}</p>
                  <div className="row tight"><span className={`pill ${c.gender === "M" ? "pill-boy" : c.gender === "F" ? "pill-girl" : ""}`}>{levelsLabel(c)}</span>
                    {mode === "parent" && (who.length ? who.map((g) => <span key={g.id} className="pill pill-me">✓ {g.name}</span>) : <span className="pill pill-off">Not your athletes' level</span>)}</div>
                </div>
                <button className="link" onClick={() => setEdit(i)}>Edit</button>
              </div>
            );
          })}
          {mode === "parent" && inGym && <label className="check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Also send the full schedule to my gym so other families get it</label>}
          <ErrorNote error={err} />
          <Button className="wide" disabled={step === "saving" || !picked.length} onClick={saveAll}>{step === "saving" ? "Saving…" : mode === "owner" ? `Publish ${picked.length} competitions to families` : `Add ${picked.length} to my calendar`}</Button>
          <button className="link center" onClick={() => { setComps([]); setOff({}); setStep("pick"); }}>Use a different photo</button>
        </div>
      )}
      {step === "done" && (
        <div className="empty">
          <div className="empty-icon">🎉</div>
          {mode === "owner" ? <><h3>{result.saved} competitions published</h3><p>{result.added ? `${result.added} calendar entries were added for families already in your gym. ` : ""}New families get theirs the moment they join. We're now looking online for hosts, websites and session times.</p></>
            : <><h3>{result.added} added to your calendar</h3><p>{Object.entries(result.perAthlete || {}).map(([n, c]) => `${n}: ${c}`).join(" · ") || "Those competitions were already on your calendar."}{result.shared ? ` · Sent ${result.shared} to your gym.` : ""}</p><p className="muted small">We'll look for the host, website and session times, and remind you 14, 7, 2 and 1 days before.</p></>}
          <Button onClick={() => onDone?.(result)}>Done</Button>
        </div>
      )}
      {edit !== null && <CompEdit row={comps[edit]} onClose={() => setEdit(null)} onSave={(r) => { setComps(comps.map((c, i) => (i === edit ? r : c))); setEdit(null); }} />}
    </Sheet>
  );
}

// Edit one competition (used in the photo review and in the gym's schedule).
export function CompEdit({ row, onSave, onClose, full = false }) {
  const [f, setF] = useState({ ...row, levelsText: (row.levels || []).join(", "), sessionsText: (row.sessions || []).map((s) => `${(s.levels || []).join("/")}${s.levels?.length ? ": " : ""}${s.text}`).join("\n") });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function submit(e) {
    e.preventDefault();
    const { levelsText, sessionsText, ...rest } = f;
    const out = { ...rest, end_date: f.end_date || null, gender: f.gender || null, levels: levelsText.split(",").map((s) => s.trim()).filter(Boolean) };
    if (full) out.sessions = sessionsText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const m = /^([^:]{1,60}):\s+(.+)$/.exec(l); return m && /level|xcel|gold|silver|bronze|platinum|diamond|\d/i.test(m[1]) && !/\d\s*(am|pm)/i.test(m[1]) ? { levels: m[1].split("/").map((s) => s.trim()).filter(Boolean), gender: out.gender, text: m[2] } : { levels: [], gender: out.gender, text: l }; });
    onSave(out);
  }
  return (
    <Sheet title="Edit competition" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Name"><input value={f.name || ""} onChange={set("name")} required /></Field>
        <div className="grid2"><Field label="Start date"><input type="date" value={f.start_date || ""} onChange={set("start_date")} required /></Field><Field label="End date"><input type="date" value={f.end_date || ""} onChange={set("end_date")} /></Field></div>
        <Field label="City, State"><input value={f.location || ""} onChange={set("location")} /></Field>
        <div className="grid2">
          <Field label="Levels" hint="Commas between levels. Empty = whole team"><input value={f.levelsText} onChange={set("levelsText")} placeholder="Level 4, Level 5" /></Field>
          <Field label="Who"><select value={f.gender || ""} onChange={set("gender")}><option value="">Girls and boys</option><option value="F">Girls</option><option value="M">Boys</option></select></Field>
        </div>
        {full && <>
          <div className="grid2"><Field label="Host"><input value={f.host || ""} onChange={set("host")} /></Field><Field label="Website"><input type="url" value={f.website || ""} onChange={set("website")} placeholder="https://" /></Field></div>
          <Field label="Venue & address"><input value={f.venue || ""} onChange={set("venue")} /></Field>
          <Field label="Session times" hint={'One per line. Start with the level to send each family only theirs, e.g. "Level 4: Sat 8:00 AM, Session 1"'}><textarea rows={3} value={f.sessionsText} onChange={set("sessionsText")} /></Field>
        </>}
        <Button className="wide">Save</Button>
      </form>
    </Sheet>
  );
}

// ---------- 2. Host, website, venue and session time on a meet (found online) ----------
export function MeetInfo({ meet, me, can, upgrade, onChange }) {
  const [m, setM] = useState(meet); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [miss, setMiss] = useState(false);
  const past = fmt.daysUntil(m.start_date) < 0;
  const site = safeUrl(m.website), src = safeUrl(m.info_source);
  async function find() {
    if (!can("schedule")) return upgrade("schedule");
    setBusy(true); setErr(null); setMiss(false);
    try { const r = await api("club/lookup", { meetId: m.id }); const { found, ...patch } = r; const next = { ...m, ...patch }; Object.assign(meet, patch); setM(next); setMiss(!found); onChange?.(next); } catch (e) { setErr(e); }
    setBusy(false);
  }
  return (
    <div className="card meet-info">
      <div className="info-grid">
        <div><small>Host</small><b>{m.host || "—"}</b></div>
        <div><small>Your session</small><b className={m.session_time ? "" : "muted"}>{m.session_time || (past ? "—" : "Not posted yet")}</b></div>
        {m.venue && <div className="span2"><small>Venue</small><b>{m.venue}</b> <a className="link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.venue)}`} target="_blank" rel="noopener noreferrer">Map ↗</a></div>}
      </div>
      {site && <a className="site-btn" href={site} target="_blank" rel="noopener noreferrer"><span aria-hidden>🌐</span><span className="grow"><b>Official meet website</b><small>{new URL(site).hostname.replace(/^www\./, "")}</small></span><span aria-hidden>↗</span></a>}
      {m.info_checked_at && <p className="muted small">{src ? "Found online" : "Checked online"} {fmt.date(String(m.info_checked_at).slice(0, 10))}{!m.session_time && !past ? " · session times usually post 1–2 weeks before; we check daily and email you" : ""}. Always confirm times with your gym.</p>}
      {miss && <p className="note">We couldn't confirm this one online yet. We'll keep checking.</p>}
      <ErrorNote error={err} />
      {!past && (me?.web_lookup !== false) && (busy ? <Spinner label="Searching the web for this meet…" /> : <Button kind="ghost" className="wide" onClick={find}>🔎 {m.info_checked_at ? "Check again for session times" : "Find host, website & session time"}</Button>)}
    </div>
  );
}

// ---------- 3. Parent's "My gym" page ----------
export default function GymPage({ me, gymnasts, refresh, go, params }) {
  const [home, setHome] = useState(null); const [err, setErr] = useState(null); const [tab, setTab] = useState(params?.tab || "posts");
  const load = () => api("club/home", null, "GET").then((r) => { setHome(r); const latest = r.announcements?.[0]?.created_at; if (latest) try { localStorage.setItem("gp-ann-seen", latest); } catch {} }).catch(setErr);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params?.tab) setTab(params.tab); }, [params]);
  if (!home && !err) return <div className="skeleton" />;
  if (!home?.club) return <div className="stack"><div className="page-head"><h1>My gym</h1></div><ErrorNote error={err} /><JoinGym onJoined={() => { load(); refresh(); }} /></div>;
  const findable = home.rosterSize > 0 && home.unlinked.length > 0;
  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">My gym</p>
        <h1>{home.club.name}</h1>
        <p className="hero-sub">Announcements, your season schedule and a direct line to the gym.</p>
      </section>
      {findable && <FindAthlete home={home} onLinked={() => { load(); refresh(); }} />}
      <div className="chips" role="tablist">
        {[["posts", "📣 Announcements"], ["messages", `💬 Messages${home.unread ? ` (${home.unread})` : ""}`], ["find", "🔎 Find my athlete"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "posts" && <Posts list={home.announcements} />}
      {tab === "messages" && <Thread title={home.club.name} onRead={() => { if (home.unread) { setHome({ ...home, unread: 0 }); refresh(); } }} />}
      {tab === "find" && <FindAthlete home={home} open onLinked={() => { load(); refresh(); }} />}
      <button className="link center" onClick={() => go("meets")}>See {gymnasts?.length > 1 ? "each athlete's" : "your athlete's"} competitions ›</button>
    </div>
  );
}

function JoinGym({ onJoined }) {
  const [code, setCode] = useState(() => { try { return localStorage.getItem("gp-gym-code") || ""; } catch { return ""; } }); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api("club/join", { code }); try { localStorage.removeItem("gp-gym-code"); } catch {} onJoined(); } catch (e2) { setErr(e2); } setBusy(false); }}>
      <h3>Connect to your gym</h3>
      <p className="muted">Enter the code your gym gave you. You'll get the gym's season schedule for your athlete's level, announcements, and you can message the gym here.</p>
      <div className="row"><input className="grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GYM-CODE" aria-label="Gym code" /><Button disabled={busy || !code.trim()}>{busy ? "Joining…" : "Join"}</Button></div>
      <ErrorNote error={err} />
      <p className="muted small">Gym not on AthleteOrbit yet? You can still add the whole season from a photo under Meets.</p>
    </form>
  );
}

function Posts({ list }) {
  const [open, setOpen] = useState(null);
  if (!list.length) return <Empty icon="📣" title="No announcements yet" text="When your gym posts a schedule change or news, it shows here and in your email." />;
  return list.map((a) => (
    <article key={a.id} className="card post">
      <p className="muted small">{fmt.date(a.created_at.slice(0, 10))}</p>
      <h3>{a.title}</h3>
      {a.summary ? <><p className="post-sum"><b>In short:</b> {a.summary}</p>{open === a.id ? <p className="pre">{a.body}</p> : <button className="link" onClick={() => setOpen(a.id)}>Read the full message</button>}</> : <p className="pre">{a.body}</p>}
    </article>
  ));
}

// One conversation. Parent side: no familyId. Gym side: pass the family's id.
export function Thread({ familyId, title, onRead }) {
  const [msgs, setMsgs] = useState(null); const [who, setWho] = useState(null); const [text, setText] = useState(""); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const end = useRef(null); const side = familyId ? "gym" : "family";
  const load = () => api("club/messages", null, "GET", familyId ? { family: familyId } : null).then((r) => { setMsgs(r.messages || []); setWho(r.who || null); onRead?.(); }).catch(setErr);
  useEffect(() => { load(); }, [familyId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs?.length]);
  async function send(e) {
    e.preventDefault(); if (!text.trim()) return;
    setBusy(true); setErr(null);
    try { await api("club/messages", { body: text.trim(), ...(familyId ? { familyId } : {}) }); setText(""); await load(); } catch (e2) { setErr(e2); }
    setBusy(false);
  }
  return (
    <div className="card thread">
      {who && <p className="muted small"><b>{who.name}</b>{who.athletes ? ` · ${who.athletes}` : ""}</p>}
      {!msgs ? <Spinner label="Loading messages…" /> : !msgs.length ? <p className="muted center">{side === "family" ? `Ask ${title || "your gym"} about practice times, meets or fees. They get your message by email and reply here.` : "No messages yet."}</p> : (
        <div className="bubbles">{msgs.map((m) => <div key={m.id} className={`bubble ${m.sender === side ? "me" : "them"}`}><p className="pre">{m.body}</p><small>{m.sender === side ? "You" : side === "family" ? title || "Gym" : who?.name || "Parent"} · {when(m.created_at)}</small></div>)}<span ref={end} /></div>
      )}
      <form className="row send-row" onSubmit={send}>
        <textarea rows={1} className="grow" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder={side === "family" ? "Message your gym…" : "Reply…"} aria-label="Message" />
        <Button disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</Button>
      </form>
      <ErrorNote error={err} />
    </div>
  );
}

// Search the gym's roster by name or level and link the athlete: profile, level and season schedule come with it.
function FindAthlete({ home, open = false, onLinked }) {
  const [show, setShow] = useState(open); const [q, setQ] = useState(""); const [level, setLevel] = useState(""); const [res, setRes] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(""); const [done, setDone] = useState(null);
  useEffect(() => {
    if (!show) return;
    let live = true;
    const t = setTimeout(() => api("club/roster-search", null, "GET", { q, level }).then((r) => live && setRes(r)).catch((e) => live && setErr(e)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [show, q, level]);
  if (!show) return (
    <button className="card find-cta" onClick={() => setShow(true)}>
      <span aria-hidden className="find-icon">🔎</span>
      <span className="grow"><b>Find {home.unlinked.join(" & ")} on {home.club.name}'s roster</b><small>One tap sets the level and adds the season's competitions.</small></span><span aria-hidden>›</span>
    </button>
  );
  async function claim(r) {
    setBusy(r.id); setErr(null);
    try { const out = await api("club/roster-claim", { rosterId: r.id }); setDone(out); onLinked?.(); } catch (e) { setErr(e); }
    setBusy("");
  }
  return (
    <div className="card form">
      <h3>Find my athlete</h3>
      {!home.rosterSize ? <p className="muted">Your gym hasn't added its roster yet. You can add your athlete yourself under More.</p> : <>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" />
        {res?.levels?.length > 0 && <div className="chips">{["", ...res.levels].map((l) => <button key={l || "all"} className={`chip ${level === l ? "on" : ""}`} onClick={() => setLevel(l)}>{l || "All levels"}</button>)}</div>}
        {done && <p className="note note-ok"><b>{done.name} is linked.</b> {done.meets ? `${done.meets} competitions were added to the calendar.` : "The season schedule appears as soon as your gym publishes it."}</p>}
        <ErrorNote error={err} />
        {!res ? <Spinner label="Searching…" /> : !res.results.length ? <p className="muted center">No one found. Check the spelling or ask your gym to add your athlete.</p> : res.results.map((r) => (
          <div key={r.id} className="list-row">
            <div className="grow"><b>{r.name}</b><p className="muted small">{r.level}{r.gender ? ` · ${r.gender === "M" ? "Boys" : "Girls"}` : ""}{r.group ? ` · ${r.group}` : ""}</p></div>
            {r.mine ? <span className="pill pill-me">✓ Linked</span> : r.full ? <span className="pill">Already linked</span> : <Button kind="ghost" disabled={busy === r.id} onClick={() => claim(r)}>{busy === r.id ? "Linking…" : "This is my athlete"}</Button>}
          </div>
        ))}
        <p className="muted small">Other families' athletes show as first name and last initial only.</p>
      </>}
    </div>
  );
}

// ---------- Before adding an athlete by hand: are they already on a gym's roster? ----------
// Shown when a parent adds a child. Linking brings the level, the gym, the season schedule and announcements.
export function FindAthleteFirst({ onLinked, onManual, compact = false }) {
  const [q, setQ] = useState(""); const [res, setRes] = useState(null); const [err, setErr] = useState(null); const [pick, setPick] = useState(null);
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined; }
    let live = true; const t = setTimeout(() => api("roster/find", null, "GET", { q: q.trim() }).then((r) => live && setRes(r.results)).catch((e) => live && setErr(e)), 300);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  async function link(r, withCode) {
    setBusy(true); setErr(null);
    try { const out = await api("roster/request", { rosterId: r.id, ...(withCode ? { code } : {}) }); setDone({ ...out, who: r }); if (out.linked) setTimeout(() => onLinked?.(out), 2400); } catch (e) { setErr(e); }
    setBusy(false);
  }
  if (done) return (
    <div className="card find-done">
      {done.linked ? <><div className="empty-icon">🎉</div><h3>{done.name} is linked to {done.gym}</h3><p className="muted">{done.meets ? `${done.meets} competitions were added to your calendar.` : "Level, gym and season schedule are set."}</p></>
        : <><div className="empty-icon">📨</div><h3>Request sent to {done.gym}</h3><p className="muted">They'll approve it and you'll get an email. Have their gym code? Enter it to link right away.</p>
          <div className="row"><input className="grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GYM-CODE" aria-label="Gym code" /><Button disabled={busy || !code.trim()} onClick={() => link(done.who, true)}>Link now</Button></div>
          <ErrorNote error={err} /><button className="link" onClick={onManual}>Add my athlete myself for now</button></>}
    </div>
  );
  return (
    <div className={`card form find-first ${compact ? "compact" : ""}`}>
      <h3>🔎 Find your athlete</h3>
      <p className="muted small">If your gym or club uses AthleteOrbit, your athlete is already here — level, team and season schedule included.</p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Athlete's name, e.g. Maya Patel" aria-label="Athlete's name" autoFocus={!compact} />
      {res && (!res.length ? <p className="muted small">No match yet. Your gym may not be on AthleteOrbit — add your athlete below.</p> : res.map((r) => (
        <div key={r.id} className={`list-row ${pick?.id === r.id ? "picked" : ""}`}>
          <span className="grow"><b>{r.name}</b><small className="muted"> · {r.level}{r.gender ? ` · ${r.gender === "M" ? "Boys" : "Girls"}` : ""}</small><p className="small muted">{r.gym}{r.myGym ? " · your gym" : ""}</p></span>
          {r.mine ? <span className="pill pill-me">✓ Yours</span> : r.pending ? <span className="pill">Requested</span> : <Button kind="ghost" disabled={busy} onClick={() => (r.myGym ? link(r) : setPick(r))}>This is my child</Button>}
        </div>
      )))}
      {pick && (
        <div className="card inner">
          <p><b>Link {pick.name} at {pick.gym}</b></p>
          <p className="muted small">Enter the gym's code to link now, or send a request the gym approves.</p>
          <div className="row"><input className="grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GYM-CODE (optional)" aria-label="Gym code" /><Button disabled={busy} onClick={() => link(pick, !!code.trim())}>{code.trim() ? "Link" : "Send request"}</Button></div>
        </div>
      )}
      <ErrorNote error={err} />
      <button className="link center" onClick={onManual}>Not listed? Add my athlete myself →</button>
    </div>
  );
}
