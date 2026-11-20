// Coach OS — the coach's daily tools: today's command center, athletes with full history, one-tap roll call,
// meet results (typed or read from a photo of the score sheet), event-by-event comparisons, evaluations,
// development plans and progress reports (AI drafts the coach approves), and an assistant over the team's data.
import { useEffect, useMemo, useState } from "react";
import { api, DEMO } from "../lib/db.js";
import { eventsFor, fmtScore, lowerBetter } from "../data/live.js";
import { RATINGS } from "../data/coach.js";
import { Button, Field, Sheet, ErrorNote, Spinner, fmt } from "../ui.jsx";

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const arrow = (n, lower) => (n == null || n === 0 ? "" : (lower ? n < 0 : n > 0) ? "▲" : "▼");
const tone = (n, lower) => (n == null || n === 0 ? "" : (lower ? n < 0 : n > 0) ? "up" : "down");
const abs = (n) => (n == null ? "" : Number(Math.abs(n)).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
const signed = (n) => (n == null ? "" : `${n > 0 ? "+" : ""}${Number(n).toFixed(Math.abs(n) < 1 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "")}`);
const VIS = { private: "Only me", staff: "Coaches", parent: "Parents can see" };
const fileToDataUrl = (f) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
async function shrink(file) { // phones take 8–12 MB photos; the sheet reads fine at ~2000px
  if (!file.type.startsWith("image/")) return fileToDataUrl(file);
  const img = await createImageBitmap(file).catch(() => null); if (!img) return fileToDataUrl(file);
  const k = Math.min(1, 2000 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.85);
}

// ---------------- Today (command center) ----------------
export function CoachToday({ setTab, openAthlete, children }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { api("coach/dashboard", null, "GET").then(setD).catch(setErr); }, []);
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const c = d.counts, a = d.attendance;
  const tiles = [["Athletes", c.athletes, "athletes"], ["Groups", c.groups, "athletes"], ["Upcoming meets", c.meets, "schedule"], ["Attendance (14 days)", a.rate14 == null ? "—" : `${a.rate14}%`, "attendance"], ["Need evaluation", c.pendingEvals, "athletes"], ["Unread messages", c.unread, "messages"]];
  return (
    <div className="stack">
      <div className="coach-tiles">{tiles.map(([l, v, t]) => <button key={l} className="coach-tile" onClick={() => setTab(t)}><b>{v}</b><span>{l}</span></button>)}</div>
      <button className="card find-cta" onClick={() => setTab("attendance")}>
        <span className="find-icon" aria-hidden>✅</span>
        <span className="grow"><b>{a.today.marked ? `Today's roll call: ${a.today.present}/${a.today.marked} here` : "Take today's roll call"}</b><small>One tap per athlete — absences show up in “Needs attention”</small></span><span aria-hidden>›</span>
      </button>
      <section className="card">
        <h3>Needs your attention</h3>
        {!d.attention.length ? <p className="muted small">Nobody flagged. Flags come from attendance, meet results and overdue evaluations.</p> : d.attention.map((x) => (
          <button key={x.id} className="list-row" onClick={() => openAthlete(x.id)}><span className="grow"><b>{x.name}</b><small className="muted"> · {x.level}</small><br /><small className="warn-text">{x.why.join(" · ")}</small></span><span aria-hidden>›</span></button>
        ))}
      </section>
      {!!d.improved.length && <section className="card">
        <h3>Recently improved 🎉</h3>
        {d.improved.map((x) => <button key={x.id} className="list-row" onClick={() => openAthlete(x.id)}><span className="grow"><b>{x.name}</b><small className="muted"> · {x.level}</small></span><span className="delta up">▲ {abs(x.trend)}</span></button>)}
      </section>}
      <section className="card">
        <h3>Coming up</h3>
        {!d.upcoming.length && !d.milestones.length ? <p className="muted small">No meets on the schedule. <button className="link" onClick={() => setTab("schedule")}>Add the season</button></p> : <>
          {d.upcoming.map((m) => <div key={m.id} className="list-row static"><span className="grow"><b>{m.name}</b><small className="muted"> · {fmt.date(m.start_date)}{m.location ? ` · ${m.location}` : ""}</small></span></div>)}
          {d.milestones.map((m) => <button key={m.id + m.review} className="list-row" onClick={() => openAthlete(m.id)}><span className="grow">🎯 <b>{m.name}</b><small className="muted"> · plan review {fmt.date(m.review)}</small></span><span aria-hidden>›</span></button>)}
        </>}
      </section>
      <div className="row tight">
        <Button kind="ghost" className="sm" onClick={() => setTab("results")}>📊 Record meet results</Button>
        <Button kind="ghost" className="sm" onClick={() => setTab("assistant")}>✨ Ask the assistant</Button>
      </div>
      <Ambassador />
      {children}
    </div>
  );
}

function Ambassador() {
  const [d, setD] = useState(null);
  useEffect(() => { api("coach/ambassador", null, "GET").then(setD).catch(() => {}); }, []);
  if (!d) return null;
  const link = `${location.origin}/register?gym=${d.code}`;
  return (
    <section className="card ambassador">
      <h3>🤝 Coach ambassador</h3>
      <p className="small">Families who join with your code get AthleteOrbit through you. During launch, coaches earn <b>10% of every paying family's subscription</b> they bring in — paid monthly.</p>
      <div className="stats three">
        <div className="stat"><span className="stat-value">{d.families}</span><span className="stat-label">Families joined</span></div>
        <div className="stat"><span className="stat-value">{d.paying}</span><span className="stat-label">Paying</span></div>
        <div className="stat"><span className="stat-value">{d.trialing}</span><span className="stat-label">On trial</span></div>
      </div>
      <div className="row tight"><button className="btn btn-ghost sm" onClick={() => navigator.clipboard.writeText(link).catch(() => {})}>Copy my family link</button><small className="muted">Code {d.code}</small></div>
      <p className="muted small">Commissions never depend on scores, evaluations or team decisions.</p>
    </section>
  );
}

// ---------------- Athletes ----------------
export function CoachAthletes({ openAthlete, setTab }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [q, setQ] = useState(""); const [grp, setGrp] = useState("");
  useEffect(() => { api("coach/athletes", null, "GET").then(setD).catch(setErr); }, []);
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const groups = [...new Set(d.athletes.map((a) => a.group || a.level).filter(Boolean))];
  const shown = d.athletes.filter((a) => (!grp || (a.group || a.level) === grp) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  if (!d.athletes.length) return <section className="card"><p>Add your athletes first.</p><Button onClick={() => setTab("roster")}>Go to roster</Button></section>;
  return (
    <div className="stack">
      <input className="music-search" placeholder="Find an athlete" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an athlete" />
      <div className="chips">{["", ...groups].map((g) => <button key={g || "all"} className={`chip ${grp === g ? "on" : ""}`} onClick={() => setGrp(g)}>{g || "Everyone"}</button>)}</div>
      <section className="card">
        {shown.map((a) => (
          <button key={a.id} className="list-row athlete-row" onClick={() => openAthlete(a.id)}>
            <span className="avatar-sm" aria-hidden>{a.name[0]}</span>
            <span className="grow"><b>{a.name}</b><small className="muted"> · {a.level || "—"}</small><br />
              <small className="muted">{a.meets ? `${a.meets} meet${a.meets === 1 ? "" : "s"} · last ${fmtScore(a.last_total, a.sport)}` : "no results yet"}{a.attendance.rate != null ? ` · ${a.attendance.rate}% attendance` : ""}{a.weakest ? ` · work on ${a.weakest}` : ""}</small></span>
            {a.trend != null && <span className={`delta ${tone(a.trend, a.sport === "Swimming")}`}>{arrow(a.trend, a.sport === "Swimming")} {abs(a.trend)}</span>}
            {a.plan?.status === "published" && <span className="pill" title="Development plan shared">🎯</span>}
          </button>
        ))}
      </section>
    </div>
  );
}

export function AthleteProfile({ id, onClose }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [tab, setTab] = useState("progress"); const [edit, setEdit] = useState(null);
  const load = () => api("coach/athlete", null, "GET", { id }).then(setD).catch(setErr);
  useEffect(() => { load(); }, [id]);
  const a = d?.athlete;
  return (
    <Sheet title={a ? a.name : "Athlete"} onClose={onClose}>
      {!d ? (err ? <ErrorNote error={err} /> : <Spinner />) : <div className="stack">
        <p className="muted small">{a.level || "—"}{a.group ? ` · ${a.group}` : ""} · {a.sport} · {a.family_linked ? "family connected ✓" : a.parent_email ? `family invited (${a.parent_email})` : "family not connected yet"}</p>
        <div className="stats three">
          <div className="stat"><span className="stat-value">{a.meets}</span><span className="stat-label">Meets</span></div>
          <div className="stat"><span className="stat-value">{d.attendance.last30.rate == null ? "—" : `${d.attendance.last30.rate}%`}</span><span className="stat-label">Attendance (30d)</span></div>
          <div className="stat"><span className={`stat-value delta ${tone(a.trend, d.lowerBetter)}`}>{a.trend == null ? "—" : `${arrow(a.trend, d.lowerBetter)} ${abs(a.trend)}`}</span><span className="stat-label">Last meet</span></div>
        </div>
        <div className="chips">{[["progress", "📈 Progress"], ["eval", "📝 Evaluate"], ["plan", "🎯 Plan"], ["report", "✉️ Report"], ["notes", `🗂 Notes (${d.notes.length})`], ["attendance", "✅ Attendance"]].map(([k, l]) => <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => { setTab(k); setEdit(null); }}>{l}</button>)}</div>
        {tab === "progress" && <Progress d={d} />}
        {tab === "eval" && <EvalForm athleteId={id} onSaved={() => { load(); setTab("notes"); }} />}
        {tab === "plan" && <PlanEditor athleteId={id} existing={edit || d.notes.find((n) => n.kind === "plan" && n.status !== "archived")} onSaved={() => { load(); setTab("notes"); }} />}
        {tab === "report" && <ReportEditor athleteId={id} onSaved={() => { load(); setTab("notes"); }} />}
        {tab === "notes" && <Notes notes={d.notes} athleteId={id} reload={load} onEditPlan={(n) => { setEdit(n); setTab("plan"); }} />}
        {tab === "attendance" && <section className="card"><div className="att-dots">{d.attendance.history.length ? d.attendance.history.map((h) => <span key={h.day} className={`att-dot ${h.status}`} title={`${fmt.date(h.day)} · ${h.status}`}>{h.status[0].toUpperCase()}</span>) : <p className="muted small">No roll calls yet.</p>}</div><p className="muted small">Last 30 days: {d.attendance.last30.missed} missed of {d.attendance.last30.marked} marked.</p></section>}
      </div>}
    </Sheet>
  );
}

function Progress({ d }) {
  const { results, events, analysis } = d; const lower = d.lowerBetter;
  if (!results.length) return <section className="card"><p className="muted">No meet results yet. Add them from the Results tab — type them in or snap the score sheet.</p></section>;
  const cols = results.slice(-6);
  return (
    <section className="card">
      <div className="table-scroll"><table className="cmp">
        <thead><tr><th>Event</th>{cols.map((r) => <th key={r.meet_date + r.meet_name} title={r.meet_name}>{r.meet_name.split(" ").slice(0, 2).join(" ")}<br /><small>{fmt.date(r.meet_date)}</small></th>)}<th>Best</th></tr></thead>
        <tbody>
          {events.map((e) => { const x = analysis.events[e]; return (
            <tr key={e} className={analysis.weakest === e ? "weak" : ""}><th>{e}{analysis.weakest === e ? " ⚑" : ""}</th>{cols.map((r) => { const v = r.scores[e]; return <td key={r.meet_date + r.meet_name} className={x && v === x.best ? "pb" : ""}>{v == null ? "–" : fmtScore(v, d.athlete.sport)}</td>; })}<td><b>{x ? fmtScore(x.best, d.athlete.sport) : "–"}</b></td></tr>); })}
          {events.length > 1 && <tr className="tot"><th>Total</th>{cols.map((r) => <td key={r.meet_date + r.meet_name}><b>{fmtScore(r.aa, d.athlete.sport)}</b>{r.place ? <small> · {r.place}{["st", "nd", "rd"][r.place - 1] || "th"}</small> : null}</td>)}<td /></tr>}
        </tbody>
      </table></div>
      <ul className="insights">
        {Object.entries(analysis.events).filter(([, x]) => x.change != null).map(([e, x]) => <li key={e}><span className={`delta ${tone(x.change, lower)}`}>{arrow(x.change, lower)} {signed(x.change)}</span> {e}{x.pbLast ? " — personal best!" : ""}</li>)}
        {analysis.weakest && <li>⚑ {analysis.weakest} is her lowest event on average — a good focus for her plan.</li>}
      </ul>
      <p className="muted small">Gold cells = personal best. Comparisons use only meets you've recorded.</p>
    </section>
  );
}

function Stars({ value = 0, onChange, label }) {
  return <div className="stars" role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} className={n <= value ? "on" : ""} onClick={() => onChange(value === n ? 0 : n)}>★</button>)}</div>;
}
function VisPick({ value, onChange }) {
  return <div className="chips">{Object.entries(VIS).map(([k, l]) => <button type="button" key={k} className={`chip ${value === k ? "on" : ""}`} onClick={() => onChange(k)}>{k === "private" ? "🔒" : k === "staff" ? "👥" : "👪"} {l}</button>)}</div>;
}
function EvalForm({ athleteId, onSaved }) {
  const [f, setF] = useState({ ratings: {}, strengths: "", weaknesses: "", next_steps: "", body: "", visibility: "private" }); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api("coach/notes", { roster_id: athleteId, kind: "evaluation", ...f }); onSaved(); } catch (x) { setErr(x); setBusy(false); } }}>
      {RATINGS.map((k) => <div key={k} className="rate-row"><span className="grow">{k}</span><Stars label={k} value={f.ratings[k] || 0} onChange={(v) => setF({ ...f, ratings: { ...f.ratings, [k]: v } })} /></div>)}
      <Field label="Strengths"><textarea rows={2} value={f.strengths} onChange={set("strengths")} placeholder="Confident on beam, strong kick on floor" /></Field>
      <Field label="Needs work"><textarea rows={2} value={f.weaknesses} onChange={set("weaknesses")} placeholder="Kip timing; landings on vault" /></Field>
      <Field label="Next steps"><textarea rows={2} value={f.next_steps} onChange={set("next_steps")} /></Field>
      <Field label="Notes (optional)"><textarea rows={2} value={f.body} onChange={set("body")} /></Field>
      <p className="small">Who can see this?</p><VisPick value={f.visibility} onChange={(v) => setF({ ...f, visibility: v })} />
      <Button disabled={busy}>{busy ? "Saving…" : "Save evaluation"}</Button>
      <ErrorNote error={err} />
    </form>
  );
}

function PlanEditor({ athleteId, existing, onSaved }) {
  const blank = { focus: "", current: "", target: "", review_date: "", goals: [{ text: "", drills: "" }] };
  const [p, setP] = useState(existing?.plan || blank); const [vis, setVis] = useState(existing?.visibility || "parent"); const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(null); const [missing, setMissing] = useState(null);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const setGoal = (i, k, v) => setP({ ...p, goals: p.goals.map((g, j) => (j === i ? { ...g, [k]: v } : g)) });
  const save = async (status) => { setBusy(status); setErr(null); try { await api("coach/notes", existing?.id ? { id: existing.id, plan: p, visibility: vis, status } : { roster_id: athleteId, kind: "plan", plan: p, visibility: vis, status }); onSaved(); } catch (e) { setErr(e); setBusy(""); } };
  return (
    <div className="card form">
      <div className="ai-box">
        <Field label="✨ Draft with AI — what have you noticed? (optional)"><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Kip is late; she rushes her beam series" /></Field>
        <Button kind="ghost" className="sm" disabled={!!busy} onClick={async () => { setBusy("ai"); setErr(null); try { const r = await api("coach/draft", { roster_id: athleteId, kind: "plan", observations: obs }); setP(r.draft.plan); setMissing(r.missing); } catch (e) { setErr(e); } setBusy(""); }}>{busy === "ai" ? "Drafting from her results…" : "Draft a plan"}</Button>
        {missing && <p className="muted small">Would make it better: {missing}</p>}
        <p className="muted small">AI drafts from her results, attendance and your notes. Nothing is shared until you publish.</p>
      </div>
      <Field label="Focus"><input value={p.focus || ""} onChange={set("focus")} placeholder="Bars: kip consistency" /></Field>
      <div className="grid2"><Field label="Where she is now"><input value={p.current || ""} onChange={set("current")} /></Field><Field label="Target"><input value={p.target || ""} onChange={set("target")} /></Field></div>
      <Field label="Review date"><input type="date" value={p.review_date || ""} onChange={set("review_date")} /></Field>
      <p className="small"><b>Weekly goals & drills</b></p>
      {p.goals.map((g, i) => <div key={i} className="goal-row">
        <label className="check"><input type="checkbox" checked={!!g.done} onChange={(e) => setGoal(i, "done", e.target.checked)} aria-label="Done" /></label>
        <div className="grow"><input value={g.text || ""} onChange={(e) => setGoal(i, "text", e.target.value)} placeholder="Goal for the week" /><input value={g.drills || ""} onChange={(e) => setGoal(i, "drills", e.target.value)} placeholder="Drills" className="small" /></div>
        <button type="button" className="link" aria-label="Remove goal" onClick={() => setP({ ...p, goals: p.goals.filter((_, j) => j !== i) })}>×</button>
      </div>)}
      <button type="button" className="link" onClick={() => setP({ ...p, goals: [...p.goals, { text: "", drills: "" }] })}>＋ Add a goal</button>
      <p className="small">Who can see it?</p><VisPick value={vis} onChange={setVis} />
      <div className="row tight"><Button disabled={!!busy || !p.focus} onClick={() => save("published")}>{busy === "published" ? "Publishing…" : vis === "parent" ? "Publish to family" : "Publish"}</Button><Button kind="ghost" disabled={!!busy || !p.focus} onClick={() => save("draft")}>Save draft</Button></div>
      <ErrorNote error={err} />
    </div>
  );
}

function ReportEditor({ athleteId, onSaved }) {
  const [body, setBody] = useState(""); const [obs, setObs] = useState(""); const [busy, setBusy] = useState(""); const [err, setErr] = useState(null);
  const save = async (status) => { setBusy(status); setErr(null); try { await api("coach/notes", { roster_id: athleteId, kind: "report", body, visibility: "parent", status }); onSaved(); } catch (e) { setErr(e); setBusy(""); } };
  return (
    <div className="card form">
      <Field label="Anything to mention? (optional)"><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Great attitude this month; new back walkover" /></Field>
      <Button kind="ghost" className="sm" disabled={!!busy} onClick={async () => { setBusy("ai"); setErr(null); try { const r = await api("coach/draft", { roster_id: athleteId, kind: "report", observations: obs }); setBody(r.draft.body); } catch (e) { setErr(e); } setBusy(""); }}>{busy === "ai" ? "Writing…" : "✨ Draft a progress report"}</Button>
      <Field label="Progress report for the family"><textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write it yourself, or draft it with AI and edit." /></Field>
      <div className="row tight"><Button disabled={!!busy || body.trim().length < 10} onClick={() => save("published")}>{busy === "published" ? "Sending…" : "Share with family"}</Button><Button kind="ghost" disabled={!!busy || body.trim().length < 10} onClick={() => save("draft")}>Save draft</Button></div>
      <ErrorNote error={err} />
    </div>
  );
}

function Notes({ notes, athleteId, reload, onEditPlan }) {
  const [txt, setTxt] = useState(""); const [vis, setVis] = useState("private"); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const act = async (body) => { setErr(null); try { await api("coach/notes", body); reload(); } catch (e) { setErr(e); } };
  return (
    <div className="stack">
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await act({ roster_id: athleteId, kind: "note", body: txt, visibility: vis }); setTxt(""); setBusy(false); }}>
        <Field label="Quick note"><textarea rows={2} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Landed her first kip today!" /></Field>
        <VisPick value={vis} onChange={setVis} />
        <Button className="sm" disabled={busy || txt.trim().length < 2}>Add note</Button>
      </form>
      <ErrorNote error={err} />
      {notes.map((n) => (
        <section key={n.id} className="card note-card">
          <p className="small"><b>{{ note: "Note", evaluation: "Evaluation", plan: "Development plan", report: "Progress report" }[n.kind]}</b> · {fmt.date((n.created_at || "").slice(0, 10))} · <span className={`pill ${n.visibility === "parent" ? "pill-registered" : ""}`}>{VIS[n.visibility]}</span>{n.status === "draft" ? <span className="pill pill-warn">Draft</span> : null}</p>
          {n.ratings && Object.keys(n.ratings).length > 0 && <p className="small">{Object.entries(n.ratings).map(([k, v]) => `${k} ${"★".repeat(v)}`).join(" · ")}</p>}
          {n.strengths && <p className="small"><b>Strengths:</b> {n.strengths}</p>}
          {n.weaknesses && <p className="small"><b>Needs work:</b> {n.weaknesses}</p>}
          {n.next_steps && <p className="small"><b>Next:</b> {n.next_steps}</p>}
          {n.plan && <p className="small"><b>🎯 {n.plan.focus}</b>{n.plan.target ? ` → ${n.plan.target}` : ""} · {n.plan.goals?.filter((g) => g.done).length || 0}/{n.plan.goals?.length || 0} goals done{n.plan.review_date ? ` · review ${fmt.date(n.plan.review_date)}` : ""}</p>}
          {n.body && <p className="small pre">{n.body}</p>}
          <div className="row tight">
            {n.kind === "plan" && <button className="link small" onClick={() => onEditPlan(n)}>Edit plan</button>}
            {n.status === "draft" && <button className="link small" onClick={() => act({ id: n.id, status: "published" })}>Publish</button>}
            {n.visibility !== "parent" && n.kind !== "evaluation" && <button className="link small" onClick={() => act({ id: n.id, visibility: "parent", status: "published" })}>Share with family</button>}
            <button className="link small danger" onClick={() => act({ remove: n.id })}>Delete</button>
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------- Attendance ----------------
export function CoachAttendance() {
  const [day, setDay] = useState(today()); const [d, setD] = useState(null); const [err, setErr] = useState(null); const [grp, setGrp] = useState("");
  const load = () => api("coach/attendance", null, "GET", { day }).then(setD).catch(setErr);
  useEffect(() => { setD(null); load(); }, [day]);
  const mark = async (marks) => { setD((x) => ({ ...x, athletes: x.athletes.map((a) => { const m = marks.find((y) => y.roster_id === a.id); return m ? { ...a, status: m.status } : a; }) })); try { await api("coach/attendance", { day, marks }); } catch (e) { setErr(e); load(); } };
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const groups = [...new Set(d.athletes.map((a) => a.group || a.level).filter(Boolean))];
  const shown = d.athletes.filter((a) => !grp || (a.group || a.level) === grp);
  const here = shown.filter((a) => a.status === "present" || a.status === "late").length, marked = shown.filter((a) => a.status).length;
  return (
    <div className="stack">
      <div className="row tight"><input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} aria-label="Practice day" /><span className="grow muted small">{marked ? `${here} here · ${marked - here} out · ${shown.length - marked} not marked` : `${shown.length} athletes`}</span></div>
      <div className="chips">{["", ...groups].map((g) => <button key={g || "all"} className={`chip ${grp === g ? "on" : ""}`} onClick={() => setGrp(g)}>{g || "Everyone"}</button>)}</div>
      <Button kind="ghost" className="sm" onClick={() => mark(shown.filter((a) => !a.status).map((a) => ({ roster_id: a.id, status: "present" })))} disabled={!shown.some((a) => !a.status)}>✓ Everyone else is here</Button>
      <section className="card">
        {shown.map((a) => (
          <div key={a.id} className="att-row">
            <span className="grow"><b>{a.name}</b><small className="muted"> · {a.level || "—"}{a.last30.rate != null ? ` · ${a.last30.rate}%` : ""}{a.last30.missed >= 3 ? " · ⚠ " + a.last30.missed + " missed" : ""}</small></span>
            <div className="att-btns" role="radiogroup" aria-label={`${a.name} attendance`}>
              {[["present", "✓"], ["late", "L"], ["absent", "✗"], ["excused", "E"]].map(([s, l]) => <button key={s} role="radio" aria-checked={a.status === s} aria-label={s} className={`att-btn ${s} ${a.status === s ? "on" : ""}`} onClick={() => mark([{ roster_id: a.id, status: a.status === s ? null : s }])}>{l}</button>)}
            </div>
          </div>
        ))}
      </section>
      <p className="muted small center">✓ here · L late · ✗ absent · E excused. Saves as you tap.</p>
      <ErrorNote error={err} />
    </div>
  );
}

// ---------------- Results ----------------
export function CoachResults({ openAthlete }) {
  const [roster, setRoster] = useState(null); const [hist, setHist] = useState(null); const [mode, setMode] = useState("menu"); const [err, setErr] = useState(null); const [lvl, setLvl] = useState("");
  const load = () => Promise.all([api("coach/athletes", null, "GET"), api("coach/results", null, "GET")]).then(([a, r]) => { setRoster(a.athletes); setHist(r); }).catch(setErr);
  useEffect(() => { load(); }, []);
  if (!roster) return err ? <ErrorNote error={err} /> : <Spinner />;
  const levels = [...new Set(roster.map((a) => a.level).filter(Boolean))];
  if (mode === "sheet") return <SheetReader roster={roster} onDone={() => { setMode("menu"); load(); }} />;
  if (mode === "enter") return <EnterGrid roster={roster} onDone={() => { setMode("menu"); load(); }} />;
  const sel = roster.filter((a) => !lvl || a.level === lvl);
  const meets = (hist?.meets || []).slice(0, 6).reverse();
  return (
    <div className="stack">
      <div className="grid2">
        <button className="card find-cta" onClick={() => setMode("sheet")}><span className="find-icon" aria-hidden>📸</span><span className="grow"><b>Snap the score sheet</b><small>AI reads it and matches your athletes — you check before saving</small></span></button>
        <button className="card find-cta" onClick={() => setMode("enter")}><span className="find-icon" aria-hidden>⌨️</span><span className="grow"><b>Type scores in</b><small>One row per athlete, only her events</small></span></button>
      </div>
      <section className="card">
        <h3>Compare across meets</h3>
        <div className="chips">{["", ...levels].map((l) => <button key={l || "all"} className={`chip ${lvl === l ? "on" : ""}`} onClick={() => setLvl(l)}>{l || "All levels"}</button>)}</div>
        {!meets.length ? <p className="muted small">No results yet.</p> : <div className="table-scroll"><table className="cmp">
          <thead><tr><th>Athlete</th>{meets.map((m) => <th key={m.meet_date + m.meet_name} title={m.meet_name}>{m.meet_name.split(" ").slice(0, 2).join(" ")}<br /><small>{fmt.date(m.meet_date)}</small></th>)}<th>Trend</th></tr></thead>
          <tbody>{sel.map((a) => { const rs = hist.results.filter((r) => r.roster_id === a.id); if (!rs.length) return null; return (
            <tr key={a.id}><th><button className="link" onClick={() => openAthlete(a.id)}>{a.name}</button></th>{meets.map((m) => { const r = rs.find((x) => x.meet_name === m.meet_name && x.meet_date === m.meet_date); return <td key={m.meet_date + m.meet_name}>{r ? fmtScore(r.aa, a.sport) : "–"}</td>; })}<td className={`delta ${tone(a.trend, a.sport === "Swimming")}`}>{a.trend == null ? "" : `${arrow(a.trend)} ${abs(a.trend)}`}</td></tr>); })}</tbody>
        </table></div>}
        <p className="muted small">Tap a name for event-by-event history, personal bests and her weakest event.</p>
      </section>
      <ErrorNote error={err} />
    </div>
  );
}

function MeetHeader({ m, setM }) {
  return <div className="grid2"><Field label="Meet name"><input value={m.meet_name} onChange={(e) => setM({ ...m, meet_name: e.target.value })} placeholder="Turkey Invitational" /></Field><Field label="Date"><input type="date" value={m.meet_date} onChange={(e) => setM({ ...m, meet_date: e.target.value })} /></Field></div>;
}
function EnterGrid({ roster, onDone }) {
  const [m, setM] = useState({ meet_name: "", meet_date: today() }); const [lvl, setLvl] = useState(roster[0]?.level || ""); const [vals, setVals] = useState({}); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const levels = [...new Set(roster.map((a) => a.level).filter(Boolean))];
  const sel = roster.filter((a) => a.level === lvl);
  const set = (id, k, v) => setVals({ ...vals, [id]: { ...(vals[id] || {}), [k]: v } });
  const rows = Object.entries(vals).map(([roster_id, v]) => ({ roster_id, meet_name: m.meet_name, meet_date: m.meet_date, scores: v, place: v.place }));
  return (
    <div className="card form">
      <button className="link" onClick={onDone}>‹ Back</button>
      <MeetHeader m={m} setM={setM} />
      <div className="chips">{levels.map((l) => <button key={l} className={`chip ${lvl === l ? "on" : ""}`} onClick={() => setLvl(l)}>{l}</button>)}</div>
      {sel.map((a) => { const evs = eventsFor(a.sport, a.gender); return (
        <div key={a.id} className="enter-row"><b>{a.name}</b>
          <div className="enter-cells">{[...evs, "place"].map((e) => <label key={e}><small>{e === "place" ? "Place" : e}</small><input inputMode="decimal" value={vals[a.id]?.[e] || ""} onChange={(x) => set(a.id, e, x.target.value)} aria-label={`${a.name} ${e}`} /></label>)}</div>
        </div>); })}
      <Button disabled={busy || !m.meet_name || !rows.length} onClick={async () => { setBusy(true); setErr(null); try { await api("coach/results", { rows }); onDone(); } catch (e) { setErr(e); setBusy(false); } }}>{busy ? "Saving…" : `Save ${rows.length} result${rows.length === 1 ? "" : "s"}`}</Button>
      <ErrorNote error={err} />
    </div>
  );
}
function SheetReader({ roster, onDone }) {
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(null); const [r, setR] = useState(null); const [m, setM] = useState({ meet_name: "", meet_date: today() });
  const read = async (file) => { setBusy("read"); setErr(null); try { const out = await api("coach/scorecard", { image: await shrink(file) }); setR(out); setM({ meet_name: out.meet_name || "", meet_date: out.meet_date || today() }); } catch (e) { setErr(e); } setBusy(""); };
  const setRow = (i, k, v) => setR({ ...r, rows: r.rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const mine = r?.rows.filter((x) => x.roster_id) || [];
  return (
    <div className="card form">
      <button className="link" onClick={onDone}>‹ Back</button>
      {!r ? <>
        <p>Take a photo of the results sheet (or upload the PDF). We read every row and match names to your roster. <b>Nothing is saved until you check it.</b></p>
        <label className="btn btn-primary wide">{busy ? "Reading the sheet…" : "📸 Choose photo or PDF"}<input type="file" accept="image/*,application/pdf" capture="environment" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} /></label>
      </> : <>
        <MeetHeader m={m} setM={setM} />
        <p className="small">Found {r.rows.length} athletes — <b>{mine.length} are yours</b>. Fix any number or match, then save.</p>
        {r.rows.map((x, i) => (
          <div key={i} className={`enter-row ${x.roster_id ? "" : "dim"}`}>
            <div className="row tight"><b className="grow">{x.name}{x.gym ? <small className="muted"> · {x.gym}</small> : null}</b>
              <select value={x.roster_id || ""} onChange={(e) => setRow(i, "roster_id", e.target.value || null)} aria-label={`Match ${x.name}`}><option value="">Not my athlete</option>{roster.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.level}</option>)}</select></div>
            {x.roster_id && <div className="enter-cells">{Object.keys(x.scores).map((e) => <label key={e}><small>{e}</small><input inputMode="decimal" value={x.scores[e] ?? ""} onChange={(v) => setRow(i, "scores", { ...x.scores, [e]: v.target.value })} /></label>)}<label><small>Place</small><input inputMode="numeric" value={x.place ?? ""} onChange={(v) => setRow(i, "place", v.target.value)} /></label></div>}
          </div>
        ))}
        <Button disabled={!!busy || !m.meet_name || !mine.length} onClick={async () => { setBusy("save"); setErr(null); try { await api("coach/results", { rows: mine.map((x) => ({ roster_id: x.roster_id, meet_name: m.meet_name, meet_date: m.meet_date, level: r.level, scores: x.scores, aa: x.aa, place: x.place, source: "scorecard" })) }); onDone(); } catch (e) { setErr(e); setBusy(""); } }}>{busy === "save" ? "Saving…" : `Save ${mine.length} result${mine.length === 1 ? "" : "s"}`}</Button>
      </>}
      <ErrorNote error={err} />
    </div>
  );
}

// ---------------- Assistant ----------------
const ASK = ["Which athletes need attention this week?", "Who has missed more than three practices?", "Which gymnasts improved their beam scores the most?", "Which athletes haven't improved in their last three meets?", "Compare Maya's last two meets"];
export function CoachAssistant({ openAthlete }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [ans, setAns] = useState(null); const [err, setErr] = useState(null); const [names, setNames] = useState({});
  useEffect(() => { api("coach/athletes", null, "GET").then((r) => setNames(Object.fromEntries(r.athletes.map((a) => [a.id, a.name])))).catch(() => {}); }, []);
  const go = async (question) => { setQ(question); setBusy(true); setErr(null); setAns(null); try { setAns(await api("coach/ask", { question })); } catch (e) { setErr(e); } setBusy(false); };
  return (
    <div className="stack">
      <section className="card form">
        <h3>✨ Ask about your team</h3>
        <p className="muted small">Answers come only from your roster, roll calls, results and notes — with the numbers behind them.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) go(q.trim()); }}><Field label="Your question"><textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which athletes need attention this week?" /></Field><Button disabled={busy || !q.trim()}>{busy ? "Looking at your data…" : "Ask"}</Button></form>
        <div className="chips">{ASK.map((s) => <button key={s} className="chip" onClick={() => go(s)} disabled={busy}>{s}</button>)}</div>
      </section>
      {ans && <section className="card">
        <p className="pre">{ans.answer}</p>
        {!!ans.athletes?.length && <div className="chips">{ans.athletes.map((id) => <button key={id} className="chip" onClick={() => openAthlete(id)}>{names[id] || "Athlete"} ›</button>)}</div>}
        {ans.missing && <p className="muted small">To answer better, record: {ans.missing}</p>}
      </section>}
      <ErrorNote error={err} />
      {DEMO && <p className="muted small center">Demo answers are calculated from the sample team.</p>}
    </div>
  );
}

// ---------------- Parent portal: what the coach shared ----------------
export function FromCoach({ gymnast }) {
  const [d, setD] = useState(null);
  useEffect(() => { api("coach/family", null, "GET", { gymnast: gymnast.id }).then(setD).catch(() => setD(null)); }, [gymnast.id]);
  const best = useMemo(() => (d?.analysis ? Object.entries(d.analysis.events) : []), [d]);
  if (!d?.linked || (!d.feedback.length && !d.results.length)) return null;
  const plan = d.feedback.find((f) => f.kind === "plan");
  return (
    <section className="card from-coach">
      <h3>🧑‍🏫 From {gymnast.name}'s coach{d.gym ? <small className="muted"> · {d.gym}</small> : null}</h3>
      {plan && <div className="plan-box"><p><b>🎯 {plan.plan.focus}</b>{plan.plan.target ? <small> → {plan.plan.target}</small> : null}</p>
        <ul className="goals">{(plan.plan.goals || []).map((g, i) => <li key={i} className={g.done ? "done" : ""}>{g.done ? "✓" : "○"} {g.text}{g.drills ? <small className="muted"> — {g.drills}</small> : null}</li>)}</ul>
        {plan.plan.review_date && <p className="muted small">Coach reviews this on {fmt.date(plan.plan.review_date)}</p>}</div>}
      {d.feedback.filter((f) => f !== plan).slice(0, 3).map((f) => <div key={f.id} className="fb"><p className="small muted">{{ note: "Note", evaluation: "Evaluation", report: "Progress report", plan: "Plan" }[f.kind]} · {fmt.date(f.date)}</p>
        {f.strengths && <p className="small"><b>Strengths:</b> {f.strengths}</p>}{f.weaknesses && <p className="small"><b>Working on:</b> {f.weaknesses}</p>}{f.next_steps && <p className="small"><b>Next:</b> {f.next_steps}</p>}{f.body && <p className="small pre">{f.body}</p>}</div>)}
      {!!best.length && <div className="pb-row">{best.map(([e, x]) => <span key={e} className="pb-chip"><small>{e} best</small><b>{fmtScore(x.best, "Gymnastics")}</b>{x.change != null && <small className={`delta ${tone(x.change)}`}>{arrow(x.change)} {signed(x.change)}</small>}</span>)}</div>}
    </section>
  );
}
