import { TOP_FAQ } from "../data/faq.js";
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
// 3D showcase: three phones floating in an orbit, each playing a short real screen recording.
const ORBIT = [
  ["schedule", "Season from one photo", "Only Maya’s meets kept ✓"],
  ["live", "Live scores", "● LIVE  Maya P. 35.305"],
  ["coach", "Coach G", "Meet-day food plan ready"],
];
function Orbit3D() {
  const ref = React.useRef(null); const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Load and play the clips only while the section is on screen — the page itself stays light.
    const io = new IntersectionObserver(([e]) => { setOn(e.isIntersecting); el.querySelectorAll("video").forEach((v) => { if (e.isIntersecting && !v.poster) v.poster = v.dataset.poster; if (e.isIntersecting && !still) { if (!v.src) v.src = v.dataset.src + (v.canPlayType('video/mp4; codecs="avc1.42E01E"') ? ".mp4" : ".webm"); v.play().catch(() => {}); } else v.pause(); }); }, { rootMargin: "300px" });
    io.observe(el);
    let raf = 0;
    const move = (e) => { if (still) return; const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`); el.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`); }); };
    const leave = () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
    el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave);
    return () => { io.disconnect(); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); };
  }, []);
  return (
    <section className={`l-orbit ${on ? "on" : ""}`} ref={ref} aria-label="AthleteOrbit on a phone">
      <div className="o-copy"><p className="eyebrow">● Real app, real screens</p><h2>Your athlete's whole season, in orbit.</h2><p>Schedule, live scores and an AI coach — one app the whole family checks.</p></div>
      <div className="o-stage">
        <i className="o-ring r1" aria-hidden /><i className="o-ring r2" aria-hidden /><i className="o-glow" aria-hidden />
        {ORBIT.map(([k, t, chip], n) => (
          <figure key={k} className={`o-phone p${n}`}>
            <div className="o-screen"><video muted loop playsInline preload="none" data-poster={`/videos/orbit-${k}.jpg`} data-src={`/videos/orbit-${k}`} aria-label={`${t} screen recording`} /></div>
            <figcaption className="o-chip">{chip}</figcaption>
            <span className="o-label">{t}</span>
          </figure>
        ))}
      </div>
    </section>
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
const FAQ = TOP_FAQ;
// For every parent — no sport needed.
const EVERY_KID = [["📚", "School & reading", "Reading minutes, test scores and report cards in one place — see progress over the year."], ["🥦", "Picky eaters & lunchboxes", "Coach G writes school-day food plans, lunchbox ideas and a week of family dinners."], ["✅", "Life skills by age", "Tie shoes, pack a bag, cook a meal, save money — checklists for ages 2 to 17."], ["😴", "Sleep, screens & habits", "Simple routines and goals your child can see in their own read-only view."]];
// Phones get the short version of long sections, with "Show more".
function More({ items, n = 4, render, className }) {
  const [all, setAll] = useState(false);
  const small = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;
  const list = all || !small ? items : items.slice(0, n);
  return <>{<div className={className}>{list.map(render)}</div>}{small && !all && items.length > n && <p className="center"><button className="link" onClick={() => setAll(true)}>Show {items.length - n} more ›</button></p>}</>;
}

export default function Landing({ nav }) {
  const [who, setWho] = useState("parent"); const [term, setTerm] = useState("yearly"); const [tierSel, setTierSel] = useState("basic"); const [contact, setContact] = useState(false);
  const go = (path) => (e) => { e.preventDefault(); nav(path); };
  return (
    <div className="landing">
      <header className="l-nav">
        <a href="/" onClick={go("/")}><Logo small /></a>
        <nav className="l-links">
          <a href="/live" onClick={go("/live")}>● Live scores</a>
          <a href="/tour" onClick={go("/tour")} className="hide-sm">Tour</a>
          <a href="#pricing">Pricing</a>
          <a href="/login" onClick={go("/login")}>Log in</a>
          <a href="/register" onClick={go("/register")} className="btn btn-primary"><span className="hide-sm">Start free trial</span><span className="only-sm">Try free</span></a>
        </nav>
      </header>

      <section className="l-hero">
        <div className="l-hero-text">
          <p className="eyebrow">For sports families — and every parent</p>
          <h1>Snap your gym's schedule. See only <em>your</em> athlete's meets.</h1>
          <p className="l-sports" aria-label="Sports">🤸 Gymnastics · 🏊 Swimming · 📣 Cheer & Dance · ⚽ Soccer · 🏀 Basketball · 🎾 Tennis · 🌱 Not in a sport? Yes, you too</p>
          <p className="l-lead">One photo of the season schedule and {APP.name} builds each child's calendar by level — then finds the host, the meet website and your session time online, and reminds you before every one. Scores, costs, packing lists and messages with your gym live in the same app.</p>
          <div className="row">
            <a className="btn btn-primary" href="/register" onClick={go("/register")}>Start 7-day free trial</a>
            <a className="btn btn-ghost" href="/?demo">▶ Try the parent demo</a>
            <a className="btn btn-ghost" href="/?demo=gym">▶ Gym owner demo</a>
          </div>
          <p className="muted small hide-sm">The demos open a sample family and a sample gym — no sign-up, nothing saved.</p>
          <p className="muted small">{PLANS.parent.trialDays}-day free trial · No card needed · Cancel anytime</p>
        </div>
        <HeroDemo />
      </section>

      <Orbit3D />

      <section className="l-section l-live">
        <div className="l-live-card">
          <div><p className="eyebrow">● Free for everyone</p><h2>Live scores for every sport</h2><p className="l-lead">Gymnastics meets, swim meets, soccer and basketball tournaments, cheer competitions — follow live, look up past results, share a score card. No account needed.</p>
            <div className="row"><a className="btn btn-primary" href="/live" onClick={go("/live")}>See live scores</a><a className="btn btn-ghost" href="/?page=events">Post scores for your event</a></div></div>
        </div>
      </section>

      <section className="l-section l-every">
        <p className="eyebrow center">Not a sports family?</p>
        <h2>AthleteOrbit works for every kid</h2>
        <p className="center muted">Pick <b>🌱 Growing Up</b> when you add your child — no sport needed.</p>
        <More items={EVERY_KID} n={2} className="l-features" render={([i, t, d]) => <div key={t} className="l-feature"><span className="l-icon" aria-hidden>{i}</span><h3>{t}</h3><p>{d}</p></div>} />
        <p className="center"><a className="btn btn-ghost" href="/register?sport=Growing%20Up" onClick={go("/register?sport=Growing%20Up")}>Start free for my child</a></p>
      </section>

      <section className="l-section l-video hide-sm">
        <p className="eyebrow center">See it in action</p>
        <h2>Three minutes, every feature</h2>
        <video poster="/videos/walkthrough.jpg" controls playsInline preload="none"><source src="/videos/walkthrough.mp4" type="video/mp4" /><source src="/videos/walkthrough.webm" type="video/webm" /></video>
        <p className="center"><a href="/tour" onClick={go("/tour")} className="link">Watch each feature on its own ›</a></p>
      </section>

      <section className="l-section l-how hide-sm">
        <p className="eyebrow center">How it works</p>
        <h2>From a paper schedule to a season that runs itself</h2>
        <div className="l-steps">{STEPS.map(([i, t, d], n) => <div key={t} className="l-step"><span className="l-num">{n + 1}</span><span className="l-icon" aria-hidden>{i}</span><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>

      <section className="l-section">
        <h2>Everything else a sports family juggles</h2>
        <More items={FEATURES} n={3} className="l-features" render={([i, t, d]) => <div key={t} className="l-feature"><span className="l-icon" aria-hidden>{i}</span><h3>{t}</h3><p>{d}</p></div>} />
      </section>

      <section className="l-section l-gym">
        <div>
          <p className="eyebrow">For gym owners and booster clubs</p>
          <h2>Upload your roster and one schedule photo. Every family is set up.</h2>
          <p className="l-lead">Parents search for their athlete instead of filling in forms. Each family sees only their level's competitions with session times, your announcements reach everyone as a short summary, and questions come to one inbox instead of your phone.</p>
          <ul className="perks hide-sm">{PLANS.gym.features.map((f) => <li key={f}>{f}</li>)}</ul>
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
        <More items={FAQ} n={4} className="faq" render={([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>} />
        <p className="center"><a href="/faq" onClick={go("/faq")} className="link">See all questions ›</a></p>
      </section>

      <footer className="l-foot">
        <Logo small />
        <p className="muted small">{APP.supportEmail}{APP.supportPhone ? ` · ${APP.supportPhone}` : ""}</p>
        <p className="small"><a href="/tour" onClick={go("/tour")}>Feature tour</a> · <a href="/about" onClick={go("/about")}>About us</a> · <a href="/contact" onClick={go("/contact")}>Contact us</a> · <a href="/faq" onClick={go("/faq")}>FAQ</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>
        <p className="muted small">Independent app. Not affiliated with any sport governing body.</p>
      </footer>
      {contact && <ContactSheet onClose={() => setContact(false)} />}
    </div>
  );
}
