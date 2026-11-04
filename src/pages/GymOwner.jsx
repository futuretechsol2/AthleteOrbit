import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, DEMO } from "../lib/db.js";
import { PLANS, termLabel } from "../data/plans.js";
import PlanPicker from "../components/PlanPicker.jsx";
import { Button, Field, ErrorNote, Spinner, fmt } from "../ui.jsx";
import { openExternal } from "./More.jsx";

// Home screen for gym-owner accounts: pick a plan, then share the code and track families.
export default function GymOwner({ profile, me, go }) {
  const [clubs, setClubs] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { api("club/mine", null, "GET").then((r) => setClubs(r.clubs || [])).catch((e) => { setErr(e); setClubs([]); }); }, []);
  if (!clubs) return <Spinner label="Loading your gym…" />;
  const club = clubs[0];
  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">Gym account</p>
        <h1>{club?.name || profile.gym_name || "Your gym"}</h1>
        <p className="hero-sub">{club ? `${club.families} of ${club.seats} families joined · ${termLabel(club.plan || "yearly")} plan` : "Pick a plan to give every family AthleteOrbit Pro."}</p>
      </section>
      <ErrorNote error={err} />
      {club ? <ClubPanel club={club} go={go} /> : <BuyPlan profile={profile} />}
    </div>
  );
}

function BuyPlan({ profile }) {
  const [term, setTerm] = useState("yearly"); const [name, setName] = useState(profile.gym_name || ""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  return (
    <section className="card form">
      <h3>Choose your gym plan</h3>
      <ul className="perks">{PLANS.gym.features.map((f) => <li key={f}>{f}</li>)}</ul>
      <PlanPicker kind="gym" value={term} onChange={setTerm} compact />
      <Field label="Gym or booster club name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Button className="wide" disabled={busy || name.trim().length < 2 || DEMO} onClick={async () => { setBusy(true); setErr(null); try { const { url } = await api("club/checkout", { clubName: name, plan: term }); openExternal(url); } catch (e) { setErr(e); setBusy(false); } }}>
        {busy ? "Opening secure checkout…" : "Continue to payment"}
      </Button>
      {DEMO && <p className="muted small center">Checkout is switched off in demo mode.</p>}
      <p className="muted small center">Your gym code appears here and arrives by email right after payment. Renews automatically; cancel anytime.</p>
      <ErrorNote error={err} />
    </section>
  );
}

function ClubPanel({ club, go }) {
  const base = (import.meta.env.VITE_APP_URL || location.origin).replace(/\/$/, "");
  const link = `${base}/register?gym=${club.code}`;
  const [qr, setQr] = useState(""); const [copied, setCopied] = useState("");
  useEffect(() => { QRCode.toDataURL(link, { width: 360, margin: 1, color: { dark: "#16213E", light: "#FFFFFF" } }).then(setQr).catch(() => {}); }, [link]);
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 2000); } catch {} };
  const pct = club.seats ? club.families / club.seats : 0;
  return (
    <>
      <section className="card">
        <div className="card-head"><h3>Families joined</h3><b className="big">{club.families}/{club.seats}</b></div>
        <div className="stat-bar big-bar"><i style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }} /></div>
        <p className="muted small">{club.active_until ? `Plan active until ${fmt.date(club.active_until.slice(0, 10))} and renews automatically.` : ""}</p>
      </section>
      <section className="card share">
        <h3>Invite your families</h3>
        <div className="share-row">
          {qr && <img src={qr} alt="QR code to join" className="share-qr" />}
          <div className="grow">
            <p className="muted small">Gym code</p>
            <p className="gym-code mono">{club.code}</p>
            <Button kind="ghost" onClick={() => copy(club.code, "code")}>{copied === "code" ? "Copied" : "Copy code"}</Button>
          </div>
        </div>
        <Field label="Sign-up link (code included)"><input readOnly value={link} onFocus={(e) => e.target.select()} /></Field>
        <div className="row">
          <Button onClick={() => copy(`Our gym uses AthleteOrbit for meet reminders, scores and travel. Pro is included for our families: ${link}`, "msg")}>{copied === "msg" ? "Copied" : "Copy message for parents"}</Button>
          <a className="btn btn-ghost" href={`/flyer?gym=${encodeURIComponent(club.code)}&name=${encodeURIComponent(club.name)}`} target="_blank" rel="noreferrer">Printable flyer</a>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h3>Announcements</h3><button className="link" onClick={() => go("news")}>See posts ›</button></div>
        <p className="muted small">Post schedule changes, picture day or meet info. Families see it in the app, and you can email everyone.</p>
        <Button className="wide" onClick={() => go("more", { announce: club.code })}>📣 Post an announcement</Button>
      </section>
    </>
  );
}
