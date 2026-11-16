import React, { useEffect, useState } from "react";
import { db } from "../lib/db.js";
import { COST_CATEGORIES } from "../data/skills.js";
import { seasonOf, seasonRange, seasonsAround, spendSummary, budgetStatus } from "../data/family.js";
import { Button, Field, Sheet, Empty, ErrorNote, fmt, today } from "../ui.jsx";

export default function Costs({ gymnasts }) {
  const [d, setD] = useState(null); const [edit, setEdit] = useState(null); const [who, setWho] = useState("all");
  const [season, setSeason] = useState(seasonOf(today())); const [budgetEdit, setBudgetEdit] = useState(null);
  const load = () => Promise.all([db.list("costs"), db.list("budgets"), db.list("meets")]).then(([costs, budgets, meets]) => setD({ costs, budgets, meets }));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="skeleton" />;
  const { from, to } = seasonRange(season);
  const name = (id) => (id ? gymnasts.find((g) => g.id === id)?.name || "—" : "Shared");
  const inSeason = d.costs.filter((r) => r.spent_on >= from && r.spent_on <= to);
  const shown = inSeason.filter((r) => who === "all" || (who === "family" ? !r.gymnast_id : r.gymnast_id === who));
  const total = shown.reduce((a, r) => a + Number(r.amount), 0);
  const unpaid = shown.filter((r) => !r.paid).reduce((a, r) => a + Number(r.amount), 0);
  const byCat = Object.entries(shown.reduce((m, r) => ({ ...m, [r.category]: (m[r.category] || 0) + Number(r.amount) }), {})).sort((a, b) => b[1] - a[1]);
  const max = byCat[0]?.[1] || 1;
  const summary = spendSummary(d.costs, season, gymnasts);
  const budgets = budgetStatus(d.budgets, d.costs, season)
    .filter((b) => who === "all" || (who === "family" ? !b.gymnast_id : b.gymnast_id === who));
  const sports = {};
  for (const r of inSeason) { const g = gymnasts.find((x) => x.id === r.gymnast_id); const k = g ? (g.program === "Other" ? g.sport : "Gymnastics") : "Shared"; sports[k] = (sports[k] || 0) + Number(r.amount); }
  const meetName = (id) => d.meets.find((m) => m.id === id)?.name;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Costs</h1>
        <div className="row">
          <select className="compact" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Season">{seasonsAround(today()).map((s) => <option key={s} value={s}>{s} season</option>)}</select>
          <Button onClick={() => setEdit({})}>＋ Add</Button>
        </div>
      </div>
      <div className="chips" role="tablist">
        {[["all", "Everyone"], ...gymnasts.map((g) => [g.id, g.name]), ["family", "Shared"]].map(([k, l]) => (
          <button key={k} className={`chip ${who === k ? "on" : ""}`} onClick={() => setWho(k)}>{l}</button>
        ))}
      </div>
      <div className="stats two">
        <div className="stat"><span className="stat-value">{fmt.money(total)}</span><span className="stat-label">Spent in {season}</span></div>
        <div className={`stat ${unpaid ? "warn" : ""}`}><span className="stat-value">{fmt.money(unpaid)}</span><span className="stat-label">Unpaid</span></div>
      </div>

      <section className="card">
        <div className="card-head"><h3>Budget vs actual</h3><button className="link" onClick={() => setBudgetEdit({ season, gymnast_id: who !== "all" && who !== "family" ? who : null })}>＋ Budget</button></div>
        {!budgets.length && <p className="muted small">Set a season budget for the family, each child or a category (like hotels) to see how you're tracking.</p>}
        {budgets.map((b) => (
          <button key={b.id} className="budget" onClick={() => setBudgetEdit(b)}>
            <div className="budget-top"><b>{b.gymnast_id ? name(b.gymnast_id) : "Family"} · {b.category || "Total"}</b><span className={b.pct >= 1 ? "warn-text" : "muted"}>{fmt.money(b.spent)} of {fmt.money(b.amount)}</span></div>
            <div className="stat-bar"><i className={b.pct >= 1 ? "over" : b.pct >= 0.9 ? "near" : ""} style={{ width: `${Math.min(100, Math.round(b.pct * 100))}%` }} /></div>
            <small className="muted">{b.pct >= 1 ? `${fmt.money(b.spent - b.amount)} over budget` : `${fmt.money(b.amount - b.spent)} left`}</small>
          </button>
        ))}
      </section>

      {who === "all" && Object.keys(summary.byChild).length > 1 && (
        <section className="card">
          <h3>Per child</h3>
          {Object.entries(summary.byChild).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} className="barrow"><span>{k}</span><div className="bar"><i style={{ width: `${(v / Math.max(...Object.values(summary.byChild))) * 100}%` }} /></div><b>{fmt.money(v)}</b></div>
          ))}
          {Object.keys(sports).length > 1 && <p className="muted small">By sport: {Object.entries(sports).map(([k, v]) => `${k} ${fmt.money(v)}`).join(" · ")}</p>}
        </section>
      )}

      {byCat.length > 0 && (
        <section className="card">
          <h3>Where the money goes</h3>
          {byCat.map(([c, v]) => (
            <div key={c} className="barrow"><span>{c}</span><div className="bar"><i style={{ width: `${(v / max) * 100}%` }} /></div><b>{fmt.money(v)}</b></div>
          ))}
        </section>
      )}
      {!d.costs.length && <Empty icon="💵" title="Track every fee" text="Tuition, meet entries, coach fees, hotels, flights, fuel, uniforms and gear: see the real cost of the season." action={<Button onClick={() => setEdit({})}>Add a cost</Button>} />}
      {shown.map((r) => (
        <button key={r.id} className="card list-row" onClick={() => setEdit(r)}>
          <div className="grow"><b>{r.description || r.category}</b><p className="muted small">{fmt.date(r.spent_on)} · {r.category} · {name(r.gymnast_id)}{r.meet_id && meetName(r.meet_id) ? ` · ${meetName(r.meet_id)}` : ""}</p></div>
          <div className="right"><b>{fmt.money(r.amount)}</b>{!r.paid && <span className="pill pill-warn">Unpaid</span>}</div>
        </button>
      ))}
      {edit && <CostForm gymnasts={gymnasts} meets={d.meets} row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {budgetEdit && <BudgetForm gymnasts={gymnasts} row={budgetEdit} onClose={() => setBudgetEdit(null)} onSaved={() => { setBudgetEdit(null); load(); }} />}
    </div>
  );
}

export function CostForm({ gymnasts, meets = [], row, onClose, onSaved }) {
  const [f, setF] = useState({ spent_on: row.spent_on || today(), gymnast_id: row.id ? row.gymnast_id || "" : row.gymnast_id ?? gymnasts[0]?.id ?? "", category: row.category || COST_CATEGORIES[0],
    description: row.description || "", amount: row.amount ?? "", paid: row.paid ?? true, meet_id: row.meet_id || "" });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const meetOptions = meets.filter((m) => !f.gymnast_id || m.gymnast_id === f.gymnast_id);
  async function save(e) {
    e.preventDefault();
    const amt = Number(f.amount);
    if (isNaN(amt) || amt < 0) return setErr(new Error("Enter an amount like 125 or 49.99"));
    const rec = { ...f, amount: amt, gymnast_id: f.gymnast_id || null, description: f.description || null, meet_id: f.meet_id || null };
    try { row.id ? await db.update("costs", row.id, rec) : await db.insert("costs", rec); onSaved(); } catch (e2) { setErr(e2); }
  }
  return (
    <Sheet title={row.id ? "Edit cost" : "Add cost"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid2">
          <Field label="Amount ($)"><input inputMode="decimal" value={f.amount} onChange={set("amount")} required placeholder="125" /></Field>
          <Field label="Date"><input type="date" value={f.spent_on} onChange={set("spent_on")} required /></Field>
        </div>
        <div className="grid2">
          <Field label="Category"><select value={f.category} onChange={set("category")}>{[...new Set([...COST_CATEGORIES, f.category])].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="For"><select value={f.gymnast_id} onChange={set("gymnast_id")}>{gymnasts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}<option value="">Shared / family</option></select></Field>
        </div>
        <Field label="Description"><input value={f.description} onChange={set("description")} placeholder="Queen City Cup entry" /></Field>
        {meetOptions.length > 0 && <Field label="Meet (optional)" hint="Links the cost to that meet's trip budget"><select value={f.meet_id} onChange={set("meet_id")}><option value="">Not for a specific meet</option>{meetOptions.map((m) => <option key={m.id} value={m.id}>{m.name} · {fmt.date(m.start_date)}</option>)}</select></Field>}
        <label className="check"><input type="checkbox" checked={f.paid} onChange={set("paid")} /> Paid</label>
        <ErrorNote error={err} />
        <div className="row end">
          {row.id && <Button type="button" kind="danger" onClick={async () => { if (window.confirm("Delete this cost?")) { await db.remove("costs", row.id); onSaved(); } }}>Delete</Button>}
          <Button>Save</Button>
        </div>
      </form>
    </Sheet>
  );
}

function BudgetForm({ gymnasts, row, onClose, onSaved }) {
  const [f, setF] = useState({ season: row.season, gymnast_id: row.gymnast_id || "", category: row.category || "", amount: row.amount ?? "" }); const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    const amt = Number(f.amount); if (isNaN(amt) || amt <= 0) return setErr(new Error("Enter the budget amount."));
    const rec = { season: f.season, gymnast_id: f.gymnast_id || null, category: f.category || null, amount: amt };
    try { row.id ? await db.update("budgets", row.id, rec) : await db.insert("budgets", rec); onSaved(); } catch (e2) { setErr(e2); }
  }
  return (
    <Sheet title={row.id ? "Edit budget" : "Set a budget"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <p className="muted small">Season {f.season} runs {fmt.date(seasonRange(f.season).from)} to {fmt.date(seasonRange(f.season).to)}.</p>
        <Field label="Budget ($)"><input inputMode="decimal" value={f.amount} onChange={set("amount")} required placeholder="6000" /></Field>
        <div className="grid2">
          <Field label="For"><select value={f.gymnast_id} onChange={set("gymnast_id")}><option value="">Whole family</option>{gymnasts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Category"><select value={f.category} onChange={set("category")}><option value="">All spending</option>{COST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <ErrorNote error={err} />
        <div className="row end">{row.id && <Button type="button" kind="danger" onClick={async () => { await db.remove("budgets", row.id); onSaved(); }}>Delete</Button>}<Button>Save budget</Button></div>
      </form>
    </Sheet>
  );
}
