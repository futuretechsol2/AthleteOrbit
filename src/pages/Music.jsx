// Floor Music: the gym uploads each level's (or athlete's) floor music once; families see it on their athlete; the meet's
// music table finds any athlete and plays her music with one tap — saved on the device so it plays without signal.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, uploadMusic, DEMO } from "../lib/db.js";
import { Button, Sheet, Spinner, ErrorNote } from "../ui.jsx";

export const fmtTime = (s) => (s == null || !isFinite(s) ? "–:––" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
const LIMIT = 90; // most meets cap floor music at 1:30
const readDuration = (file) => new Promise((ok) => { const a = new Audio(); a.preload = "metadata"; a.onloadedmetadata = () => ok(Math.round(a.duration) || null); a.onerror = () => ok(null); a.src = URL.createObjectURL(file); setTimeout(() => ok(null), 4000); });
const cleanTitle = (name) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").slice(0, 120);

// One shared preview player so two tracks never play at once.
let previewEl = null;
function usePreview() {
  const [playing, setPlaying] = useState(null);
  useEffect(() => () => { if (previewEl) previewEl.pause(); }, []);
  const toggle = (id, url) => {
    if (!previewEl) previewEl = new Audio();
    if (playing === id) { previewEl.pause(); setPlaying(null); return; }
    previewEl.src = url; previewEl.currentTime = 0; previewEl.play().catch(() => {}); previewEl.onended = () => setPlaying(null); setPlaying(id);
  };
  return [playing, toggle];
}

function PickMusic({ label = "Upload music", kind = "ghost", onFile, disabled }) {
  const ref = useRef(null);
  return <>
    <Button kind={kind} className="sm" disabled={disabled} onClick={() => ref.current?.click()}>{label}</Button>
    <input ref={ref} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
  </>;
}
async function uploadFor(file, attach) {
  const [dur, up] = await Promise.all([readDuration(file), uploadMusic(file)]);
  return { ...(await attach({ path: up.path, preview: up.preview, title: cleanTitle(file.name), duration: dur })), duration: dur };
}
const Long = ({ d }) => (d > LIMIT ? <span className="pill pill-warn" title="Most meets limit floor music to 1:30">over 1:30</span> : null);

// ---------- Gym: Music tab ----------
export function GymMusic() {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(""); const [msg, setMsg] = useState(""); const [q, setQ] = useState("");
  const [playing, toggle] = usePreview();
  const load = () => api("music", null, "GET").then(setD).catch(setErr);
  useEffect(() => { load(); }, []);
  const attach = (key, body) => async (file) => {
    setBusy(key); setErr(null); setMsg("");
    try { const r = await uploadFor(file, (x) => api("music", { ...body, ...x })); setMsg(body.level ? `Saved — ${r.athletes === 1 ? `1 ${body.level} girl now competes` : `all ${r.athletes} ${body.level} girls now compete`} to “${cleanTitle(file.name)}”.${r.duration > LIMIT ? " Heads up: it's longer than 1:30." : ""}` : `Saved for ${body.name}.`); await load(); }
    catch (e) { setErr(e); }
    setBusy("");
  };
  const remove = async (id) => { setBusy(id); try { await api("music", { remove: id }); await load(); } catch (e) { setErr(e); } setBusy(""); };
  if (!d) return err ? <ErrorNote error={err} /> : <Spinner />;
  const shown = d.athletes.filter((a) => !q || `${a.name} ${a.level}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <section className="card music-intro">
        <h2>🎵 Floor music</h2>
        <p className="muted">Upload each level's floor music once — every girl at that level gets it. Give an athlete her own routine music to override it. At meets, the music table plays it with one tap.</p>
        <div className="stats three">
          <div className="stat"><span className="stat-value">{d.counts.ready}/{d.counts.girls}</span><span className="stat-label">Girls with music</span></div>
          <div className="stat"><span className="stat-value">{d.levels.filter((l) => l.music).length}/{d.levels.length}</span><span className="stat-label">Levels done</span></div>
          <div className="stat"><span className="stat-value">1 tap</span><span className="stat-label">At the meet</span></div>
        </div>
        <div className="row tight">
          <a className="btn btn-primary sm" href={d.desk_url} target="_blank" rel="noreferrer">▶ Open music player</a>
          <button className="btn btn-ghost sm" onClick={() => navigator.clipboard.writeText(d.desk_url).then(() => setMsg("Music player link copied — send it to whoever runs music at your home meet. No account needed; keep it private.")).catch(() => {})}>Copy link for a volunteer</button>
        </div>
      </section>
      {msg && <p className="note note-ok">{msg}</p>}
      <ErrorNote error={err} />
      {!d.levels.length ? <section className="card"><p className="muted">Add your roster first (Roster tab) — girls' levels show up here.</p></section> : <>
        <h3 className="section-title">By level</h3>
        {d.levels.map((l) => (
          <section key={l.level} className="card music-row">
            <span className="grow"><b>{l.level}</b><small className="muted"> · {l.girls} girl{l.girls === 1 ? "" : "s"}</small><br />
              {l.music ? <small>{l.music.title} · {fmtTime(l.music.duration)} <Long d={l.music.duration} /></small> : <small className="muted">No music yet</small>}</span>
            {l.music && <button className="play-sm" aria-label={`Preview ${l.level} music`} onClick={() => toggle(l.music.id, l.music.url)}>{playing === l.music.id ? "⏸" : "▶"}</button>}
            <PickMusic kind={l.music ? "ghost" : "primary"} label={busy === l.level ? "Uploading…" : l.music ? "Replace" : (l.girls > 1 ? `Upload for all ${l.girls}` : "Upload")} disabled={!!busy} onFile={attach(l.level, { level: l.level })} />
          </section>
        ))}
        <h3 className="section-title">Athletes <small className="muted">— her own routine music overrides the level's</small></h3>
        <input className="music-search" placeholder="Find an athlete" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an athlete" />
        <section className="card">
          {shown.map((a) => (
            <div key={a.roster_id} className="music-athlete">
              <span className="grow"><b>{a.name}</b><small className="muted"> · {a.level || "—"}</small><br />
                {a.music ? <small>{a.music.scope === "athlete" ? "★ Own music: " : "Level music: "}{a.music.title} · {fmtTime(a.music.duration)}</small> : <small className="muted">No music yet</small>}</span>
              {a.music && <button className="play-sm" aria-label={`Preview ${a.name}'s music`} onClick={() => toggle(a.music.id + a.roster_id, a.music.url)}>{playing === a.music.id + a.roster_id ? "⏸" : "▶"}</button>}
              {a.music?.scope === "athlete" ? <button className="link small" disabled={!!busy} onClick={() => remove(a.music.id)}>Use level music</button>
                : <PickMusic label={busy === a.roster_id ? "…" : "Own music"} disabled={!!busy} onFile={attach(a.roster_id, { roster_id: a.roster_id, name: a.name })} />}
            </div>
          ))}
        </section>
      </>}
    </div>
  );
}

// ---------- Family: on the athlete's home ----------
export function AthleteMusic({ gymnast }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const [playing, toggle] = usePreview();
  const load = () => api("music", null, "GET", { gymnast: gymnast.id }).then(setD).catch(() => setD(null));
  useEffect(() => { load(); }, [gymnast.id]);
  if (!d?.eligible) return null;
  const m = d.music;
  const upload = async (file) => { setBusy(true); setErr(null); try { await uploadFor(file, (x) => api("music", { gymnast_id: gymnast.id, ...x })); await load(); } catch (e) { setErr(e); } setBusy(false); };
  return (
    <section className="card music-card">
      <div className="row tight">
        <span className="music-icon" aria-hidden>🎵</span>
        <span className="grow"><b>Floor music</b><br />
          {m ? <small>{m.title} · {fmtTime(m.duration)} {d.from && d.from !== "family" ? <span className="muted">· from {d.from}</span> : null}</small>
            : <small className="muted">{d.gym ? `${d.gym} hasn't added ${gymnast.name}'s music yet.` : `Add ${gymnast.name}'s floor music so the meet can play it with one tap.`}</small>}</span>
        {m && <button className="play-sm" aria-label="Play floor music" onClick={() => toggle(m.id, m.url)}>{playing === m.id ? "⏸" : "▶"}</button>}
      </div>
      {(!m || d.from === "family") && <div className="row tight" style={{ marginTop: 8 }}>
        <PickMusic label={busy ? "Uploading…" : m ? "Replace" : "Upload music"} kind={m ? "ghost" : "primary"} disabled={busy} onFile={upload} />
        {m && d.from === "family" && <button className="link small" onClick={async () => { await api("music", { gymnast_id: gymnast.id, remove: true }); load(); }}>Remove</button>}
        <small className="muted">MP3, M4A or WAV · most meets allow up to 1:30</small>
      </div>}
      <ErrorNote error={err} />
    </section>
  );
}

// ---------- Meet music table: /music/<eventId>?k=… or /music/gym-<id>?k=… ----------
const CACHE = "ao-floor-music";
const keyFor = (m) => `/__floor-music/${m.id}`;
async function cached(m) { try { const c = await caches.open(CACHE); const r = await c.match(keyFor(m)); return r ? URL.createObjectURL(await r.blob()) : null; } catch { return null; } }
async function saveOffline(m) { const c = await caches.open(CACHE); if (await c.match(keyFor(m))) return; const r = await fetch(m.url); if (!r.ok) throw new Error("download"); await c.put(keyFor(m), new Response(await r.blob(), { headers: { "content-type": r.headers.get("content-type") || "audio/mpeg" } })); }

export function MusicDesk({ id }) {
  const k = new URLSearchParams(location.search).get("k") || "";
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [q, setQ] = useState(""); const [lvl, setLvl] = useState("");
  const [cur, setCur] = useState(null); const [state, setState] = useState("idle"); const [t, setT] = useState(0); const [dur, setDur] = useState(0);
  const [offline, setOffline] = useState({ done: 0, total: 0, failed: 0, running: false });
  const audio = useRef(null); const fade = useRef(null); const localRef = useRef(null);
  useEffect(() => { api("music/desk", null, "GET", { id, k }).then(setD).catch(setErr); }, [id]);
  // Save every track on this device so the table keeps working without signal.
  const downloadAll = async (list) => {
    const ms = list.filter((a) => a.music).map((a) => a.music); const uniq = [...new Map(ms.map((m) => [m.id, m])).values()];
    if (typeof caches === "undefined") return setOffline({ done: 0, total: uniq.length, failed: uniq.length, running: false, unsupported: true });
    setOffline({ done: 0, total: uniq.length, failed: 0, running: true });
    let done = 0, failed = 0;
    for (const m of uniq) { try { await saveOffline(m); done++; } catch { failed++; } setOffline({ done, total: uniq.length, failed, running: true }); }
    setOffline({ done, total: uniq.length, failed, running: false });
  };
  useEffect(() => { if (d) downloadAll(d.athletes); }, [d]);
  // Keep the screen awake at the music table.
  useEffect(() => { let lock; navigator.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); return () => lock?.release?.(); }, []);
  useEffect(() => {
    const a = (audio.current = new Audio()); a.preload = "auto";
    a.ontimeupdate = () => setT(a.currentTime); a.onloadedmetadata = () => setDur(a.duration); a.onended = () => setState("done");
    const key = (e) => { if (e.code === "Space" && !/input|select|textarea/i.test(e.target.tagName)) { e.preventDefault(); playPause(); } };
    window.addEventListener("keydown", key);
    return () => { a.pause(); window.removeEventListener("keydown", key); };
  }, []);
  const cue = async (ath, file) => {
    clearInterval(fade.current); const a = audio.current; a.pause(); a.volume = 1;
    let src = file ? URL.createObjectURL(file) : (await cached(ath.music)) || ath.music.url;
    a.src = src; a.currentTime = 0; setT(0); setDur(ath.music?.duration || 0);
    setCur({ ...ath, music: ath.music || { title: file.name, id: "local" } }); setState("ready");
  };
  const playPause = () => { const a = audio.current; if (!a?.src) return; if (a.paused) { clearInterval(fade.current); a.volume = 1; a.play().then(() => setState("playing")).catch(() => setState("ready")); } else { a.pause(); setState("paused"); } };
  const playNow = async (ath) => { await cue(ath); playPause(); };
  const stop = () => { const a = audio.current; clearInterval(fade.current); fade.current = setInterval(() => { if (a.volume > 0.08) a.volume = Math.max(0, a.volume - 0.08); else { clearInterval(fade.current); a.pause(); a.currentTime = 0; a.volume = 1; setState("ready"); setT(0); } }, 60); };
  const restart = () => { const a = audio.current; a.currentTime = 0; setT(0); };
  const levels = useMemo(() => [...new Set((d?.athletes || []).map((a) => a.level).filter(Boolean))], [d]);
  if (!d) return <div className="tix-shell">{err ? <div className="card"><ErrorNote error={err} /></div> : <Spinner label="Loading the music table…" />}</div>;
  const shown = d.athletes.filter((a) => (!lvl || a.level === lvl) && (!q || `${a.name} ${a.gym}`.toLowerCase().includes(q.toLowerCase())));
  const pct = dur ? Math.min(100, (t / dur) * 100) : 0;
  return (
    <div className="music-desk">
      <header className="desk-head">
        <p className="eyebrow">🎵 Floor music table{DEMO ? " · demo" : ""}</p>
        <h1>{d.title}</h1>
        <p className="small">{d.counts.ready}/{d.counts.athletes} athletes have music · {offline.unsupported ? "plays online" : offline.running ? `saving for offline ${offline.done}/${offline.total}…` : offline.total ? `✓ ${offline.done}/${offline.total} saved on this device — works without signal` : "no music yet"}{offline.failed && !offline.running && !offline.unsupported ? ` · ${offline.failed} not saved` : ""}</p>
        {!!offline.failed && !offline.running && !offline.unsupported && <button className="btn btn-ghost sm" onClick={() => downloadAll(d.athletes)}>Retry saving</button>}
      </header>
      <div className="desk-tools">
        <input className="music-search big" placeholder="Search athlete or gym" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search athlete or gym" />
        <div className="chips">{["", ...levels].map((l) => <button key={l || "all"} className={`chip ${lvl === l ? "on" : ""}`} onClick={() => setLvl(l)}>{l || "All levels"}</button>)}</div>
      </div>
      <div className="desk-list">
        {shown.map((a) => (
          <div key={a.id} className={`desk-row ${cur?.id === a.id ? "on" : ""}`}>
            <button className="desk-pick" onClick={() => { if (a.music) cue(a); else { localRef.current.dataset.id = a.id; localRef.current.click(); } }}>
              <b>{a.name}</b><small>{a.gym} · {a.level || "—"}</small>
              <small className={a.music ? "" : "warn"}>{a.music ? `${a.music.title} · ${fmtTime(a.music.duration)}` : "No music on file — tap to play from this device"}</small>
            </button>
            {a.music && <button className="desk-play" aria-label={`Play ${a.name}'s music`} onClick={() => playNow(a)}>▶</button>}
          </div>
        ))}
        {!shown.length && <p className="muted center">No athletes match.</p>}
        {!!d.notOnApp?.length && <p className="muted small center">Not on AthleteOrbit yet: {d.notOnApp.join(", ")} — tap any athlete without music, or use “Play a file”, to play from this device.</p>}
      </div>
      <input ref={localRef} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const a = d.athletes.find((x) => x.id === localRef.current.dataset.id) || { id: "local", name: cleanTitle(f.name), gym: "This device" }; cue(a, f); }} />
      <footer className={`desk-player ${state}`}>
        {cur ? <>
          <div className="dp-who"><b>{cur.name}</b><small>{cur.gym ? `${cur.gym} · ` : ""}{cur.music?.title}</small></div>
          <div className="dp-bar" aria-hidden><span style={{ width: `${pct}%` }} /></div>
          <div className="dp-time"><span>{fmtTime(t)}</span><span>{fmtTime(dur)}</span></div>
          <div className="dp-ctl">
            <button className="dp-btn" onClick={restart} aria-label="Back to start">⏮</button>
            <button className="dp-main" onClick={playPause} aria-label={state === "playing" ? "Pause" : "Play"}>{state === "playing" ? "⏸" : "▶"}</button>
            <button className="dp-btn" onClick={stop} aria-label="Stop (fade out)">⏹</button>
          </div>
          <small className="dp-hint">{state === "ready" ? "Ready — tap ▶ when she salutes" : state === "done" ? "Done ✓ — pick the next athlete" : "Space bar = play / pause"}</small>
        </> : <div className="dp-who"><b>Pick an athlete</b><small>Tap a name to cue her music, then ▶ when she salutes. <button className="link" onClick={() => { localRef.current.dataset.id = ""; localRef.current.click(); }}>Play a file</button></small></div>}
      </footer>
    </div>
  );
}
