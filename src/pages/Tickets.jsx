// Meet tickets: buy (public page, works without an account), my tickets (QR codes), door check-in, and admin setup.
import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, DEMO } from "../lib/db.js";
import { Button, Field, Sheet, ErrorNote, Spinner, Empty, fmt } from "../ui.jsx";
import { Logo } from "./Auth.jsx";
import { APP } from "../config.js";

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
      </section>
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

// /door/:listingId?k=… — for the organizer's volunteers at the entrance. Type or scan a code.
export function DoorPage({ id, nav }) {
  const k = new URLSearchParams(location.search).get("k") || "";
  const [info, setInfo] = useState(null); const [err, setErr] = useState(null); const [code, setCode] = useState(""); const [res, setRes] = useState(null); const [scan, setScan] = useState(false);
  const video = useRef(); const stream = useRef();
  const load = () => api("tickets/door", null, "GET", { l: id, k }).then(setInfo).catch(setErr);
  useEffect(() => { load(); }, [id]);
  async function check(c) {
    const v = String(c || code).trim(); if (!v) return;
    try { const r = await api("tickets/checkin", { l: id, k, code: v }); setRes({ ...r, code: v.toUpperCase() }); setCode(""); load(); } catch (e) { setErr(e); }
  }
  useEffect(() => {
    if (!scan) return undefined;
    let live = true, timer;
    (async () => {
      try {
        if (!("BarcodeDetector" in window)) throw new Error("This browser can't scan. Type the code instead.");
        const det = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.current.srcObject = stream.current; await video.current.play();
        const tick = async () => { if (!live) return; try { const [b] = await det.detect(video.current); if (b?.rawValue) { await check(b.rawValue); timer = setTimeout(tick, 1500); return; } } catch {} timer = setTimeout(tick, 300); };
        tick();
      } catch (e) { setErr(e); setScan(false); }
    })();
    return () => { live = false; clearTimeout(timer); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, [scan]);
  if (!info) return <Shell nav={nav}>{err ? <div className="card"><ErrorNote error={err} /></div> : <Spinner label="Loading…" />}</Shell>;
  const msg = !res ? null : res.ok ? { cls: "ok", text: `✓ Valid — ${res.type_name}${res.session_label ? ` · ${res.session_label}` : ""}` } : res.reason === "used" ? { cls: "bad", text: `Already used at ${new Date(res.used_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` } : res.reason === "refunded" ? { cls: "bad", text: "Refunded ticket" } : { cls: "bad", text: "Code not found for this meet" };
  return (
    <Shell nav={nav}>
      <section className="tix-hero"><p className="eyebrow">🚪 Door check-in</p><h1>{info.listing.name}</h1><p><b>{info.checkedIn}</b> of {info.sold} tickets checked in</p></section>
      {msg && <div className={`door-result ${msg.cls}`}><b>{msg.text}</b><small className="mono">{res.code}</small></div>}
      <form className="card form" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <Field label="Ticket code"><input className="mono big" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" inputMode="text" placeholder="ABCD2345" /></Field>
        <Button className="wide">Check in</Button>
        <Button type="button" kind="ghost" className="wide" onClick={() => setScan(!scan)}>{scan ? "Stop camera" : "📷 Scan QR codes"}</Button>
        {scan && <video ref={video} className="door-video" playsInline muted />}
        <ErrorNote error={err} />
      </form>
    </Shell>
  );
}

// In the app: pick a meet with tickets on sale when adding a meet ("Find this meet").
export function FindListing({ onPick }) {
  const [q, setQ] = useState(""); const [rows, setRows] = useState(null);
  useEffect(() => { const t = setTimeout(() => api("tickets/search", null, "GET", { q }).then((r) => setRows(r.listings)).catch(() => setRows([])), 250); return () => clearTimeout(t); }, [q]);
  if (rows && !rows.length && !q) return null;
  return (
    <div className="find-listing">
      <Field label="🎟️ Find this meet (tickets in the app)"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meet name or city" /></Field>
      {(rows || []).slice(0, 5).map((l) => <button type="button" key={l.id} className="list-row" onClick={() => onPick(l)}><span className="grow"><b>{l.name}</b><small className="muted"> · {when(l)}{l.location ? ` · ${l.location}` : ""}</small></span><span className="pill pill-registered">Tickets</span></button>)}
    </div>
  );
}

// In the app: More > My tickets.
export function MyTicketsList() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api("tickets/mine", null, "GET").then((r) => setRows(r.orders)).catch(() => setRows([])); }, []);
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
  const [rows, setRows] = useState(null); const [edit, setEdit] = useState(null); const [msg, setMsg] = useState(""); const [err, setErr] = useState(null);
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
            {!l.stripe_account && <button className="chip" onClick={() => act("admin/listing-connect", l.id, (r) => copy(r.url, "Organizer payout sign-up link"))}>Organizer payout link</button>}
            {l.status === "on_sale" && <button className="chip" onClick={() => act("admin/listing-notify", l.id, (r) => setMsg(`Emailed ${r.notified} famil${r.notified === 1 ? "y" : "ies"}`))}>Notify families</button>}
          </div>
        </div>
      ))}
      {edit && <ListingForm row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </section>
  );
}

function ListingForm({ row, onClose, onSaved }) {
  const [f, setF] = useState({ name: row.name || "", host: row.host || "", location: row.location || "", start_date: row.start_date || "", end_date: row.end_date || "",
    sessions: (row.sessions || []).join("\n"), types: (row.ticket_types?.length ? row.ticket_types : [{ id: "adult", name: "Adult day pass", price: 15 }, { id: "child", name: "Child (6-12)", price: 8 }]),
    fee: ((row.buyer_fee_cents ?? 150) / 100).toFixed(2), pct: row.platform_pct || 0, organizer_name: row.organizer_name || "", organizer_email: row.organizer_email || "", clubs: (row.club_codes || []).join(", "), status: row.status || "draft" });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setType = (i, k, v) => setF({ ...f, types: f.types.map((t, j) => (j === i ? { ...t, [k]: v } : t)) });
  async function save(e) {
    e.preventDefault(); setErr(null);
    try {
      await api("admin/listings", { id: row.id, name: f.name, host: f.host, location: f.location, start_date: f.start_date, end_date: f.end_date || null, sessions: f.sessions.split("\n"),
        ticket_types: f.types.filter((t) => t.name).map((t) => ({ ...t, price: Number(t.price) })), buyer_fee_cents: Math.round(Number(f.fee) * 100), platform_pct: Number(f.pct),
        organizer_name: f.organizer_name, organizer_email: f.organizer_email, club_codes: f.clubs.split(",").map((s) => s.trim()).filter(Boolean), status: f.status });
      onSaved();
    } catch (e2) { setErr(e2); }
  }
  return (
    <Sheet title={row.id ? "Edit meet tickets" : "New meet tickets"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <Field label="Meet name"><input value={f.name} onChange={set("name")} required /></Field>
        <div className="grid2"><Field label="Host gym"><input value={f.host} onChange={set("host")} /></Field><Field label="City, State"><input value={f.location} onChange={set("location")} /></Field></div>
        <div className="grid2"><Field label="Start date"><input type="date" value={f.start_date} onChange={set("start_date")} required /></Field><Field label="End date"><input type="date" value={f.end_date} onChange={set("end_date")} /></Field></div>
        <Field label="Sessions (one per line, optional)"><textarea rows={3} value={f.sessions} onChange={set("sessions")} placeholder={"Session 1 · Sat 8:00 AM\nSession 2 · Sat 1:00 PM"} /></Field>
        <h3>Ticket types</h3>
        {f.types.map((t, i) => <div key={i} className="grid2"><input value={t.name} onChange={(e) => setType(i, "name", e.target.value)} placeholder="Adult day pass" aria-label="Ticket name" /><input inputMode="decimal" value={t.price} onChange={(e) => setType(i, "price", e.target.value)} placeholder="15" aria-label="Price in dollars" /></div>)}
        <button type="button" className="link" onClick={() => setF({ ...f, types: [...f.types, { id: `t${Date.now() % 100000}`, name: "", price: "" }] })}>＋ Add a ticket type</button>
        <div className="grid2"><Field label="Service fee per ticket ($)" hint="Paid by the buyer, kept by AthleteOrbit"><input inputMode="decimal" value={f.fee} onChange={set("fee")} /></Field><Field label="Our % of ticket price" hint="0 if the organizer keeps 100%"><input inputMode="decimal" value={f.pct} onChange={set("pct")} /></Field></div>
        <div className="grid2"><Field label="Organizer name"><input value={f.organizer_name} onChange={set("organizer_name")} /></Field><Field label="Organizer email"><input type="email" value={f.organizer_email} onChange={set("organizer_email")} /></Field></div>
        <Field label="Gym codes attending (comma separated)" hint="Their families get the ticket link"><input value={f.clubs} onChange={set("clubs")} placeholder="DEMO-1A2B3C" /></Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}><option value="draft">Draft (hidden)</option><option value="on_sale">On sale</option><option value="closed">Closed</option></select></Field>
        <ErrorNote error={err} />
        <Button className="wide">Save</Button>
      </form>
    </Sheet>
  );
}
