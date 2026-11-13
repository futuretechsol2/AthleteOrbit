// Public pages: About us, Contact us, and the Feature tour (videos + try-it links + end-to-end test path).
import React, { useEffect, useState } from "react";
import { APP } from "../config.js";
import { TIERS } from "../data/plans.js";
import { FEATURES, TEST_PATH } from "../data/tour.js";
import { Logo } from "./Auth.jsx";
import { ContactSheet } from "./Extras.jsx";

function Page({ nav, children, wide = false }) {
  const go = (to) => (e) => { e.preventDefault(); nav(to); };
  return (
    <div className="info">
      <header className="info-top"><a href="/welcome" onClick={go("/welcome")} aria-label={`${APP.name} home`}><Logo small /></a>
        <nav><a href="/tour" onClick={go("/tour")}>Tour</a><a href="/about" onClick={go("/about")}>About</a><a href="/contact" onClick={go("/contact")}>Contact</a><a className="btn btn-primary sm" href="/register">Start free</a></nav></header>
      <main className={wide ? "info-main wide" : "info-main"}>{children}</main>
      <footer className="l-foot"><Logo small /><p className="muted small">{APP.supportEmail} · {APP.supportPhone}</p><p className="small"><a href="/tour" onClick={go("/tour")}>Feature tour</a> · <a href="/about" onClick={go("/about")}>About us</a> · <a href="/contact" onClick={go("/contact")}>Contact us</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p><p className="muted small">Independent app. Not affiliated with any sport governing body.</p></footer>
    </div>
  );
}

export function About({ nav }) {
  return (
    <Page nav={nav}>
      <section className="info-hero"><p className="eyebrow">About us</p><h1>Built by a gym dad who was tired of the group text.</h1>
        <p className="lead">{APP.name} started in Concord, North Carolina, at the side of a gymnastics floor. With two kids competing, every season meant a paper schedule for every level, session times that showed up a week before, hundreds of photos lost across phones and the same questions sent to the coach again and again.</p></section>
      <section className="info-grid">
        <div className="card"><h3>What we believe</h3><ul className="perks"><li><b>Parents should coach less and cheer more.</b> The app does the organizing.</li><li><b>Gyms shouldn't be help desks.</b> One upload, and every family has what they need.</li><li><b>Kids' data stays private.</b> Photos are private by default; other families see first names and last initials only. We never sell data.</li></ul></div>
        <div className="card"><h3>Who it's for</h3><ul className="perks"><li><b>Families</b> in gymnastics, swimming, cheer & dance, soccer, basketball, tennis, volleyball, baseball & softball, martial arts, music and academic competitions.</li><li><b>Gyms and clubs</b> that want one place for roster, schedule, announcements and messages.</li><li><b>Meet organizers</b> who want online tickets and phone scanning at the door.</li></ul></div>
      </section>
      <section className="card"><h3>The company</h3><p>{APP.name} is made by FutureTech AI, a small team in the Charlotte, NC area building practical AI tools for families and small businesses. The founder is a data engineer with 15 years of experience in banking, insurance and healthcare systems, an Army National Guard member, and a sports parent.</p>
        <p className="muted small">Plans: Basic ${TIERS.basic.prices.monthly}/month, Pro ${TIERS.pro.prices.monthly}/month, 7-day free trial. Gyms start free for 30 days.</p>
        <div className="row"><a className="btn btn-primary" href="/tour" onClick={(e) => { e.preventDefault(); nav("/tour"); }}>▶ Watch the tour</a><a className="btn btn-ghost" href="/contact" onClick={(e) => { e.preventDefault(); nav("/contact"); }}>Talk to us</a></div></section>
    </Page>
  );
}

export function Contact({ nav, session }) {
  const [open, setOpen] = useState(false);
  return (
    <Page nav={nav}>
      <section className="info-hero"><p className="eyebrow">Contact us</p><h1>We answer every message.</h1><p className="lead">Questions about your account, a gym or club plan, selling meet tickets, or a feature you'd like? Reach us any of these ways — usually the same business day.</p></section>
      <section className="info-grid three">
        <a className="card contact-card" href={`mailto:${APP.supportEmail}`}><span aria-hidden>✉️</span><b>Email</b><small>{APP.supportEmail}</small></a>
        <a className="card contact-card" href={`tel:${APP.supportPhone.replace(/[^\d+]/g, "")}`}><span aria-hidden>📞</span><b>Call or text</b><small>{APP.supportPhone} · {APP.supportHours}</small></a>
        <button className="card contact-card" onClick={() => setOpen(true)}><span aria-hidden>💬</span><b>Send a message</b><small>Pick a topic and we'll reply by email</small></button>
      </section>
      <section className="card"><h3>Gyms, clubs and meet organizers</h3><p>Want a 15-minute walkthrough for your staff or booster club? Send a message with “Gym / club plan” as the topic and we'll set up a time. Gyms can also start a free 30-day trial right away.</p><div className="row"><a className="btn btn-primary" href="/register?type=gym">Start my gym free</a><button className="btn btn-ghost" onClick={() => setOpen(true)}>Book a walkthrough</button></div></section>
      {open && <ContactSheet email={session?.user?.email || ""} onClose={() => setOpen(false)} />}
    </Page>
  );
}

export function Tour({ nav }) {
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem("ao-test-path")) || {}; } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("ao-test-path", JSON.stringify(done)); } catch {} }, [done]);
  const total = TEST_PATH.reduce((a, g) => a + g.steps.length, 0), n = Object.values(done).filter(Boolean).length;
  return (
    <Page nav={nav} wide>
      <section className="info-hero"><p className="eyebrow">Feature tour</p><h1>See {APP.name} in action</h1><p className="lead">Six short videos, one per feature. Tap “Try it” to open the same screen in the demo — no sign-up, nothing saved.</p>
        <div className="row"><a className="btn btn-primary" href="#full">▶ Watch the full walkthrough</a><a className="btn btn-ghost" href="#test">End-to-end test path</a></div></section>
      <section className="tour-grid">
        {FEATURES.map((f) => (
          <article key={f.key} className="card tour-card" id={f.key}>
            <video poster={`/videos/${f.video}.jpg`} controls playsInline preload="none" muted><source src={`/videos/${f.video}.mp4`} type="video/mp4" /><source src={`/videos/${f.video}.webm`} type="video/webm" /></video>
            <div className="tour-body"><p className="eyebrow">{f.icon} {f.who}</p><h3>{f.title}</h3><p className="tour-problem"><b>The problem:</b> {f.problem}</p><p>{f.how}</p><a className="btn btn-ghost sm" href={f.try}>Try it in the demo ›</a></div>
          </article>
        ))}
      </section>
      <section className="card full-video" id="full"><h2>The full walkthrough</h2><p className="muted">Every feature, end to end, in about three minutes (played a little faster).</p><video poster="/videos/walkthrough.jpg" controls playsInline preload="none"><source src="/videos/walkthrough.mp4" type="video/mp4" /><source src="/videos/walkthrough.webm" type="video/webm" /></video></section>
      <section className="card" id="test">
        <div className="card-head"><h2>End-to-end test path</h2><span className="pill">{n} of {total} done</span></div>
        <p className="muted small">Walk through every feature in order. Each step opens the right screen in the demo; tick it when it works. Progress is saved on this device.</p>
        {TEST_PATH.map((g) => (
          <div key={g.group} className="test-group"><h3>{g.group}</h3>
            {g.steps.map(([text, href]) => { const k = `${g.group}:${text}`; return (
              <div key={k} className="test-step"><label className="check grow"><input type="checkbox" checked={!!done[k]} onChange={(e) => setDone({ ...done, [k]: e.target.checked })} /> <span>{text}</span></label><a className="link small" href={href} target="_blank" rel="noreferrer">Open ›</a></div>
            ); })}
          </div>
        ))}
        {n > 0 && <button className="link" onClick={() => setDone({})}>Reset</button>}
      </section>
    </Page>
  );
}
