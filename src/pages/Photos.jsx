// Meet photos: drop in the whole camera roll from a meet weekend — each photo lands in the right event by the day it
// was taken. Private by default; share with teammates' families at the same gym competition. Order prints, or a
// Season Book that puts every event's photos and results together, printed and shipped.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, db, uploadPhotos, uploadBook, DEMO } from "../lib/db.js";
import { photoDate, printReady, meetForDate } from "../lib/media.js";
import { PRINTS, printTotal, SHIPPING } from "../data/prints.js";
import { allAround } from "../data/skills.js";
import { conf, sportOf, usesScores } from "../data/sports.js";
import { Button, Field, Sheet, Empty, ErrorNote, Spinner, fmt } from "../ui.jsx";

const usd = (n) => `$${Number(n).toFixed(2)}`;
const day = (iso) => (iso ? fmt.date(String(iso).slice(0, 10)) : "");

export default function Photos({ gymnast, gymnasts = [], go, can, upgrade }) {
  const kids = gymnast ? [gymnast] : gymnasts;
  const [who, setWho] = useState(gymnast?.id || gymnasts[0]?.id || "");
  const kid = gymnasts.find((g) => g.id === who) || gymnast || gymnasts[0];
  const [data, setData] = useState(null); const [meets, setMeets] = useState([]); const [err, setErr] = useState(null);
  const [adding, setAdding] = useState(null); const [view, setView] = useState(null); const [cart, setCart] = useState(null); const [book, setBook] = useState(false);
  const file = useRef(null);
  const printed = new URLSearchParams(location.search).get("printed");
  const load = async () => {
    if (!kid) return;
    try { const [r, m] = await Promise.all([api("photos", null, "GET", { gymnast: kid.id }), db.list("meets", { gymnast_id: kid.id })]); setData(r); setMeets(m); } catch (e) { setErr(e); setData({ photos: [] }); }
  };
  useEffect(() => { setData(null); load(); }, [kid?.id]);
  if (!kid) return <Empty icon="📸" title="Add an athlete first" text="Photos are kept per athlete and sorted by event." />;
  if (!can("photos")) return <Empty icon="📸" title="Photos & prints are in Basic" text="Keep every event's photos in one place, sorted automatically, and order prints or a Season Book." action={<Button onClick={() => upgrade("photos")}>See plans</Button>} />;
  const S = conf(sportOf(kid));

  async function pick(files) {
    const list = [...(files || [])].filter((f) => f.type.startsWith("image/")).slice(0, 60);
    if (!list.length) return;
    setErr(null); setAdding({ step: "reading", total: list.length, done: 0, items: [] });
    const items = [];
    for (const f of list) {
      try {
        const taken_at = await photoDate(f); const r = await printReady(f);
        const m = meetForDate(meets, taken_at);
        items.push({ blob: r.blob, width: r.width, height: r.height, preview: r.canvas.toDataURL("image/jpeg", 0.5), taken_at, meetId: m?.id || "", gymnastId: kid.id, shared: false });
      } catch {}
      setAdding((a) => ({ ...a, done: items.length }));
    }
    setAdding({ step: "review", items, total: items.length, done: 0 });
  }

  const photos = data?.photos || [];
  const groups = groupByMeet(photos, meets);
  return (
    <div className="stack">
      <section className="hero photos-hero">
        <p className="eyebrow">📸 Photos & prints</p>
        <h1>{kid.name}'s {S.event.toLowerCase()} photos</h1>
        <p className="hero-sub">Add a whole weekend of photos at once — each one is filed under the right {S.event.toLowerCase()} by the day it was taken.</p>
        <div className="row"><Button onClick={() => file.current?.click()}>＋ Add photos</Button>{photos.length > 0 && <Button kind="ghost" className="on-dark" onClick={() => setCart({})}>🖨️ Order prints</Button>}</div>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </section>
      {!gymnast && gymnasts.length > 1 && <div className="chips">{gymnasts.map((g) => <button key={g.id} className={`chip ${g.id === who ? "on" : ""}`} onClick={() => setWho(g.id)}>{g.name}</button>)}</div>}
      {printed && <p className="note note-ok"><b>Order placed.</b> Your prints are on the way to the lab — we'll email you. Most arrive in 5–8 business days.</p>}
      <button className="card book-cta" onClick={() => (can("seasonBook") ? setBook(true) : upgrade("seasonBook"))}>
        <span className="book-art" aria-hidden><i /><b>{kid.name.slice(0, 1)}</b></span>
        <span className="grow"><b>{kid.name}'s Season Book</b><small>Every {S.event.toLowerCase()} with its photos and {S.results.toLowerCase()} — download a PDF or order a hardcover.</small></span>{!can("seasonBook") ? <i className="lock">Pro</i> : <span aria-hidden>›</span>}
      </button>
      <ErrorNote error={err} />
      {!data ? <div className="skeleton" /> : !photos.length ? (
        <Empty icon="📷" title="No photos yet" text={`Tap “Add photos” and pick everything from the ${S.event.toLowerCase()} — we'll sort them. Photos stay private unless you share them with your team.`} />
      ) : groups.map((g) => (
        <section key={g.key} className="photo-group">
          <div className="card-head"><h3>{g.title}</h3><span className="muted small">{g.sub}</span></div>
          <div className="photo-grid">{g.photos.map((p) => <button key={p.id} className="photo-tile" onClick={() => setView(p)} aria-label={p.caption || "Open photo"}><img src={p.url} alt={p.caption || ""} loading="lazy" />{!p.mine ? <span className="tile-tag">Team</span> : p.shared ? <span className="tile-tag">Shared</span> : null}</button>)}</div>
        </section>
      ))}
      <p className="muted small center">Some meets only allow photos of your own child — please follow each event's photo policy. Shared photos are visible only to families of your gym at the same {S.event.toLowerCase()}.</p>
      {adding && <AddSheet state={adding} setState={setAdding} meets={meets} S={S} onClose={() => setAdding(null)} onDone={() => { setAdding(null); load(); }} />}
      {view && <Viewer photo={view} meets={meets} S={S} onClose={() => setView(null)} onChanged={() => { setView(null); load(); }} onPrint={(p) => { setView(null); setCart({ [p.id]: { p4x6: 1 } }); }} />}
      {cart && <PrintCart photos={photos} initial={cart} enabled={data?.printsEnabled} onClose={() => setCart(null)} />}
      {book && <SeasonBook kid={kid} meets={meets} photos={photos} S={S} printable={data?.bookPrintable} onClose={() => setBook(false)} />}
    </div>
  );
}

function groupByMeet(photos, meets) {
  const byId = Object.fromEntries(meets.map((m) => [m.id, m])), byClub = Object.fromEntries(meets.filter((m) => m.club_meet_id).map((m) => [m.club_meet_id, m]));
  const out = {};
  for (const p of photos) {
    const m = byId[p.meet_id] || byClub[p.club_meet_id];
    const key = m ? m.id : "none";
    (out[key] ||= { key, m, photos: [] }).photos.push(p);
  }
  return Object.values(out).sort((a, b) => (a.m && b.m ? (a.m.start_date < b.m.start_date ? 1 : -1) : a.m ? -1 : 1))
    .map((g) => ({ ...g, title: g.m ? g.m.name : "Other photos", sub: g.m ? `${day(g.m.start_date)} · ${g.photos.length} photo${g.photos.length === 1 ? "" : "s"}` : `${g.photos.length}` }));
}

function AddSheet({ state, setState, meets, S, onClose, onDone }) {
  const [err, setErr] = useState(null);
  const { step, items = [] } = state;
  const counts = items.reduce((a, it) => ({ ...a, [it.meetId || ""]: (a[it.meetId || ""] || 0) + 1 }), {});
  const setAll = (k, v) => setState({ ...state, items: items.map((it) => ({ ...it, [k]: v })) });
  const setOne = (i, k, v) => setState({ ...state, items: items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });
  const canShare = items.some((it) => meets.find((m) => m.id === it.meetId)?.club_meet_id);
  async function upload() {
    setErr(null); setState({ ...state, step: "uploading", done: 0 });
    try { await uploadPhotos(items, (n) => setState((s) => ({ ...s, done: n }))); onDone(); } catch (e) { setErr(e); setState({ ...state, step: "review" }); }
  }
  return (
    <Sheet title="Add photos" onClose={step === "uploading" ? () => {} : onClose}>
      {step === "reading" && <div className="reading"><Spinner label={`Reading photos… ${state.done} of ${state.total}`} /><p className="muted small center">Finding the day each photo was taken.</p></div>}
      {step === "uploading" && <div className="reading"><Spinner label={`Uploading ${state.done} of ${items.length}…`} /><div className="progress"><i style={{ width: `${(state.done / Math.max(1, items.length)) * 100}%` }} /></div></div>}
      {step === "review" && (
        <div className="stack">
          <p className="note note-ok"><b>{items.length} photos ready.</b> {Object.entries(counts).map(([k, n]) => `${n} → ${meets.find((m) => m.id === k)?.name || "no event"}`).join(" · ")}</p>
          <div className="photo-grid small">{items.map((it, i) => (
            <div key={i} className="photo-tile"><img src={it.preview} alt="" /><select className="tile-select" value={it.meetId} onChange={(e) => setOne(i, "meetId", e.target.value)} aria-label="Event for this photo"><option value="">No event</option>{meets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          ))}</div>
          {meets.length > 0 && <Field label={`Put all of them in one ${S.event.toLowerCase()}`}><select value="" onChange={(e) => e.target.value && setAll("meetId", e.target.value)}><option value="">Keep the automatic sorting</option>{meets.map((m) => <option key={m.id} value={m.id}>{m.name} · {day(m.start_date)}</option>)}</select></Field>}
          {canShare && <label className="check"><input type="checkbox" checked={items.every((it) => it.shared)} onChange={(e) => setAll("shared", e.target.checked)} /> Share with teammates' families from our gym at these {S.events.toLowerCase()}</label>}
          <ErrorNote error={err} />
          <Button className="wide" onClick={upload}>Save {items.length} photos</Button>
          <p className="muted small center">Saved in full quality for prints. Only you see them unless you share.</p>
        </div>
      )}
    </Sheet>
  );
}

function Viewer({ photo, meets, S, onClose, onChanged, onPrint }) {
  const [cap, setCap] = useState(photo.caption || ""); const [err, setErr] = useState(null);
  const save = async (update) => { setErr(null); try { await api("photos", { update: { id: photo.id, ...update } }); onChanged(); } catch (e) { setErr(e); } };
  return (
    <Sheet title={photo.caption || (photo.taken_at ? day(photo.taken_at) : "Photo")} onClose={onClose}>
      <div className="stack">
        <img className="viewer-img" src={photo.url} alt={photo.caption || ""} />
        <div className="row"><Button onClick={() => onPrint(photo)}>🖨️ Print this</Button><a className="btn btn-ghost" href={photo.url} download target="_blank" rel="noreferrer">⬇ Download</a></div>
        {photo.mine ? <>
          <Field label="Caption"><div className="row"><input className="grow" value={cap} maxLength={140} onChange={(e) => setCap(e.target.value)} placeholder="First clean beam routine!" /><Button kind="ghost" onClick={() => save({ caption: cap })}>Save</Button></div></Field>
          <Field label={S.event}><select value={photo.meet_id || ""} onChange={(e) => save({ meetId: e.target.value || null })}><option value="">No event</option>{meets.map((m) => <option key={m.id} value={m.id}>{m.name} · {day(m.start_date)}</option>)}</select></Field>
          {photo.club_meet_id && <label className="check"><input type="checkbox" checked={!!photo.shared} onChange={(e) => save({ shared: e.target.checked })} /> Shared with our gym's families at this {S.event.toLowerCase()}</label>}
          <button className="link danger" onClick={() => window.confirm("Delete this photo?") && api("photos", { remove: photo.id }).then(onChanged).catch(setErr)}>Delete photo</button>
        </> : <p className="muted small">Shared by another family from your gym.</p>}
        <ErrorNote error={err} />
      </div>
    </Sheet>
  );
}

function PrintCart({ photos, initial, enabled, onClose }) {
  const [sel, setSel] = useState(initial || {}); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const sizes = Object.keys(PRINTS).filter((k) => k !== "book");
  const lines = Object.entries(sel).flatMap(([id, by]) => Object.entries(by).filter(([, q]) => q > 0).map(([product, qty]) => ({ photoId: id, product, qty })));
  const t = printTotal(lines);
  const bump = (p, size, d) => setSel((s) => ({ ...s, [p.id]: { ...(s[p.id] || {}), [size]: Math.max(0, Math.min(50, ((s[p.id] || {})[size] || 0) + d)) } }));
  const fits = (p, size) => !p.width || Math.max(p.width, p.height) >= PRINTS[size].minPx;
  async function pay() { setBusy(true); setErr(null); try { const r = await api("photos/order", { items: lines }); location.href = r.url; } catch (e) { setErr(e); setBusy(false); } }
  return (
    <Sheet title="Order prints" onClose={onClose}>
      <div className="stack">
        <p className="muted">Lab-quality prints shipped to your door. Shipping {usd(SHIPPING.price)}, free over {usd(SHIPPING.freeOver)}.</p>
        {photos.map((p) => (
          <div key={p.id} className="print-row">
            <img src={p.url} alt="" />
            <div className="grow print-sizes">{sizes.map((k) => fits(p, k) ? (
              <div key={k} className="print-size"><small>{PRINTS[k].name} · {usd(PRINTS[k].price)}</small><div className="stepper"><button type="button" onClick={() => bump(p, k, -1)} aria-label={`One fewer ${PRINTS[k].name}`}>−</button><span>{(sel[p.id] || {})[k] || 0}</span><button type="button" onClick={() => bump(p, k, 1)} aria-label={`One more ${PRINTS[k].name}`}>＋</button></div></div>
            ) : null)}</div>
          </div>
        ))}
        <div className="tix-total"><span>{lines.reduce((a, l) => a + l.qty, 0)} prints {usd(t.sub)} + shipping {t.ship ? usd(t.ship) : "free"}</span><b>{usd(t.total)}</b></div>
        {enabled === false && <p className="note">Printing switches on soon. You can download any photo meanwhile.</p>}
        <ErrorNote error={err} />
        <Button className="wide" disabled={busy || !lines.length || enabled === false} onClick={pay}>{busy ? "Opening secure checkout…" : lines.length ? `Checkout · ${usd(t.total)}` : "Choose sizes"}</Button>
        {DEMO && <p className="muted small center">Checkout is off in the demo.</p>}
      </div>
    </Sheet>
  );
}

// ---------- Season Book: PDF made on the phone, printed as a hardcover if the family orders it ----------
function SeasonBook({ kid, meets, photos, S, printable, onClose }) {
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(null); const [pdf, setPdf] = useState(null); const [ordering, setOrdering] = useState(false);
  const past = meets.filter((m) => m.start_date <= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.start_date > b.start_date ? 1 : -1));
  const withPhotos = past.filter((m) => photos.some((p) => p.meet_id === m.id || (m.club_meet_id && p.club_meet_id === m.club_meet_id)));
  async function make() {
    setBusy("Building the book…"); setErr(null);
    try {
      const [scores, stats] = await Promise.all([usesScores(kid) ? db.list("scores", { gymnast_id: kid.id }) : [], usesScores(kid) ? [] : db.list("stats", { gymnast_id: kid.id })]);
      // Every competition of the season: calendar events, plus ones that only have results logged.
      const seen = new Set(past.map((m) => `${m.start_date}|${m.name.toLowerCase()}`));
      const fromResults = [...scores.map((x) => [x.meet_name, x.meet_date]), ...stats.map((x) => [x.event_name, x.event_date])].filter(([n, d]) => n && d && !seen.has(`${d}|${n.toLowerCase()}`) && !past.some((m) => m.start_date === d))
        .map(([n, d]) => (seen.add(`${d}|${n.toLowerCase()}`), { id: `r-${d}-${n}`, name: n, start_date: d }));
      const all = [...past, ...fromResults].sort((a, b) => (a.start_date > b.start_date ? 1 : -1));
      const blob = await buildBook({ kid, S, meets: all, photos, scores, stats, onPage: (n) => setBusy(`Building page ${n}…`) });
      setPdf({ blob, url: URL.createObjectURL(blob) });
    } catch (e) { setErr(e); }
    setBusy("");
  }
  async function orderBook() {
    setOrdering(true); setErr(null);
    try { const { path } = await uploadBook(pdf.blob); const r = await api("photos/order", { items: [{ product: "book", qty: 1, path, title: `${kid.name}'s season` }] }); location.href = r.url; } catch (e) { setErr(e); setOrdering(false); }
  }
  return (
    <Sheet title={`${kid.name}'s Season Book`} onClose={onClose}>
      <div className="stack">
        <div className="book-preview"><span className="book-art big" aria-hidden><i /><b>{kid.name.slice(0, 1)}</b></span>
          <div><b>{photos.length} photo{photos.length === 1 ? "" : "s"} · every {S.event.toLowerCase()} this season</b><p className="muted small">Cover, one page per {S.event.toLowerCase()} with photos and {S.results.toLowerCase()}, and a season-highlights page.</p></div></div>
        {!past.length && false && <p className="note">Add {S.events.toLowerCase()} and photos first — the book fills itself in.</p>}
        {past.length > 0 && withPhotos.length < past.length && <p className="muted small">{past.length - withPhotos.length} {S.events.toLowerCase()} have no photos yet — they'll show results only.</p>}
        <ErrorNote error={err} />
        {busy ? <Spinner label={busy} /> : !pdf ? <Button className="wide" onClick={make}>📖 Make the book</Button> : <>
          <a className="btn btn-primary wide" href={pdf.url} download={`${kid.name}-season-book.pdf`}>⬇ Download PDF</a>
          {printable ? <Button kind="ghost" className="wide" disabled={ordering || DEMO} onClick={orderBook}>{ordering ? "Opening checkout…" : `Order hardcover · ${usd(PRINTS.book.price)} + shipping`}</Button>
            : <p className="muted small center">Printed hardcovers are coming soon. The PDF prints well at any photo shop (8×8 in).</p>}
        </>}
      </div>
    </Sheet>
  );
}

async function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
function cover(img, w, h) { // centre-crop an image into a w×h JPEG data URL
  const c = document.createElement("canvas"); const px = 1400; c.width = px; c.height = Math.round((px * h) / w);
  const r = Math.max(c.width / img.width, c.height / img.height); const iw = img.width * r, ih = img.height * r;
  c.getContext("2d").drawImage(img, (c.width - iw) / 2, (c.height - ih) / 2, iw, ih); return c.toDataURL("image/jpeg", 0.86);
}
export async function buildBook({ kid, S, meets, photos, scores, stats, onPage }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "in", format: [8.25, 8.25] }); // 8×8 page + bleed
  const W = 8.25, M = 0.6, navy = [22, 33, 62], coral = [229, 82, 63];
  const pics = (m) => photos.filter((p) => p.meet_id === m.id || (m.club_meet_id && p.club_meet_id === m.club_meet_id));
  // Cover
  const coverPhoto = photos[0] && (await loadImg(photos[0].url));
  doc.setFillColor(...navy); doc.rect(0, 0, W, W, "F");
  if (coverPhoto) doc.addImage(cover(coverPhoto, 7.05, 4.6), "JPEG", M, M, W - 2 * M, 4.6);
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(34); doc.text(`${kid.name}'s season`, M, 6.15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.text(`${S.icon ? "" : ""}${sportOf(kid)} · ${kid.level || ""}${kid.club ? ` · ${kid.club}` : ""}`, M, 6.6);
  const yr = meets.length ? `${meets[0].start_date.slice(0, 4)}${meets.at(-1).start_date.slice(0, 4) !== meets[0].start_date.slice(0, 4) ? `–${meets.at(-1).start_date.slice(2, 4)}` : ""}` : "";
  doc.setFontSize(12); doc.setTextColor(244, 201, 93); doc.text(yr, M, 7.0);
  let page = 1;
  for (const m of meets) {
    doc.addPage([W, W]); page++; onPage?.(page);
    doc.setFillColor(251, 247, 241); doc.rect(0, 0, W, W, "F");
    doc.setTextColor(...coral); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(fmt.date(m.start_date).toUpperCase(), M, M + 0.1);
    doc.setTextColor(...navy); doc.setFontSize(22); doc.text(doc.splitTextToSize(m.name, W - 2 * M), M, M + 0.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(90, 96, 120); doc.text([m.location, m.host].filter(Boolean).join(" · "), M, M + 0.85);
    // Results line
    const sc = scores.find((s) => s.meet_name === m.name && s.meet_date === m.start_date) || scores.find((s) => s.meet_date === m.start_date);
    const st = stats.filter((s) => s.event_date === m.start_date);
    let res = "";
    if (sc) { const aa = allAround(sc); res = [["Vault", sc.vault], ["Bars", sc.bars], ["Beam", sc.beam], ["Floor", sc.floor], ["Pommel", sc.pommel], ["Rings", sc.rings], ["P-bars", sc.pbars], ["High bar", sc.highbar]].filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k} ${Number(v).toFixed(3)}`).join("   ") + (aa ? `   ·   All-around ${aa.toFixed(3)}` : "") + (sc.aa_place ? `   ·   ${ordinal(sc.aa_place)} place` : ""); }
    else if (st.length) res = st.map((s) => `${s.metric} ${s.value}${s.unit ? ` ${s.unit}` : ""}`).join("   ·   ");
    if (res) { doc.setFillColor(255, 255, 255); doc.roundedRect(M, M + 1.05, W - 2 * M, 0.55, 0.08, 0.08, "F"); doc.setTextColor(...navy); doc.setFontSize(10.5); doc.text(doc.splitTextToSize(res, W - 2 * M - 0.3), M + 0.15, M + 1.38); }
    const ps = pics(m).slice(0, 3); const top = M + (res ? 1.8 : 1.15), avail = W - M - top;
    const imgs = (await Promise.all(ps.map((p) => loadImg(p.url)))).filter(Boolean);
    if (imgs.length === 1) doc.addImage(cover(imgs[0], W - 2 * M, avail), "JPEG", M, top, W - 2 * M, avail);
    else if (imgs.length === 2) { const w = (W - 2 * M - 0.15) / 2; imgs.forEach((im, i) => doc.addImage(cover(im, w, avail), "JPEG", M + i * (w + 0.15), top, w, avail)); }
    else if (imgs.length === 3) { const big = avail * 0.6, w = (W - 2 * M - 0.15) / 2; doc.addImage(cover(imgs[0], W - 2 * M, big), "JPEG", M, top, W - 2 * M, big); imgs.slice(1).forEach((im, i) => doc.addImage(cover(im, w, avail - big - 0.15), "JPEG", M + i * (w + 0.15), top + big + 0.15, w, avail - big - 0.15)); }
    else { doc.setTextColor(170, 170, 180); doc.setFontSize(11); doc.text("Add photos from this event to fill this page.", M, top + 0.4); }
    const cap = ps.find((p) => p.caption)?.caption; if (cap) { doc.setTextColor(90, 96, 120); doc.setFontSize(9.5); doc.text(cap, M, W - 0.3); }
  }
  // Highlights
  doc.addPage([W, W]); doc.setFillColor(...navy); doc.rect(0, 0, W, W, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(26); doc.text("Season highlights", M, M + 0.6);
  doc.setFont("helvetica", "normal"); doc.setFontSize(14);
  const rows = scores.map((s) => ({ ...s, aa: allAround(s) })).filter((s) => s.aa);
  const best = rows.sort((a, b) => b.aa - a.aa)[0];
  const lines = [`${meets.length} ${(meets.length === 1 ? S.event : S.events).toLowerCase()} this season`, `${photos.length} photo${photos.length === 1 ? "" : "s"}`, best ? `Best all-around: ${best.aa.toFixed(3)} at ${best.meet_name}` : null, rows.filter((r) => r.aa_place && Number(r.aa_place) <= 3).length ? `${rows.filter((r) => r.aa_place && Number(r.aa_place) <= 3).length} all-around podium finishes` : null].filter(Boolean);
  lines.forEach((l, i) => doc.text(`•  ${l}`, M, M + 1.4 + i * 0.45));
  doc.setFontSize(10); doc.setTextColor(201, 208, 228); doc.text("Made with AthleteOrbit", M, W - 0.45);
  return doc.output("blob");
}
const ordinal = (n) => { n = Number(n); const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
