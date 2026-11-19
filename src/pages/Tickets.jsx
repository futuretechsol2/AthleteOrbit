// Meet tickets: buy (public page, works without an account), my tickets (QR codes), door check-in, and admin setup.
import { LiveManage } from "./Live.jsx";
import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, DEMO } from "../lib/db.js";
import { Button, Field, Sheet, ErrorNote, Spinner, Empty, fmt } from "../ui.jsx";
import { Logo } from "./Auth.jsx";
import { APP } from "../config.js";
import { SPORT_NAMES, conf } from "../data/sports.js";

const usd = (c) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;
const when = (l) => `${fmt.date(l.start_date)}${l.end_date && l.end_date !== l.start_date ? ` – ${fmt.date(l.end_date)}` : ""}`;
function Shell({ children, nav }) {
  return <div className="tix-shell"><button className="logo-btn" onClick={() => nav("/")} aria-label={`${APP.name} home`}><Logo small /></button>{children}</div>;
}

// /tickets/:id — choose tickets, pay with Stripe, get QR codes by email and on screen.
export function TicketPage({ id, nav, session }) {
  const [l, setL] = useState(null); const [err, setErr] = useState(null);
  const [qty, setQty] = useState({}); const [sess, setSess] = useState(""); const [who, setWho] = useState({ name: "", email: session?.user?.email || "" });
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
  const paidId = new URLSearchParams(location.search).get("paid");
  useEffect(() => { api("tickets/listing", null, "GET", { id }).then((r) => { setL(r.listing); if ((r.listing.sessions || []).length === 1) setSess(r.listing.sessions[0]); }).catch(setErr); }, [id]);
  useEffect(() => {
    if (!paidId) return; let n = 0;
    const poll = async () => { n++; try { const r = await api("tickets/paid", null, "GET", { session_id: paidId }); if (r.link) return setDone(r.link); } catch {} if (n < 15) setTimeout(poll, 2000); else setDone("email"); };
    poll();
  }, [paidId]);
  if (err) return <Shell nav={nav}><div className="card"><ErrorNote error={err} /></div></Shell>;
  if (!l) return <Shell nav={nav}><Spinner label="Loading the meet…" /></Shell>;
  const types = l.ticket_types || [];
  const count = types.reduce((a, t) => a + (qty[t.id] || 0), 0);
  const tickets = types.reduce((a, t) => a + Math.round(t.price * 100) * (qty[t.id] || 0), 0);
  const fee = count * (l.buyer_fee_cents ?? 150);
  const set = (t, d) => setQty({ ...qty, [t.id]: Math.max(0, Math.min(20, (qty[t.id] || 0) + d)) });
  async function buy(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api("tickets/checkout", { listingId: l.id, items: types.map((t) => ({ typeId: t.id, qty: qty[t.id] || 0 })), session: sess || undefined, name: who.name, email: who.email }); location.href = r.url; }
    catch (e2) { setErr(e2); setBusy(false); }
  }
  return (
    <Shell nav={nav}>
      <section className="tix-hero">
        <p className="eyebrow">🎟️ Skip-the-line tickets</p>
        <h1>{l.name}</h1>
        <p>{when(l)}{l.location ? ` · ${l.location}` : ""}{l.host ? ` · hosted by ${l.host}` : ""}</p>
        {!!l.attending_gyms?.length && <p className="small">Gyms competing: {l.attending_gyms.join(" · ")}</p>}
      </section>
      <Updates list={l.updates} />
      {l.live_enabled && l.live_status && l.live_status !== "off" && <a className="card find-cta" href={`/live/${l.id}`}><span className="find-icon" aria-hidden>●</span><span className="grow"><b>{l.live_status === "final" ? "Final results" : "Live scores now"}</b><small>Free — no account needed</small></span><span aria-hidden>›</span></a>}
      {paidId ? (
        <div className="card center stack">
          {!done ? <Spinner label="Confirming your payment…" /> : done === "email" ? <><h2>Payment received 🎉</h2><p>Your tickets are on their way to your email.</p></>
            : <><h2>You're all set 🎉</h2><p>Your tickets are also in your email.</p><a className="btn btn-primary" href={done}>Show my tickets</a></>}
        </div>
      ) : l.status !== "on_sale" ? <div className="card"><p>Tickets for this meet aren't on sale right now.</p></div> : (
        <form className="card form" onSubmit={buy}>
          {(l.sessions || []).length > 1 && <Field label="Session"><select value={sess} onChange={(e) => setSess(e.target.value)} required><option value="">Choose a session…</option>{l.sessions.map((s) => <option key={s}>{s}</option>)}</select></Field>}
          {types.map((t) => (
            <div key={t.id} className="tix-row">
              <div className="grow"><b>{t.name}</b><small className="muted"> · {usd(Math.round(t.price * 100))}</small></div>
              <div className="stepper"><button type="button" onClick={() => set(t, -1)} aria-label={`One fewer ${t.name}`}>−</button><span aria-live="polite">{qty[t.id] || 0}</span><button type="button" onClick={() => set(t, 1)} aria-label={`One more ${t.name}`}>＋</button></div>
            </div>
          ))}
          <div className="grid2">
            <Field label="Your name"><input value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} autoComplete="name" /></Field>
            <Field label="Email for your tickets"><input type="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} autoComplete="email" required /></Field>
          </div>
          {count > 0 && <div className="tix-total"><span>{count} ticket{count > 1 ? "s" : ""} {usd(tickets)} + service fee {usd(fee)}</span><b>{usd(tickets + fee)}</b></div>}
          <ErrorNote error={err} />
          <Button className="wide buy-btn" disabled={busy || !count || DEMO}>{busy ? "Opening secure checkout…" : count ? `Buy ${count} ticket${count > 1 ? "s" : ""} · ${usd(tickets + fee)}` : "Choose tickets"}</Button>
          {DEMO && <p className="muted small center">Checkout is switched off in demo mode.</p>}
          <p className="muted small center">Show the QR code at the door. Payment by Stripe. Refunds follow the meet organizer's policy.</p>
        </form>
      )}
    </Shell>
  );
}

function Updates({ list }) {
  if (!list?.length) return null;
  return <div className="tix-updates" role="status">{list.slice(0, 3).map((u, i) => <p key={i} className={i ? "muted small" : ""}><b>{i ? "" : "📣 "}{u.text}</b> <small>{new Date(u.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></p>)}</div>;
}

function Qr({ text }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { QRCode.toDataURL(text, { width: 360, margin: 1, color: { dark: "#16213E", light: "#FFFFFF" } }).then(setSrc).catch(() => {}); }, [text]);
  return src ? <img src={src} alt={`QR code ${text}`} className="tix-qr" /> : <div className="tix-qr" />;
}

// /my-tickets/:orderId?t=… — what to show at the door.
export function MyTickets({ id, nav }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { api("tickets/order", null, "GET", { o: id, t: new URLSearchParams(location.search).get("t") || "" }).then(setD).catch(setErr); }, [id]);
  if (err) return <Shell nav={nav}><div className="card"><ErrorNote error={err} /></div></Shell>;
  if (!d) return <Shell nav={nav}><Spinner label="Loading your tickets…" /></Shell>;
  return (
    <Shell nav={nav}>
      <section className="tix-hero"><p className="eyebrow">🎟️ Your tickets</p><h1>{d.listing.name}</h1><p>{when(d.listing)}{d.listing.location ? ` · ${d.listing.location}` : ""}</p></section>
      <Updates list={d.listing.updates} />
      <p className="muted small center">Turn your screen brightness up and show one code per person at the door.</p>
      {d.tickets.map((t) => (
        <div key={t.code} className={`card tix-ticket ${t.used_at ? "used" : ""}`}>
          <Qr text={t.code} />
          <div><b>{t.type_name}</b>{t.session_label && <p className="small muted">{t.session_label}</p>}<p className="mono big">{t.code}</p>{t.used_at && <span className="pill">Checked in</span>}</div>
        </div>
      ))}
    </Shell>
  );
}

// /door/:listingId?k=… — for the organizer's volunteers at the entrance. Any phone: scan the QR with the camera,
// type the code, or find the buyer by name. Big green / red result, a buzz and a beep, so lines move fast.
export function DoorPage({ id, nav }) {
  const k = new URLSearchParams(location.search).get("k") || "";
  const [info, setInfo] = useState(null); const [err, setErr] = useState(null); const [code, setCode] = useState(""); const [res, setRes] = useState(null); const [scan, setScan] = useState(false);
  const [q, setQ] = useState(""); const [found, setFound] = useState(null);
  const video = useRef(); const stream = useRef(); const last = useRef({ code: "", at: 0 }); const busy = useRef(false);
  const load = () => api("tickets/door", null, "GET", { l: id, k }).then(setInfo).catch(setErr);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [id]);
  async function check(c) {
    const v = String(c || code).trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!v || busy.current) return;
    if (last.current.code === v && Date.now() - last.current.at < 4000) return; // same QR still in front of the camera
    busy.current = true; last.current = { code: v, at: Date.now() };
    try { const r = await api("tickets/checkin", { l: id, k, code: v }); setRes({ ...r, code: v, at: Date.now() }); feedback(r.ok); setCode(""); load(); if (found) search(q); } catch (e) { setErr(e); }
    busy.current = false;
  }
  async function search(text) {
    setQ(text); if (text.trim().length < 2) return setFound(null);
    try { setFound((await api("tickets/door-search", { l: id, k, q: text })).results); } catch (e) { setErr(e); }
  }
  useEffect(() => {
    if (!scan) return undefined;
    let live = true, timer;
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        video.current.srcObject = stream.current; await video.current.play();
        // Chrome/Android have a built-in QR reader; iPhone Safari doesn't, so we read frames ourselves there.
        const det = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
        const jsQR = det ? null : (await import("jsqr")).default;
        const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const tick = async () => {
          if (!live) return;
          try {
            let value = null; const v = video.current;
            if (det) { const [b] = await det.detect(v); value = b?.rawValue; }
            else if (v.videoWidth) { const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * 640); canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h); value = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data; }
            if (value) await check(value);
          } catch {}
          timer = setTimeout(tick, 220);
        };
        tick();
      } catch (e) { setErr(new Error(e?.name === "NotAllowedError" ? "Allow camera access to scan, or type the code." : "The camera couldn't start. Type the code instead.")); setScan(false); }
    })();
    return () => { live = false; clearTimeout(timer); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, [scan]);
  if (!info) return <Shell nav={nav}>{err ? <div className="card"><ErrorNote error={err} /></div> : <Spinner label="Loading…" />}</Shell>;
  const msg = !res ? null : res.ok ? { cls: "ok", icon: "✓", text: "Valid ticket", sub: `${res.type_name}${res.session_label ? ` · ${res.session_label}` : ""}${res.buyer_name ? ` · ${res.buyer_name}` : ""}` }
    : res.reason === "used" ? { cls: "bad", icon: "!", text: "Already used", sub: `Checked in at ${new Date(res.used_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` }
    : res.reason === "refunded" ? { cls: "bad", icon: "✕", text: "Refunded ticket", sub: "Not valid" } : { cls: "bad", icon: "✕", text: "Not a ticket for this event", sub: "Check the code or find them by name" };
  return (
    <Shell nav={nav}>
      <section className="tix-hero door-hero"><p className="eyebrow">🚪 Door check-in</p><h1>{info.listing.name}</h1>
        <div className="door-count"><b>{info.checkedIn}</b><span>of {info.sold} checked in</span><i style={{ width: `${info.sold ? (info.checkedIn / info.sold) * 100 : 0}%` }} /></div></section>
      {msg && <button key={res.at} className={`door-result big ${msg.cls}`} onClick={() => setRes(null)} aria-live="assertive"><span className="door-icon" aria-hidden>{msg.icon}</span><b>{msg.text}</b><small>{msg.sub}</small><small className="mono">{res.code}</small></button>}
      <div className="card form">
        <Button className={`wide ${scan ? "" : "scan-btn"}`} kind={scan ? "ghost" : undefined} onClick={() => { setErr(null); setScan(!scan); }}>{scan ? "Stop camera" : "📷 Scan tickets with this phone"}</Button>
        {scan && <div className="door-cam"><video ref={video} className="door-video" playsInline muted /><span className="door-frame" aria-hidden /></div>}
        <form className="row" onSubmit={(e) => { e.preventDefault(); check(); }}>
          <input className="mono big grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="Type code" aria-label="Ticket code" />
          <Button disabled={!code.trim()}>Check in</Button>
        </form>
        <input type="search" value={q} onChange={(e) => search(e.target.value)} placeholder="No phone? Find by buyer name or email" aria-label="Find by name" />
        {found && (!found.length ? <p className="muted small">No buyer found.</p> : found.map((o, i) => (
          <div key={i} className="list-row door-found"><span className="grow"><b>{o.name}</b><small className="muted"> · {o.tickets.length} ticket{o.tickets.length === 1 ? "" : "s"}</small></span>
            <span className="row tight">{o.tickets.map((t) => t.used_at ? <span key={t.code} className="pill">✓ {t.type_name}</span> : <button key={t.code} className="chip" onClick={() => check(t.code)}>Check in {t.type_name}</button>)}</span></div>
        )))}
        <ErrorNote error={err} />
      </div>
      <p className="muted small center">Works on any phone — no scanner needed. Keep this page open; the count updates every 20 seconds.</p>
    </Shell>
  );
}
function feedback(ok) {
  try { navigator.vibrate?.(ok ? 80 : [120, 80, 120]); } catch {}
  try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (ok ? 0.12 : 0.35)); } catch {}
}

// In the app: pick a meet with tickets on sale when adding a meet ("Find this meet").
export function FindListing({ onPick, always = false }) {
  const [q, setQ] = useState(""); const [rows, setRows] = useState(null);
  useEffect(() => { const t = setTimeout(() => api("tickets/search", null, "GET", { q }).then((r) => setRows(r.listings)).catch(() => setRows([])), 250); return () => clearTimeout(t); }, [q]);
  if (rows && !rows.length && !q && !always) return null;
  return (
    <div className="find-listing">
      {always && rows && !rows.length && <p className="muted small">{q ? "No meets on sale match that." : "No meets have tickets on sale right now. Check back closer to meet season."}</p>}
      <Field label={always ? "🔎 Find a meet with tickets on sale" : "🎟️ Find this meet (tickets in the app)"}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meet name or city" /></Field>
      {(rows || []).slice(0, 5).map((l) => <button type="button" key={l.id} className="list-row" onClick={() => onPick(l)}><span className="grow"><b>{l.name}</b><small className="muted"> · {when(l)}{l.location ? ` · ${l.location}` : ""}</small></span><span className="pill pill-registered">Tickets</span></button>)}
    </div>
  );
}

// In the app: More > My tickets.
export function MyTicketsList({ empty = false }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api("tickets/mine", null, "GET").then((r) => setRows(r.orders)).catch(() => setRows([])); }, []);
  if (empty && rows && !rows.length) return <section className="card"><h3>🎟️ My tickets</h3><p className="muted small">Tickets you buy with this account's email show up here.</p></section>;
  if (!rows?.length) return null;
  return (
    <section className="card">
      <h3>🎟️ My tickets</h3>
      {rows.map((o) => <a key={o.id} className="list-row" href={o.link}><span className="grow"><b>{o.listing.name}</b><small className="muted"> · {when(o.listing)}</small></span><span aria-hidden>›</span></a>)}
    </section>
  );
}

// Owner dashboard: meet ticket listings.
export function TicketsAdmin() {
  const [rows, setRows] = useState(null); const [edit, setEdit] = useState(null); const [msg, setMsg] = useState(""); const [err, setErr] = useState(null); const [live, setLive] = useState(null);
  const load = () => api("admin/listings", null, "GET").then((r) => setRows(r.listings)).catch(setErr);
  useEffect(() => { load(); }, []);
  const act = async (path, id, done) => { setErr(null); try { const r = await api(path, { id }); done(r); } catch (e) { setErr(e); } };
  const copy = async (t, what) => { try { await navigator.clipboard.writeText(t); setMsg(`${what} copied`); setTimeout(() => setMsg(""), 2000); } catch {} };
  return (
    <section className="card">
      <div className="card-head"><h3>🎟️ Meet tickets</h3><button className="link" onClick={() => setEdit({})}>＋ New meet</button></div>
      <p className="muted small">Agree prices and the service fee with each organizer, add the meet here, connect their Stripe for automatic payouts, then put it on sale. Families with this meet on their calendar, and families of the gyms you list, get the link by email.</p>
      {msg && <p className="note note-ok">{msg}</p>}
      <ErrorNote error={err} />
      {!rows ? <Spinner /> : !rows.length ? <p className="muted">No meets yet.</p> : rows.map((l) => (
        <div key={l.id} className="listing">
          <div className="row"><b className="grow">{l.name}</b><span className={`pill ${l.status === "on_sale" ? "pill-registered" : ""}`}>{l.status.replace("_", " ")}</span></div>
          <p className="small muted">{when(l)} · sold {l.sold} · checked in {l.checkedIn} · tickets {usd(l.gross_cents)} · ours {usd(l.our_cents)}{l.owed_cents ? ` · owed to organizer ${usd(l.owed_cents)}` : ""}{l.stripe_account ? " · payouts automatic" : ""}</p>
          <div className="row tight">
            <button className="chip" onClick={() => setEdit(l)}>Edit</button>
            <button className="chip" onClick={() => copy(l.public_url, "Buy link")}>Copy buy link</button>
            <button className="chip" onClick={() => copy(l.door_url, "Door link")}>Copy door link</button>
            <button className="chip" onClick={() => setLive(l)}>● Live scores</button>
            {!l.stripe_account && <button className="chip" onClick={() => act("admin/listing-connect", l.id, (r) => copy(r.url, "Organizer payout sign-up link"))}>Organizer payout link</button>}
            {l.status === "on_sale" && <button className="chip" onClick={() => act("admin/listing-notify", l.id, (r) => setMsg(`Emailed ${r.notified} famil${r.notified === 1 ? "y" : "ies"}`))}>Notify families</button>}
          </div>
        </div>
      ))}
      {edit && <ListingForm row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {live && <LiveManage listing={live} onClose={() => { setLive(null); load(); }} />}
    </section>
  );
}

// Saved as attending_gyms (names, gyms on AthleteOrbit first) + club_codes (their codes, same order).
function initGyms(row) {
  const names = row.attending_gyms || [], codes = row.club_codes || [];
  if (!names.length) return codes.map((c) => ({ name: c, code: c })); // events saved before gym names existed
  return names.map((n, i) => ({ name: n, code: codes[i] || null }));
}
const sortGyms = (gs) => [...gs.filter((g) => g.code), ...gs.filter((g) => !g.code)];
// "Which gyms are coming?" Type a gym name or gym code: gyms on AthleteOrbit are matched (their families get the link
// by email); any other gym name is kept on the event page as typed.
function GymPicker({ value, onChange, near = "" }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState([]); const [web, setWeb] = useState(null);
  useEffect(() => { setWeb(null); if (q.trim().length < 2) return setHits([]); const t = setTimeout(() => api("gyms/search", null, "GET", { q: q.trim() }).then((r) => setHits(r.gyms || [])).catch(() => setHits([])), 250); return () => clearTimeout(t); }, [q]);
  const add = (g) => { if (!value.some((x) => x.name.toLowerCase() === g.name.toLowerCase())) onChange([...value, { name: g.name, code: g.code || null }]); setQ(""); setHits([]); setWeb(null); };
  const searchWeb = () => { setWeb("busy"); api("gyms/search", null, "GET", { q: q.trim(), web: 1, near }).then((r) => setWeb(r.unavailable ? "off" : r.online || [])).catch(() => setWeb([])); };
  const typed = q.trim();
  return (
    <div className="field gym-picker">
      <span className="field-label">Gyms attending</span>
      <small className="muted">Search by gym name or gym code. Gyms on AthleteOrbit get the link emailed to their families.</small>
      {!!value.length && <div className="chips">{value.map((g) => <span key={g.name} className="chip on">{g.code ? "✓ " : ""}{g.name}<button type="button" className="chip-x" aria-label={`Remove ${g.name}`} onClick={() => onChange(value.filter((x) => x !== g))}>×</button></span>)}</div>}
      <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (hits[0]) add(hits[0]); else if (typed.length > 1) add({ name: typed, code: null }); } }} placeholder="e.g. Queen City Flyers" aria-label="Search gyms" />
      {typed.length > 1 && <div className="gym-hits">
        {hits.map((g) => <button type="button" key={g.code} className="list-row" onClick={() => add(g)}><span className="grow"><b>{g.name}</b><small className="muted"> · {g.code}</small></span><span className="pill pill-registered">On AthleteOrbit</span></button>)}
        {Array.isArray(web) && web.map((g) => <button type="button" key={g.name + g.city} className="list-row" onClick={() => add(g)}><span className="grow"><b>{g.name}</b><small className="muted">{g.city ? ` · ${g.city}` : ""}</small></span><span className="pill">Found online</span></button>)}
        {Array.isArray(web) && !web.length && <p className="muted small" style={{ padding: "6px 12px" }}>Nothing found online for “{typed}”.</p>}
        {web === "off" && <p className="muted small" style={{ padding: "6px 12px" }}>Online search isn't available right now.</p>}
        {!hits.some((g) => g.name.toLowerCase() === typed.toLowerCase()) && <>
          {web === null && typed.length > 2 && <button type="button" className="list-row" onClick={searchWeb}><span className="grow">🔎 Search online for “{typed}”</span><small className="muted">finds the gym's official name</small></button>}
          {web === "busy" && <div className="list-row"><Spinner label="Searching online…" /></div>}
          <button type="button" className="list-row" onClick={() => add({ name: typed, code: null })}><span className="grow">＋ Add “{typed}” as typed</span></button>
        </>}
      </div>}
    </div>
  );
}

function ListingForm({ row, onClose, onSaved, organizer = false }) {
  const [f, setF] = useState({ name: row.name || "", host: row.host || "", location: row.location || "", start_date: row.start_date || "", end_date: row.end_date || "",
    sessions: (row.sessions || []).join("\n"), types: (row.ticket_types?.length ? row.ticket_types : [{ id: "adult", name: "Adult day pass", price: 15 }, { id: "child", name: "Child (6-12)", price: 8 }]),
    fee: ((row.buyer_fee_cents ?? 150) / 100).toFixed(2), pct: row.platform_pct || 0, organizer_name: row.organizer_name || "", organizer_email: row.organizer_email || "", gyms: initGyms(row), status: row.status || "draft",
    sport: row.sport || "Gymnastics", tickets: row.id ? (row.ticket_types || []).length > 0 : true });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setType = (i, k, v) => setF({ ...f, types: f.types.map((t, j) => (j === i ? { ...t, [k]: v } : t)) });
  async function save(e) {
    e.preventDefault(); setErr(null);
    try {
      await api(organizer ? "tickets/organizer" : "admin/listings", { id: row.id, name: f.name, host: f.host, location: f.location, start_date: f.start_date, end_date: f.end_date || null, sessions: f.sessions.split("\n"),
        sport: f.sport, ticket_types: f.tickets ? f.types.filter((t) => t.name).map((t) => ({ ...t, price: Number(t.price) })) : [], buyer_fee_cents: Math.round(Number(f.fee) * 100), platform_pct: Number(f.pct),
        organizer_name: f.organizer_name, organizer_email: f.organizer_email, club_codes: sortGyms(f.gyms).filter((g) => g.code).map((g) => g.code), attending_gyms: sortGyms(f.gyms).map((g) => g.name), status: f.tickets ? f.status : "draft" });
      onSaved(f);
    } catch (e2) { setErr(e2); }
  }
  return (
    <Sheet title={row.id ? "Edit event" : organizer ? "Sell tickets for an event" : "New meet tickets"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid2"><Field label="Sport"><select value={f.sport} onChange={set("sport")}>{SPORT_NAMES.filter((x) => !conf(x).everyday).map((x) => <option key={x} value={x}>{conf(x).icon} {x}</option>)}</select></Field>
          <Field label="Event name"><input value={f.name} onChange={set("name")} required placeholder={f.sport === "Gymnastics" ? "Queen City Classic 2027" : f.sport === "Swimming" ? "Turkey Trot Invitational" : "Carolina Fall Cup"} /></Field></div>
        <div className="grid2"><Field label="Host gym / club"><input value={f.host} onChange={set("host")} /></Field><Field label="City, State"><input value={f.location} onChange={set("location")} /></Field></div>
        <div className="grid2"><Field label="Start date"><input type="date" value={f.start_date} onChange={set("start_date")} required /></Field><Field label="End date"><input type="date" value={f.end_date} onChange={set("end_date")} /></Field></div>
        <Field label="Sessions (one per line, optional)"><textarea rows={3} value={f.sessions} onChange={set("sessions")} placeholder={"Session 1 · Sat 8:00 AM\nSession 2 · Sat 1:00 PM"} /></Field>
        <label className="check"><input type="checkbox" checked={f.tickets} onChange={(e) => setF({ ...f, tickets: e.target.checked })} /> Sell tickets for this event <small className="muted">(untick for live scores only)</small></label>
        {f.tickets && <>
        <h3>Ticket types</h3>
        {f.types.map((t, i) => <div key={i} className="grid2"><input value={t.name} onChange={(e) => setType(i, "name", e.target.value)} placeholder="Adult day pass" aria-label="Ticket name" /><input inputMode="decimal" value={t.price} onChange={(e) => setType(i, "price", e.target.value)} placeholder="15" aria-label="Price in dollars" /></div>)}
        <button type="button" className="link" onClick={() => setF({ ...f, types: [...f.types, { id: `t${Date.now() % 100000}`, name: "", price: "" }] })}>＋ Add a ticket type</button>
        {organizer ? <p className="note">You keep 100% of the ticket price. Buyers pay a {usd(150)} service fee per ticket. Stripe sends your money to your bank automatically.</p> : <>
        <div className="grid2"><Field label="Service fee per ticket ($)" hint="Paid by the buyer, kept by AthleteOrbit"><input inputMode="decimal" value={f.fee} onChange={set("fee")} /></Field><Field label="Our % of ticket price" hint="0 if the organizer keeps 100%"><input inputMode="decimal" value={f.pct} onChange={set("pct")} /></Field></div>
        <div className="grid2"><Field label="Organizer name"><input value={f.organizer_name} onChange={set("organizer_name")} /></Field><Field label="Organizer email"><input type="email" value={f.organizer_email} onChange={set("organizer_email")} /></Field></div></>}
        </>}
        <GymPicker value={f.gyms} near={f.location} onChange={(gyms) => setF({ ...f, gyms })} />
        {f.tickets && <Field label="Status" hint={organizer ? "Put tickets on sale after you connect your bank (Get paid)." : undefined}><select value={f.status} onChange={set("status")}><option value="draft">Draft (hidden)</option><option value="on_sale">On sale</option><option value="closed">Closed</option></select></Field>}
        <ErrorNote error={err} />
        <Button className="wide">Save</Button>
      </form>
    </Sheet>
  );
}

// For meet organizers and host gyms: run your own ticketed events.
export function Events() {
  const [rows, setRows] = useState(null); const [edit, setEdit] = useState(null); const [msg, setMsg] = useState(""); const [err, setErr] = useState(null);
  const [people, setPeople] = useState(null); const [post, setPost] = useState(null); const [live, setLive] = useState(null); const [share, setShare] = useState(null);
  const load = () => api("tickets/organizer", null, "GET").then((r) => setRows(r.listings)).catch(setErr);
  useEffect(() => { load(); }, []);
  const copy = async (t, what) => { try { await navigator.clipboard.writeText(t); setMsg(`${what} copied`); setTimeout(() => setMsg(""), 2500); } catch {} };
  async function getPaid(l) { setErr(null); try { const r = await api("tickets/organizer-connect", { id: l.id }); if (r.ready) { setMsg("Payouts are connected."); load(); } else location.href = r.url; } catch (e) { setErr(e); } }
  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">🎟️ For meets, games and tournaments</p>
        <h1>Tickets, door scanning and live scores — one place.</h1>
        <p className="hero-sub">Families buy QR tickets in a minute and volunteers scan them with their own phones. Post live scores everyone can watch free. You keep 100% of the ticket price.</p>
      </section>
      <div className="how-row">
        {[["1", "Create the event", "Any sport — tickets optional"], ["2", "Get paid", "Connect your bank once with Stripe"], ["3", "Share the link", "Families of attending gyms get it by email"], ["4", "Scan at the door", "Open the door link on any phone"]].map(([n, t, d]) => <div key={n} className="how-step"><span>{n}</span><b>{t}</b><small>{d}</small></div>)}
      </div>
      <Button className="wide" onClick={() => setEdit({})}>＋ New event</Button>
      {msg && <p className="note note-ok">{msg}</p>}
      <ErrorNote error={err} />
      {!rows ? <Spinner /> : !rows.length ? <Empty icon="🎟️" title="No events yet" text="Create your first event — it stays hidden until you put tickets on sale." /> : rows.map((l) => (
        <article key={l.id} className="card listing">
          <div className="card-head"><h3>{l.name}</h3><span className={`pill ${l.status === "on_sale" ? "pill-me" : ""}`}>{l.status === "on_sale" ? "On sale" : l.status === "closed" ? "Closed" : "Draft"}</span></div>
          <p className="muted small">{when(l)}{l.location ? ` · ${l.location}` : ""}</p>
          <div className="stats three">
            <div className="stat"><span className="stat-value">{l.sold}</span><span className="stat-label">Tickets sold</span></div>
            <div className="stat"><span className="stat-value">{l.checkedIn}</span><span className="stat-label">Checked in</span></div>
            <div className="stat"><span className="stat-value">{usd(l.gross_cents)}</span><span className="stat-label">Ticket sales</span></div>
          </div>
          {!l.payouts && <button className="card find-cta" onClick={() => getPaid(l)}><span className="find-icon" aria-hidden>🏦</span><span className="grow"><b>Get paid: connect your bank</b><small>About 5 minutes with Stripe. Needed before tickets go on sale.</small></span><span aria-hidden>›</span></button>}
          <div className="row tight">
            <button className="chip chip-primary" onClick={() => setShare(l)}>📲 Share with families</button>
            <button className="chip" onClick={() => setEdit(l)}>Edit</button>
            <button className="chip" onClick={() => copy(l.public_url, "Buy link")}>Copy buy link</button>
            <a className="chip" href={l.door_url} target="_blank" rel="noreferrer">📷 Open door scanner</a>
            <button className="chip" onClick={() => copy(l.door_url, "Door scanner link for volunteers")}>Copy door link</button>
            <button className="chip live-chip" onClick={() => setLive(l)}>● Live scores</button>
            <button className="chip" onClick={() => copy(l.score_url, "Scorer link (no account needed) ")}>✍️ Copy scorer link</button>
            {l.music_url && (l.sport || "Gymnastics") === "Gymnastics" && <a className="chip" href={l.music_url} target="_blank" rel="noreferrer">🎵 Floor music table</a>}
            {l.music_url && (l.sport || "Gymnastics") === "Gymnastics" && <button className="chip" onClick={() => copy(l.music_url, "Music table link (no account needed) ")}>Copy music link</button>}
            <button className="chip" onClick={() => setPeople(l)}>Who's coming</button>
            {l.status === "on_sale" && <button className="chip" onClick={() => setPost(l)}>📣 Live update</button>}
          </div>
          {!!l.attending_gyms?.length && <p className="muted small">Gyms attending: {l.attending_gyms.join(", ")}</p>}
          {l.updates?.[0] && <p className="muted small">Last update: “{l.updates[0].text}”</p>}
        </article>
      ))}
      {edit && <ListingForm organizer row={edit} onClose={() => setEdit(null)} onSaved={(f) => { setEdit(null); load(); setMsg(f && !f.tickets ? "Saved. Tap ● Live scores on the event to post scores and share the free live link." : "Saved."); }} />}
      {live && <LiveManage listing={live} onClose={() => { setLive(null); load(); }} />}
      {share && <ShareSheet listing={share} onClose={() => setShare(null)} />}
      {people && <Attendees listing={people} onClose={() => setPeople(null)} />}
      {post && <LiveUpdate listing={post} onClose={() => setPost(null)} onDone={(r) => { setPost(null); setMsg(`Update posted${r.emailed ? ` and emailed to ${r.emailed} buyer${r.emailed === 1 ? "" : "s"}` : ""}.`); load(); }} />}
    </div>
  );
}
// One place to get an event in front of every family: QR code (print it, put it on a slide), link, phone share sheet,
// and one-tap sends to the gym's own families (app + email) and to the families of every attending gym.
function ShareSheet({ listing: l, onClose }) {
  const selling = l.status === "on_sale" && (l.ticket_types || []).length > 0;
  const url = selling ? l.public_url : l.live_url || l.share_url;
  const [qr, setQr] = useState(null); const [msg, setMsg] = useState(""); const [err, setErr] = useState(null); const [busy, setBusy] = useState("");
  useEffect(() => { QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: "#16213E", light: "#FFFFFF" } }).then(setQr).catch(() => {}); }, [url]);
  useEffect(() => { if (!selling && !l.live_enabled) api("live/manage", { id: l.id, live_enabled: true }).then(() => { l.live_enabled = true; }).catch(() => {}); }, [l.id]);
  const text = selling ? `Tickets for ${l.name} (${when(l)}) are on sale — buy here and show the QR code at the door, no line:` : `Follow live scores for ${l.name} (${when(l)}) — free, no account needed:`;
  const run = async (key, fn) => { setBusy(key); setErr(null); setMsg(""); try { setMsg(await fn()); } catch (e) { setErr(e); } setBusy(""); };
  return (
    <Sheet title={`Share · ${l.name}`} onClose={onClose}>
      <div className="stack center">
        <p className="muted small">{selling ? "This QR opens the ticket page. Families buy, then get their own QR tickets by email." : "Tickets aren't on sale, so this QR opens the free live-scores page."}</p>
        {qr ? <img src={qr} alt={`QR code for ${url}`} className="event-qr" /> : <div className="event-qr" />}
        <p className="mono small">{url.replace(/^https?:\/\//, "")}</p>
        <div className="row tight center">
          <button className="btn btn-primary sm" onClick={() => run("copy", async () => { await navigator.clipboard.writeText(`${text} ${url}`); return "Message and link copied — paste it in your team group chat, email or newsletter."; })}>Copy link + message</button>
          {typeof navigator !== "undefined" && navigator.share && <button className="btn btn-ghost sm" onClick={() => navigator.share({ title: l.name, text, url }).catch(() => {})}>Share…</button>}
          {qr && <a className="btn btn-ghost sm" href={qr} download={`${l.name.replace(/[^\w]+/g, "-")}-QR.png`}>Download QR</a>}
        </div>
        <hr />
        <h3>Send to every family at once</h3>
        <button className="list-row" disabled={!!busy || DEMO} onClick={() => run("gym", async () => { const r = await api("club/announce", { title: selling ? `Tickets on sale: ${l.name}` : `Live scores: ${l.name}`, body: `${text}\n${url}` }); return `Posted to your gym's families in the app${r.emailed ? ` and emailed ${r.emailed}` : ""}.`; })}>
          <span className="grow"><b>📣 My gym's families</b><small className="muted"> · app announcement + email</small></span><span>{busy === "gym" ? "…" : "›"}</span></button>
        <button className="list-row" disabled={!!busy || !selling || DEMO} onClick={() => run("att", async () => { const r = await api("tickets/organizer-notify", { id: l.id }); return r.notified ? `Emailed ${r.notified} famil${r.notified === 1 ? "y" : "ies"}. Families already emailed aren't emailed twice.` : "Everyone we can reach already has the link (families are emailed once)."; })}>
          <span className="grow"><b>✉️ Families of attending gyms</b><small className="muted"> · {selling ? (l.attending_gyms?.length ? l.attending_gyms.slice(0, 3).join(", ") + (l.attending_gyms.length > 3 ? "…" : "") : "plus families who have this meet on their calendar") : "after tickets go on sale"}</small></span><span>{busy === "att" ? "…" : "›"}</span></button>
        {DEMO && <p className="muted small">Sending is switched off in demo mode.</p>}
        {msg && <p className="note note-ok">{msg}</p>}
        <ErrorNote error={err} />
      </div>
    </Sheet>
  );
}

// Parents: buy tickets for any meet on sale and keep every ticket in one place. (Selling is for gym / organizer accounts.)
export function BuyTickets() {
  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">🎟️ Tickets</p>
        <h1>Buy & view meet tickets</h1>
        <p className="hero-sub">Skip the ticket-table line: buy here, get QR tickets by email, show them at the door. Grandparents can buy from the same link — no account needed.</p>
      </section>
      <MyTicketsList empty />
      <section className="card"><FindListing always onPick={(l) => { location.href = `/tickets/${l.id}`; }} /></section>
      <p className="muted small center">Run a meet or own a gym? Selling tickets is for gym & organizer accounts — <a href="/register?type=gym">create one free</a> with your gym's email.</p>
    </div>
  );
}

function Attendees({ listing, onClose }) {
  const [rows, setRows] = useState(null); const [q, setQ] = useState(""); const [err, setErr] = useState(null);
  useEffect(() => { api("tickets/attendees", null, "GET", { id: listing.id }).then((r) => setRows(r.attendees)).catch(setErr); }, [listing.id]);
  const shown = (rows || []).filter((a) => !q || `${a.name} ${a.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet title={`Who's coming · ${listing.name}`} onClose={onClose}>
      <ErrorNote error={err} />
      {!rows ? <Spinner /> : !rows.length ? <p className="muted">No tickets sold yet.</p> : <>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search buyers" aria-label="Search buyers" />
        {shown.map((a, i) => <div key={i} className="list-row"><span className="grow"><b>{a.name}</b><small className="muted"> · {a.email}</small><p className="small muted">{a.tickets} × {a.types}{a.session ? ` · ${a.session}` : ""}</p></span><span className={`pill ${a.checkedIn === a.tickets ? "pill-me" : ""}`}>{a.checkedIn}/{a.tickets} in</span></div>)}
      </>}
    </Sheet>
  );
}
function LiveUpdate({ listing, onClose, onDone }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const ideas = ["Session 2 is running about 30 minutes late.", "Doors open at 7:30 AM. Use the side entrance for ticket holders.", "Parking lot A is full — use the overflow lot across the street.", "Awards for Session 1 start at 12:15 PM."];
  return (
    <Sheet title="Live update to ticket holders" onClose={onClose}>
      <form className="form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { onDone(await api("tickets/update", { id: listing.id, text })); } catch (e2) { setErr(e2); setBusy(false); } }}>
        <p className="muted">Shown at the top of every ticket and emailed to everyone who bought.</p>
        <textarea rows={3} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} placeholder="Session 2 is running 30 minutes late." aria-label="Update" required />
        <div className="starters">{ideas.map((x) => <button type="button" key={x} className="starter" onClick={() => setText(x)}>{x}</button>)}</div>
        <ErrorNote error={err} />
        <Button className="wide" disabled={busy || text.trim().length < 3}>{busy ? "Sending…" : "Send update"}</Button>
      </form>
    </Sheet>
  );
}
