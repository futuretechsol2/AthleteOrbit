// Draws a shareable "season so far" card (1080x1350, Instagram portrait) on a canvas.
import { APP } from "../config.js";
import { EVENTS } from "../data/skills.js";

export async function drawRecap({ gymnast, rows, readiness, appUrl }) {
  try { await document.fonts?.ready; } catch {}
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#16213E"); g.addColorStop(1, "#2A3B6B");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W - 120, 140, 10, W - 120, 140, 420); glow.addColorStop(0, "rgba(244,201,93,.45)"); glow.addColorStop(1, "rgba(244,201,93,0)");
  x.fillStyle = glow; x.fillRect(0, 0, W, H);

  const serif = '"Fraunces", Georgia, serif', sans = '"Plus Jakarta Sans", Arial, sans-serif';
  x.fillStyle = "#F4C95D"; x.font = `700 34px ${sans}`; x.fillText(`${gymnast.program} · ${gymnast.level}`.toUpperCase(), 80, 140);
  x.fillStyle = "#FFFFFF"; x.font = `700 104px ${serif}`; x.fillText(fit(x, gymnast.name, W - 160), 80, 260);
  x.font = `600 52px ${serif}`; x.fillStyle = "#D7DCEB"; x.fillText("Season so far", 80, 335);

  const aa = rows.map((r) => r.aa);
  const best = aa.length ? Math.max(...aa) : null;
  const events = EVENTS[gymnast.program];
  let topEvent = null;
  for (const [k, label] of events) {
    const v = rows.map((r) => r[k]).filter((n) => n != null && n !== "").map(Number);
    if (v.length) { const avg = v.reduce((a, b) => a + b, 0) / v.length; if (!topEvent || avg > topEvent.avg) topEvent = { label, avg }; }
  }
  const tiles = [
    ["Meets", String(rows.length)],
    ["Best all-around", best ? best.toFixed(3) : "–"],
    ["Top event", topEvent ? topEvent.label.replace("Uneven ", "").replace("Balance ", "") : "–"],
    ["Skills ready", `${Math.round(readiness * 100)}%`],
  ];
  tiles.forEach(([label, val], i) => {
    const tx = 80 + (i % 2) * 470, ty = 400 + Math.floor(i / 2) * 210;
    x.fillStyle = "rgba(255,255,255,.08)"; round(x, tx, ty, 450, 180, 32); x.fill();
    x.fillStyle = "#FFFFFF"; x.font = `700 72px ${serif}`; x.fillText(fit(x, val, 400), tx + 32, ty + 100);
    x.fillStyle = "#AEB6CF"; x.font = `600 30px ${sans}`; x.fillText(label, tx + 32, ty + 148);
  });

  // trend of average score per event
  const pts = rows.map((r) => r.aa / r.n);
  const cx = 80, cy = 860, cw = 920, ch = 240;
  x.fillStyle = "rgba(255,255,255,.08)"; round(x, cx, cy, cw, ch + 60, 32); x.fill();
  x.fillStyle = "#AEB6CF"; x.font = `600 28px ${sans}`; x.fillText("Average score per event, meet by meet", cx + 32, cy + 48);
  if (pts.length >= 2) {
    let lo = Math.min(...pts), hi = Math.max(...pts); const pad = Math.max(0.05, (hi - lo) * 0.2); lo -= pad; hi += pad;
    const px = (i) => cx + 50 + (i * (cw - 100)) / (pts.length - 1), py = (v) => cy + 80 + (1 - (v - lo) / (hi - lo)) * (ch - 60);
    x.strokeStyle = "#FF6B5B"; x.lineWidth = 8; x.lineJoin = "round"; x.lineCap = "round"; x.beginPath();
    pts.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)))); x.stroke();
    pts.forEach((v, i) => { x.beginPath(); x.arc(px(i), py(v), aa[i] === best ? 16 : 11, 0, Math.PI * 2); x.fillStyle = aa[i] === best ? "#F4C95D" : "#FFFFFF"; x.fill(); });
  } else {
    x.fillStyle = "#D7DCEB"; x.font = `500 32px ${sans}`; x.fillText("More meets coming soon!", cx + 32, cy + 170);
  }
  x.fillStyle = "#FFFFFF"; x.font = `700 44px ${serif}`; x.fillText(APP.name, 80, H - 90);
  x.fillStyle = "#AEB6CF"; x.font = `500 28px ${sans}`; x.fillText(appUrl.replace(/^https?:\/\//, ""), 80, H - 48);
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

export async function shareOrDownload(blob, name) {
  const file = new File([blob], `${name.replace(/\W+/g, "-").toLowerCase()}-season.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${name}'s gymnastics season` }); return "shared"; } catch (e) { if (e.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}

function round(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function fit(x, text, max) { let t = String(text); while (x.measureText(t).width > max && t.length > 3) t = t.slice(0, -2) + "…"; return t; }
