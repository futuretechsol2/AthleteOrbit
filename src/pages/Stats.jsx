import React, { useEffect, useState } from "react";
import { db, api } from "../lib/db.js";
import { resizeImage } from "../lib/media.js";
import { SPORT_PRESETS } from "../data/skills.js";
import { conf, sportOf } from "../data/sports.js";
import Qualifiers from "../components/Qualifiers.jsx";
import { personalRecords, fmtValue } from "../data/family.js";
import { Button, Field, Sheet, Empty, ErrorNote, Spinner, TrendChart, fmt, today } from "../ui.jsx";

// Results for a child in another sport: any metric, personal records, a trend per metric.
export default function Stats({ gymnast, params, can, upgrade }) {
  const [rows, setRows] = useState(null); const [edit, setEdit] = useState(null); const [metric, setMetric] = useState(""); const [snap, setSnap] = useState(false);
  const S = conf(sportOf(gymnast));
  const load = () => db.list("stats", { gymnast_id: gymnast.id }).then(setRows);
  useEffect(() => { load(); }, [gymnast.id]);
  useEffect(() => { if (params?.add) setEdit({}); if (params?.snap && S.photoImport) can("snap") ? setSnap(true) : upgrade("snap"); }, [params]);
  if (!rows) return <div className="skeleton" />;
  const prs = personalRecords(rows);
  const metrics = Object.keys(prs);
  const sel = metric && metrics.includes(metric) ? metric : metrics[0];
  const series = rows.filter((r) => r.metric === sel);
  const lowerBetter = series[0]?.better === "lower";
  return (
    <div className="stack">
      <div className="page-head"><h1>{S.results}</h1><div className="row tight">{S.photoImport && <Button kind="ghost" onClick={() => (can("snap") ? setSnap(true) : upgrade("snap"))}>📷 Snap{!can("snap") ? " · Pro" : ""}</Button>}<Button onClick={() => setEdit({})}>＋ Add</Button></div></div>
      <p className="muted small">{S.icon} {sportOf(gymnast)} · {gymnast.level}{gymnast.club ? ` · ${gymnast.club}` : ""}</p>
      {!rows.length && <Empty icon="⏱️" title="No results yet" text={`Log ${S.results.toLowerCase()} after each ${S.event.toLowerCase()}. Personal records are marked automatically.${S.photoImport ? " Or snap a photo of the results sheet." : ""}`} action={<Button onClick={() => setEdit({})}>Add first result</Button>} />}
      <Qualifiers gymnast={gymnast} locked={!can("qualifiers")} onLocked={() => upgrade("qualifiers")} examples={sportOf(gymnast) === "Swimming" ? `"Champs cut: 50 Free 33.49"` : `"Regionals: score 90"`}
        options={[...new Map([...(S.metrics || []), ...rows.map((r) => [r.metric, r.unit, r.better])].map(([m, u, b]) => [m, [m, m, b || "higher"]])).values()]}
        bestOf={(m, better) => { const v = rows.filter((r) => r.metric === m).map((r) => Number(r.value)); return v.length ? (better === "lower" ? Math.min(...v) : Math.max(...v)) : null; }} />
      {metrics.length > 0 && (
        <section className="card">
          <h3>Personal records</h3>
          <div className="pr-grid">
            {metrics.map((m) => (
              <button key={m} className={`pr ${m === sel ? "on" : ""}`} onClick={() => setMetric(m)}>
                <small>{m}</small><b>{fmtValue(prs[m].value, prs[m].unit)}</b><small className="muted">{fmt.date(prs[m].event_date)}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {series.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>{sel}</h3><span className="muted small">{lowerBetter ? "Lower is better" : "Higher is better"}</span></div>
          <TrendChart label={sel} points={series.map((r) => ({ y: Number(r.value), label: r.event_name || r.event_date, short: fmt.short(r.event_date), best: prs[sel].id === r.id }))} />
        </section>
      )}
      {[...rows].reverse().map((r) => (
        <button key={r.id} className={`card list-row ${prs[r.metric]?.id === r.id ? "is-pr" : ""}`} onClick={() => setEdit(r)}>
          <div className="grow"><b>{r.metric}</b><p className="muted small">{fmt.date(r.event_date)}{r.event_name ? ` · ${r.event_name}` : ""}</p></div>
          <div className="right"><b>{fmtValue(r.value, r.unit)}</b>{prs[r.metric]?.id === r.id && <span className="pill pill-gold">PR</span>}</div>
        </button>
      ))}
      {snap && <SnapResults gymnast={gymnast} onClose={() => setSnap(false)} onSaved={() => { setSnap(false); load(); }} />}
      {edit && <StatForm gymnast={gymnast} row={edit} last={rows[rows.length - 1]} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function StatForm({ gymnast, row, last, onClose, onSaved }) {
  const presets = conf(sportOf(gymnast)).metrics || SPORT_PRESETS[gymnast.sport] || [];
  const [f, setF] = useState({ event_date: row.event_date || today(), event_name: row.event_name || last?.event_name || "", metric: row.metric || presets[0]?.[0] || "",
    value: row.value ?? "", unit: row.unit ?? presets[0]?.[1] ?? "", better: row.better || presets[0]?.[2] || "higher", notes: row.notes || "" });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function pickPreset(name) {
    const p = presets.find((x) => x[0] === name);
    setF({ ...f, metric: name, ...(p ? { unit: p[1], better: p[2] } : {}) });
  }
  async function save(e) {
    e.preventDefault();
    let v = String(f.value).trim();
    if (f.unit === "sec" && v.includes(":")) { const [m, s] = v.split(":"); v = Number(m) * 60 + Number(s); }
    v = Number(v);
    if (!f.metric.trim() || isNaN(v)) return setErr(new Error("Add what you measured and a number (times can be 1:05.30)."));
    const rec = { gymnast_id: gymnast.id, event_date: f.event_date, event_name: f.event_name || null, metric: f.metric.trim(), value: v, unit: f.unit || null, better: f.better, notes: f.notes || null };
    try { row.id ? await db.update("stats", row.id, rec) : await db.insert("stats", rec); onSaved(); } catch (e2) { setErr(e2); }
  }
  return (
    <Sheet title={row.id ? "Edit result" : "Add result"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {presets.length > 0 && <div className="chips">{presets.map(([n]) => <button type="button" key={n} className={`chip ${f.metric === n ? "on" : ""}`} onClick={() => pickPreset(n)}>{n}</button>)}</div>}
        <div className="grid2">
          <Field label="What"><input value={f.metric} onChange={set("metric")} placeholder="50 Free, Goals, 100m…" required /></Field>
          <Field label={f.unit === "sec" ? "Time (35.20 or 1:05.30)" : "Value"}><input inputMode="decimal" value={f.value} onChange={set("value")} required /></Field>
        </div>
        <div className="grid2">
          <Field label="Unit"><input value={f.unit} onChange={set("unit")} placeholder="sec, goals, pts" /></Field>
          <Field label="Personal record is"><select value={f.better} onChange={set("better")}><option value="lower">Lower (times)</option><option value="higher">Higher (points, goals)</option></select></Field>
        </div>
        <div className="grid2">
          <Field label="Date"><input type="date" value={f.event_date} onChange={set("event_date")} required /></Field>
          <Field label={conf(sportOf(gymnast)).event}><input value={f.event_name} onChange={set("event_name")} /></Field>
        </div>
        <ErrorNote error={err} />
        <div className="row end">
          {row.id && <Button type="button" kind="danger" onClick={async () => { await db.remove("stats", row.id); onSaved(); }}>Delete</Button>}
          <Button>Save</Button>
        </div>
      </form>
    </Sheet>
  );
}

// Photo of a heat sheet / results printout / score sheet → reviewed list → saved results.
function SnapResults({ gymnast, onClose, onSaved }) {
  const S = conf(sportOf(gymnast));
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(null); const [r, setR] = useState(null);
  const input = React.useRef();
  async function pick(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setErr(null); setBusy("Reading the results…");
    try {
      const image = await resizeImage(f);
      const out = await api("ai/scoresheet", { image, sport: sportOf(gymnast), nameHint: gymnast.name });
      setR({ ...out, event_date: out.event_date || today(), results: (out.results || []).map((x) => ({ ...x, keep: true })) });
    } catch (e2) { setErr(e2); }
    setBusy("");
  }
  async function save() {
    setBusy("Saving…");
    try {
      for (const x of r.results.filter((y) => y.keep)) {
        const m = (S.metrics || []).find((y) => y[0] === x.metric);
        await db.insert("stats", { gymnast_id: gymnast.id, event_date: r.event_date, event_name: r.event_name || null, metric: x.metric, value: Number(x.value), unit: x.unit || m?.[1] || null, better: m?.[2] || (x.unit === "sec" ? "lower" : "higher"), notes: x.place ? `Place ${x.place}` : null });
      }
      onSaved();
    } catch (e2) { setErr(e2); setBusy(""); }
  }
  return (
    <Sheet title={`Snap ${S.results.toLowerCase()}`} onClose={onClose}>
      {!r ? <div className="stack">
        <p className="muted">Take a clear photo of the {sportOf(gymnast) === "Swimming" ? "results printout or Meet Mobile screen" : "score sheet"} with {gymnast.name}'s name on it. The photo is read and then discarded.</p>
        <Button className="wide" onClick={() => input.current.click()} disabled={!!busy}>📷 Take or choose photo</Button>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      </div> : <div className="form">
        <div className="grid2">
          <Field label={S.event}><input value={r.event_name || ""} onChange={(e) => setR({ ...r, event_name: e.target.value })} /></Field>
          <Field label="Date"><input type="date" value={r.event_date} onChange={(e) => setR({ ...r, event_date: e.target.value })} /></Field>
        </div>
        {!r.results.length && <p className="muted">We couldn't find {gymnast.name}'s results on that photo. Try a closer, flatter shot.</p>}
        {r.results.map((x, i) => (
          <label key={i} className="check snap-row">
            <input type="checkbox" checked={x.keep} onChange={() => setR({ ...r, results: r.results.map((y, j) => (j === i ? { ...y, keep: !y.keep } : y)) })} />
            <span className="grow">{x.metric}{x.place ? <small className="muted"> · place {x.place}</small> : null}</span>
            <input className="compact num" inputMode="decimal" value={x.value} onChange={(e) => setR({ ...r, results: r.results.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) })} aria-label={`${x.metric} value`} />
            <small className="muted">{x.unit}</small>
          </label>
        ))}
        {r.notes && <p className="muted small">{r.notes}</p>}
        <p className="muted small">Check each number against the sheet before saving.</p>
        <Button className="wide" onClick={save} disabled={!!busy || !r.results.some((x) => x.keep)}>Save {r.results.filter((x) => x.keep).length} result(s)</Button>
      </div>}
      {busy && <Spinner label={busy} />}
      <ErrorNote error={err} />
    </Sheet>
  );
}
