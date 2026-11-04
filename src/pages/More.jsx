import React, { useState } from "react";
import { db, api, DEMO } from "../lib/db.js";
import { PROGRAMS, PROGRAM_LABEL } from "../data/skills.js";
import { SPORTS, SPORT_NAMES, conf, sportOf, levelsFor } from "../data/sports.js";
import { APP } from "../config.js";
import { Button, Field, Sheet, ErrorNote, fmt, Avatar, PhotoPicker } from "../ui.jsx";
import { RemindersCard, GymCard, ContactSheet, AdminInbox, Announce } from "./Extras.jsx";
import { termLabel, tierName } from "../data/plans.js";
import { passwordIssues } from "./Auth.jsx";
import { MyTicketsList } from "./Tickets.jsx";

export default function More({ gymnasts, allKids, profile, paid, refresh, openPaywall, go, session, me, params, sport }) {
  const kids = allKids || gymnasts;
  const [contact, setContact] = useState(false); const [inbox, setInbox] = useState(!!params?.inbox);
  const [edit, setEdit] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState(params?.announce || null); const [pwOpen, setPwOpen] = useState(false);
  const gymAcct = profile?.account_type === "gym" && !kids.length;
  async function billing() {
    setBusy(true); setErr(null);
    try { const { url } = await api("billing/portal"); openExternal(url); } catch (e) { setErr(e); }
    setBusy(false);
  }
  async function deleteAccount() {
    if (!confirm("Delete your account and all data? This can't be undone.")) return;
    if (prompt('Type DELETE to confirm') !== "DELETE") return;
    try { await api("account/delete"); await db.signOut(); } catch (e) { setErr(e); }
  }
  const status = profile?.subscription_status || "none";
  return (
    <div className="stack">
      <div className="page-head"><h1>More</h1></div>
      <nav className="card menu">
        {!gymAcct && <>
          <button onClick={() => go("calendar")}>📆 Family calendar</button>
          <button onClick={() => go("costs")}>💵 Costs & budget</button>
          <button onClick={() => go("news")}>📰 News & gym posts</button>
        </>}
        <button onClick={() => setContact(true)}>💬 Contact us</button>
        {me?.admin && <button onClick={() => go("admin")}>📈 Owner dashboard</button>}
        {me?.admin && <button onClick={() => setInbox(true)}>📥 Team inbox</button>}
        {me?.admin && <a className="menu-link" href="/flyer" target="_blank" rel="noreferrer">🖨️ Printable flyer</a>}
      </nav>

      {!gymAcct && <section className="card">
        <div className="card-head"><h3>Children</h3><button className="link" onClick={() => (!paid ? openPaywall() : setEdit({}))}>＋ Add</button></div>
        {kids.map((g) => (
          <button key={g.id} className="list-row" onClick={() => setEdit(g)}>
            <Avatar src={g.photo} name={g.name} />
            <div className="grow"><b>{g.name}</b><p className="muted small">{conf(sportOf(g)).icon} {sportOf(g)}{sportOf(g) === "Gymnastics" ? ` ${g.program}` : ""} · {g.level}{g.club ? ` · ${g.club}` : ""}</p></div>
            <span className="muted">Edit</span>
          </button>
        ))}
        <p className="muted small">Up to 6 children, any sport. Each child can have a photo.</p>
      </section>}

      {!gymAcct && <MyTicketsList />}
      {!gymAcct && me?.referral_code && <InviteCard me={me} />}
      {!gymAcct && <RemindersCard profile={profile} me={me} refresh={refresh} />}
      {!gymAcct && <GymCard me={me} refresh={refresh} />}

      {gymAcct ? (
        <section className="card">
          <h3>Gym plan & billing</h3>
          <p className="muted small">Change plan length, update your card or download invoices.</p>
          <Button kind="ghost" className="wide" onClick={billing} disabled={busy || DEMO || !profile.stripe_customer_id}>Manage gym billing</Button>
          <ErrorNote error={err} />
        </section>
      ) : <section className="card">
        <h3>Your plan</h3>
        <p className="plan-line">
          {me?.tier && ["active", "trialing", "past_due"].includes(status) ? <><b>AthleteOrbit {tierName(me.subscription_tier || me.tier)}</b> · {termLabel(profile.subscription_plan || me.plan || "monthly")}{profile.current_period_end ? ` · renews ${fmt.date(profile.current_period_end.slice(0, 10))}` : ""}{status === "past_due" && <b className="warn-text"> · Payment failed — update your card</b>}</>
            : me?.trial ? <><b>Free Pro trial</b> · ends {fmt.date(me.trial_ends_at.slice(0, 10))}</>
            : me?.club ? <><b>AthleteOrbit Plus</b> · covered by {me.club.name}</> : <>No active plan</>}
        </p>
        <div className="row">
          {!(me?.club && !["active", "trialing", "past_due"].includes(status)) && <Button className="grow" onClick={() => openPaywall()}>{["active", "trialing", "past_due"].includes(status) ? (me?.tier === "pro" ? "Change plan" : "Upgrade") : "Choose a plan"}</Button>}
          {["active", "trialing", "past_due"].includes(status) && <Button kind="ghost" className="grow" onClick={billing} disabled={busy || DEMO}>Billing & invoices</Button>}
        </div>
        <ErrorNote error={err} />
      </section>}

      <section className="card">
        <h3>Account</h3>
        <PhotoPicker value={profile?.avatar} name={profile?.full_name || profile?.username || "You"} size={72} onChange={async (avatar) => { try { await db.updateProfile({ avatar }); refresh(); } catch (e) { setErr(e); } }} />
        <dl className="kv">
          <dt>Name</dt><dd>{profile?.full_name || "—"}</dd>
          <dt>Username</dt><dd>{profile?.username || me?.username || "—"}</dd>
          <dt>Email</dt><dd>{DEMO ? "demo@athleteorbit.app" : session?.user?.email}</dd>
          <dt>Account type</dt><dd>{gymAcct || profile?.account_type === "gym" ? "Gym owner" : "Parent"}</dd>
        </dl>
        {DEMO && <p className="muted small">Demo mode — data is saved on this device only.</p>}
        <div className="row">
          <Button kind="ghost" onClick={() => setPwOpen(true)}>Change password</Button>
          <Button kind="ghost" onClick={async () => { try { sessionStorage.removeItem("gp-sport-chosen"); } catch {} await db.signOut(); if (!DEMO) location.href = "/login"; }}>{DEMO ? "Log out (resets demo)" : "Log out"}</Button>
          {!gymAcct && <Button kind="ghost" onClick={() => exportData(kids).catch((e) => setErr(e))}>Download my data</Button>}
          {!DEMO && <Button kind="danger" onClick={deleteAccount}>Delete account</Button>}
        </div>
      </section>

      <section className="card small muted">
        <p><b>Privacy:</b> your family's data is private to your account. Videos never leave your phone; only a few still frames are sent for AI feedback and are not stored. Score-sheet photos are read and then discarded.</p>
        <p><b>Safety:</b> {APP.name} gives guidance for parents. It doesn't replace your coach, doctor or physical therapist. Skill lists are typical benchmarks, not official rules. Not affiliated with USA Gymnastics, USA Swimming, USA Cheer, US Youth Soccer, USA Basketball or USTA.</p>
        <p>Questions? <button className="link" onClick={() => setContact(true)}>Contact us</button> · {APP.supportEmail}</p>
      </section>

      <p className="center small"><a href="/welcome" onClick={(e) => { e.preventDefault(); history.pushState(null, "", "/welcome"); dispatchEvent(new PopStateEvent("popstate")); }}>View the public page</a></p>
      {contact && <ContactSheet email={session?.user?.email || ""} onClose={() => setContact(false)} />}
      {announce && <Announce code={announce} onClose={() => setAnnounce(null)} />}
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
      {inbox && <AdminInbox onClose={() => setInbox(false)} />}
      {edit && <GymnastForm row={edit} sport={sport} canDelete={kids.length > 1} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function ChangePassword({ onClose }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [err, setErr] = useState(null); const [done, setDone] = useState(false);
  return (
    <Sheet title="Change password" onClose={onClose}>
      {done ? <div className="empty"><div className="empty-icon">🔒</div><h3>Password changed</h3><Button onClick={onClose}>Done</Button></div> : (
        <form className="form" onSubmit={async (e) => { e.preventDefault(); const i = passwordIssues(pw); if (i.length) return setErr(new Error(`Password needs ${i.join(", ")}.`)); if (pw !== pw2) return setErr(new Error("Passwords don't match.")); try { await db.updatePassword(pw); setDone(true); } catch (e2) { setErr(e2); } }}>
          <Field label="New password" hint="8+ characters with a letter and a number"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></Field>
          <Field label="Confirm new password"><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required /></Field>
          <ErrorNote error={err} />
          <Button className="wide">Save new password</Button>
        </form>
      )}
    </Sheet>
  );
}

export function GymnastForm({ row, onClose, onSaved, canDelete = true, title, sport: defaultSport }) {
  const initSport = row.id ? sportOf(row) : defaultSport || "Gymnastics";
  const [f, setF] = useState(() => {
    const program = row.program && row.program !== "Other" ? row.program : "WAG";
    const levels = levelsFor(initSport, program);
    return { name: row.name || "", sport: initSport, program, level: row.level || (initSport === "Gymnastics" ? "Level 3" : levels[0]) || "", club: row.club || "", photo: row.photo || null,
      coach_name: row.coach_name || "", coach_phone: row.coach_phone || "", coach_email: row.coach_email || "" };
  });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const gym = f.sport === "Gymnastics";
  const levels = levelsFor(f.sport, f.program) || [];
  const S = conf(f.sport);
  const set = (k) => (e) => {
    const v = e.target.value;
    if (k === "sport" || k === "program") {
      const n = { ...f, [k]: v }; const lv = levelsFor(n.sport, n.program) || [];
      setF({ ...n, level: lv.includes(f.level) ? f.level : lv[0] || "" });
    } else setF({ ...f, [k]: v });
  };
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    const rec = { name: f.name.trim(), program: gym ? f.program : "Other", sport: f.sport, level: f.level.trim() || levels[0] || "Team", club: f.club.trim() || null, photo: f.photo || null,
      coach_name: f.coach_name.trim() || null, coach_phone: f.coach_phone.trim() || null, coach_email: f.coach_email.trim() || null };
    try { const saved = row.id ? await db.update("gymnasts", row.id, rec) : await db.insert("gymnasts", rec); onSaved(saved || rec); } catch (e2) { setErr(e2); setBusy(false); }
  }
  const body = (
    <form className="form" onSubmit={save}>
      <PhotoPicker value={f.photo} name={f.name} onChange={(photo) => setF({ ...f, photo })} />
      <Field label="First name"><input value={f.name} onChange={set("name")} maxLength={60} required autoFocus={!row.id} /></Field>
      <Field label="Sport"><select value={f.sport} onChange={set("sport")}>{SPORT_NAMES.map((x) => <option key={x} value={x}>{SPORTS[x].icon} {x}</option>)}</select></Field>
      <div className="grid2">
        {gym && <Field label="Program"><select value={f.program} onChange={set("program")}>{PROGRAMS.filter((p) => p !== "Other").map((p) => <option key={p} value={p}>{PROGRAM_LABEL[p]}</option>)}</select></Field>}
        <Field label={`Current ${S.level.toLowerCase()}`}><select value={f.level} onChange={set("level")}>{(levels.includes(f.level) || !f.level ? levels : [f.level, ...levels]).map((l) => <option key={l}>{l}</option>)}</select></Field>
      </div>
      <Field label={gym ? "Gym / club (optional)" : "Club / team (optional)"}><input value={f.club} onChange={set("club")} /></Field>
      <details className="more-fields" open={!!f.coach_name}>
        <summary>Coach contact (optional)</summary>
        <div className="form">
          <Field label="Coach name"><input value={f.coach_name} onChange={set("coach_name")} /></Field>
          <div className="grid2">
            <Field label="Phone"><input type="tel" value={f.coach_phone} onChange={set("coach_phone")} /></Field>
            <Field label="Email"><input type="email" value={f.coach_email} onChange={set("coach_email")} /></Field>
          </div>
        </div>
      </details>
      <ErrorNote error={err} />
      <div className="row end">
        {row.id && canDelete && <Button type="button" kind="danger" onClick={async () => { if (window.confirm(`Delete ${row.name} and all their data?`)) { await db.remove("gymnasts", row.id); onSaved(); } }}>Delete</Button>}
        <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
  return onClose ? <Sheet title={title || (row.id ? `Edit ${row.name}` : "Add a child")} onClose={onClose}>{body}</Sheet> : body;
}

export function openExternal(url) {
  // In the native app, Capacitor opens external links in the system browser.
  window.location.href = url;
}

// Give a month, get a month.
function InviteCard({ me }) {
  const url = `${(import.meta.env.VITE_APP_URL || location.origin).replace(/\/$/, "")}/?ref=${me.referral_code}&utm_source=referral`;
  const msg = `I use AthleteOrbit to track my kids' scores, meets and costs in one app. Try it free for 7 days and get your first month free with my link: ${url}`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="card invite">
      <h3>🎁 Give a month, get a month</h3>
      <p className="small">Invite another sports family. They get their first month free, and when they join a plan, your next month is free too.</p>
      <div className="row">
        <Button className="grow" onClick={async () => { try { if (navigator.share) await navigator.share({ title: "AthleteOrbit", text: msg }); else { await navigator.clipboard.writeText(msg); setCopied(true); } } catch {} }}>{copied ? "Copied ✓" : "Share my invite"}</Button>
        <a className="btn btn-ghost grow center" href={`sms:?&body=${encodeURIComponent(msg)}`}>Text a parent</a>
      </div>
      <p className="muted small">Your code: <b className="mono">{me.referral_code}</b>{me.referrals ? ` · ${me.referrals} famil${me.referrals === 1 ? "y has" : "ies have"} joined` : ""}</p>
    </section>
  );
}

// Everything the family logged, as spreadsheet-friendly CSV files (one per kind of data) in a single download.
async function exportData(kids) {
  const tables = [["scores", "Scores"], ["stats", "Results"], ["meets", "Events"], ["costs", "Costs"], ["practice_logs", "Practice"], ["goals", "Goals"], ["coach_notes", "Coach notes"]];
  const name = (id) => kids.find((k) => k.id === id)?.name || "";
  const skip = new Set(["id", "user_id", "gymnast_id", "checklist", "share_key", "created_at"]);
  const csv = (rows) => {
    if (!rows.length) return "";
    const cols = ["child", ...[...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !skip.has(c))];
    const cell = (v) => { const t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(c === "child" ? name(r.gymnast_id) : r[c])).join(","))].join("\n");
  };
  let out = "";
  for (const [t, label] of tables) { const rows = await db.list(t).catch(() => []); if (rows.length) out += `# ${label}\n${csv(rows)}\n\n`; }
  if (!out) throw new Error("Nothing to download yet.");
  const blob = new Blob([out], { type: "text/csv" });
  const file = new File([blob], `gympath-data-${new Date().toISOString().slice(0, 10)}.csv`, { type: "text/csv" });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "AthleteOrbit data" }); return; } catch {} }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
