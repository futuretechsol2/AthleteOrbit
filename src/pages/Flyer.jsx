import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { APP } from "../config.js";
import { PLANS, TIERS, money } from "../data/plans.js";
import { Logo } from "./Auth.jsx";

// Printable one-page flyer with a QR code to sign up. /flyer?gym=CODE&name=Gym makes a gym-specific version.
export default function Flyer() {
  const sp = new URLSearchParams(location.search);
  const gym = sp.get("gym"), gymName = sp.get("name");
  const base = (import.meta.env.VITE_APP_URL || location.origin).replace(/\/$/, "");
  const url = gym ? `${base}/register?gym=${encodeURIComponent(gym)}` : `${base}/register`;
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: "#16213E", light: "#FFFFFF" } }).then(setQr).catch(() => {}); }, [url]);
  return (
    <div className="flyer-wrap">
      <div className="flyer-actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
        <a className="btn btn-ghost" href="/">Back to app</a>
      </div>
      <article className="flyer">
        <header><Logo /><p className="eyebrow">{gymName ? `${gymName} families` : "For gymnastics families"}</p></header>
        <h1>Every meet, score and dollar of the season. In one app.</h1>
        <ul className="flyer-list">
          <li><b>Scores & skills</b>: snap the score sheet, see season bests and level readiness</li>
          <li><b>Meet reminders</b>: 14, 7, 2 and 1 days out, with packing lists</li>
          <li><b>Travel</b>: hotels, flights and a trip plan for away meets</li>
          <li><b>Costs & budget</b>: tuition, fees, hotels and gear, per child</li>
          <li><b>AI coach</b>: explains scores, reviews a short video, plans the next level</li>
          <li><b>Family calendar</b>: every child, every event, every deadline</li>
        </ul>
        <div className="flyer-bottom">
          <div>
            {gym ? (
              <>
                <p className="flyer-big">Pro is included for {gymName || "our gym"}'s families</p>
                <p>Scan, create your account and enter gym code</p>
                <p className="flyer-code">{gym}</p>
              </>
            ) : (
              <>
                <p className="flyer-big">{PLANS.parent.trialDays}-day free trial · no card</p>
                <p>Plans from {money(TIERS.basic.prices.monthly)}/month · Basic, Plus or Pro</p>
                <p className="muted">Gyms: Pro for up to {PLANS.gym.seats} families from {money(PLANS.gym.prices.monthly)}/month</p>
              </>
            )}
            <p className="flyer-url">{url.replace(/^https?:\/\//, "")}</p>
          </div>
          {qr && <img src={qr} alt={`QR code to ${url}`} className="flyer-qr" />}
        </div>
        <footer className="muted small">{APP.supportEmail} · Not affiliated with USA Gymnastics.</footer>
      </article>
    </div>
  );
}
