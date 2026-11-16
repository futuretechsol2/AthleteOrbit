// Athlete recruiting page: the parent builds it in the app; the public page lives at /a/<name>.
import React, { useEffect, useState } from "react";
import { api, DEMO } from "../lib/db.js";
import { Button, Field, Sheet, ErrorNote, Spinner, fmt } from "../ui.jsx";
import { Logo } from "./Auth.jsx";

export function RecruitEditor({ gymnast, onClose }) {
  const [d, setD] = useState(null); const [f, setF] = useState(null); const [photos, setPhotos] = useState([]); const [err, setErr] = useState(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api("athlete/page", null, "GET", { gymnast: gymnast.id }), api("photos", null, "GET", { gymnast: gymnast.id }).catch(() => ({ photos: [] }))]).then(([r, ph]) => {
      setD(r); setPhotos((ph.photos || []).filter((p) => p.mine).slice(0, 24));
      const p = r.page || {};
      setF({ display_name: p.display_name || `${gymnast.name}`, bio: p.bio || "", grad_year: p.grad_year || "", highlights: (p.highlights || []).join("\n"), videos: (p.videos || []).map((v) => `${v.title} | ${v.url}`).join("\n"), photo_ids: p.photo_ids || [], show_scores: p.show_scores !== false, contact_email: p.contact_email || "", published: !!p.published });
    }).catch(setErr);
  }, [gymnast.id]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  async function save(published) {
    setBusy(true); setErr(null); setMsg("");
    try {
      const r = await api("athlete/page", { gymnastId: gymnast.id, ...f, published, grad_year: f.grad_year ? Number(f.grad_year) : null, highlights: f.highlights.split("\n").map((s) => s.trim()).filter(Boolean),
        videos: f.videos.split("\n").map((l) => { const [a, b] = l.includes("|") ? l.split("|") : ["Video", l]; return { title: a.trim(), url: (b || "").trim() }; }).filter((v) => v.url) });
      setF({ ...f, published }); setD({ ...d, url: r.url }); setMsg(published ? "Published. Share the link with coaches." : "Saved. Only you can see it until you publish.");
    } catch (e) { setErr(e); }
    setBusy(false);
  }
  async function buy() { setBusy(true); try { await save(false); const r = await api("athlete/page-checkout", { gymnastId: gymnast.id }); location.href = r.url; } catch (e) { setErr(e); setBusy(false); } }
  return (
    <Sheet title={`${gymnast.name}'s recruiting page`} onClose={onClose}>
      {!f ? (err ? <ErrorNote error={err} /> : <Spinner />) : (
        <div className="form">
          <p className="muted small">A shareable page for college coaches: highlights, best scores, videos and graduation year. Private until you publish. Show only what you're comfortable sharing — we suggest first name and last initial.</p>
          <div className="grid2"><Field label="Name shown"><input value={f.display_name} maxLength={60} onChange={set("display_name")} /></Field><Field label="Graduation year"><input inputMode="numeric" value={f.grad_year} onChange={set("grad_year")} placeholder="2031" /></Field></div>
          <Field label="About"><textarea rows={3} maxLength={1200} value={f.bio} onChange={set("bio")} placeholder="Level 9, competing since age 6. Strongest events: beam and floor." /></Field>
          <Field label="Highlights" hint="One per line"><textarea rows={3} value={f.highlights} onChange={set("highlights")} placeholder={"State champion on beam 2026\n1st all-around, Queen City Classic"} /></Field>
          <Field label="Videos" hint="One per line: Title | link (YouTube, Vimeo, Hudl or Google Drive)"><textarea rows={3} value={f.videos} onChange={set("videos")} placeholder="Floor routine 2026 | https://youtu.be/…" /></Field>
          {photos.length > 0 && <Field label="Photos to show"><div className="photo-grid small">{photos.map((p) => <button type="button" key={p.id} className={`photo-tile pick ${f.photo_ids.includes(p.id) ? "on" : ""}`} onClick={() => setF({ ...f, photo_ids: f.photo_ids.includes(p.id) ? f.photo_ids.filter((x) => x !== p.id) : [...f.photo_ids, p.id].slice(0, 8) })}><img src={p.url} alt="" />{f.photo_ids.includes(p.id) && <span className="tile-tag">✓</span>}</button>)}</div></Field>}
          <Field label="Contact email for coaches (optional)"><input type="email" value={f.contact_email} onChange={set("contact_email")} /></Field>
          <label className="check"><input type="checkbox" checked={f.show_scores} onChange={set("show_scores")} /> Show best scores and recent meets</label>
          {msg && <p className="note note-ok">{msg}{d.url && f.published ? <> <a href={d.url} target="_blank" rel="noreferrer">Open page ›</a></> : null}</p>}
          <ErrorNote error={err} />
          <div className="row"><Button kind="ghost" disabled={busy} onClick={() => save(false)}>{f.published ? "Unpublish" : "Save draft"}</Button>
            {d.canPublish ? <Button disabled={busy} onClick={() => save(true)}>{f.published ? "Save & keep published" : "Publish page"}</Button> : <Button disabled={busy || DEMO} onClick={buy}>Publish — ${d.price}/year</Button>}</div>
          {!d.canPublish && <p className="muted small">Included free with Pro.</p>}
        </div>
      )}
    </Sheet>
  );
}

// /a/<slug> — public, no sign-in
export function AthletePublic({ slug, nav }) {
  const [a, setA] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { api("athlete/public", null, "GET", { slug }).then((r) => setA(r.athlete)).catch(setErr); }, [slug]);
  const EV = { vault: "Vault", bars: "Bars", beam: "Beam", floor: "Floor", pommel: "Pommel", rings: "Rings", pbars: "P-Bars", highbar: "High Bar", aa: "All-around" };
  return (
    <div className="info">
      <header className="info-top"><a href="/welcome" onClick={(e) => { e.preventDefault(); nav("/welcome"); }}><Logo small /></a><nav><a href="/live">Live scores</a></nav></header>
      <main className="info-main">
        {err ? <div className="card"><h2>Page not found</h2><p className="muted">This athlete page isn't published.</p></div> : !a ? <Spinner /> : <>
          <section className="athlete-hero">
            {a.photos?.[0] && <img src={a.photos[0]} alt="" />}
            <div><p className="eyebrow">{a.sport}{a.level ? ` · ${a.level}` : ""}{a.grad_year ? ` · Class of ${a.grad_year}` : ""}</p><h1>{a.name}</h1>{a.club && <p className="muted">{a.club}</p>}</div>
          </section>
          {a.bio && <section className="card"><p className="pre">{a.bio}</p></section>}
          {a.highlights?.length > 0 && <section className="card"><h3>Highlights</h3><ul className="perks">{a.highlights.map((h) => <li key={h}>{h}</li>)}</ul></section>}
          {a.best && Object.keys(a.best).length > 0 && <section className="card"><h3>Best scores</h3><div className="best-grid">{Object.entries(a.best).map(([k, v]) => <div key={k}><small>{EV[k] || k}</small><b>{Number(v).toFixed(3)}</b></div>)}</div>
            {a.recent?.length > 0 && <><h3>Recent meets</h3>{a.recent.map((r, i) => <div key={i} className="list-row"><span className="grow">{r.meet}<small className="muted"> · {fmt.date(r.date)}{r.level ? ` · ${r.level}` : ""}</small></span><b>{r.aa.toFixed(3)}</b></div>)}</>}</section>}
          {a.videos?.length > 0 && <section className="card"><h3>Videos</h3>{a.videos.map((v) => <a key={v.url} className="list-row" href={v.url} target="_blank" rel="noopener noreferrer"><span className="grow">▶ {v.title}</span><span aria-hidden>↗</span></a>)}</section>}
          {a.photos?.length > 1 && <section className="photo-grid">{a.photos.slice(1).map((u) => <div key={u} className="photo-tile"><img src={u} alt="" /></div>)}</section>}
          {a.contact_email && <section className="card"><h3>Contact</h3><p>Coaches: <a href={`mailto:${a.contact_email}`}>{a.contact_email}</a></p></section>}
          <p className="muted small center">Page shared by the athlete's family on AthleteOrbit.</p>
        </>}
      </main>
    </div>
  );
}
