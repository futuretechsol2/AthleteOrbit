import { TicketsAdmin } from "./Tickets.jsx";
import React, { useEffect, useState } from "react";
import { api } from "../lib/db.js";
import { TERMS } from "../data/plans.js";
import { Spinner, ErrorNote, Button, fmt } from "../ui.jsx";
import { AdminInbox } from "./Extras.jsx";

// Your business at a glance: sign-ups, paying families by plan, gyms, revenue and support.
export default function Admin() {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [inbox, setInbox] = useState(false);
  const load = () => api("admin/stats", null, "GET").then(setD).catch(setErr);
  useEffect(() => { load(); }, []);
  if (err) return <ErrorNote error={err} />;
  if (!d) return <Spinner label="Loading your numbers…" />;
  const tile = (label, value, tone = "") => <div className={`stat ${tone}`}><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div>;
  return (
    <div className="stack">
      <div className="page-head"><h1>Owner dashboard</h1><Button kind="ghost" onClick={load}>Refresh</Button></div>
      {d.demo && <p className="note note-warn">Sample numbers in demo mode.</p>}
      <div className="stats">
        {tile("Monthly revenue (est.)", fmt.money(d.revenue.mrr))}
        {tile("Paying families", d.subscriptions.paying)}
        {tile("On free trial", d.subscriptions.trialing)}
        {tile("Active gyms", d.gyms.active)}
        {tile("Sign-ups (7 days)", d.signups.last7)}
        {tile("Open questions", d.support.open, d.support.open ? "warn" : "")}
      </div>
      <section className="card">
        <h3>Revenue</h3>
        <p><b className="big">{fmt.money(d.revenue.arr)}</b> <span className="muted">a year at today's subscriptions</span></p>
        <p className="muted small">Families {fmt.money(d.revenue.fromParents)}/mo · Gyms {fmt.money(d.revenue.fromGyms)}/mo. Estimate from plan prices; Stripe has the exact totals.</p>
      </section>
      <section className="card">
        <h3>Plans</h3>
        <table className="tbl">
          <thead><tr><th>Plan</th><th>Families</th><th>Gyms</th></tr></thead>
          <tbody>{TERMS.map((t) => <tr key={t.key}><td>{t.label}</td><td>{d.subscriptions.byPlan[t.key] || 0}</td><td>{d.gyms.byPlan[t.key] || 0}</td></tr>)}</tbody>
        </table>
        {d.subscriptions.byTier && <p className="small">Basic {d.subscriptions.byTier.basic || 0} · Plus {d.subscriptions.byTier.plus || 0} · Pro {d.subscriptions.byTier.pro || 0}{d.subscriptions.trialConversion != null ? ` · trial → paid ${d.subscriptions.trialConversion}%` : ""}</p>}
        <p className="muted small">{d.subscriptions.viaGym} families have Plus through a gym · {d.subscriptions.pastDue} payment{d.subscriptions.pastDue === 1 ? "" : "s"} failing</p>
      </section>
      <SetupCheck />
      <TicketsAdmin />
      {d.marketing && <section className="card">
        <h3>Where sign-ups came from (30 days)</h3>
        {!Object.keys(d.marketing.sources).length && <p className="muted small">No sign-ups yet. Share links with ?utm_source=facebook (or instagram, flyer, gym…) so they show here.</p>}
        {Object.entries(d.marketing.sources).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="row"><span className="grow">{k}</span><b>{v}</b></div>)}
        <p className="muted small">{d.marketing.referrals} families joined through an invite link.</p>
      </section>}
      <section className="card">
        <h3>Accounts</h3>
        <p>{d.totals.accounts} total · {d.totals.parents} parents · {d.totals.gymOwners} gym owners · {d.totals.children} children · {d.signups.last30} new in 30 days</p>
      </section>
      {d.gyms.list.length > 0 && (
        <section className="card">
          <h3>Gyms</h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Gym</th><th>Code</th><th>Plan</th><th>Families</th></tr></thead>
            <tbody>{d.gyms.list.map((g) => <tr key={g.code}><td>{g.name}</td><td className="mono">{g.code}</td><td>{TERMS.find((t) => t.key === g.plan)?.label || "—"}</td><td>{g.families}/{g.seats}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
      <section className="card">
        <h3>Newest sign-ups</h3>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Name</th><th>Username</th><th>Type</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>{d.recent.map((r, i) => <tr key={i}><td>{r.name || "—"}<br /><small className="muted">{r.email}</small></td><td>{r.username || "—"}</td><td>{r.type === "gym" ? "Gym" : "Parent"}</td><td>{r.status === "none" ? "Free" : r.status}{r.plan && r.status !== "none" ? ` · ${TERMS.find((t) => t.key === r.plan)?.label || r.plan}` : ""}</td><td>{fmt.date(r.created_at.slice(0, 10))}</td></tr>)}</tbody>
        </table></div>
      </section>
      <div className="row">
        <Button onClick={() => setInbox(true)}>📥 Team inbox</Button>
        <a className="btn btn-ghost" href="/flyer" target="_blank" rel="noreferrer">🖨️ Printable flyer</a>
      </div>
      {inbox && <AdminInbox onClose={() => setInbox(false)} />}
    </div>
  );
}

// Shows which server settings are still missing after deploying (names only).
function SetupCheck() {
  const [h, setH] = useState(null);
  useEffect(() => { api("health", null, "GET").then(setH).catch(() => setH(null)); }, []);
  if (!h || h.demo) return null;
  if (h.ok) return <section className="card"><h3>✅ Setup complete</h3><p className="muted small">All settings found · database ready · Stripe in {h.checks.stripeMode} mode{h.checks.stripeMode === "test" ? " (switch to live before launch)" : ""}.</p></section>;
  return (
    <section className="card pain-flag">
      <h3>⚙️ Setup still needs</h3>
      {!h.checks.database && <p className="small">• Database not reachable — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.</p>}
      {h.checks.database && !h.checks.schemaUpToDate && <p className="small">• Run the latest supabase/schema.sql in Supabase → SQL Editor.</p>}
      {h.missing.length > 0 && <p className="small">• Add in Vercel → Settings → Environment Variables, then Redeploy: <span className="mono">{h.missing.join(", ")}</span></p>}
      {h.optionalMissing.length > 0 && <p className="muted small">Optional: {h.optionalMissing.join(", ")}</p>}
    </section>
  );
}
