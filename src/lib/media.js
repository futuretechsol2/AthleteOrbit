// Photo and video helpers. Everything here runs on the parent's phone:
// videos are never uploaded, only a few small still frames are sent for feedback.

export function resizeImage(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't open that photo. Try a JPG or PNG.")); };
    img.src = url;
  });
}

// Square, small profile photo (center-cropped) stored as a data URL on the record.
export function avatarFromFile(file, side = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) return reject(new Error("Pick a photo (JPG, PNG or HEIC)."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const m = Math.min(img.width, img.height);
      const c = document.createElement("canvas"); c.width = c.height = side;
      c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, side, side);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't open that photo. Try a JPG or PNG.")); };
    img.src = url;
  });
}

export async function extractFrames(file, count = 8, maxSide = 640) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await once(v, "loadedmetadata", 15000);
    const dur = v.duration;
    if (!isFinite(dur) || dur <= 0) throw new Error("Couldn't read that video.");
    if (dur > 90) throw new Error("Please trim the video to 90 seconds or less (one skill or routine).");
    const s = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
    const ctx = c.getContext("2d");
    const frames = [];
    for (let i = 0; i < count; i++) {
      v.currentTime = Math.min(dur - 0.05, (dur * (i + 0.5)) / count);
      await once(v, "seeked", 8000);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      frames.push(c.toDataURL("image/jpeg", 0.7));
    }
    return { frames, duration: dur };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(el, ev, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { el.removeEventListener(ev, h); rej(new Error("That video format isn't supported on this device. Try an MP4 or MOV.")); }, ms);
    const h = () => { clearTimeout(t); res(); };
    el.addEventListener(ev, h, { once: true });
  });
}

// ---------- Meet photos ----------
// When was this photo taken? EXIF DateTimeOriginal from a JPEG, else the file's date. Returns "YYYY-MM-DDTHH:MM:SS" (local).
export async function photoDate(file) {
  try {
    const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf.getUint16(0) === 0xffd8) {
      let off = 2;
      while (off < buf.byteLength - 4) {
        const marker = buf.getUint16(off), size = buf.getUint16(off + 2);
        if (marker === 0xffe1 && buf.getUint32(off + 4) === 0x45786966) { const d = exifDate(buf, off + 10); if (d) return d; break; }
        if ((marker & 0xff00) !== 0xff00) break;
        off += 2 + size;
      }
    }
  } catch {}
  const d = new Date(file.lastModified || Date.now());
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
function exifDate(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(tiff + o, le), u32 = (o) => v.getUint32(tiff + o, le);
  const readIfd = (ifd, want) => { const n = u16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === want) return e; } return null; };
  const ifd0 = u32(4);
  const exifPtr = readIfd(ifd0, 0x8769);
  const tryTag = (ifd, tag) => { const e = ifd != null && readIfd(ifd, tag); if (!e) return null; const at = u32(e + 8); let s = ""; for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(tiff + at + i)); return /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T") : null; };
  return (exifPtr && tryTag(u32(exifPtr + 8), 0x9003)) || tryTag(ifd0, 0x0132);
}
// Full-quality JPEG for prints (long side up to 3600 px) + its size.
export function printReady(file, maxSide = 3600, quality = 0.9) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) return reject(new Error("Pick photos (JPG, PNG or HEIC)."));
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((blob) => (blob ? resolve({ blob, width: c.width, height: c.height, dataUrl: null, canvas: c }) : reject(new Error("Couldn't read that photo."))), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't open that photo. Try a JPG or PNG.")); };
    img.src = url;
  });
}
// Which event does a photo belong to? The one whose dates include the day it was taken (± 1 day for travel).
export function meetForDate(meets, when) {
  const day = String(when || "").slice(0, 10); if (!day) return null;
  const within = (m, pad) => { const s = new Date(m.start_date + "T00:00:00"), e = new Date((m.end_date || m.start_date) + "T23:59:59"); const d = new Date(day + "T12:00:00"); return d >= new Date(s.getTime() - pad * 86400000) && d <= new Date(e.getTime() + pad * 86400000); };
  return meets.find((m) => within(m, 0)) || meets.find((m) => within(m, 1)) || null;
}
