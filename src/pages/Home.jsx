import React, { useEffect, useState } from "react";
import { db } from "../lib/db.js";
import { allAround, eventsCompeted } from "../data/skills.js";
import { conf, sportOf, skillsForChild, usesScores } from "../data/sports.js";
import { personalRecords, fmtValue } from "../data/family.js";
import { TrendChart, fmt, today, Markdown, Sheet, Button, Spinner, Avatar, ErrorNote } from "../ui.jsx";
import { drawRecap, shareOrDownload } from "../lib/recap.js";
import { api } from "../lib/db.js";
import { isMeetDay, arriveBy, mapsLink, curatedTips } from "../data/meetday.js";

export default function Home({ gymnast, go, can, upgrade }) {
  const [d, setD] = useState(null);
  const [recap, setRecap] = useState(null); const [share, setShare] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([
      db.list("scores", { gymnast_id: gymnast.id }),
      db.list("meets", { gymnast_id: gymnast.id }),
      db.list("costs"),
      db.list("skill_status", { gymnast_id: gymnast.id }),
      db.list("ai_notes", { gymnast_id: gymnast.id }),
      usesScores(gymnast) ? [] : db.list("stats", { gymnast_id: gymnast.id }),
    ]).then(([scores, meets, costs, skills, notes, stats]) => live && setD({ scores, meets, costs, skills, notes, stats })).catch(() => live && setD({ scores: [], meets: [], costs: [], skills: [], notes: [], stats: [] }));
    return () => { live = false; };
  }, [gymnast.id]);
  if (!d) return <div className="skeleton" />;

  const rows = d.scores.map((s) => ({ ...s, aa: allAround(s), n: eventsCompeted(s) })).filter((s) => s.aa !== null);
  const best = rows.length ? Math.max(...rows.map((r) => r.aa)) : null;
  const latest = rows[rows.length - 1];
  const avgEvent = rows.length ? rows.reduce((a, r) => a + r.aa / r.n, 0) / rows.length : null;
  const S = conf(sportOf(gymnast)), gym = usesScores(gymnast);
  const levelSkills = skillsForChild(gymnast);
  const st = Object.fromEntries(d.skills.map((s) => [s.skill_key, s.status]));
  const ready = levelSkills.length ? levelSkills.filter((s) => ["Have it", "Competed"].includes(st[s.key])).length / levelSkills.length : 0;
  const myCosts = d.costs.filter((c) => c.gymnast_id === gymnast.id);
  const spent = myCosts.reduce((a, c) => a + Number(c.amount), 0);
  const unpaid = d.costs.filter((c) => !c.paid).reduce((a, c) => a + Number(c.amount), 0);
  const next = d.meets.filter((m) => m.start_date >= today() && m.status !== "Skipped")[0];
  const points = rows.map((r) => ({ y: r.aa / r.n, label: r.meet_name, short: fmt.short(r.meet_date), best: r.aa === best }));
  const lastNote = d.notes[0];
  const prs = personalRecords(d.stats || []), metrics = Object.keys(prs);
  const firstMetric = metrics[0], series = (d.stats || []).filter((r) => r.metric === firstMetric);
  const recent = (d.stats || [])[d.stats?.length - 1];

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-top"><Avatar src={gymnast.photo} name={gymnast.name} size={52} className="hero-avatar" />
        <div><p className="eyebrow">{S.icon} {gym ? gymnast.program : sportOf(gymnast)} · {gymnast.level}{gymnast.club ? ` · ${gymnast.club}` : ""}</p>
        <h1>{gymnast.name}'s season</h1></div></div>
        {!gym ? (recent ? <p className="hero-sub">Latest: <strong>{recent.metric} {fmtValue(recent.value, recent.unit)}</strong>{recent.event_name ? ` at ${recent.event_name}` : ""}{prs[recent.metric]?.id === recent.id ? " — personal record ★" : ""}</p>
          : <p className="hero-sub">Log a {S.event.toLowerCase()} to start the season story.</p>) : latest ? (
          <p className="hero-sub">Latest all-around <strong>{fmt.score(latest.aa)}</strong> at {latest.meet_name}{latest.aa === best ? " — season best ★" : ""}</p>
        ) : <p className="hero-sub">Log a meet to start the season story.</p>}
      </section>

      {d.meets.filter((m) => isMeetDay(m, today())).map((m) => <MeetDayCard key={m.id} meet={m} gymnast={gymnast} go={go} can={can} upgrade={upgrade} />)}

      <GettingStarted gymnast={gymnast} d={d} gym={gym} S={S} go={go} can={can} openShare={() => (can("share") ? setShare(true) : upgrade("share"))} />

      <div className="stats">
        {gym ? <>
        <Stat label="Meets" value={rows.length} />
        <Stat label="Best AA" value={best ? fmt.score(best) : "–"} />
        <Stat label="Avg / event" value={avgEvent ? avgEvent.toFixed(3) : "–"} />
        </> : <>
        <Stat label={`${S.events} logged`} value={new Set((d.stats || []).map((r) => r.event_date + r.event_name)).size} onClick={() => go("scores")} />
        <Stat label="Personal records" value={metrics.length} onClick={() => go("scores")} />
        <Stat label={firstMetric ? `Best ${firstMetric}` : "Best"} value={firstMetric ? fmtValue(prs[firstMetric].value, prs[firstMetric].unit) : "–"} onClick={() => go("scores")} />
        </>}
        <Stat label="Skills ready" value={`${Math.round(ready * 100)}%`} bar={ready} onClick={() => go("skills")} />
        <Stat label="Spent" value={fmt.money(spent)} onClick={() => go("costs")} />
        <Stat label="Unpaid (family)" value={fmt.money(unpaid)} tone={unpaid ? "warn" : ""} onClick={() => go("costs")} />
      </div>

      {gym ? <section className="card">
        <div className="card-head"><h3>Average score per event</h3><button className="link" onClick={() => go("scores")}>All scores</button></div>
        <TrendChart points={points} />
      </section> : series.length > 0 && <section className="card">
        <div className="card-head"><h3>{firstMetric}</h3><button className="link" onClick={() => go("scores")}>All {S.results.toLowerCase()}</button></div>
        <TrendChart label={firstMetric} points={series.map((r) => ({ y: Number(r.value), label: r.event_name || r.event_date, short: fmt.short(r.event_date), best: prs[firstMetric].id === r.id }))} />
      </section>}

      {next && (
        <section className="card next-meet" onClick={() => go("meets", { meetId: next.id })} role="button" tabIndex={0}>
          <div className="countdown"><strong>{Math.max(0, fmt.daysUntil(next.start_date))}</strong><span>days</span></div>
          <div>
            <p className="eyebrow">Next {S.event.toLowerCase()}</p>
            <h3>{next.name}</h3>
            <p className="muted small">{fmt.date(next.start_date)}{next.location ? ` · ${next.location}` : ""} · {next.status}</p>
            <p className="link small">Packing list & trip planner →</p>
          </div>
        </section>
      )}

      <section className="quick">
        <button onClick={() => go("scores", { add: true })}><span>＋</span>Add {S.results.toLowerCase()}</button>
        {gym ? <button onClick={() => go("scores", { online: true })}><span>🌐</span>Pull scores online{!can("onlineScores") && <i className="lock">Plus</i>}</button>
          : S.photoImport ? <button onClick={() => (can("snap") ? go("scores", { snap: true }) : upgrade("snap"))}><span>📷</span>Snap results{!can("snap") && <i className="lock">Pro</i>}</button>
          : <button onClick={() => go("meets")}><span>🗓️</span>{S.events}</button>}
        <button onClick={() => (can("video") ? go("coach", { tab: "video" }) : upgrade("video"))}><span>🎥</span>Video check{!can("video") && <i className="lock">Pro</i>}</button>
        <button onClick={() => (can("tips") ? go("coach", { tab: "tips" }) : upgrade("tips"))}><span>🥗</span>Tips & nutrition{!can("tips") && <i className="lock">Pro</i>}</button>
      </section>

      {gym && rows.length > 0 && (
        <button className="card recap-cta" onClick={async () => { if (!can("seasonCard")) return upgrade("seasonCard"); setRecap({ busy: true }); const blob = await drawRecap({ gymnast, rows, readiness: ready, appUrl: import.meta.env.VITE_APP_URL || location.origin }); setRecap({ blob, url: URL.createObjectURL(blob) }); }}>
          <span className="recap-icon" aria-hidden>🏆</span>
          <span className="grow"><b>Share {gymnast.name}'s season card</b><small className="muted">A picture of the season for family, friends and Instagram</small></span><span aria-hidden>↗</span>
        </button>
      )}

      <button className="card recap-cta" onClick={() => (can("share") ? setShare(true) : upgrade("share"))}>
        <span className="recap-icon" aria-hidden>👵</span>
        <span className="grow"><b>Share with grandparents & family</b><small className="muted">A private live page with {gymnast.name}'s {S.results.toLowerCase()} and upcoming {S.events.toLowerCase()} — no app needed</small></span>{!can("share") ? <i className="lock">Plus</i> : <span aria-hidden>↗</span>}
      </button>

      {lastNote && (
        <section className="card">
          <div className="card-head"><h3>{lastNote.title}</h3><button className="link" onClick={() => go("coach", { tab: "notes" })}>Saved notes</button></div>
          <div className="clamp"><Markdown text={lastNote.body} /></div>
        </section>
      )}
      {share && <ShareSheet gymnast={gymnast} onClose={() => setShare(false)} />}
      {recap && (
        <Sheet title="Season card" onClose={() => { if (recap.url) URL.revokeObjectURL(recap.url); setRecap(null); }}>
          {recap.busy ? <Spinner label="Drawing the card…" /> : <>
            <img src={recap.url} alt={`${gymnast.name}'s season card`} className="recap-img" />
            <Button className="wide" onClick={() => shareOrDownload(recap.blob, gymnast.name)}>Share or save image</Button>
          </>}
        </Sheet>
      )}
    </div>
  );
}

function Stat({ label, value, bar, tone = "", onClick }) {
  return (
    <button className={`stat ${tone}`} onClick={onClick} disabled={!onClick}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {bar !== undefined && <span className="stat-bar"><i style={{ width: `${Math.round(bar * 100)}%` }} /></span>}
    </button>
  );
}

function ShareSheet({ gymnast, onClose }) {
  const [url, setUrl] = useState(null); const [err, setErr] = useState(null); const [copied, setCopied] = useState(false); const [busy, setBusy] = useState(true);
  const call = async (body) => { setBusy(true); setErr(null); try { const r = await api("share/link", { gymnastId: gymnast.id, ...body }); setUrl(r.url); } catch (e) { setErr(e); } setBusy(false); };
  useEffect(() => { call({}); }, []);
  const msg = `Follow ${gymnast.name}'s season here: ${url}`;
  return (
    <Sheet title="Share with family" onClose={onClose}>
      <p className="muted">Anyone with this link sees {gymnast.name}'s results, personal bests and upcoming events. Never costs, hotels, notes or contact details. Turn it off anytime.</p>
      {busy && <Spinner label="Making your link…" />}
      {url && <div className="form">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Share link" />
        <div className="row">
          <Button className="grow" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied ✓" : "Copy link"}</Button>
          <a className="btn btn-ghost grow center" href={`sms:?&body=${encodeURIComponent(msg)}`}>Text it</a>
          <a className="btn btn-ghost grow center" href={`mailto:?subject=${encodeURIComponent(`${gymnast.name}'s season`)}&body=${encodeURIComponent(msg)}`}>Email it</a>
        </div>
        <div className="row"><button className="link" onClick={() => call({ rotate: true })}>Make a new link (old one stops working)</button><button className="link danger" onClick={async () => { await call({ enable: false }); onClose(); }}>Turn off sharing</button></div>
      </div>}
      <ErrorNote error={err} />
    </Sheet>
  );
}

// First-week checklist: the few steps that make the app useful (and worth paying for). Hides when done.
function GettingStarted({ gymnast, d, gym, S, go, openShare }) {
  const key = `gp-start-${gymnast.id}`;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });
  const steps = [
    ["📷", `Add ${gymnast.name}'s photo`, !!gymnast.photo, () => go("more")],
    ["🗓️", `Add the next ${S.event.toLowerCase()}`, d.meets.length > 0, () => go("meets")],
    ["🏅", `Log a ${gym ? "score" : "result"}`, gym ? d.scores.length > 0 : (d.stats || []).length > 0, () => go("scores", gym ? { online: true } : { add: true })],
    ["✅", "Check off skills", d.skills.length > 0, () => go("skills")],
    ["👵", "Share with grandparents", !!gymnast.share_key, openShare],
  ];
  const done = steps.filter((x) => x[2]).length;
  if (hidden || done === steps.length) return null;
  return (
    <section className="card start">
      <div className="card-head"><h3>Get set up · {done}/{steps.length}</h3><button className="link small" onClick={() => { setHidden(true); try { localStorage.setItem(key, "1"); } catch {} }}>Hide</button></div>
      <div className="stat-bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      {steps.map(([icon, label, ok, act]) => (
        <button key={label} className={`start-row ${ok ? "ok" : ""}`} onClick={ok ? undefined : act} disabled={ok}><span aria-hidden>{ok ? "✓" : icon}</span><span className="grow">{label}</span>{!ok && <span aria-hidden>›</span>}</button>
      ))}
    </section>
  );
}

// On the day of a meet: when to arrive, directions, packing left, tickets, and today's tips.
function MeetDayCard({ meet, gymnast, go, can, upgrade }) {
  const [tips, setTips] = useState(null);
  useEffect(() => { api("ai/meetday", { meetId: meet.id }).then(setTips).catch(() => setTips({ ...curatedTips(sportOf(gymnast), meet.id + today()), arrive: arriveBy(meet.session_time), maps: mapsLink(meet), ai: false })); }, [meet.id]);
  const left = (Array.isArray(meet.checklist) ? meet.checklist : []).filter((i) => !i.done).length;
  const S = conf(sportOf(gymnast));
  return (
    <section className="card meetday">
      <p className="eyebrow">🌟 {S.event} day</p>
      <h2>{meet.name}</h2>
      <p className="small muted">{[meet.session_time && `Session ${meet.session_time}`, meet.location].filter(Boolean).join(" · ")}</p>
      {tips?.arrive && <p className="arrive">⏰ Aim to arrive by <b>{tips.arrive}</b> <span className="muted small">(or your gym's report time)</span></p>}
      <div className="row tight">
        {tips?.maps && <a className="btn btn-ghost" href={tips.maps} target="_blank" rel="noreferrer">📍 Directions</a>}
        <button className="btn btn-ghost" onClick={() => go("meets", { meetId: meet.id })}>🎒 {left ? `${left} to pack` : "Packed ✓"}</button>
        {meet.listing_id && <a className="btn btn-primary" href={`/tickets/${meet.listing_id}`}>🎟️ Tickets</a>}
      </div>
      {!tips ? <Spinner label="Getting today's tips…" /> : <>
        <div className="tip"><b>💬 Say this today</b><p>{tips.motivation}</p></div>
        <div className="tip"><b>🍎 Fuel</b><p>{tips.nutrition}</p></div>
        {tips.focus && <div className="tip"><b>🎯 Focus cue</b><p>{tips.focus}</p></div>}
        {!tips.ai && !can("coach") && <button className="link small" onClick={() => upgrade("coach")}>Get tips written for {gymnast.name} by the AI coach · Pro</button>}
      </>}
    </section>
  );
}
