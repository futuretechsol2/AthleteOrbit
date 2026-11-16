import React, { useEffect } from "react";

export function Button({ kind = "primary", className = "", ...p }) {
  return <button className={`btn btn-${kind} ${className}`} {...p} />;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

// Open pop-ups form a stack in the browser history: Back closes the top one instead of leaving the app.
const sheets = []; let skipPops = 0; let sheetSeq = 0; const queued = [];
const pushSheet = (id) => { try { history.pushState({ ...(history.state || {}), sheet: id }, ""); } catch {} };
if (typeof window !== "undefined") window.addEventListener("popstate", () => {
  if (skipPops > 0) { skipPops--; if (!skipPops) while (queued.length) pushSheet(queued.shift()); return; }
  const top = sheets.pop();
  if (top) { top.byBack = true; top.close(); }
});
export const sheetOpen = () => sheets.length > 0;

export function Sheet({ title, onClose, children }) {
  const close = React.useRef(onClose); close.current = onClose;
  useEffect(() => {
    const k = (e) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    const me = { id: ++sheetSeq, byBack: false, close: () => close.current() };
    sheets.push(me);
    if (skipPops > 0) queued.push(me.id); else pushSheet(me.id);
    return () => {
      window.removeEventListener("keydown", k); if (!sheets.length || sheets.length === 1) document.body.style.overflow = "";
      const i = sheets.indexOf(me);
      if (i >= 0) sheets.splice(i, 1);
      const q = queued.indexOf(me.id);
      if (q >= 0) queued.splice(q, 1);
      else if (!me.byBack) { skipPops++; history.back(); }
    };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon = "✦", title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="note note-error" role="alert">{String(error.message || error)}</div>;
}

export function Spinner({ label = "Working…" }) {
  return <div className="spinner-row"><span className="spinner" aria-hidden />{label}</div>;
}

// Small, safe Markdown renderer: headings, bold, italic, bullets, numbered lists, paragraphs.
export function Markdown({ text }) {
  const lines = String(text || "").split(/\r?\n/);
  const out = []; let list = null; let key = 0;
  const flush = () => { if (list) { out.push(list.ordered ? <ol key={key++}>{list.items}</ol> : <ul key={key++}>{list.items}</ul>); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const b = /^\s*[-*•]\s+(.*)$/.exec(line), n = /^\s*\d+[.)]\s+(.*)$/.exec(line), h = /^#{1,4}\s+(.*)$/.exec(line);
    if (b || n) {
      const ordered = !!n;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push(<li key={list.items.length}>{inline((b || n)[1])}</li>);
    } else if (h) { flush(); out.push(<h4 key={key++}>{inline(h[1])}</h4>); }
    else if (!line.trim()) flush();
    else { flush(); out.push(<p key={key++}>{inline(line)}</p>); }
  }
  flush();
  return <div className="md">{out}</div>;
}
function inline(s) {
  const parts = []; const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g; let last = 0, m, i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const t = m[0];
    parts.push(t.startsWith("**") ? <strong key={i++}>{t.slice(2, -2)}</strong> : <em key={i++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

// Line chart drawn as SVG (no chart library needed).
export function TrendChart({ points, label = "Avg per event" }) {
  if (points.length < 2) return <p className="muted small">Add two or more meets to see the trend.</p>;
  const W = 320, H = 140, P = { l: 34, r: 12, t: 12, b: 26 };
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max(0.1, (hi - lo) * 0.25); lo -= pad; hi += pad;
  const x = (i) => P.l + (i * (W - P.l - P.r)) / (points.length - 1);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${label} trend`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={P.l - 6} y={y(t) + 3} textAnchor="end" className="chart-tick">{t.toFixed(2)}</text>
        </g>
      ))}
      <path d={d} className="chart-line" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.y)} r={p.best ? 5.5 : 4} className={p.best ? "chart-dot best" : "chart-dot"}><title>{`${p.label}: ${p.y.toFixed(3)}`}</title></circle>
          <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-tick">{p.short}</text>
        </g>
      ))}
    </svg>
  );
}

export const fmt = {
  score: (v) => (v === null || v === undefined || v === "" ? "–" : Number(v).toFixed(3)),
  money: (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
  date: (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""),
  short: (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }) : ""),
  daysUntil: (s) => Math.round((new Date(`${s}T12:00:00`) - new Date(new Date().toDateString() + " 12:00")) / 86400000),
  num: (v) => (v === null || v === undefined || v === "" ? "–" : String(Math.round(Number(v) * 1000) / 1000)),
};
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Round profile photo with initial fallback.
export function Avatar({ src, name = "?", size = 40, className = "" }) {
  return src ? <img className={`avatar ${className}`} src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>{(name || "?").trim()[0]?.toUpperCase()}</span>;
}

// Tap the photo to pick/take a new one; resized on the device to a 256px square.
export function PhotoPicker({ value, name, onChange, size = 84 }) {
  const ref = React.useRef(); const [err, setErr] = React.useState(null);
  async function pick(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    try { const { avatarFromFile } = await import("./lib/media.js"); onChange(await avatarFromFile(f)); setErr(null); } catch (e2) { setErr(e2); }
  }
  return (
    <div className="photo-pick">
      <button type="button" className="photo-btn" onClick={() => ref.current.click()} aria-label="Change photo">
        <Avatar src={value} name={name} size={size} /><span className="photo-cam" aria-hidden>📷</span>
      </button>
      <div className="photo-actions">
        <button type="button" className="link" onClick={() => ref.current.click()}>{value ? "Change photo" : "Add photo"}</button>
        {value && <button type="button" className="link danger" onClick={() => onChange(null)}>Remove</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
      <ErrorNote error={err} />
    </div>
  );
}
