// Live scores: free public pages (no account), the TV scoreboard, the organizer's scoring tools,
// parent-reported scores, follow alerts, and shareable / printable score cards.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, db, DEMO, uploadCard } from "../lib/db.js";
import { eventsFor, rankRows, parseResults, toCsv, fmtScore, athleteKey, totalOf } from "../data/live.js";
import { PRINTS, printTotal } from "../data/prints.js";
import { Button, Field, Sheet, Empty, ErrorNote, Spinner, fmt } from "../ui.jsx";
import { Logo } from "./Auth.jsx";

const ord = (n) => { if (!n) return ""; const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const go = (nav, to) => (e) => { e.preventDefault(); nav(to); };

function LiveShell({ nav, meet, children }) {
  const color = meet?.branding?.color;
  return (
    <div className="live-shell" style={color ? { "--live-accent": color } : undefined}>
      <header className="live-top">
        <a href="/live" onClick={go(nav, "/live")} aria-label="All live meets"><Logo small /></a>
        <nav><a href="/live" onClick={go(nav, "/live")}>Live scores</a><a className="btn btn-primary sm" href="/register">Get the app</a></nav>
      </header>
      <main className="live-main">{children}</main>
      <footer className="live-foot muted small">Live scores are free on AthleteOrbit — no account needed. <a href="/faq">FAQ</a> · <a href="/privacy.html">Privacy</a></footer>
    </div>
  );
}

// /live — find a meet
export function LiveIndex({ nav }) {
  const [q, setQ] = useState(""); const [meets, setMeets] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { const t = setTimeout(() => api("live/list", null, "GET", { q }).then((r) => setMeets(r.meets)).catch(setErr), 250); return () => clearTimeout(t); }, [q]);
  return (
    <LiveShell nav={nav}>
      <section className="live-hero"><p className="eyebrow">● Live scores</p><h1>Follow every routine, live.</h1><p className="lead">Free for everyone — no account, no subscription. Find your meet:</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Meet name, host gym or city" aria-label="Search meets" /></section>
      <ErrorNote error={err} />
      {!meets ? <Spinner label="Loading meets…" /> : !meets.length ? <Empty icon="🏟️" title="No live meets found" text="Ask your meet organizer to post scores on AthleteOrbit — it's free for them too." /> : (
        <div className="live-list">{meets.map((m) => (
          <a key={m.id} className="card live-meet" href={`/live/${m.id}`} onClick={go(nav, `/live/${m.id}`)}>
            <span className={`live-dot ${m.live_status}`}>{m.live_status === "live" ? "LIVE" : m.live_status === "final" ? "FINAL" : m.now ? "TODAY" : "SOON"}</span>
            <span className="grow"><b>{m.name}</b><small className="muted">{fmt.date(m.start_date)}{m.location ? ` · ${m.location}` : ""}{m.host ? ` · ${m.host}` : ""}</small></span><span aria-hidden>›</span>
          </a>
        ))}</div>
      )}
      <section className="card live-cta"><h3>Running a meet?</h3><p className="muted">Post live scores free from any laptop or phone — type them in or upload your scoring software's results file after each rotation.</p><a className="btn btn-ghost" href="/register?type=gym">Start free</a></section>
    </LiveShell>
  );
}

// /live/:id — one meet, free for everyone
export function LivePage({ id, nav, session }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [q, setQ] = useState(""); const [sess, setSess] = useState(""); const [lvl, setLvl] = useState(""); const [onlyMine, setOnlyMine] = useState(false);
  const [report, setReport] = useState(false); const [card, setCard] = useState(null); const [msg, setMsg] = useState("");
  const load = () => api("live/meet", null, "GET", { id }).then(setD).catch(setErr);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [id, session?.user?.id]);
  if (err && !d) return <LiveShell nav={nav}><div className="card"><ErrorNote error={err} /><a href="/live" onClick={go(nav, "/live")}>Find another meet ›</a></div></LiveShell>;
  if (!d) return <LiveShell nav={nav}><Spinner label="Loading live scores…" /></LiveShell>;
  const m = d.meet, sport = m.sport || "Gymnastics";
  const all = [...d.rows, ...d.parentRows];
  const sessions = [...new Set(all.map((r) => r.session).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const levels = [...new Set(all.map((r) => r.level).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const myNames = new Set((d.myAthletes || []).map((g) => g.name.toLowerCase()));
  const isMine = (r) => d.follows.includes(athleteKey(r)) || r.mine || [...myNames].some((n) => r.name.toLowerCase().startsWith(n));
  const show = (r) => (!sess || r.session === sess) && (!lvl || r.level === lvl) && (!q || `${r.name} ${r.gym}`.toLowerCase().includes(q.toLowerCase())) && (!onlyMine || isMine(r));
  const groups = rankRows(d.rows.filter(show));
  const parent = d.parentRows.filter(show);
  async function follow(r) {
    if (!d.signedIn) return nav(`/register?next=/live/${id}`);
    if (!d.canFollow) { setMsg("Following athletes is included in AthleteOrbit Basic — start your free trial in the app."); return; }
    try { await api("live/follow", { id, name: r.name, gym: r.gym }); load(); } catch (e) { setErr(e); }
  }
  const share = async () => { const url = `${location.origin}/live/${id}`; try { if (navigator.share) await navigator.share({ title: `${m.name} live scores`, url }); else { await navigator.clipboard.writeText(url); setMsg("Link copied — share it with family."); } } catch {} };
  return (
    <LiveShell nav={nav} meet={m}>
      <section className="live-hero meet">
        <div className="row tight"><span className={`live-dot ${m.live_status}`}>{m.live_status === "live" ? "● LIVE" : m.live_status === "final" ? "FINAL" : "SCORES"}</span>{m.pro && m.branding?.tagline && <span className="muted small">{m.branding.tagline}</span>}</div>
        {m.pro && m.branding?.logo_url && <img className="live-logo" src={m.branding.logo_url} alt="" />}
        <h1>{m.name}</h1>
        <p className="muted">{fmt.date(m.start_date)}{m.end_date && m.end_date !== m.start_date ? ` – ${fmt.date(m.end_date)}` : ""}{m.location ? ` · ${m.location}` : ""}{m.host ? ` · hosted by ${m.host}` : ""}</p>
        <div className="row"><Button kind="ghost" onClick={share}>Share</Button>{d.signedIn ? <Button onClick={() => setReport(true)}>＋ Add my athlete's score</Button> : <a className="btn btn-primary" href={`/register?next=/live/${id}`}>Follow my athlete — free trial</a>}{m.tickets && <a className="btn btn-ghost" href={`/tickets/${m.id}`}>🎟️ Tickets</a>}{d.owner && <a className="btn btn-ghost" href="/?page=events">Manage scores</a>}</div>
      </section>
      {m.updates?.[0] && <div className="tix-updates" role="status"><p><b>📣 {m.updates[0].text}</b></p></div>}
      <Sponsors meet={m} />
      {msg && <p className="note">{msg}</p>}
      <div className="live-filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an athlete or gym" aria-label="Find an athlete or gym" />
        {sessions.length > 1 && <div className="chips">{["", ...sessions].map((s) => <button key={s || "all"} className={`chip ${sess === s ? "on" : ""}`} onClick={() => setSess(s)}>{s ? `Session ${s.replace(/^session\s*/i, "")}` : "All sessions"}</button>)}</div>}
        {levels.length > 1 && <div className="chips">{["", ...levels].map((s) => <button key={s || "all"} className={`chip ${lvl === s ? "on" : ""}`} onClick={() => setLvl(s)}>{s || "All levels"}</button>)}</div>}
        {d.signedIn && <label className="check small"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Only my athletes and the ones I follow</label>}
      </div>
      {parent.length > 0 && (
        <section className="card live-parent">
          <h3>Parent-reported <span className="pill">Unofficial</span></h3>
          <p className="muted small">From your family and your team. Replaced automatically when the meet posts official scores.</p>
          {parent.map((r) => <Row key={r.id} r={r} sport={sport} parent onCard={r.mine ? () => setCard({ r, m }) : null} />)}
        </section>
      )}
      {!groups.length ? <Empty icon="⏱️" title={d.rows.length ? "No athletes match" : "Scores will appear here"} text={d.rows.length ? "Try another search or filter." : "This page updates by itself every 20 seconds once the meet starts posting."} /> : groups.map((g) => (
        <section key={g.key} className="card flight">
          <div className="card-head"><h3>{[g.session && `Session ${g.session.replace(/^session\s*/i, "")}`, g.level, g.division, sport === "Gymnastics" && g.gender ? (g.gender === "M" ? "Boys" : "Girls") : null].filter(Boolean).join(" · ") || "Results"}</h3><span className="muted small">{g.rows.length} athletes</span></div>
          {g.rows.map((r) => <Row key={r.id} r={r} sport={sport} following={d.follows.includes(athleteKey(r))} onFollow={() => follow(r)} mine={isMine(r)} onCard={() => setCard({ r, m })} />)}
        </section>
      ))}
      {report && <ReportSheet id={id} meet={m} athletes={d.myAthletes} sessions={m.sessions} onClose={() => setReport(false)} onDone={() => { setReport(false); load(); }} />}
      {card && <ScoreCard row={card.r} meet={card.m} signedIn={d.signedIn} onClose={() => setCard(null)} />}
    </LiveShell>
  );
}

function Row({ r, sport, following, onFollow, mine, parent, onCard }) {
  const evs = eventsFor(sport, r.gender);
  return (
    <div className={`live-row ${mine ? "mine" : ""}`}>
      <span className="live-rank">{parent ? "•" : r.rank ? ord(r.rank) : "–"}</span>
      <span className="grow live-name"><b>{r.name}</b><small className="muted">{r.gym}{parent && r.level ? ` · ${r.level}` : ""}</small>
        <span className="live-events">{evs.map((e) => r.scores?.[e] != null ? <span key={e} className={`ev ${r.eventPlace?.[e] && r.eventPlace[e] <= 3 ? "top" : ""}`}><small>{e}</small>{fmtScore(r.scores[e], sport)}{r.eventPlace?.[e] && r.eventPlace[e] <= 3 ? <i>{ord(r.eventPlace[e])}</i> : null}</span> : <span key={e} className="ev empty"><small>{e}</small>–</span>)}</span></span>
      <span className="live-aa"><small>{sport === "Gymnastics" ? "AA" : "Total"}</small><b>{fmtScore(r.aa ?? totalOf(r.scores), sport)}</b>
        <span className="row tight">{onFollow && <button className={`star ${following ? "on" : ""}`} onClick={onFollow} aria-label={following ? `Stop following ${r.name}` : `Follow ${r.name}`} title={following ? "Following" : "Follow — get an email when scores post"}>{following ? "★" : "☆"}</button>}{onCard && <button className="star" onClick={onCard} aria-label={`Score card for ${r.name}`} title="Share card">⤴</button>}</span></span>
    </div>
  );
}

function Sponsors({ meet, tv = false }) {
  const list = meet.pro ? meet.sponsors || [] : [];
  const [i, setI] = useState(0);
  useEffect(() => { if (list.length < 2) return undefined; const t = setInterval(() => setI((x) => (x + 1) % list.length), tv ? 8000 : 6000); return () => clearInterval(t); }, [list.length]);
  if (!list.length) return meet.pro ? null : <a className="sponsor house" href={`/contact?topic=Sponsorship&meet=${encodeURIComponent(meet.name)}`}><small>Sponsor</small><b>Your business here</b><span>Reach every family at {meet.name} — sponsor this meet ›</span></a>;
  const s = list[i % list.length];
  const inner = <><small>Sponsored by</small><b>{s.name}</b>{s.tagline && <span>{s.tagline}</span>}</>;
  return s.url && !tv ? <a className="sponsor" href={s.url} target="_blank" rel="noopener sponsored" style={s.color ? { borderColor: s.color } : undefined}>{inner}</a> : <div className="sponsor" style={s.color ? { borderColor: s.color } : undefined}>{inner}</div>;
}

// /live/:id/tv — big-screen scoreboard for the gym (Live Scoring Pro)
export function LiveTv({ id }) {
  const [d, setD] = useState(null); const [i, setI] = useState(0); const [err, setErr] = useState(null);
  useEffect(() => { const load = () => api("live/meet", null, "GET", { id }).then(setD).catch(setErr); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [id]);
  const groups = useMemo(() => (d ? rankRows(d.rows) : []), [d]);
  useEffect(() => { const t = setInterval(() => setI((x) => x + 1), 10000); return () => clearInterval(t); }, []);
  if (err) return <div className="tv"><h1>{err.message}</h1></div>;
  if (!d) return <div className="tv"><h1>Loading…</h1></div>;
  const m = d.meet, sport = m.sport || "Gymnastics";
  if (!m.pro) return <div className="tv"><Logo /><h1>The TV scoreboard is part of Live Scoring Pro</h1><p>Scan for live scores on your phone: athleteorbit.org/live/{m.id}</p></div>;
  const g = groups.length ? groups[i % groups.length] : null;
  return (
    <div className="tv" style={m.branding?.color ? { "--live-accent": m.branding.color } : undefined}>
      <header><div>{m.branding?.logo_url ? <img src={m.branding.logo_url} alt="" /> : <Logo />}</div><div className="grow"><h1>{m.name}</h1><p>{g ? [g.session && `Session ${g.session.replace(/^session\s*/i, "")}`, g.level, g.division].filter(Boolean).join(" · ") : "Scores coming up"}</p></div><span className={`live-dot ${m.live_status}`}>{m.live_status === "final" ? "FINAL" : "● LIVE"}</span></header>
      {g && <table><thead><tr><th>#</th><th>Athlete</th>{eventsFor(sport, g.gender).map((e) => <th key={e}>{e}</th>)}<th>{sport === "Gymnastics" ? "AA" : "Total"}</th></tr></thead>
        <tbody>{g.rows.slice(0, 12).map((r) => <tr key={r.id} className={r.rank <= 3 ? "podium" : ""}><td>{r.rank || "–"}</td><td><b>{r.name}</b><small>{r.gym}</small></td>{eventsFor(sport, g.gender).map((e) => <td key={e}>{fmtScore(r.scores?.[e], sport)}</td>)}<td className="aa">{fmtScore(r.aa, sport)}</td></tr>)}</tbody></table>}
      <footer><Sponsors meet={m} tv /><span>Live scores on your phone: <b>athleteorbit.org/live</b></span></footer>
    </div>
  );
}

// Parent adds their athlete's scores (during or after the meet).
function ReportSheet({ id, meet, athletes, sessions = [], onClose, onDone }) {
  const sport = meet.sport || "Gymnastics";
  const [gid, setGid] = useState(athletes[0]?.id || ""); const g = athletes.find((x) => x.id === gid);
  const evs = eventsFor(sport, g?.gender === "M" || g?.program === "MAG" ? "M" : "F");
  const [sc, setSc] = useState({}); const [session, setSession] = useState(""); const [share, setShare] = useState(true); const [save, setSave] = useState(true); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (!athletes.length) return <Sheet title="Add a score" onClose={onClose}><p>Add your athlete in the app first.</p><a className="btn btn-primary" href="/">Open AthleteOrbit</a></Sheet>;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("live/report", { id, gymnastId: gid, session, scores: Object.fromEntries(Object.entries(sc).filter(([, v]) => v !== "")), share, saveToScores: save }); onDone(); } catch (e2) { setErr(e2); setBusy(false); }
  }
  return (
    <Sheet title="Add my athlete's score" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">Shown as “Parent-reported” to your family{share ? " and your team" : ""} until the meet posts official scores. Add events as they happen — you can come back after each one.</p>
        {athletes.length > 1 && <Field label="Athlete"><select value={gid} onChange={(e) => setGid(e.target.value)}>{athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
        {sessions.length > 0 && <Field label="Session"><select value={session} onChange={(e) => setSession(e.target.value)}><option value="">—</option>{sessions.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>}
        <div className="score-grid">{evs.map((ev) => <Field key={ev} label={ev}><input inputMode="decimal" value={sc[ev] ?? ""} onChange={(e) => setSc({ ...sc, [ev]: e.target.value.replace(/[^\d.]/g, "") })} placeholder={sport === "Gymnastics" ? "9.250" : "0"} /></Field>)}</div>
        <label className="check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share with families on our team</label>
        {sport === "Gymnastics" && <label className="check"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Also save to {g?.name || "my athlete"}'s score history</label>}
        <ErrorNote error={err} />
        <Button className="wide" disabled={busy || !Object.values(sc).some((v) => v !== "")}>{busy ? "Saving…" : "Save score"}</Button>
      </form>
    </Sheet>
  );
}

// ---------- Score card: free to share; printed certificate or poster to order ----------
export function drawCard({ row, meet, size = 1080, w = 1080, h = 1350 }) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  const sport = meet.sport || "Gymnastics", accent = meet.branding?.color || "#7C3AED";
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#0F1838"); g.addColorStop(0.6, "#1E2A5A"); g.addColorStop(1, "#3B2380"); x.fillStyle = g; x.fillRect(0, 0, w, h);
  // orbit swoosh + star
  x.strokeStyle = accent; x.lineWidth = 14; x.globalAlpha = 0.55; x.beginPath(); x.ellipse(w * 0.72, h * 0.2, w * 0.42, h * 0.08, -0.35, Math.PI * 0.9, Math.PI * 2.05); x.stroke(); x.globalAlpha = 1;
  star(x, w * 0.88, h * 0.1, 34, "#F4C95D");
  x.fillStyle = "#F4C95D"; x.font = `700 ${w * 0.03}px system-ui, sans-serif`; x.fillText((meet.name || "").toUpperCase().slice(0, 44), w * 0.08, h * 0.12);
  x.fillStyle = "#C9D0E4"; x.font = `500 ${w * 0.026}px system-ui, sans-serif`; x.fillText([fmt.date(meet.start_date), meet.location].filter(Boolean).join(" · "), w * 0.08, h * 0.16);
  x.fillStyle = "#fff"; x.font = `800 ${w * 0.085}px Georgia, serif`; wrap(x, row.name, w * 0.08, h * 0.3, w * 0.84, w * 0.09);
  x.fillStyle = "#C9D0E4"; x.font = `500 ${w * 0.032}px system-ui, sans-serif`; x.fillText([row.gym, row.level, row.division].filter(Boolean).join(" · "), w * 0.08, h * 0.43);
  const aa = row.aa ?? totalOf(row.scores);
  x.fillStyle = accent; roundRect(x, w * 0.08, h * 0.48, w * 0.84, h * 0.2, 36); x.fill();
  x.fillStyle = "#fff"; x.font = `600 ${w * 0.03}px system-ui, sans-serif`; x.fillText(sport === "Gymnastics" ? "ALL-AROUND" : "TOTAL", w * 0.13, h * 0.535);
  x.font = `800 ${w * 0.12}px system-ui, sans-serif`; x.fillText(fmtScore(aa, sport), w * 0.13, h * 0.64);
  if (row.rank) { x.textAlign = "right"; x.font = `800 ${w * 0.09}px Georgia, serif`; x.fillStyle = "#F4C95D"; x.fillText(ord(row.rank), w * 0.87, h * 0.635); x.textAlign = "left"; }
  const evs = eventsFor(sport, row.gender).filter((e) => row.scores?.[e] != null);
  const cw = (w * 0.84) / Math.max(1, Math.min(evs.length, 4));
  evs.forEach((e, i) => { const cx = w * 0.08 + (i % 4) * cw, cy = h * 0.74 + Math.floor(i / 4) * h * 0.1;
    x.fillStyle = "rgba(255,255,255,.08)"; roundRect(x, cx + 6, cy, cw - 12, h * 0.085, 22); x.fill();
    x.fillStyle = "#C9D0E4"; x.font = `600 ${w * 0.024}px system-ui, sans-serif`; x.fillText(e.toUpperCase(), cx + 26, cy + h * 0.032);
    x.fillStyle = "#fff"; x.font = `800 ${w * 0.042}px system-ui, sans-serif`; x.fillText(fmtScore(row.scores[e], sport) + (row.eventPlace?.[e] && row.eventPlace[e] <= 3 ? ` · ${ord(row.eventPlace[e])}` : ""), cx + 26, cy + h * 0.07); });
  x.fillStyle = "#C9D0E4"; x.font = `600 ${w * 0.026}px system-ui, sans-serif`; x.fillText("athleteorbit.org", w * 0.08, h * 0.955);
  if (row.source === "parent") { x.textAlign = "right"; x.fillText("Unofficial · parent-reported", w * 0.92, h * 0.955); x.textAlign = "left"; }
  return c;
}
function star(x, cx, cy, r, color) { x.fillStyle = color; x.beginPath(); for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); }
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function wrap(x, text, a, b, max, lh) { const words = String(text).split(" "); let line = "", y = b; for (const w of words) { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > max && line) { x.fillText(line, a, y); line = w; y += lh; } else line = t; } x.fillText(line, a, y); }

function ScoreCard({ row, meet, signedIn, onClose }) {
  const [url, setUrl] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState("");
  useEffect(() => { try { setUrl(drawCard({ row, meet }).toDataURL("image/png")); } catch (e) { setErr(e); } }, [row.id]);
  async function shareIt() {
    try { const blob = await (await fetch(url)).blob(); const file = new File([blob], `${row.name}-${meet.name}.png`.replace(/[^\w.-]+/g, "-"), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${row.name} · ${meet.name}` }); else { const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); } } catch {}
  }
  async function order(product) {
    setBusy(product); setErr(null);
    try {
      const big = product === "poster16x20" ? drawCard({ row, meet, w: 3200, h: 4000 }) : drawCard({ row, meet, w: 2400, h: 3000 });
      const blob = await new Promise((r) => big.toBlob(r, "image/jpeg", 0.92));
      const { path } = await uploadCard(blob);
      const r = await api("photos/order", { items: [{ product, qty: 1, path, title: `${row.name} · ${meet.name}` }] });
      location.href = r.url;
    } catch (e) { setErr(e); setBusy(""); }
  }
  return (
    <Sheet title="Score card" onClose={onClose}>
      <div className="stack">
        {url ? <img className="card-img" src={url} alt={`Score card for ${row.name}`} /> : <Spinner />}
        <div className="row"><Button onClick={shareIt}>Share or save image</Button></div>
        <p className="muted small">Free to share. Want it on the wall?</p>
        {["cert8x10", "poster16x20"].map((p) => <button key={p} className="card find-cta" disabled={!!busy || !signedIn || DEMO} onClick={() => order(p)}><span className="find-icon" aria-hidden>{p === "cert8x10" ? "🏅" : "🖼️"}</span><span className="grow"><b>{PRINTS[p].name}</b><small>${PRINTS[p].price} + shipping · printed and shipped to your door</small></span>{busy === p ? <Spinner label="" /> : <span aria-hidden>›</span>}</button>)}
        {!signedIn && <p className="muted small">Sign in to order prints.</p>}{DEMO && <p className="muted small">Ordering is off in the demo.</p>}
        <ErrorNote error={err} />
      </div>
    </Sheet>
  );
}

// ---------- Organizer: live scoring for one event (opened from Sell tickets → event) ----------
export function LiveManage({ listing, onClose }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [msg, setMsg] = useState(""); const [tab, setTab] = useState("enter");
  const sport = listing.sport || "Gymnastics";
  const load = async () => { try { if (!listing.live_enabled && !d) { await api("live/manage", { id: listing.id, live_enabled: true }); listing.live_enabled = true; } setD(await api("live/meet", null, "GET", { id: listing.id })); } catch (e) { setErr(e); } };
  useEffect(() => { load(); }, [listing.id]);
  const status = async (s) => { try { await api("live/manage", { id: listing.id, live_status: s }); load(); } catch (e) { setErr(e); } };
  const pub = `${location.origin}/live/${listing.id}`;
  return (
    <Sheet title={`Live scores · ${listing.name}`} onClose={onClose}>
      {!d ? (err ? <ErrorNote error={err} /> : <Spinner />) : <div className="stack">
        <div className="row tight">{["off", "live", "final"].map((s) => <button key={s} className={`chip ${d.meet.live_status === s ? "on" : ""}`} onClick={() => status(s)}>{s === "off" ? "Not started" : s === "live" ? "● Live now" : "Final"}</button>)}</div>
        <div className="row"><a className="btn btn-ghost sm" href={pub} target="_blank" rel="noreferrer">Open public page</a><button className="btn btn-ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(pub); setMsg("Public link copied — share it with families. No account needed to watch."); } catch {} }}>Copy link</button>{d.meet.pro && <a className="btn btn-ghost sm" href={`${pub}/tv`} target="_blank" rel="noreferrer">📺 TV scoreboard</a>}</div>
        {msg && <p className="note note-ok">{msg}</p>}
        <div className="chips">{[["enter", "Type scores"], ["import", "Upload results file"], ["list", `Posted (${d.rows.length})`], ["pro", d.meet.pro ? "Pro: branding & sponsors" : "⭐ Live Scoring Pro"]].map(([k, l]) => <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === "enter" && <EnterScores listing={listing} sport={sport} onSaved={(r) => { setMsg(`Saved — ${r.added} new, ${r.updated} updated${r.notified ? `, ${r.notified} followers emailed` : ""}.`); load(); }} />}
        {tab === "import" && <ImportScores listing={listing} sport={sport} onSaved={(r) => { setMsg(`Posted — ${r.added} new, ${r.updated} updated${r.notified ? `, ${r.notified} followers emailed` : ""}.`); setTab("list"); load(); }} />}
        {tab === "list" && <Posted rows={d.rows} sport={sport} pro={d.meet.pro} name={listing.name} onRemove={async (id) => { await api("live/post", { id: listing.id, remove: id }); load(); }} />}
        {tab === "pro" && <ProPanel listing={listing} meet={d.meet} onChange={load} />}
        <ErrorNote error={err} />
      </div>}
    </Sheet>
  );
}
function EnterScores({ listing, sport, onSaved }) {
  const blank = { session: listing.sessions?.[0] || "", name: "", gym: "", level: "", division: "", gender: "F", scores: {} };
  const [f, setF] = useState(blank); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const nameRef = useRef(null);
  const evs = eventsFor(sport, f.gender);
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api("live/post", { id: listing.id, rows: [{ ...f, scores: Object.fromEntries(Object.entries(f.scores).filter(([, v]) => v !== "")) }] }); onSaved(r); setF({ ...blank, session: f.session, level: f.level, division: f.division, gender: f.gender }); nameRef.current?.focus(); } catch (e2) { setErr(e2); }
    setBusy(false);
  }
  return (
    <form className="form" onSubmit={save}>
      <p className="muted small">Enter one athlete at a time — session, level and division stay filled in for the next one. Entering an athlete again adds or updates their events.</p>
      <div className="grid2"><Field label="Session"><input value={f.session} onChange={(e) => setF({ ...f, session: e.target.value })} list="live-sessions" /></Field><Field label="Level"><input value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} placeholder="Level 5" /></Field></div>
      <datalist id="live-sessions">{(listing.sessions || []).map((s) => <option key={s} value={s} />)}</datalist>
      <div className="grid2"><Field label="Athlete name"><input ref={nameRef} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field><Field label="Gym / team"><input value={f.gym} onChange={(e) => setF({ ...f, gym: e.target.value })} /></Field></div>
      <div className="grid2"><Field label="Division / age"><input value={f.division} onChange={(e) => setF({ ...f, division: e.target.value })} placeholder="Junior A" /></Field>{sport === "Gymnastics" && <Field label="Girls / boys"><select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value, scores: {} })}><option value="F">Girls</option><option value="M">Boys</option></select></Field>}</div>
      <div className="score-grid">{evs.map((ev) => <Field key={ev} label={ev}><input inputMode="decimal" value={f.scores[ev] ?? ""} onChange={(e) => setF({ ...f, scores: { ...f.scores, [ev]: e.target.value.replace(/[^\d.]/g, "") } })} /></Field>)}</div>
      <ErrorNote error={err} />
      <Button className="wide" disabled={busy || f.name.trim().length < 2}>{busy ? "Posting…" : "Post scores"}</Button>
    </form>
  );
}
function ImportScores({ listing, sport, onSaved }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const file = useRef(null);
  const parsed = useMemo(() => (text.trim() ? parseResults(text, { sport }) : null), [text, sport]);
  async function post() { setBusy(true); setErr(null); try { onSaved(await api("live/post", { id: listing.id, rows: parsed.rows })); setText(""); } catch (e) { setErr(e); } setBusy(false); }
  return (
    <div className="form">
      <p className="muted small">Export results from your scoring software as CSV after each rotation (or at the end) and upload it here. Common column names work: Name, Gym/Team, Level, Session, Vault/VT, Bars/UB, Beam/BB, Floor/FX… Upload again any time — athletes are updated, not duplicated.</p>
      <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
      <Button kind="ghost" className="wide" onClick={() => file.current?.click()}>📄 Choose results file (.csv)</Button>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Or paste here:\nSession,Name,Gym,Level,Vault,Bars,Beam,Floor\n1,Maya Patel,Apex Gymnastics,5,9.1,8.85,9.2,9.0"} aria-label="Results" />
      {parsed && (parsed.problems.length ? <p className="note">{parsed.problems.join(" ")}</p> : <div className="card preview"><b>{parsed.rows.length} athletes ready</b>{parsed.rows.slice(0, 4).map((r, i) => <p key={i} className="small">{r.name} · {r.gym} · {r.level} · {fmtScore(r.aa, sport)}</p>)}{parsed.rows.length > 4 && <p className="muted small">…and {parsed.rows.length - 4} more</p>}</div>)}
      <ErrorNote error={err} />
      <Button className="wide" disabled={busy || !parsed?.rows.length} onClick={post}>{busy ? "Posting…" : `Post ${parsed?.rows.length || ""} athletes`}</Button>
    </div>
  );
}
function Posted({ rows, sport, pro, name, onRemove }) {
  const groups = rankRows(rows);
  const exportCsv = () => { const blob = new Blob([toCsv(rows, sport)], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name.replace(/[^\w]+/g, "-")}-results.csv`; a.click(); };
  if (!rows.length) return <p className="muted">Nothing posted yet.</p>;
  return (
    <div className="stack">
      {pro ? <Button kind="ghost" onClick={exportCsv}>⬇ Export results (CSV)</Button> : <p className="muted small">Results export is part of Live Scoring Pro.</p>}
      {groups.map((g) => <div key={g.key}><b className="small">{[g.session, g.level, g.division].filter(Boolean).join(" · ") || "Results"}</b>{g.rows.map((r) => <div key={r.id} className="list-row"><span className="grow">{r.rank ? `${ord(r.rank)} · ` : ""}{r.name} <small className="muted">{r.gym}</small></span><b>{fmtScore(r.aa, sport)}</b><button className="link danger small" onClick={() => window.confirm(`Remove ${r.name}?`) && onRemove(r.id)}>Remove</button></div>)}</div>)}
    </div>
  );
}
function ProPanel({ listing, meet, onChange }) {
  const [b, setB] = useState(meet.branding || {}); const [sp, setSp] = useState(meet.sponsors?.length ? meet.sponsors : [{ name: "", tagline: "", url: "" }]); const [err, setErr] = useState(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  if (!meet.pro) return (
    <div className="card pro-pitch">
      <h3>⭐ Live Scoring Pro — $149 per meet</h3>
      <ul className="perks"><li><b>TV scoreboard</b> for the gym's screens, rotating every flight</li><li><b>Your branding</b>: logo, color and tagline on the live page</li><li><b>Sponsor banners</b> on the live page and TV — sell them to local businesses</li><li><b>Results export</b> (CSV) when the meet ends</li></ul>
      <p className="muted small">Free when you sell your meet's tickets with AthleteOrbit.</p>
      <ErrorNote error={err} />
      <Button className="wide" disabled={busy || DEMO} onClick={async () => { setBusy(true); try { const r = await api("live/pro-checkout", { id: listing.id }); if (r.pro) onChange(); else location.href = r.url; } catch (e) { setErr(e); setBusy(false); } }}>{busy ? "Opening checkout…" : "Upgrade this meet"}</Button>
      {DEMO && <p className="muted small center">Checkout is off in the demo.</p>}
    </div>
  );
  async function save() { setErr(null); try { await api("live/manage", { id: listing.id, branding: b, sponsors: sp.filter((s) => s.name?.trim()) }); setMsg("Saved."); onChange(); } catch (e) { setErr(e); } }
  return (
    <div className="form">
      <h3>Branding</h3>
      <div className="grid2"><Field label="Accent color"><input type="color" value={b.color || "#7C3AED"} onChange={(e) => setB({ ...b, color: e.target.value })} /></Field><Field label="Tagline"><input value={b.tagline || ""} maxLength={80} onChange={(e) => setB({ ...b, tagline: e.target.value })} placeholder="Home of the Flyers" /></Field></div>
      <Field label="Logo image link (https)"><input type="url" value={b.logo_url || ""} onChange={(e) => setB({ ...b, logo_url: e.target.value })} placeholder="https://yourgym.com/logo.png" /></Field>
      <h3>Sponsors</h3>
      {sp.map((s, i) => <div key={i} className="card inner"><div className="grid2"><Field label="Sponsor name"><input value={s.name || ""} onChange={(e) => setSp(sp.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field><Field label="Website (https)"><input type="url" value={s.url || ""} onChange={(e) => setSp(sp.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} /></Field></div><Field label="One line"><input value={s.tagline || ""} maxLength={90} onChange={(e) => setSp(sp.map((x, j) => (j === i ? { ...x, tagline: e.target.value } : x)))} placeholder="Proud sponsor of the Queen City Classic" /></Field></div>)}
      {sp.length < 8 && <button className="link" onClick={() => setSp([...sp, { name: "", tagline: "", url: "" }])}>＋ Add sponsor</button>}
      <p className="muted small">Want us to find sponsors for your meet? <a href={`/contact?topic=Sponsorship&meet=${encodeURIComponent(listing.name)}`}>Contact us</a> — we split sponsor revenue 50/50.</p>
      <ErrorNote error={err} />{msg && <p className="note note-ok">{msg}</p>}
      <Button className="wide" onClick={save}>Save branding & sponsors</Button>
    </div>
  );
}
