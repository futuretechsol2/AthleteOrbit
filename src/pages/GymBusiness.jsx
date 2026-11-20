// Gym owner business tools (classes & waitlists, tuition billing, staff schedule, reports, email) and the parent's
// Payments page. Card payments go straight to the gym's own Stripe account.
import { useEffect, useState } from "react";
import { api, DEMO } from "../lib/db.js";
import { Button, Field, Sheet, ErrorNote, Spinner, fmt } from "../ui.jsx";
import { openExternal } from "./More.jsx";

const usd = (c) => `$${(Number(c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const t12 = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "a" : "p"}`; };

// ---------------- Classes ----------------
export function GymClasses() {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [edit, setEdit] = useState(null); const [open, setOpen] = useState(null); const [msg, setMsg] = useState("");
  const load = () => api("gym/classes", null, "GET").then(setD).catch(setErr);
  useEffect(() => { load(); }, []);
  const act = async (body, note) => { setErr(null); try { const r = await api("gym/classes", body); if (note) setMsg(note(r)); await load(); return r; } catch (e) { setErr(e); } };
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const c = d.classes.find((x) => x.id === open);
  return (
    <div className="stack">
      <div className="row tight"><Button onClick={() => setEdit({ name: "", level: "", days: [], start_time: "16:00", end_time: "18:00", coach_name: "", capacity: 12, monthly_fee: "" })}>＋ New class</Button></div>
      {msg && <p className="note note-ok">{msg}</p>}
      {!d.classes.length ? <section className="card"><p className="muted">Add your classes — capacity, coach and monthly fee. When a class is full, new athletes go on its waitlist and move in automatically when a spot opens (their family gets an email).</p></section> :
        <section className="card">{d.classes.map((x) => { const pct = Math.round((x.enrolled.length / x.capacity) * 100); return (
          <button key={x.id} className="list-row" onClick={() => setOpen(x.id)}>
            <span className="grow"><b>{x.name}</b><small className="muted"> · {x.days.join("/")} {t12(x.start_time)}–{t12(x.end_time)}{x.coach_name ? ` · ${x.coach_name}` : ""}</small><br />
              <small>{x.enrolled.length}/{x.capacity} enrolled{x.waitlist.length ? ` · ${x.waitlist.length} waitlisted` : ""}{x.monthly_fee_cents ? ` · ${usd(x.monthly_fee_cents)}/mo` : ""}</small></span>
            <span className={`meter ${pct >= 100 ? "full" : ""}`}><span style={{ width: `${Math.min(100, pct)}%` }} /></span></button>); })}</section>}
      {c && <Sheet title={c.name} onClose={() => setOpen(null)}>
        <div className="stack">
          <p className="muted small">{c.days.join(", ")} · {t12(c.start_time)}–{t12(c.end_time)} · {c.enrolled.length}/{c.capacity}</p>
          <section className="card"><h3>Enrolled</h3>{c.enrolled.length ? c.enrolled.map((a) => <div key={a.roster_id} className="list-row static"><span className="grow">{a.name}<small className="muted"> · {a.level}</small></span><button className="link small" onClick={() => act({ class_id: c.id, drop: a.roster_id }, (r) => (r.promoted?.length ? "Dropped — the next athlete on the waitlist moved in and their family was emailed." : "Dropped."))}>Drop</button></div>) : <p className="muted small">Nobody yet.</p>}</section>
          {!!c.waitlist.length && <section className="card"><h3>Waitlist</h3>{c.waitlist.map((a, i) => <div key={a.roster_id} className="list-row static"><span className="grow">{i + 1}. {a.name}</span><button className="link small" onClick={() => act({ class_id: c.id, drop: a.roster_id })}>Remove</button></div>)}</section>}
          <Field label="Add an athlete"><select value="" onChange={(e) => e.target.value && act({ class_id: c.id, enroll: e.target.value }, (r) => (r.status === "waitlist" ? "Class is full — added to the waitlist." : "Enrolled."))}>
            <option value="">Choose…</option>{d.roster.filter((r) => !c.enrolled.concat(c.waitlist).some((a) => a.roster_id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.level}</option>)}</select></Field>
          <div className="row tight"><Button kind="ghost" className="sm" onClick={() => { setEdit({ ...c, monthly_fee: c.monthly_fee_cents ? c.monthly_fee_cents / 100 : "" }); setOpen(null); }}>Edit class</Button><Button kind="ghost" className="sm" onClick={async () => { await act({ remove: c.id }); setOpen(null); }}>Delete</Button></div>
          <ErrorNote error={err} />
        </div></Sheet>}
      {edit && <Sheet title={edit.id ? "Edit class" : "New class"} onClose={() => setEdit(null)}>
        <form className="form" onSubmit={async (e) => { e.preventDefault(); const r = await act({ ...edit, monthly_fee_cents: edit.monthly_fee === "" ? null : Math.round(Number(edit.monthly_fee) * 100) }, (r) => (r.promoted?.length ? `Saved — ${r.promoted.length} moved off the waitlist.` : "Class saved.")); if (r) setEdit(null); }}>
          <Field label="Class name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Level 4 team" /></Field>
          <div className="chips">{DAYS.map((x) => <button type="button" key={x} className={`chip ${edit.days.includes(x) ? "on" : ""}`} onClick={() => setEdit({ ...edit, days: edit.days.includes(x) ? edit.days.filter((y) => y !== x) : [...edit.days, x].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)) })}>{x}</button>)}</div>
          <div className="grid2"><Field label="Starts"><input type="time" value={edit.start_time || ""} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} /></Field><Field label="Ends"><input type="time" value={edit.end_time || ""} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} /></Field></div>
          <div className="grid2"><Field label="Capacity"><input inputMode="numeric" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value.replace(/\D/g, "") })} /></Field><Field label="Monthly fee ($)"><input inputMode="decimal" value={edit.monthly_fee} onChange={(e) => setEdit({ ...edit, monthly_fee: e.target.value.replace(/[^\d.]/g, "") })} placeholder="185" /></Field></div>
          <div className="grid2"><Field label="Level (optional)"><input value={edit.level || ""} onChange={(e) => setEdit({ ...edit, level: e.target.value })} /></Field><Field label="Coach"><input value={edit.coach_name || ""} onChange={(e) => setEdit({ ...edit, coach_name: e.target.value })} /></Field></div>
          <Button disabled={!edit.name}>Save class</Button><ErrorNote error={err} />
        </form></Sheet>}
      <ErrorNote error={err} />
    </div>
  );
}

// ---------------- Billing ----------------
export function GymBilling() {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [f, setF] = useState(null); const [msg, setMsg] = useState(""); const [filter, setFilter] = useState("open"); const [opts, setOpts] = useState(null); const [busy, setBusy] = useState("");
  const load = () => api("gym/invoices", null, "GET").then(setD).catch(setErr);
  useEffect(() => { load(); api("gym/classes", null, "GET").then(setOpts).catch(() => {}); }, []);
  const act = async (key, body, note) => { setBusy(key); setErr(null); try { const r = await api("gym/invoices", body); if (note) setMsg(note(r)); await load(); } catch (e) { setErr(e); } setBusy(""); };
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const levels = [...new Set((opts?.roster || []).map((r) => r.level).filter(Boolean))];
  const shown = d.invoices.filter((i) => filter === "all" || i.status === filter || (filter === "overdue" && i.status === "open" && i.due_date && i.due_date < today()));
  return (
    <div className="stack">
      <div className="coach-tiles"><div className="coach-tile"><b>{usd(d.totals.open)}</b><span>Open balance</span></div><div className="coach-tile"><b className={d.totals.overdue ? "warn-text" : ""}>{usd(d.totals.overdue)}</b><span>Overdue</span></div><div className="coach-tile"><b>{usd(d.totals.collected30)}</b><span>Collected (30 days)</span></div></div>
      {!d.online ? <section className="card find-cta static"><span className="find-icon" aria-hidden>💳</span><span className="grow"><b>Let families pay online</b><small>Card payments go straight to your bank through Stripe. {d.fee_pct ? `${d.fee_pct}% AthleteOrbit fee on the free plan; 0% on a paid gym plan.` : "No AthleteOrbit fee on your plan."}</small></span><Button className="sm" disabled={busy === "c" || DEMO} onClick={async () => { setBusy("c"); try { const r = await api("gym/connect", {}); if (r.url) openExternal(r.url); else load(); } catch (e) { setErr(e); } setBusy(""); }}>{busy === "c" ? "…" : "Turn on"}</Button></section>
        : <p className="note note-ok">✓ Online payments are on — families pay from their app; you see it here instantly.</p>}
      <div className="row tight"><Button onClick={() => setF({ who: "level", level: levels[0] || "", class_id: "", roster_id: "", description: `${new Date().toLocaleString("en-US", { month: "long" })} tuition`, amount: "", due_date: "" })}>＋ Bill families</Button>
        <Button kind="ghost" disabled={!!busy || !d.totals.overdue} onClick={() => act("r", { remind: "overdue" }, (r) => `Reminded ${r.reminded} famil${r.reminded === 1 ? "y" : "ies"}.`)}>Remind overdue</Button></div>
      {msg && <p className="note note-ok">{msg}</p>}
      <div className="chips">{[["open", "Open"], ["overdue", "Overdue"], ["paid", "Paid"], ["all", "All"]].map(([k, l]) => <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <section className="card">{!shown.length ? <p className="muted small">Nothing here.</p> : shown.map((i) => (
        <div key={i.id} className="inv-row">
          <span className="grow"><b>{i.athlete_name || "—"}</b><small className="muted"> · {i.description}</small><br /><small className={i.status === "open" && i.due_date && i.due_date < today() ? "warn-text" : "muted"}>{i.status === "paid" ? `Paid ${fmt.date(i.paid_at.slice(0, 10))} · ${i.paid_via}` : i.status === "void" ? "Void" : i.due_date ? `Due ${fmt.date(i.due_date)}` : "Open"}{!i.family_email && i.status === "open" ? " · no family email" : ""}</small></span>
          <b className="amt">{usd(i.amount_cents)}</b>
          {i.status === "open" && <select aria-label="Mark" value="" onChange={(e) => e.target.value && act(i.id, { mark: i.id, ...(e.target.value === "void" ? { status: "void" } : { status: "paid", via: e.target.value }) })}><option value="">Mark…</option><option value="cash">Paid · cash</option><option value="check">Paid · check</option><option value="other">Paid · other</option><option value="void">Void</option></select>}
          {i.status !== "open" && <button className="link small" onClick={() => act(i.id, { mark: i.id, status: "open" })}>Reopen</button>}
        </div>))}</section>
      {f && <Sheet title="Bill families" onClose={() => setF(null)}>
        <form className="form" onSubmit={(e) => { e.preventDefault(); act("n", { description: f.description, amount_cents: Math.round(Number(f.amount) * 100), due_date: f.due_date || null, ...(f.who === "level" ? { level: f.level } : f.who === "class" ? { class_id: f.class_id } : f.who === "one" ? { roster_id: f.roster_id } : { everyone: true }) },
          (r) => `Created ${r.created} invoice${r.created === 1 ? "" : "s"} and emailed ${r.emailed} famil${r.emailed === 1 ? "y" : "ies"}.${r.missingEmail?.length ? ` No email on file for ${r.missingEmail.join(", ")}.` : ""}`).then(() => setF(null)); }}>
          <div className="chips">{[["level", "A level"], ["class", "A class"], ["one", "One athlete"], ["all", "Everyone"]].map(([k, l]) => <button type="button" key={k} className={`chip ${f.who === k ? "on" : ""}`} onClick={() => setF({ ...f, who: k })}>{l}</button>)}</div>
          {f.who === "level" && <Field label="Level"><select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>{levels.map((l) => <option key={l}>{l}</option>)}</select></Field>}
          {f.who === "class" && <Field label="Class (enrolled athletes)"><select value={f.class_id} onChange={(e) => { const c = opts.classes.find((x) => x.id === e.target.value); setF({ ...f, class_id: e.target.value, amount: c?.monthly_fee_cents ? c.monthly_fee_cents / 100 : f.amount }); }}><option value="">Choose…</option>{(opts?.classes || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.enrolled.length})</option>)}</select></Field>}
          {f.who === "one" && <Field label="Athlete"><select value={f.roster_id} onChange={(e) => setF({ ...f, roster_id: e.target.value })}><option value="">Choose…</option>{(opts?.roster || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>}
          <Field label="What for"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid2"><Field label="Amount ($)"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="185" /></Field><Field label="Due"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field></div>
          <Button disabled={busy === "n" || !f.amount || !f.description}>{busy === "n" ? "Creating…" : "Create & email families"}</Button>
          <p className="muted small">Each family gets an email with a secure Pay button. Cash or check? Mark it paid here.</p>
          <ErrorNote error={err} />
        </form></Sheet>}
      <ErrorNote error={err} />
    </div>
  );
}

// ---------------- Staff schedule ----------------
export function GymStaff() {
  const [week, setWeek] = useState(today()); const [d, setD] = useState(null); const [err, setErr] = useState(null); const [p, setP] = useState(null); const [s, setS] = useState(null);
  const load = () => api("gym/staff", null, "GET", { week }).then(setD).catch(setErr);
  useEffect(() => { load(); }, [week]);
  const act = async (body) => { setErr(null); try { await api("gym/staff", body); await load(); return true; } catch (e) { setErr(e); return false; } };
  const shift = (n) => { const x = new Date(`${d.week}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n * 7); setWeek(x.toISOString().slice(0, 10)); };
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const payroll = d.staff.reduce((a, x) => a + (x.pay_cents || 0), 0);
  return (
    <div className="stack">
      <div className="row tight"><button className="btn btn-ghost sm" onClick={() => shift(-1)}>‹</button><b className="grow center">Week of {fmt.date(d.week)}</b><button className="btn btn-ghost sm" onClick={() => shift(1)}>›</button></div>
      <div className="row tight"><Button className="sm" onClick={() => setP({ name: "", role: "Coach", email: "", phone: "", rate: "" })}>＋ Staff</Button><Button kind="ghost" className="sm" disabled={!d.staff.length} onClick={() => setS({ staff_id: d.staff[0]?.id, day: d.days[0], start_time: "16:00", end_time: "20:00", class_id: "", note: "" })}>＋ Shift</Button><span className="grow muted small right">{d.staff.reduce((a, x) => a + x.hours, 0)} hours{payroll ? ` · est. payroll ${usd(payroll)}` : ""}</span></div>
      <div className="table-scroll"><table className="cmp sched">
        <thead><tr><th>Staff</th>{d.days.map((x) => <th key={x}>{new Date(`${x}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short" })}<br /><small>{x.slice(5)}</small></th>)}<th>Hours</th></tr></thead>
        <tbody>{d.staff.map((x) => <tr key={x.id}><th><button className="link" onClick={() => setP({ ...x, rate: x.pay_rate_cents ? x.pay_rate_cents / 100 : "" })}>{x.name}</button><br /><small className="muted">{x.role}</small></th>
          {d.days.map((day) => <td key={day}>{d.shifts.filter((sh) => sh.staff_id === x.id && sh.day === day).map((sh) => <button key={sh.id} className="shift" title={sh.note || ""} onClick={() => confirm("Remove this shift?") && act({ remove_shift: sh.id })}>{t12(sh.start_time)}–{t12(sh.end_time)}{sh.class_id ? <small>{d.classes.find((c) => c.id === sh.class_id)?.name}</small> : null}</button>)}</td>)}
          <td><b>{x.hours}</b>{x.pay_cents ? <small><br />{usd(x.pay_cents)}</small> : null}</td></tr>)}</tbody></table></div>
      {!d.staff.length && <p className="muted small center">Add your coaches and front-desk staff, then their shifts. Double-bookings are blocked.</p>}
      {p && <Sheet title={p.id ? p.name : "Add staff"} onClose={() => setP(null)}><form className="form" onSubmit={async (e) => { e.preventDefault(); if (await act({ id: p.id, name: p.name, role: p.role, email: p.email, phone: p.phone, pay_rate_cents: p.rate ? Math.round(Number(p.rate) * 100) : null })) setP(null); }}>
        <Field label="Name"><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <div className="grid2"><Field label="Role"><input value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} /></Field><Field label="Pay rate ($/hr, optional)"><input inputMode="decimal" value={p.rate} onChange={(e) => setP({ ...p, rate: e.target.value.replace(/[^\d.]/g, "") })} /></Field></div>
        <div className="grid2"><Field label="Email"><input type="email" value={p.email || ""} onChange={(e) => setP({ ...p, email: e.target.value })} /></Field><Field label="Phone"><input value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field></div>
        <div className="row tight"><Button disabled={!p.name}>Save</Button>{p.id && <Button kind="ghost" onClick={async (e) => { e.preventDefault(); if (await act({ remove_staff: p.id })) setP(null); }}>Remove</Button>}</div><ErrorNote error={err} /></form></Sheet>}
      {s && <Sheet title="Add a shift" onClose={() => setS(null)}><form className="form" onSubmit={async (e) => { e.preventDefault(); if (await act({ shift: s })) setS(null); }}>
        <Field label="Who"><select value={s.staff_id} onChange={(e) => setS({ ...s, staff_id: e.target.value })}>{d.staff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Day"><select value={s.day} onChange={(e) => setS({ ...s, day: e.target.value })}>{d.days.map((x) => <option key={x} value={x}>{new Date(`${x}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</option>)}</select></Field>
        <div className="grid2"><Field label="Start"><input type="time" value={s.start_time} onChange={(e) => setS({ ...s, start_time: e.target.value })} /></Field><Field label="End"><input type="time" value={s.end_time} onChange={(e) => setS({ ...s, end_time: e.target.value })} /></Field></div>
        <Field label="Class (optional)"><select value={s.class_id} onChange={(e) => setS({ ...s, class_id: e.target.value })}><option value="">—</option>{d.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Button>Add shift</Button><ErrorNote error={err} /></form></Sheet>}
      <ErrorNote error={err} />
    </div>
  );
}

// ---------------- Reports ----------------
export function GymReports() {
  const [d, setD] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { api("gym/reports", null, "GET").then(setD).catch(setErr); }, []);
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const f = d.finance, max = Math.max(1, ...f.months.map((m) => Math.max(m.billed, m.collected)));
  const csv = () => { const rows = [["Month", "Billed", "Collected"], ...f.months.map((m) => [m.month, (m.billed / 100).toFixed(2), (m.collected / 100).toFixed(2)])]; navigator.clipboard.writeText(rows.map((r) => r.join(",")).join("\n")).catch(() => {}); };
  return (
    <div className="stack">
      <section className="card"><div className="row tight"><h3 className="grow">💵 Billed vs collected (6 months)</h3><button className="link small" onClick={csv}>Copy CSV</button></div>
        <div className="bars">{f.months.map((m) => <div key={m.month} className="bar-col" title={`${m.month}: billed ${usd(m.billed)}, collected ${usd(m.collected)}`}><div className="bar-pair"><span className="b1" style={{ height: `${(m.billed / max) * 100}%` }} /><span className="b2" style={{ height: `${(m.collected / max) * 100}%` }} /></div><small>{new Date(`${m.month}-15`).toLocaleDateString("en-US", { month: "short" })}</small></div>)}</div>
        <p className="small"><span className="key k1" /> Billed <span className="key k2" /> Collected</p>
        <div className="coach-tiles"><div className="coach-tile"><b>{usd(f.outstanding)}</b><span>Outstanding</span></div><div className="coach-tile"><b>{usd(f.aging.d30)}</b><span>1–30 days late</span></div><div className="coach-tile"><b className={f.aging.d60plus ? "warn-text" : ""}>{usd(f.aging.d60 + f.aging.d60plus)}</b><span>31+ days late</span></div></div>
        <p className="muted small">Paid by: {f.byMethod.filter((m) => m.cents).map((m) => `${m.method} ${usd(m.cents)}`).join(" · ") || "—"}</p></section>
      <section className="card"><h3>🏫 Class enrollment</h3>{!d.enrollment.length ? <p className="muted small">No classes yet.</p> : <div className="table-scroll"><table className="cmp"><thead><tr><th>Class</th><th>Enrolled</th><th>Waitlist</th><th>Full</th><th>Monthly</th></tr></thead>
        <tbody>{d.enrollment.map((c) => <tr key={c.id}><th>{c.name}</th><td>{c.enrolled}/{c.capacity}</td><td>{c.waitlist || "–"}</td><td>{c.fill}%</td><td>{c.monthly_cents ? usd(c.monthly_cents) : "–"}</td></tr>)}</tbody></table></div>}</section>
      <section className="card"><h3>🤸 Athlete progress by level</h3><div className="table-scroll"><table className="cmp"><thead><tr><th>Level</th><th>Athletes</th><th>Attendance (30d)</th><th>Skills comp-ready</th><th>Consistent</th><th>Learning</th></tr></thead>
        <tbody>{d.athletes.map((a) => <tr key={a.level}><th>{a.level}</th><td>{a.athletes}</td><td>{a.attendance == null ? "–" : `${a.attendance}%`}</td><td>{a.skills.competition}</td><td>{a.skills.consistent}</td><td>{a.skills.learning}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}

// ---------------- Email families ----------------
export function GymEmail() {
  const [opts, setOpts] = useState(null); const [f, setF] = useState({ to: "all", level: "", class_id: "", subject: "", body: "" }); const [n, setN] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [err, setErr] = useState(null);
  useEffect(() => { api("gym/classes", null, "GET").then(setOpts).catch(setErr); }, []);
  const aud = () => (f.to === "level" ? { level: f.level } : f.to === "class" ? { class_id: f.class_id } : {});
  useEffect(() => { if (!opts) return; api("gym/email", { ...aud(), subject: "x", body: "x", preview: true }).then((r) => setN(r.recipients)).catch(() => setN(null)); }, [f.to, f.level, f.class_id, opts]);
  if (!opts) return err ? <ErrorNote error={err} /> : <Spinner />;
  const levels = [...new Set(opts.roster.map((r) => r.level).filter(Boolean))];
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { const r = await api("gym/email", { ...aud(), subject: f.subject, body: f.body }); setMsg(`Sent to ${r.sent} famil${r.sent === 1 ? "y" : "ies"}.`); setF({ ...f, subject: "", body: "" }); } catch (x) { setErr(x); } setBusy(false); }}>
      <h3>✉️ Email families</h3>
      <div className="chips">{[["all", "Everyone"], ["level", "A level"], ["class", "A class"]].map(([k, l]) => <button type="button" key={k} className={`chip ${f.to === k ? "on" : ""}`} onClick={() => setF({ ...f, to: k, level: levels[0] || "", class_id: opts.classes[0]?.id || "" })}>{l}</button>)}</div>
      {f.to === "level" && <Field label="Level"><select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>{levels.map((l) => <option key={l}>{l}</option>)}</select></Field>}
      {f.to === "class" && <Field label="Class"><select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}>{opts.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      <p className="muted small">{n == null ? "" : `${n} famil${n === 1 ? "y" : "ies"} will get this.`} For one family, use Messages (1-to-1 chat).</p>
      <Field label="Subject"><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Picture day Saturday" /></Field>
      <Field label="Message"><textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <Button disabled={busy || !f.subject || !f.body || !n || DEMO}>{busy ? "Sending…" : `Send to ${n || 0}`}</Button>
      {DEMO && <p className="muted small">Sending is off in the demo.</p>}
      {msg && <p className="note note-ok">{msg}</p>}<ErrorNote error={err} />
    </form>
  );
}

// ---------------- Parents: Payments ----------------
export function ParentBilling({ params }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState("");
  useEffect(() => { api("family/billing", null, "GET").then(setD).catch(setErr); }, []);
  const paid = params?.paid || new URLSearchParams(location.search).get("paid");
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  return (
    <div className="stack">
      <section className="hero"><p className="eyebrow">💳 Payments</p><h1>{d.balance ? `${usd(d.balance)} due` : "You're all paid up"}</h1><p className="hero-sub">Tuition and fees from your gym. Card payments go straight to the gym.</p></section>
      {paid && <p className="note note-ok">Thank you — your payment went through. A receipt is on its way.</p>}
      <section className="card">{!d.invoices.length ? <p className="muted">No bills from your gym yet. When your gym bills through AthleteOrbit, they show up here.</p> : d.invoices.map((i) => (
        <div key={i.id} className="inv-row">
          <span className="grow"><b>{i.description}</b><small className="muted"> · {i.athlete || i.gym}</small><br /><small className={i.status === "open" && i.due_date && i.due_date < today() ? "warn-text" : "muted"}>{i.status === "paid" ? `Paid ${fmt.date(i.paid_at.slice(0, 10))}` : i.due_date ? `Due ${fmt.date(i.due_date)}` : i.gym}</small></span>
          <b className="amt">{usd(i.amount_cents)}</b>
          {i.status === "open" && (i.payable ? <Button className="sm" disabled={!!busy || DEMO} onClick={async () => { setBusy(i.id); try { const r = await api("family/pay", { id: i.id }); openExternal(r.url); } catch (e) { setErr(e); setBusy(""); } }}>{busy === i.id ? "…" : "Pay"}</Button> : <small className="muted">Pay the gym directly</small>)}
        </div>))}</section>
      {DEMO && <p className="muted small center">Payments are switched off in the demo.</p>}
      <ErrorNote error={err} />
    </div>
  );
}
