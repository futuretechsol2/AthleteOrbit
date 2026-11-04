import React, { useEffect, useRef, useState } from "react";
import { db, api } from "../lib/db.js";
import { extractFrames } from "../lib/media.js";
import { EVENTS } from "../data/skills.js";
import { conf, sportOf, skillsForChild, nextLevel, usesScores } from "../data/sports.js";
import { Button, Field, ErrorNote, Spinner, Markdown, Empty, fmt } from "../ui.jsx";

const TABS = [["tips", "Tips"], ["chat", "Ask Coach G"], ["family", "Family assistant"], ["video", "Video check"], ["plan", "Level-up plan"], ["notes", "Saved"]];

export default function Coach({ gymnast, gymnasts = [], params, can, upgrade }) {
  const tabs = TABS.filter(([k]) => k !== "family" || gymnasts.length > 1);
  const [tab, setTab] = useState(params?.tab || "tips");
  useEffect(() => { if (params?.tab) setTab(params.tab); }, [params]);
  return (
    <div className="stack">
      <div className="page-head"><h1>AI Coach</h1></div>
      <div className="chips" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {!can("coach") && tab !== "notes" ? (
        <Empty icon="✨" title="The AI coach is in Pro" text="Weekly improvement and nutrition tips, answers about results, skills and event prep, get technique feedback from a short video, a level-up plan, and a family assistant that knows your costs and calendar." action={<Button onClick={() => upgrade("coach")}>See Pro</Button>} />
      ) : tab === "tips" ? <Tips gymnast={gymnast} /> : tab === "family" ? <Chat gymnast={gymnast} mode="family" /> : tab === "chat" ? <Chat gymnast={gymnast} /> : tab === "video" ? <Video gymnast={gymnast} /> : tab === "plan" ? <Plan gymnast={gymnast} /> : <Notes gymnast={gymnast} />}
    </div>
  );
}

const STARTERS = {
  Gymnastics: ["Why did beam score lower than practice?", "What should we focus on before the next meet?", "How do I help with a mental block without adding pressure?", "Explain execution deductions in simple words"],
  Swimming: ["How can we drop time in the 50 free?", "What should race day look like before the next meet?", "Are these times on track for the next group?", "How do I help with pre-race nerves?"],
  "Cheer & Dance": ["What usually causes deductions in a routine?", "How do we work toward the next tumbling skill safely?", "What should we prep before competition day?", "How do I help with nerves before going on the mat?"],
  Soccer: ["What can we practice at home with one ball?", "How do I help after a tough loss?", "What does this age group focus on?", "How do we build confidence with the weaker foot?"],
  Basketball: ["What ballhandling drills work in the driveway?", "How do we improve free-throw shooting?", "How do I help after a game with little playing time?", "What should this age group focus on?"],
  Tennis: ["How do we improve first-serve percentage?", "What should a match-day routine look like?", "How do I help with nerves in tiebreaks?", "What should we work on to move up a ball level?"],
};

const FAMILY_STARTERS = [
  "How much did we spend on sports this season?",
  "What do we need to prepare for the next meet?",
  "Which entry deadlines are coming up?",
  "Are we on track with our budget?",
];

function Chat({ gymnast, mode = "coach" }) {
  const fam = mode === "family"; const S = conf(sportOf(gymnast));
  const key = fam ? "gp-chat-family" : `gp-chat-${gymnast.id}`;
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem(key)) || []; } catch { return []; } });
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const end = useRef();
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(msgs.slice(-20))); } catch {} end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  async function send(q) {
    const content = (q ?? text).trim(); if (!content || busy) return;
    const next = [...msgs, { role: "user", content }];
    setMsgs(next); setText(""); setBusy(true); setErr(null);
    try { const { reply } = await api(fam ? "ai/family" : "ai/coach", { gymnastId: gymnast.id, messages: next }); setMsgs([...next, { role: "assistant", content: reply }]); }
    catch (e) { setErr(e); setMsgs(msgs); setText(content); }
    setBusy(false);
  }
  return (
    <section className="chat">
      {!msgs.length && (
        <div className="card">
          <p className="muted">{fam ? "Ask about every child's costs, budget, events, packing and calendar. Try:" : `Coach G knows ${gymnast.name}'s ${S.results.toLowerCase()}, ${S.level.toLowerCase()}, skills and coach notes. Try:`}</p>
          <div className="starters">{(fam ? FAMILY_STARTERS : STARTERS[sportOf(gymnast)] || STARTERS.Gymnastics).map((s) => <button key={s} className="starter" onClick={() => send(s)}>{s}</button>)}</div>
        </div>
      )}
      {msgs.map((m, i) => (
        <div key={i} className={`bubble ${m.role}`}>{m.role === "assistant" ? <Markdown text={m.content} /> : m.content}</div>
      ))}
      {busy && <div className="bubble assistant"><Spinner label={fam ? "Checking your family's data…" : "Coach G is thinking…"} /></div>}
      <ErrorNote error={err} />
      <div ref={end} />
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={fam ? "Ask about your family's sports…" : `Ask about ${gymnast.name}'s ${sportOf(gymnast).toLowerCase()}…`}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button disabled={busy || !text.trim()} aria-label="Send">Send</Button>
      </form>
      {msgs.length > 0 && <button className="link center" onClick={() => setMsgs([])}>Start a new conversation</button>}
      <p className="muted small center">AI guidance for parents. It doesn't replace your coach, doctor or physical therapist.</p>
    </section>
  );
}

function Video({ gymnast }) {
  const events = usesScores(gymnast) ? EVENTS[gymnast.program].map(([, l]) => l) : [...new Set(Object.values(conf(sportOf(gymnast)).skills || {}).flatMap((c) => Object.keys(c))), "Game / match play"];
  const [event, setEvent] = useState(events[0]);
  const [skill, setSkill] = useState(""); const [notes, setNotes] = useState("");
  const [frames, setFrames] = useState([]); const [busy, setBusy] = useState(""); const [err, setErr] = useState(null); const [out, setOut] = useState("");
  const input = useRef();
  const suggestions = skillsForChild(gymnast).filter((s) => s.event === event).map((s) => s.skill);
  async function pick(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setErr(null); setOut(""); setBusy("Pulling key frames from your video…");
    try { const { frames } = await extractFrames(f, 8); setFrames(frames); } catch (e2) { setErr(e2); }
    setBusy("");
  }
  async function analyze() {
    setErr(null); setBusy("Coach G is reviewing the frames…");
    try { const { feedback } = await api("ai/video", { gymnastId: gymnast.id, event, skill, notes, frames }); setOut(feedback); }
    catch (e2) { setErr(e2); }
    setBusy("");
  }
  return (
    <section className="stack">
      <div className="card">
        <p className="muted small">Film one skill or routine (up to 90 seconds), side-on if you can. Your video stays on your phone — only 8 small still frames are sent for review.</p>
        <div className="grid2">
          <Field label={usesScores(gymnast) ? "Event" : "Area"}><select value={event} onChange={(e) => setEvent(e.target.value)}>{events.map((l) => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Skill or routine"><input list="skill-sugg" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder={usesScores(gymnast) ? "e.g. Back walkover" : "e.g. " + (suggestions[0] || "Serve")} /></Field>
        </div>
        <datalist id="skill-sugg">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <Field label="Anything the coach said? (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Coach says hips are low on landing" /></Field>
        <Button kind={frames.length ? "ghost" : "primary"} className="wide" onClick={() => input.current.click()} disabled={!!busy}>🎥 {frames.length ? "Choose a different video" : "Record or choose video"}</Button>
        <input ref={input} type="file" accept="video/*" capture="environment" hidden onChange={pick} />
      </div>
      {frames.length > 0 && (
        <div className="card">
          <div className="frames">{frames.map((f, i) => <img key={i} src={f} alt={`Frame ${i + 1}`} />)}</div>
          {!out && <Button className="wide" onClick={analyze} disabled={!!busy}>Get technique feedback</Button>}
        </div>
      )}
      {busy && <Spinner label={busy} />}
      <ErrorNote error={err} />
      {out && <div className="card"><Markdown text={out} /><p className="muted small">Saved to your notes. Estimates from still frames can miss moments — share with your coach.</p></div>}
    </section>
  );
}

function Plan({ gymnast }) {
  const [busy, setBusy] = useState(false); const [plan, setPlan] = useState(""); const [err, setErr] = useState(null);
  const next = nextLevel(gymnast); const S = conf(sportOf(gymnast));
  async function run() {
    setBusy(true); setErr(null);
    try { const r = await api("ai/readiness", { gymnastId: gymnast.id }); setPlan(r.plan); } catch (e) { setErr(e); }
    setBusy(false);
  }
  return (
    <section className="stack">
      <div className="card">
        <h3>{gymnast.level}{next ? ` → ${next}` : ""}</h3>
        <p className="muted">Coach G reads {gymnast.name}'s skill checklist, recent {S.results.toLowerCase()} and coach notes, then writes a 4–6 week focus plan. Update Progress first for the best plan.</p>
        <Button className="wide" onClick={run} disabled={busy}>{busy ? "Writing plan…" : plan ? "Write a fresh plan" : "Build level-up plan"}</Button>
      </div>
      {busy && <Spinner label="Writing the plan…" />}
      <ErrorNote error={err} />
      {plan && <div className="card"><Markdown text={plan} /></div>}
    </section>
  );
}

function Notes({ gymnast }) {
  const [rows, setRows] = useState(null); const [open, setOpen] = useState(null);
  useEffect(() => { db.list("ai_notes", { gymnast_id: gymnast.id }).then(setRows); }, [gymnast.id]);
  if (!rows) return <div className="skeleton" />;
  if (!rows.length) return <Empty icon="📝" title="No saved notes yet" text="Video feedback and level-up plans are saved here so you can look back before the next event." />;
  return rows.map((n) => (
    <div key={n.id} className="card">
      <button className="note-head" onClick={() => setOpen(open === n.id ? null : n.id)}>
        <span><b>{n.title}</b><small className="muted"> · {fmt.date(n.created_at?.slice(0, 10))}</small></span><span>{open === n.id ? "−" : "+"}</span>
      </button>
      {open === n.id && <><Markdown text={n.body} /><button className="link danger" onClick={async () => { await db.remove("ai_notes", n.id); setRows(rows.filter((r) => r.id !== n.id)); }}>Delete note</button></>}
    </div>
  ));
}

// One tap: personal improvement tips or kid-safe fueling tips for this child's sport.
function Tips({ gymnast }) {
  const S = conf(sportOf(gymnast));
  const [busy, setBusy] = useState(""); const [out, setOut] = useState(null); const [err, setErr] = useState(null);
  async function run(kind) {
    setBusy(kind); setErr(null); setOut(null);
    try { const r = await api("ai/tips", { gymnastId: gymnast.id, kind }); setOut({ kind, text: r.tips }); } catch (e) { setErr(e); }
    setBusy("");
  }
  return (
    <section className="stack">
      <div className="tip-grid">
        <button className="card tip-btn" onClick={() => run("improve")} disabled={!!busy}><span aria-hidden>📈</span><b>Improvement tips</b><small className="muted">What to work on this week, from {gymnast.name}'s {S.results.toLowerCase()}, skills and coach notes</small></button>
        <button className="card tip-btn" onClick={() => run("nutrition")} disabled={!!busy}><span aria-hidden>🥗</span><b>Nutrition tips</b><small className="muted">Kid-friendly fueling for practice and {S.event.toLowerCase()} day, snacks and hydration</small></button>
      </div>
      {busy && <Spinner label={busy === "nutrition" ? "Building a fueling plan…" : "Coach G is reviewing the season…"} />}
      <ErrorNote error={err} />
      {out && <div className="card"><h3>{out.kind === "nutrition" ? "🥗 Nutrition tips" : "📈 Improvement tips"}</h3><Markdown text={out.text} /><p className="muted small">Saved under Saved. {out.kind === "nutrition" ? "General guidance, not medical advice." : "Share with your coach before trying anything new."}</p></div>}
    </section>
  );
}
