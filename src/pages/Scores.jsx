import React, { useEffect, useRef, useState } from "react";
import { db, api } from "../lib/db.js";
import { resizeImage } from "../lib/media.js";
import { EVENTS, LEVELS, allAround, eventsCompeted } from "../data/skills.js";
import { Button, Field, Sheet, Empty, ErrorNote, Spinner, fmt, today } from "../ui.jsx";
import Qualifiers from "../components/Qualifiers.jsx";

export default function Scores({ gymnast, params, can, upgrade, refresh }) {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const [snap, setSnap] = useState(false); const [online, setOnline] = useState(false); const [pending, setPending] = useState([]);
  const load = () => Promise.all([db.list("scores", { gymnast_id: gymnast.id }).then(setRows), db.list("score_imports", { gymnast_id: gymnast.id }).then((r) => setPending(r.filter((x) => x.status === "pending"))).catch(() => {})]);
  useEffect(() => { load(); }, [gymnast.id]);
  useEffect(() => {
    if (params?.add) setEdit({});
    if (params?.snap) can("snap") ? setSnap(true) : upgrade("snap");
    if (params?.online) can("onlineScores") ? setOnline(true) : upgrade("onlineScores");
  }, [params]);
  const reviewImport = (imp) => { const sc = imp.data?.scores || {}; setEdit({ ...sc, meet_date: sc.meet_date || today(), meet_name: sc.meet_name || "", level: sc.level && LEVELS[gymnast.program]?.includes(sc.level) ? sc.level : gymnast.level, _fromPhoto: sc, _importId: imp.id }); };

  if (!rows) return <div className="skeleton" />;
  const withAA = rows.map((r) => ({ ...r, aa: allAround(r), n: eventsCompeted(r) }));
  const best = Math.max(0, ...withAA.map((r) => r.aa || 0));
  const events = EVENTS[gymnast.program];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Scores</h1>
        <div className="row tight">
          <Button onClick={() => setEdit({})}>＋ Add</Button>
        </div>
      </div>
      <div className="pull-row">
        <button className="card pull-btn" onClick={() => (can("onlineScores") ? setOnline(true) : upgrade("onlineScores"))}><span aria-hidden>🌐</span><b>Pull scores online</b><small className="muted">From MeetScoresOnline</small>{!can("onlineScores") && <span className="lock">Plus</span>}</button>
        <button className="card pull-btn" onClick={() => (can("snap") ? setSnap(true) : upgrade("snap"))}><span aria-hidden>📷</span><b>Snap score sheet</b><small className="muted">AI reads the photo</small>{!can("snap") && <span className="lock">Pro</span>}</button>
      </div>
      {pending.map((imp) => (
        <div key={imp.id} className="card found-card">
          <div className="grow"><b>🎉 New scores found online</b><p className="small muted">{imp.data?.scores?.meet_name || "Meet"} · {fmt.date(imp.data?.scores?.meet_date || imp.created_at?.slice(0, 10))}</p></div>
          <div className="row tight"><Button onClick={() => reviewImport(imp)}>Review & save</Button><button className="link" onClick={async () => { await db.update("score_imports", imp.id, { status: "dismissed" }); load(); }}>Dismiss</button></div>
        </div>
      ))}
      <Qualifiers gymnast={gymnast} locked={!can("qualifiers")} onLocked={() => upgrade("qualifiers")} examples={`"State meet: 34.00 AA"`}
        options={[["aa", "All-around", "higher"], ...events.map(([k, l]) => [k, l, "higher"])]}
        bestOf={(m) => { const v = withAA.map((r) => (m === "aa" ? r.aa : r[m])).filter((x) => x != null && !isNaN(x)).map(Number); return v.length ? Math.max(...v) : null; }} />
      {!withAA.length && <Empty icon="🏅" title="No meets yet" text="Add scores after each meet, or snap a photo of the score sheet and let the app read it." action={<Button onClick={() => setEdit({})}>Add first meet</Button>} />}
      {[...withAA].reverse().map((r) => (
        <button key={r.id} className={`card score-card ${r.aa === best && best ? "is-best" : ""}`} onClick={() => setEdit(r)}>
          <div className="score-top">
            <div>
              <h3>{r.meet_name}</h3>
              <p className="muted small">{fmt.date(r.meet_date)}{r.level ? ` · ${r.level}` : ""}{r.aa_place ? ` · AA place ${r.aa_place}` : ""}</p>
            </div>
            <div className="aa">
              <span>{fmt.score(r.aa)}</span>
              <small>{r.aa === best && best ? "★ Season best" : "All-around"}</small>
            </div>
          </div>
          <div className="events">
            {events.map(([k, label]) => (
              <div key={k} className="ev"><small>{label.replace("Uneven ", "").replace("Balance ", "")}</small><b>{fmt.score(r[k])}</b></div>
            ))}
          </div>
        </button>
      ))}
      {edit && <ScoreForm gymnast={gymnast} row={edit} onClose={() => setEdit(null)} onSaved={async () => { if (edit._importId) await db.update("score_imports", edit._importId, { status: "saved" }).catch(() => {}); setEdit(null); load(); }} />}
      {online && <OnlineSheet gymnast={gymnast} onClose={() => setOnline(false)} onRead={(sc) => { setOnline(false); setEdit({ ...sc, level: sc.level && LEVELS[gymnast.program]?.includes(sc.level) ? sc.level : gymnast.level, meet_date: sc.meet_date || today(), meet_name: sc.meet_name || "", _fromPhoto: sc }); }} />}
      {snap && <SnapSheet gymnast={gymnast} onClose={() => setSnap(false)} onRead={(s) => { setSnap(false); setEdit({ ...s, _fromPhoto: s }); }} />}
    </div>
  );
}

function ScoreForm({ gymnast, row, onClose, onSaved }) {
  const events = EVENTS[gymnast.program];
  const [f, setF] = useState({
    meet_name: row.meet_name || "", meet_date: row.meet_date || today(), level: row.level || gymnast.level,
    aa_place: row.aa_place ?? "", notes: row.notes || "",
    ...Object.fromEntries(events.map(([k]) => [k, row[k] ?? ""])),
  });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const aa = allAround(f);
  const photo = row._fromPhoto;

  async function save(e) {
    e.preventDefault(); setErr(null);
    if (!f.meet_name.trim()) return setErr(new Error("Add the meet name."));
    for (const [k, label] of events) {
      if (f[k] !== "" && (isNaN(Number(f[k])) || Number(f[k]) < 0 || Number(f[k]) > 20)) return setErr(new Error(`${label} score looks off.`));
    }
    setBusy(true);
    const rec = { gymnast_id: gymnast.id, meet_name: f.meet_name.trim(), meet_date: f.meet_date, level: f.level, notes: f.notes || null,
      aa_place: f.aa_place === "" ? null : parseInt(f.aa_place, 10) };
    for (const [k] of events) rec[k] = f[k] === "" ? null : Number(f[k]);
    try { row.id ? await db.update("scores", row.id, rec) : await db.insert("scores", rec); onSaved(); }
    catch (e2) { setErr(e2); setBusy(false); }
  }
  async function del() {
    if (!confirm("Delete this meet's scores?")) return;
    await db.remove("scores", row.id); onSaved();
  }

  return (
    <Sheet title={row.id ? "Edit scores" : "Add scores"} onClose={onClose}>
      <form onSubmit={save} className="form">
        {photo && <div className={`note ${photo.confidence === "high" ? "note-ok" : "note-warn"}`}>Read from your photo ({photo.confidence} confidence). Check every number before saving.{photo.notes ? ` ${photo.notes}` : ""}</div>}
        <Field label="Meet"><input value={f.meet_name} onChange={set("meet_name")} placeholder="e.g. Queen City Cup" required /></Field>
        <div className="grid2">
          <Field label="Date"><input type="date" value={f.meet_date} onChange={set("meet_date")} required /></Field>
          <Field label="Level"><select value={f.level} onChange={set("level")}>{LEVELS[gymnast.program].map((l) => <option key={l}>{l}</option>)}</select></Field>
        </div>
        <div className="grid2">
          {events.map(([k, label]) => (
            <Field key={k} label={label}><input inputMode="decimal" value={f[k]} onChange={set(k)} placeholder="9.250" /></Field>
          ))}
        </div>
        <div className="grid2">
          <Field label="All-around place"><input inputMode="numeric" value={f.aa_place} onChange={set("aa_place")} placeholder="optional" /></Field>
          <div className="aa-live"><small>All-around</small><b>{fmt.score(aa)}</b></div>
        </div>
        <Field label="Notes"><textarea rows={2} value={f.notes} onChange={set("notes")} placeholder="Fell on beam, new skill on floor…" /></Field>
        <ErrorNote error={err} />
        <div className="row end">
          {row.id && <Button type="button" kind="danger" onClick={del}>Delete</Button>}
          <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Sheet>
  );
}

function SnapSheet({ gymnast, onClose, onRead }) {
  const input = useRef(); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const [preview, setPreview] = useState(null);
  async function pick(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setErr(null); setBusy(true);
    try {
      const img = await resizeImage(file);
      setPreview(img);
      const { scores } = await api("ai/scoresheet", { image: img, program: gymnast.program, nameHint: gymnast.name });
      onRead({ ...scores, level: scores.level && LEVELS[gymnast.program].includes(scores.level) ? scores.level : gymnast.level, meet_date: scores.meet_date || today(), meet_name: scores.meet_name || "" });
    } catch (e2) { setErr(e2); setBusy(false); }
  }
  return (
    <Sheet title="Snap a score sheet" onClose={onClose}>
      <p className="muted">Take a clear, straight-on photo of the score sheet or award slip. You'll review every number before it's saved.</p>
      {preview && <img src={preview} alt="Score sheet preview" className="preview" />}
      {busy ? <Spinner label="Reading scores…" /> : (
        <Button onClick={() => input.current.click()} className="wide">📷 Take or choose photo</Button>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <ErrorNote error={err} />
    </Sheet>
  );
}

// Pull this athlete's scores from an online results page (MeetScoresOnline). Paste the meet's results link;
// if the site won't let us read it, paste the results text instead.
function OnlineSheet({ gymnast, onClose, onRead }) {
  const [meets, setMeets] = useState([]);
  const [f, setF] = useState({ name: gymnast.results_name || gymnast.name, url: "", text: "", meetId: "" });
  const [mode, setMode] = useState("link"); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  useEffect(() => { db.list("meets", { gymnast_id: gymnast.id }).then((m) => { const recent = m.filter((x) => x.start_date <= today()).reverse(); setMeets(recent); const withUrl = recent.find((x) => x.results_url); if (withUrl) setF((p) => ({ ...p, url: withUrl.results_url, meetId: withUrl.id })); }).catch(() => {}); }, [gymnast.id]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api("scores/online", { gymnastId: gymnast.id, athleteName: f.name.trim(), ...(mode === "link" ? { url: f.url.trim(), meetId: f.meetId || undefined } : { text: f.text }) });
      onRead(r.scores || {});
    } catch (e2) { setErr(e2); setBusy(false); }
  }
  const oneWord = f.name.trim().split(/\s+/).length < 2;
  return (
    <Sheet title="Pull scores online" onClose={onClose}>
      <form className="form" onSubmit={go}>
        <p className="muted small">Find the meet on <a href="https://www.meetscoresonline.com" target="_blank" rel="noreferrer">MeetScoresOnline</a>, copy the results page link and paste it here. We find {gymnast.name}'s row and you check the numbers before saving.</p>
        <Field label="Name exactly as on the results" hint={oneWord ? "Add the last name too, e.g. Maya Patel" : "We remember this for next time"}><input value={f.name} onChange={set("name")} required autoComplete="off" /></Field>
        <div className="seg" role="tablist"><button type="button" className={mode === "link" ? "on" : ""} onClick={() => setMode("link")}>Results link</button><button type="button" className={mode === "text" ? "on" : ""} onClick={() => setMode("text")}>Paste results text</button></div>
        {mode === "link" ? <>
          <Field label="Results page link"><input type="url" inputMode="url" value={f.url} onChange={set("url")} placeholder="https://www.meetscoresonline.com/…" required /></Field>
          {meets.length > 0 && <Field label="Which meet is this? (optional)" hint="We save the link on the meet and check it automatically next time"><select value={f.meetId} onChange={set("meetId")}><option value="">—</option>{meets.slice(0, 15).map((m) => <option key={m.id} value={m.id}>{m.name} · {fmt.date(m.start_date)}</option>)}</select></Field>}
        </> : <Field label="Results text" hint="On the results page: select all, copy, then paste here"><textarea rows={6} value={f.text} onChange={set("text")} required /></Field>}
        <ErrorNote error={err} />
        {err && mode === "link" && <button type="button" className="link" onClick={() => setMode("text")}>Site not loading? Paste the results text instead →</button>}
        <Button className="wide" disabled={busy || oneWord}>{busy ? "Looking for scores…" : "Find scores"}</Button>
        {busy && <Spinner label="Reading the results page…" />}
      </form>
    </Sheet>
  );
}
