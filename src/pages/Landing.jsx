import React, { useState } from "react";
import { APP } from "../config.js";
import { PLANS, TIERS } from "../data/plans.js";
import PlanPicker, { TierPicker, SimplePlans } from "../components/PlanPicker.jsx";
import { Logo } from "./Auth.jsx";
import { ContactSheet } from "./Extras.jsx";

const FEATURES = [
  ["🏅", "Scores that find you", "Scores pulled in from MeetScoresOnline, or snap the score sheet. Season bests, qualifying scores and trends are worked out for you."],
  ["🌅", "A coach in your pocket on meet day", "The morning of every meet: when to arrive, directions, what's left to pack, a pep talk and what to eat — written for your child on Pro."],
  ["🎟️", "Skip the ticket line", "Buy spectator tickets for participating meets in the app and show the QR code at the door."],
  ["📆", "One family calendar", "Meets, games and matches for every child, entry deadlines and reminders in one place."],
  ["💵", "Know what the season costs", "Tuition, entry fees, hotels, flights and gear, against your season budget, per child and per sport."],
  ["🧳", "Away trips handled", "Reminders 14, 7, 2 and 1 days out, packing lists, hotel and flight links, and a trip plan built around session time."],
  ["✦", "An AI coach that knows your kid", "Explains scores and deductions, reviews a short video for technique, and writes a level-up plan."],
  ["👨‍👩‍👧", "One app, six sports", "Gymnastics, swimming, cheer & dance, soccer, basketball and tennis. Pick your sports after sign-up and the whole app speaks that sport — switch anytime."],
];
const FAQ = [
  ["Is there a free version?", `Every family gets everything (Pro) free for ${PLANS.parent.trialDays} days — no card needed. After that, pick Basic ($9.99/mo), Plus ($15.99/mo) or Pro ($24.99/mo). Every plan covers up to 6 children in any sport.`],
  ["How does the free trial work?", `Sign up and use every feature for ${PLANS.parent.trialDays} days, no card. If you pick a plan during the trial, billing starts when the trial ends.`],
  ["Can I cancel anytime?", "Yes, in the app under More, then Manage billing. You keep Pro until the end of the period you paid for."],
  ["How do gym plans work?", `The gym pays once and gets a code. Up to ${PLANS.gym.seats} families enter the code and get Pro included, plus gym announcements.`],
  ["Is my family's information private?", "Yes. Each family only sees its own data. Practice videos stay on your phone; only a few still frames are sent for feedback."],
  ["Is AthleteOrbit part of a sport governing body?", "No. AthleteOrbit is an independent app for families. Skill lists are typical benchmarks; your coach decides readiness."],
];

export default function Landing({ nav }) {
  const [who, setWho] = useState("parent"); const [term, setTerm] = useState("yearly"); const [tierSel, setTierSel] = useState("plus"); const [contact, setContact] = useState(false);
  const go = (path) => (e) => { e.preventDefault(); nav(path); };
  return (
    <div className="landing">
      <header className="l-nav">
        <a href="/" onClick={go("/")}><Logo small /></a>
        <nav className="l-links">
          <a href="#pricing">Pricing</a>
          <a href="/login" onClick={go("/login")}>Log in</a>
          <a href="/register" onClick={go("/register")} className="btn btn-primary">Start free trial</a>
        </nav>
      </header>

      <section className="l-hero">
        <div className="l-hero-text">
          <p className="eyebrow">For sports families</p>
          <h1>Every event, result and dollar of the season. In one app.</h1>
          <p className="l-sports" aria-label="Sports">🤸 Gymnastics · 🏊 Swimming · 📣 Cheer & Dance · ⚽ Soccer · 🏀 Basketball · 🎾 Tennis</p>
          <p className="l-lead">{APP.name} keeps your kids' results, events, travel, costs and skills together, sends the reminders for you, and adds an AI coach that knows your athlete and their sport. On the web, iPhone and Android.</p>
          <div className="row">
            <a className="btn btn-primary" href="/register" onClick={go("/register")}>Start 7-day free trial</a>
            <a className="btn btn-ghost" href="/register?type=gym" onClick={go("/register?type=gym")}>I run a gym</a>
          </div>
          <p className="muted small">{PLANS.parent.trialDays}-day free trial · No card needed · Cancel anytime</p>
        </div>
        <div className="l-phone" aria-hidden>
          <div className="l-screen">
            <div className="l-card dark"><small>WAG · LEVEL 5</small><b>Maya's season</b><span>Latest all-around 36.950 ★ season best</span></div>
            <div className="l-row"><div className="l-mini"><b>5</b><small>Meets</small></div><div className="l-mini"><b>9.24</b><small>Avg / event</small></div><div className="l-mini"><b>$1,328</b><small>Spent</small></div></div>
            <div className="l-card"><small>NEXT MEET · 12 DAYS</small><b>Turkey Invitational</b><span>Raleigh, NC · Packed 9/13</span></div>
            <div className="l-card warn"><span>🥗 Meet-day fueling plan ready for Saturday</span></div>
          </div>
        </div>
      </section>

      <section className="l-section">
        <h2>Less group-text chaos. More time in the stands.</h2>
        <div className="l-features">
          {FEATURES.map(([i, t, d]) => <div key={t} className="l-feature"><span className="l-icon" aria-hidden>{i}</span><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>

      <section className="l-section l-gym">
        <div>
          <p className="eyebrow">For gym owners and booster clubs</p>
          <h2>Give every family AthleteOrbit Plus, with one code.</h2>
          <ul className="perks">{PLANS.gym.features.map((f) => <li key={f}>{f}</li>)}</ul>
          <a className="btn btn-primary" href="/register?type=gym" onClick={go("/register?type=gym")}>Set up my gym</a>
        </div>
      </section>

      <section className="l-section" id="pricing">
        <h2>Simple pricing</h2>
        <div className="seg l-seg" role="tablist">
          <button className={who === "parent" ? "on" : ""} onClick={() => setWho("parent")}>Families</button>
          <button className={who === "gym" ? "on" : ""} onClick={() => setWho("gym")}>Gyms</button>
        </div>
        {who === "parent" ? <>
          <p className="center muted">Start with every Pro feature free for {PLANS.parent.trialDays} days. Then keep the plan that fits.</p>
          <div className="landing-plans"><SimplePlans tier={tierSel} onTier={setTierSel} plan={term} onPlan={setTerm} /></div>
        </> : <>
          <p className="center muted">{`${PLANS.gym.name}: Plus for up to ${PLANS.gym.seats} families, announcements and a families-joined dashboard.`}</p>
          <PlanPicker kind="gym" value={term} onChange={setTerm} />
        </>}
        <div className="center"><a className="btn btn-primary" href={`/register?type=${who}&plan=${term}${who === "parent" ? `&tier=${tierSel}` : ""}`} onClick={go(`/register?type=${who}&plan=${term}${who === "parent" ? `&tier=${tierSel}` : ""}`)}>{who === "parent" ? `Try ${TIERS[tierSel].name} free for ${PLANS.parent.trialDays} days` : "Create gym account"}</a></div>
        {who === "parent" && <p className="center muted small">No card needed for the trial.</p>}
      </section>

      <section className="l-section">
        <h2>Questions</h2>
        <div className="faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </section>

      <footer className="l-foot">
        <Logo small />
        <p className="muted small">{APP.supportEmail}{APP.supportPhone ? ` · ${APP.supportPhone}` : ""}</p>
        <p className="small"><button className="link" onClick={() => setContact(true)}>Contact us</button> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>
        <p className="muted small">Independent app. Not affiliated with any sport governing body.</p>
      </footer>
      {contact && <ContactSheet onClose={() => setContact(false)} />}
    </div>
  );
}
