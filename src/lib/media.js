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
