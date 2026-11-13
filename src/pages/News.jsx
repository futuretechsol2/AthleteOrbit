import React, { useEffect, useState } from "react";
import { api } from "../lib/db.js";
import { Spinner, ErrorNote, fmt } from "../ui.jsx";

export default function News() {
  const [d, setD] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => {
    api("news", null, "GET").then((r) => {
      setD(r);
      const latest = (r.announcements || [])[0]?.created_at;
      if (latest) try { localStorage.setItem("gp-ann-seen", latest); } catch {}
    }).catch(setErr);
  }, []);
  return (
    <div className="stack">
      <div className="page-head"><h1>News</h1></div>
      <ErrorNote error={err} />
      {!d && !err && <Spinner label="Loading news…" />}
      {d && (
        <>
          <h2 className="section">From your gym</h2>
          {!d.announcements.length && <p className="muted small">Gym announcements show up here when your gym uses a AthleteOrbit gym plan.</p>}
          {d.announcements.map((a) => (
            <article key={a.id} className="card"><p className="muted small">{fmt.date(a.created_at.slice(0, 10))}</p><h3>{a.title}</h3><p className="pre">{a.body}</p></article>
          ))}
          <h2 className="section">Sports news</h2>
          {!d.news.length && <p className="muted small">No headlines right now.</p>}
          {d.news.map((n, i) => (
            <a key={i} className="card link-card" href={n.link} target="_blank" rel="noopener noreferrer">
              <span className="grow"><b>{n.title}</b><small className="muted">{n.source}{n.date ? ` · ${fmt.date(n.date.slice(0, 10))}` : ""}</small></span><span aria-hidden>↗</span>
            </a>
          ))}
        </>
      )}
    </div>
  );
}
