import React, { useEffect, useRef, useState } from "react";
import { db, api } from "../lib/db.js";
import { EVENTS } from "../data/skills.js";
import { conf, sportOf, skillsForChild, nextLevel, usesScores } from "../data/sports.js";
import { Button, Field, ErrorNote, Spinner, Markdown, Empty, fmt } from "../ui.jsx";

const TABS = [["chat", "💬 Ask Coach G"], ["nutrition", "🥗 Nutrition"], ["tips", "📈 Improve"], ["plan", "🪜 Level-up plan"], ["notes", "Saved"]];

export default function Coach({ gymnast, gymnasts = [], params, can, upgrade }) {
  const tabs = TABS;
  const [tab, setTab] = useState(params?.tab === "video" || params?.tab === "family" ? "chat" : params?.tab || "chat");
  useEffect(() => { if (params?.tab && TABS.some(([k]) => k === params.tab)) setTab(params.tab); }, [params]);
  const S = conf(sportOf(gymnast));
  return (
    <div className="stack">
      <section className="coach-hero">
        <span className="coach-avatar" aria-hidden>✦</span>
        <div><p className="eyebrow">AI coach & nutrition</p><h1>Coach G for {gymnast.name}</h1><p className="hero-sub">Knows {gymnast.name}'s {S.results.toLowerCase()}, {S.level.toLowerCase()} and next {S.event.toLowerCase()}. Ask anything, any time.</p></div>
      </section>
      <div className="chips" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {!can("coach") && tab !== "notes" ? (
        <Empty icon="✨" title="Coach G is in Pro" text="Ask about results, skills, nerves and event prep any time, get a meet-day food plan written for your child, weekly improvement tips and a level-up plan." action={<Button onClick={() => upgrade("coach")}>See Pro</Button>} />
      ) : tab === "tips" ? <Tips gymnast={gymnast} /> : tab === "nutrition" ? <Nutrition gymnast={gymnast} /> : tab === "chat" ? <Chat gymnast={gymnast} /> : tab === "plan" ? <Plan gymnast={gymnast} /> : <Notes gymnast={gymnast} />}
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
  Volleyball: ["How can we make her serve more consistent?", "What should a tournament day look like?", "How do I help after a bench-heavy tournament?", "What passing drills work at home?"],
  "Baseball & Softball": ["How do we get out of a hitting slump?", "What should we practice in the backyard?", "How do I help after a tough game?", "How much pitching is safe at this age?"],
  "Martial Arts": ["How do we practice forms at home?", "What should tournament day look like?", "How do I help with sparring nerves?", "What does the next belt usually need?"],
  "Music & Performing Arts": ["How do we handle stage fright before a recital?", "What does a good practice week look like?", "How do we prepare for an adjudicated festival?", "How do I keep practice from becoming a fight?"],
  "Academics & STEM": ["How do we prepare for the next competition?", "How do I help after a disappointing round?", "What does a good practice schedule look like?", "How do we stay calm under a time limit?"],
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
  if (!rows.length) return <Empty icon="📝" title="No saved notes yet" text="Tips, food plans and level-up plans are saved here so you can look back before the next event." />;
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
// Nutrition front and center: one tap for a plan written for this child and the next event.
const FOODS = [["meetday", "🏅", "Event-day food plan", "Timeline from breakfast to the last session, with snacks to pack"], ["practice", "🍌", "Practice-day fueling", "What to eat before and after practice, school-night friendly"], ["week", "🗓️", "Healthy week of meals", "7 simple family dinners and lunchbox ideas for an athlete"], ["hydration", "💧", "Hydration & recovery", "How much to drink, what to drink, sleep and rest days"]];
function Nutrition({ gymnast }) {
  const S = conf(sportOf(gymnast));
  const [busy, setBusy] = useState(""); const [out, setOut] = useState(null); const [err, setErr] = useState(null);
  async function run(focus) {
    setBusy(focus); setErr(null); setOut(null);
    try { const r = await api("ai/tips", { gymnastId: gymnast.id, kind: "nutrition", focus }); setOut({ focus, text: r.tips }); } catch (e) { setErr(e); }
    setBusy("");
  }
  const label = (f) => FOODS.find((x) => x[0] === f)?.[2];
  return (
    <section className="stack">
      <div className="tip-grid">
        {FOODS.map(([k, i, t, d]) => <button key={k} className={`card tip-btn ${busy === k ? "busy" : ""}`} onClick={() => run(k)} disabled={!!busy}><span aria-hidden>{i}</span><b>{t.replace("Event", S.event)}</b><small className="muted">{d.replace("practice", "practice")}</small></button>)}
      </div>
      {busy && <Spinner label="Writing a plan for your athlete…" />}
      <ErrorNote error={err} />
      {out && <div className="card"><h3>🥗 {label(out.focus)?.replace("Event", S.event)} for {gymnast.name}</h3><Markdown text={out.text} /><p className="muted small">Saved under Saved. General guidance, not medical advice — for allergies or medical needs ask your pediatrician.</p></div>}
    </section>
  );
}

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
        <button className="card tip-btn" onClick={() => run("nutrition")} disabled={!!busy}><span aria-hidden>🥗</span><b>Quick nutrition tips</b><small className="muted">Kid-friendly fueling for practice and {S.event.toLowerCase()} day, snacks and hydration</small></button>
      </div>
      {busy && <Spinner label={busy === "nutrition" ? "Building a fueling plan…" : "Coach G is reviewing the season…"} />}
      <ErrorNote error={err} />
      {out && <div className="card"><h3>{out.kind === "nutrition" ? "🥗 Nutrition tips" : "📈 Improvement tips"}</h3><Markdown text={out.text} /><p className="muted small">Saved under Saved. {out.kind === "nutrition" ? "General guidance, not medical advice." : "Share with your coach before trying anything new."}</p></div>}
    </section>
  );
}
