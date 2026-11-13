import React, { useEffect, useState } from "react";
import { db, api, DEMO } from "../lib/db.js";
import { APP } from "../config.js";
import { Button, Field, Sheet, ErrorNote, Spinner, fmt } from "../ui.jsx";
import { openExternal } from "./More.jsx";
import PlanPicker from "../components/PlanPicker.jsx";

export function RemindersCard({ profile, me, refresh }) {
  const [f, setF] = useState({ email_reminders: profile.email_reminders ?? true, sms_reminders: !!profile.sms_reminders, phone: profile.phone || "", home_city: profile.home_city || "", home_airport: profile.home_airport || "" });
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(null);
  const smsOn = !!me?.sms_enabled;
  async function save(e) {
    e.preventDefault(); setErr(null); setMsg("");
    const phone = f.phone.replace(/[^\d+]/g, "");
    if (f.sms_reminders && !/^\+?1?\d{10}$/.test(phone)) return setErr(new Error("Enter a 10-digit US mobile number for texts."));
    const e164 = phone ? (phone.startsWith("+") ? phone : `+1${phone.slice(-10)}`) : null;
    try { await db.updateProfile({ ...f, phone: e164, home_airport: f.home_airport.trim().toUpperCase() || null, home_city: f.home_city.trim() || null }); setMsg("Saved."); refresh(); } catch (e2) { setErr(e2); }
  }
  return (
    <form className="card form" onSubmit={save}>
      <h3>Reminders & travel</h3>
      <p className="muted small">We remind you 14, 7, 2 and 1 days before each meet, and before entry deadlines.</p>
      <label className="check"><input type="checkbox" checked={f.email_reminders} onChange={(e) => setF({ ...f, email_reminders: e.target.checked })} /> Email reminders</label>
      <label className="check"><input type="checkbox" disabled={!smsOn} checked={f.sms_reminders} onChange={(e) => setF({ ...f, sms_reminders: e.target.checked })} /> Text reminders {smsOn ? "" : <span className="pill">Coming soon</span>}</label>
      {smsOn && f.sms_reminders && <Field label="Mobile number" hint="Msg & data rates may apply. Reply STOP to opt out, HELP for help."><input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(704) 555-0100" /></Field>}
      <div className="grid2">
        <Field label="Home city"><input value={f.home_city} onChange={(e) => setF({ ...f, home_city: e.target.value })} placeholder="Concord, NC" /></Field>
        <Field label="Home airport"><input value={f.home_airport} maxLength={3} onChange={(e) => setF({ ...f, home_airport: e.target.value })} placeholder="CLT" /></Field>
      </div>
      <ErrorNote error={err} />
      {msg && <div className="note note-ok">{msg}</div>}
      <Button kind="ghost">Save</Button>
    </form>
  );
}

export function GymCard({ me, refresh }) {
  const [code, setCode] = useState(() => { try { return localStorage.getItem("gp-gym-code") || ""; } catch { return ""; } });
  const [err, setErr] = useState(null); const [msg, setMsg] = useState(""); const [buy, setBuy] = useState(false); const [mine, setMine] = useState([]); const [post, setPost] = useState(null);
  useEffect(() => { api("club/mine", null, "GET").then((r) => setMine(r.clubs || [])).catch(() => {}); }, []);
  async function join(e) {
    e.preventDefault(); setErr(null); setMsg("");
    try { const r = await api("club/join", { code }); setMsg(`You're in! ${r.club.name} covers your AthleteOrbit plan.`); try { localStorage.removeItem("gp-gym-code"); } catch {} refresh(); } catch (e2) { setErr(e2); }
  }
  return (
    <section className="card form">
      <h3>Gym code</h3>
      {me?.club ? <p>You're connected to <b>{me.club.name}</b>. Your plan is included.</p> : (
        <form className="row" onSubmit={join}>
          <input className="grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter your gym's code" aria-label="Gym code" />
          <Button kind="ghost" disabled={!code.trim()}>Join</Button>
        </form>
      )}
      <ErrorNote error={err} />{msg && <div className="note note-ok">{msg}</div>}
      {mine.map((c) => (
        <div key={c.code} className="note note-ok">
          <b>{c.name}</b>: share code <b className="mono">{c.code}</b> · {c.families}/{c.seats} families joined{c.active_until ? ` · active to ${fmt.date(c.active_until.slice(0, 10))}` : ""}

        </div>
      ))}
      {post && <Announce code={post} onClose={() => setPost(null)} />}
      <button type="button" className="link" onClick={() => setBuy(true)}>Own or run a gym? Set it up for every family →</button>
      {buy && <ClubBuy onClose={() => setBuy(false)} />}
    </section>
  );
}

function ClubBuy({ onClose }) {
  const [name, setName] = useState(""); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const [term, setTerm] = useState("yearly");
  return (
    <Sheet title="AthleteOrbit for your gym" onClose={onClose}>
      <ul className="perks">
        <li><b>One photo of your season schedule</b>: each family sees only their athlete's competitions</li>
        <li><b>Fewer parent questions</b>: meet reminders, packing lists and travel links go out automatically</li>
        <li><b>One code to share</b>: families sign up and enter your gym code — covered by your gym</li>
      </ul>
      <PlanPicker kind="gym" value={term} onChange={setTerm} compact />
      <Field label="Gym or booster club name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Axcelerate Gymnastics" /></Field>
      <Button className="wide" disabled={busy || name.trim().length < 2 || DEMO} onClick={async () => { setBusy(true); setErr(null); try { const { url } = await api("club/checkout", { clubName: name, plan: term }); openExternal(url); } catch (e) { setErr(e); setBusy(false); } }}>
        {busy ? "Opening secure checkout…" : "Continue to payment"}
      </Button>
      {DEMO && <p className="muted small center">Checkout is switched off in demo mode.</p>}
      <p className="muted small center">Your gym code arrives by email right after payment.</p>
      <ErrorNote error={err} />
    </Sheet>
  );
}

export function ContactSheet({ onClose, email = "" }) {
  const [f, setF] = useState({ name: "", email, phone: "", topic: "Account or sign-in", message: "", website: "" });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function send(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("support/send", f); setDone(true); } catch (e2) { setErr(e2); }
    setBusy(false);
  }
  return (
    <Sheet title="Contact us" onClose={onClose}>
      {done ? (
        <div className="empty"><div className="empty-icon">✅</div><h3>Message sent</h3><p>We'll reply to {f.email} within one business day. A copy is in your inbox.</p><Button onClick={onClose}>Done</Button></div>
      ) : (
        <form className="form" onSubmit={send}>
          <div className="contact-direct">
            <div><small className="muted">Email</small><b className="select-all">{APP.supportEmail}</b></div>
            {APP.supportPhone && <div><small className="muted">Phone ({APP.supportHours})</small><a href={`tel:${APP.supportPhone.replace(/[^\d+]/g, "")}`}><b>{APP.supportPhone}</b></a></div>}
          </div>
          <div className="grid2">
            <Field label="Your name"><input value={f.name} onChange={set("name")} autoComplete="name" /></Field>
            <Field label="Email"><input type="email" value={f.email} onChange={set("email")} required autoComplete="email" /></Field>
          </div>
          <div className="grid2">
            <Field label="Phone (optional)"><input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
            <Field label="Topic"><select value={f.topic} onChange={set("topic")}>{["Account or sign-in", "Billing", "Gym / club plan", "Bug or problem", "Feature idea", "Other"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="How can we help?"><textarea rows={4} value={f.message} onChange={set("message")} required minLength={5} /></Field>
          <input className="hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} aria-hidden="true" placeholder="Leave empty" />
          <ErrorNote error={err} />
          <Button className="wide" disabled={busy}>{busy ? "Sending…" : "Send message"}</Button>
        </form>
      )}
    </Sheet>
  );
}

export function AdminInbox({ onClose }) {
  const [rows, setRows] = useState(null); const [open, setOpen] = useState(null); const [reply, setReply] = useState(""); const [err, setErr] = useState(null); const [filter, setFilter] = useState("open");
  const load = () => api("admin/support", null, "GET").then((r) => setRows(r.messages)).catch(setErr);
  useEffect(() => { load(); }, []);
  async function act(id, body) { setErr(null); try { await api("admin/support", { id, ...body }); setOpen(null); setReply(""); load(); } catch (e) { setErr(e); } }
  const shown = (rows || []).filter((r) => filter === "all" || r.status === filter);
  return (
    <Sheet title="Team inbox" onClose={onClose}>
      <div className="chips">{["open", "answered", "closed", "all"].map((k) => <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
      <ErrorNote error={err} />
      {!rows ? <Spinner label="Loading messages…" /> : !shown.length ? <p className="muted center">Nothing here.</p> : shown.map((m) => (
        <div key={m.id} className="card">
          <button className="note-head" onClick={() => { setOpen(open === m.id ? null : m.id); setReply(m.ai_draft || ""); }}>
            <span><b>{m.topic}</b> · {m.name || m.email}<br /><small className="muted">{new Date(m.created_at).toLocaleString()} · {m.status}</small></span><span>{open === m.id ? "−" : "+"}</span>
          </button>
          <p className="pre">{m.message}</p>
          {open === m.id && (
            <div className="form">
              <p className="muted small">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
              {m.reply && <div className="note note-ok"><b>Sent:</b> {m.reply}</div>}
              <Field label={m.ai_draft ? "Reply (AI draft — edit before sending)" : "Reply"}><textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
              <div className="row end">
                <Button kind="ghost" type="button" onClick={() => act(m.id, { status: "closed" })}>Close without reply</Button>
                <Button type="button" disabled={!reply.trim()} onClick={() => act(m.id, { reply })}>Send reply</Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </Sheet>
  );
}

export function Announce({ code, onClose }) {
  const [f, setF] = useState({ title: "", body: "", email: true }); const [err, setErr] = useState(null); const [done, setDone] = useState(null); const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Announcement to families" onClose={onClose}>
      {done ? <div className="empty"><div className="empty-icon">📣</div><h3>Posted</h3><p>{done.emailed ? `Emailed to ${done.emailed} families.` : "Families see it as an alert in the app."}</p><Button onClick={onClose}>Done</Button></div> : (
        <form className="form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { setDone(await api("club/announce", { clubCode: code, ...f })); } catch (e2) { setErr(e2); } setBusy(false); }}>
          <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required placeholder="Session times changed for Saturday" /></Field>
          <Field label="Message"><textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required /></Field>
          <label className="check"><input type="checkbox" checked={f.email} onChange={(e) => setF({ ...f, email: e.target.checked })} /> Also email every family</label>
          <ErrorNote error={err} />
          <Button className="wide" disabled={busy}>{busy ? "Posting…" : "Post announcement"}</Button>
        </form>
      )}
    </Sheet>
  );
}
