import React, { useEffect, useState } from "react";
import { APP } from "../config.js";
import { PLANS, TIERS } from "../data/plans.js";
import PlanPicker, { TierPicker, SimplePlans } from "../components/PlanPicker.jsx";
import { Logo } from "./Auth.jsx";
import { ContactSheet } from "./Extras.jsx";

// The hero demo: one schedule, three athletes — each sees only their own competitions.
const SEASON = [
  ["Dec 6", "Snowflake Classic", "Girls · L3–5", "Raleigh, NC", "Session 3 · 1:15 PM"], ["Dec 13", "Blackjack Boys Invite", "Boys · L4–6", "Charlotte, NC", "Session 1 · 8:30 AM"],
  ["Jan 17", "Carolina Optionals Cup", "Girls · L8–10", "Greensboro, NC", "Times post Jan 8"], ["Jan 31", "Sweetheart Invitational", "Girls · L3–5", "Columbia, SC", "Times post Jan 22"],
  ["Feb 14", "Palmetto Men's Open", "Boys · L4–6", "Greenville, SC", "Times post Feb 5"], ["Mar 7", "Team Showcase", "Everyone", "Concord, NC", "10:00 AM"],
];
const ATHLETES = [["Maya", "Girl · Level 5", [0, 3, 5]], ["Arjun", "Boy · Level 4", [1, 4, 5]], ["Chloe", "Girl · Level 8", [2, 5]]];
function HeroDemo() {
  const [i, setI] = useState(0); const [hold, setHold] = useState(false);
  useEffect(() => { if (hold || matchMedia("(prefers-reduced-motion: reduce)").matches) return; const t = setInterval(() => setI((x) => (x + 1) % ATHLETES.length), 3200); return () => clearInterval(t); }, [hold]);
  const [, , mine] = ATHLETES[i];
  return (
    <div className="l-demo" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <div className="l-paper" aria-hidden>
        <b>2026–27 COMPETITION SCHEDULE</b>
        {SEASON.map(([d, n, who], k) => <p key={n} className={mine.includes(k) ? "hit" : ""}><span>{d}</span><span>{n}</span><span>{who}</span></p>)}
        <i className="l-scan" />
      </div>
      <div className="l-phone2">
        <div className="l-who" role="tablist" aria-label="Example athletes">{ATHLETES.map(([n, sub], k) => <button key={n} role="tab" aria-selected={i === k} className={i === k ? "on" : ""} onClick={() => { setI(k); setHold(true); }}><b>{n}</b><small>{sub}</small></button>)}</div>
        <p className="l-count"><b>{mine.length}</b> of {SEASON.length} competitions are {ATHLETES[i][0]}'s</p>
        <div className="l-list" key={i}>
          {mine.map((k, n) => { const [d, name, , city, time] = SEASON[k]; return <div key={name} className="l-meet" style={{ animationDelay: `${n * 90}ms` }}><span className="l-date">{d}</span><span className="grow"><b>{name}</b><small>{city} · 🕐 {time}</small></span></div>; })}
        </div>
      </div>
    </div>
  );
}
const STEPS = [
  ["📷", "Snap the schedule", "Take a picture of the season schedule your gym hands out — paper, email or a screenshot."],
  ["🎯", "See only your athlete's meets", "We read every competition and keep the ones for your child's level and girls/boys team. Siblings each get their own."],
  ["🌐", "Host, website and session time — found for you", "We look online for who's hosting, the official meet page and the venue, and check daily until your session time is posted."],
  ["🔔", "Reminders without the group text", "Alerts 14, 7, 2 and 1 days out with what's left to pack, plus a note the moment your session time appears."],
];

const FEATURES = [
  ["🏅", "Scores that find you", "Scores pulled in from MeetScoresOnline, or snap the score sheet. Season bests, qualifying scores and trends are worked out for you."],
  ["🌅", "A coach in your pocket on meet day", "The morning of every meet: when to arrive, directions, what's left to pack, a pep talk and what to eat — written for your child on Pro."],
  ["🎟️", "Skip the ticket line", "Buy spectator tickets for participating meets in the app and show the QR code at the door."],
  ["💬", "A direct line to your gym", "Ask about practice times or fees and get the answer in one place. Gym announcements arrive as a short summary, not a wall of text."],
  ["💵", "Know what the season costs", "Tuition, entry fees, hotels, flights and gear, against your season budget, per child and per sport."],
  ["🧳", "Away trips handled", "Reminders 14, 7, 2 and 1 days out, packing lists, hotel and flight links, and a trip plan built around session time."],
  ["✦", "An AI coach that knows your kid", "Explains scores and deductions, reviews a short video for technique, and writes a level-up plan."],
  ["👨‍👩‍👧", "One app, six sports", "Gymnastics, swimming, cheer & dance, soccer, basketball and tennis. Pick your sports after sign-up and the whole app speaks that sport — switch anytime."],
];
const FAQ = [
  ["Is there a free version?", `Every family gets everything (Pro) free for ${PLANS.parent.trialDays} days — no card needed. After that, pick Basic ($29.99/mo) or Pro ($39.99/mo), or join free with your gym's code if your gym uses AthleteOrbit. Every plan covers up to 6 children in any sport.`],
  ["How does the free trial work?", `Sign up and use every feature for ${PLANS.parent.trialDays} days, no card. If you pick a plan during the trial, billing starts when the trial ends.`],
  ["Can I cancel anytime?", "Yes, in the app under More, then Manage billing. You keep Pro until the end of the period you paid for."],
  ["How do gym plans work?", `The gym pays once and gets a code. Up to ${PLANS.gym.seats} families enter the code and get Basic included: the gym's season schedule for their athlete's level, announcements and messages with the gym. Gyms start with a free 30-day trial.`],
  ["Is my family's information private?", "Yes. Each family only sees its own data. Practice videos stay on your phone; only a few still frames are sent for feedback."],
  ["Is AthleteOrbit part of a sport governing body?", "No. AthleteOrbit is an independent app for families. Skill lists are typical benchmarks; your coach decides readiness."],
];

export default function Landing({ nav }) {
  const [who, setWho] = useState("parent"); const [term, setTerm] = useState("yearly"); const [tierSel, setTierSel] = useState("basic"); const [contact, setContact] = useState(false);
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
          <h1>Snap your gym's schedule. See only <em>your</em> athlete's meets.</h1>
          <p className="l-sports" aria-label="Sports">🤸 Gymnastics · 🏊 Swimming · 📣 Cheer & Dance · ⚽ Soccer · 🏀 Basketball · 🎾 Tennis</p>
          <p className="l-lead">One photo of the season schedule and {APP.name} builds each child's calendar by level — then finds the host, the meet website and your session time online, and reminds you before every one. Scores, costs, packing lists and messages with your gym live in the same app.</p>
          <div className="row">
            <a className="btn btn-primary" href="/register" onClick={go("/register")}>Start 7-day free trial</a>
            <a className="btn btn-ghost" href="/?demo">▶ Try the parent demo</a>
            <a className="btn btn-ghost" href="/?demo=gym">▶ Gym owner demo</a>
          </div>
          <p className="muted small">The demos open a sample family and a sample gym — no sign-up, nothing saved.</p>
          <p className="muted small">{PLANS.parent.trialDays}-day free trial · No card needed · Cancel anytime</p>
        </div>
        <HeroDemo />
      </section>

      <section className="l-section l-how">
        <p className="eyebrow center">How it works</p>
        <h2>From a paper schedule to a season that runs itself</h2>
        <div className="l-steps">{STEPS.map(([i, t, d], n) => <div key={t} className="l-step"><span className="l-num">{n + 1}</span><span className="l-icon" aria-hidden>{i}</span><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>

      <section className="l-section">
        <h2>Everything else a sports family juggles</h2>
        <div className="l-features">
          {FEATURES.map(([i, t, d]) => <div key={t} className="l-feature"><span className="l-icon" aria-hidden>{i}</span><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>

      <section className="l-section l-gym">
        <div>
          <p className="eyebrow">For gym owners and booster clubs</p>
          <h2>Upload your roster and one schedule photo. Every family is set up.</h2>
          <p className="l-lead">Parents search for their athlete instead of filling in forms. Each family sees only their level's competitions with session times, your announcements reach everyone as a short summary, and questions come to one inbox instead of your phone.</p>
          <ul className="perks">{PLANS.gym.features.map((f) => <li key={f}>{f}</li>)}</ul>
          <div className="row"><a className="btn btn-primary" href="/register?type=gym" onClick={go("/register?type=gym")}>Start my gym free for 30 days</a><a className="btn btn-ghost" href="/?demo=gym">▶ See the gym demo</a></div>
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
          <p className="center muted">{`${PLANS.gym.name}: Basic for up to ${PLANS.gym.seats} families, roster, season schedule, messages, announcements and a families-joined dashboard.`}</p>
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
