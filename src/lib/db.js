// Data layer. Uses Supabase when configured; otherwise a local demo store so the app
// can be tried instantly (demo data stays on this device only).
import { demoCenter, demoMeExtras } from "./demoCenter.js";
import { createClient } from "@supabase/supabase-js";

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const APP_URL = (import.meta.env.VITE_APP_URL || (typeof location !== "undefined" ? location.origin : "")).replace(/\/$/, "");
export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
// ?demo turns on the demo (sample family, nothing saved online) for this browser tab; ?demo=off turns it off.
const forcedDemo = (() => {
  if (typeof location === "undefined") return false;
  const q = new URLSearchParams(location.search).get("demo");
  try {
    if (q === "off") { sessionStorage.removeItem("ao-demo"); return false; }
    if (q !== null) sessionStorage.setItem("ao-demo", q === "gym" ? "gym" : "1");
    return !!sessionStorage.getItem("ao-demo");
  } catch { return q !== null && q !== "off"; }
})();
export const DEMO = forcedDemo || !URL_ || !KEY;
// ?demo=gym shows the demo as a gym owner sees it (roster, season schedule, messages).
export const DEMO_GYM = DEMO && (() => { try { return sessionStorage.getItem("ao-demo") === "gym"; } catch { return false; } })();

export const supabase = DEMO ? null : createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const ORDER = { gymnasts: ["created_at", true], scores: ["meet_date", true], meets: ["start_date", true], costs: ["spent_on", false], ai_notes: ["created_at", false],
  stats: ["event_date", true], goals: ["created_at", true], coach_notes: ["noted_on", false], budgets: ["created_at", true], family_events: ["start_date", true], score_imports: ["created_at", false], practice_logs: ["practiced_on", true], qualifiers: ["created_at", true] };

// ---------- demo store ----------
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const LS = "gympath-demo-v11";
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } };
const save = (d) => { try { localStorage.setItem(LS, JSON.stringify(d)); } catch {} };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
function demoData() {
  let d = load();
  if (d) return d;
  const g1 = uid(), g2 = uid(), g3 = uid(), m1 = uid(), m2 = uid(), now = new Date(Date.now() - 60000).toISOString(), later = new Date().toISOString();
  const y = new Date().getFullYear();
  d = {
    profile: { id: "demo", email: "demo@athleteorbit.app", username: "demo_family", full_name: "Demo Parent", account_type: "parent", subscription_status: "none", subscription_plan: null, trial_ends_at: new Date(Date.now() + 5 * 86400000).toISOString(), email_reminders: true, sms_reminders: false, home_city: "Charlotte, NC", home_airport: "CLT", sports: ["Gymnastics", "Swimming"], avatar: null },
    gymnasts: [
      { id: g1, name: "Maya", sport: "Gymnastics", program: "WAG", level: "Level 5", club: "Demo Gymnastics", created_at: now },
      { id: g2, name: "Arjun", sport: "Gymnastics", program: "MAG", level: "Level 6", club: "Demo Gymnastics", created_at: later, coach_name: "Coach Dan" },
      { id: g3, name: "Zoe", program: "Other", sport: "Swimming", level: "Novice", club: "Demo Aquatics", created_at: new Date(Date.now() + 1000).toISOString() },
    ],
    scores: [
      { id: uid(), gymnast_id: g1, meet_name: "Fall Classic", meet_date: `${y}-09-14`, level: "Level 5", vault: 9.1, bars: 8.65, beam: 8.9, floor: 9.05, aa_place: 2 },
      { id: uid(), gymnast_id: g1, meet_name: "Harvest Invitational", meet_date: `${y}-10-05`, level: "Level 5", vault: 9.2, bars: 8.8, beam: 8.55, floor: 9.15, aa_place: 3 },
      { id: uid(), gymnast_id: g1, meet_name: "Queen City Cup", meet_date: `${y}-10-19`, level: "Level 5", vault: 9.25, bars: 8.95, beam: 9.0, floor: 9.2, aa_place: 1 },
      { id: uid(), gymnast_id: g2, meet_name: "Fall Classic", meet_date: `${y}-09-14`, level: "Level 6", floor: 12.4, pommel: 11.2, rings: 11.6, vault: 12.9, pbars: 12.0, highbar: 12.3, aa_place: 4 },
      { id: uid(), gymnast_id: g2, meet_name: "Queen City Cup", meet_date: `${y}-10-19`, level: "Level 6", floor: 12.8, pommel: 11.9, rings: 11.8, vault: 13.1, pbars: 12.3, highbar: 12.6, aa_place: 2 },
    ],
    meets: [
      { id: uid(), gymnast_id: g1, name: "Queen City Classic", host: "Demo Gymnastics", location: "Charlotte, NC", start_date: localDay(), session_time: "Sat 8:00 AM", status: "Registered", checklist: [{ text: "Competition leo", done: true }, { text: "Grips + wrist bands", done: false }, { text: "Water bottle", done: false }], listing_id: "demo-listing" },
      { id: m1, gymnast_id: g1, name: "Turkey Invitational", estimated_cost: 450, hotel_name: "Hampton Inn Raleigh", hotel_confirmation: "84213", host: "Demo Gym", location: "Raleigh, NC", start_date: `${y}-11-22`, session_time: "Sat 8:00 AM", status: "Registered", entry_deadline: `${y}-11-01`, checklist: [] },
      { id: m2, gymnast_id: g2, name: "Winter Cup", host: "Demo Gym", location: "Orlando, FL", start_date: `${y}-12-13`, end_date: `${y}-12-14`, status: "Planned", entry_deadline: `${y}-11-15`, estimated_cost: 1200, checklist: [] },
      { id: uid(), gymnast_id: g3, name: "Fall Splash Invitational", host: "Demo Aquatics", location: "Charlotte, NC", start_date: `${y}-11-22`, status: "Registered", checklist: [] },
    ],
    costs: [
      { id: uid(), gymnast_id: g1, spent_on: `${y}-08-01`, category: "USAG membership", description: "Athlete membership", amount: 79, paid: true },
      { id: uid(), gymnast_id: g1, spent_on: `${y}-09-01`, category: "Meet entry fee", description: "Fall Classic", amount: 125, paid: true },
      { id: uid(), gymnast_id: g2, spent_on: `${y}-09-01`, category: "Meet entry fee", description: "Fall Classic", amount: 125, paid: true },
      { id: uid(), gymnast_id: null, spent_on: `${y}-10-18`, category: "Hotel", description: "Queen City Cup, 1 night", amount: 149, paid: false },
      { id: uid(), gymnast_id: g1, spent_on: `${y}-10-01`, category: "Tuition", description: "October tuition", amount: 285, paid: true },
      { id: uid(), gymnast_id: g2, spent_on: `${y}-10-01`, category: "Tuition", description: "October tuition", amount: 285, paid: true },
      { id: uid(), gymnast_id: g3, spent_on: `${y}-10-01`, category: "Tuition", description: "Swim team dues", amount: 160, paid: true },
      { id: uid(), gymnast_id: g1, spent_on: `${y}-10-20`, category: "Hotel", description: "Turkey Invitational deposit", amount: 120, paid: false, meet_id: m1 },
    ],
    stats: [
      { id: uid(), gymnast_id: g3, event_date: `${y}-09-20`, event_name: "Time trial", metric: "50 Free", value: 36.8, unit: "sec", better: "lower" },
      { id: uid(), gymnast_id: g3, event_date: `${y}-10-11`, event_name: "Fall Classic", metric: "50 Free", value: 35.9, unit: "sec", better: "lower" },
      { id: uid(), gymnast_id: g3, event_date: `${y}-10-11`, event_name: "Fall Classic", metric: "50 Back", value: 42.1, unit: "sec", better: "lower" },
      { id: uid(), gymnast_id: g3, event_date: `${y}-10-25`, event_name: "Dual meet", metric: "50 Free", value: 35.2, unit: "sec", better: "lower" },
    ],
    goals: [
      { id: uid(), gymnast_id: g1, title: "Kip cast to handstand on bars", target_date: `${y + 1}-01-31`, done: false },
      { id: uid(), gymnast_id: g1, title: "Score 9.0+ on beam", done: true },
      { id: uid(), gymnast_id: g3, title: "Break 35 seconds in the 50 free", target_date: `${y}-12-15`, done: false },
    ],
    coach_notes: [{ id: uid(), gymnast_id: g1, noted_on: `${y}-10-15`, source: "Coach", body: "Hips square on beam turns; strong vault block." }],
    budgets: [{ id: uid(), season: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, gymnast_id: null, category: null, amount: 6000 }, { id: uid(), season: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, gymnast_id: null, category: "Hotel", amount: 600 }],
    family_events: [{ id: uid(), gymnast_id: null, title: "Grandma's 70th birthday", start_date: `${y}-11-22`, location: "Concord, NC" }],
    skill_status: [], ai_notes: [], score_imports: [], practice_logs: [{ id: uid(), gymnast_id: g1, practiced_on: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), minutes: 210, kind: "Practice", energy: 4, pain: 3, pain_area: "Wrist" }, { id: uid(), gymnast_id: g1, practiced_on: new Date(Date.now() - 86400000).toISOString().slice(0, 10), minutes: 180, kind: "Practice", energy: 3, pain: 4, pain_area: "Wrist" }], qualifiers: [{ id: uid(), gymnast_id: g1, name: "State meet", metric: "aa", target: 34, better: "higher", by_date: null }, { id: uid(), gymnast_id: g1, name: "Move up to Level 6", metric: "aa", target: 37, better: "higher", by_date: null }],
  };
  save(d);
  return d;
}

// Where a new family came from (first visit): an invite code (?ref=) and/or campaign tags (?utm_source=…).
export function rememberSource() {
  try {
    const q = new URLSearchParams(location.search);
    const ref = q.get("ref"); if (ref && !localStorage.getItem("gp-ref")) localStorage.setItem("gp-ref", ref.replace(/[^A-Za-z0-9]/g, "").slice(0, 12));
    const src = q.get("utm_source"); if (src && !localStorage.getItem("gp-source")) localStorage.setItem("gp-source", [src, q.get("utm_campaign")].filter(Boolean).join(" / ").slice(0, 120));
  } catch {}
}
function firstTouch() {
  try { const ref = localStorage.getItem("gp-ref"), source = localStorage.getItem("gp-source") || (document.referrer && !document.referrer.includes(location.host) ? new URL(document.referrer).hostname : ""); return { ...(ref ? { ref } : {}), ...(source ? { source } : {}) }; } catch { return {}; }
}

// ---------- public API ----------
export const db = {
  async session() {
    if (DEMO) return { user: { id: "demo", email: "demo@athleteorbit.app" } };
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuth(cb) {
    if (DEMO) return () => {};
    const { data } = supabase.auth.onAuthStateChange((e, s) => cb(s, e));
    return () => data.subscription.unsubscribe();
  },
  // Log in with an email (straight to Supabase) or a username (through our server, which keeps emails private).
  async signIn(identifier, password) {
    if (DEMO) return;
    const id = String(identifier || "").trim();
    if (id.includes("@")) {
      const { error } = await supabase.auth.signInWithPassword({ email: id, password });
      if (error) throw new Error(/confirm/i.test(error.message) ? "Please confirm your email first. Check your inbox for the link we sent." : /invalid/i.test(error.message) ? "Wrong email or password." : error.message);
      await db.claimDevice();
      return;
    }
    const r = await fetch(`${API_BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: id, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Couldn't log in. Try again.");
    const { error } = await supabase.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
    if (error) throw error;
    await db.claimDevice();
  },
  // One device at a time: this sign-in becomes the active one and every other device is signed out.
  async claimDevice() {
    if (DEMO) return;
    try { await api("session/claim"); } catch {}
    try { await supabase.auth.signOut({ scope: "others" }); } catch {}
  },
  // Sign-up goes through our server, which emails the confirmation link itself (no hourly email limit,
  // and the link opens the app already signed in). Falls back to Supabase's mailer only if the server has no email set up.
  async signUp({ email, password, username, full_name, account_type, gym_name }) {
    if (DEMO) { await new Promise((r) => setTimeout(r, 400)); return "check-email"; }
    const meta = { username: username.toLowerCase(), full_name, account_type, gym_name: gym_name || null, ...firstTouch() };
    const r = await fetch(`${API_BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, ...meta }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return "check-email";
    if (r.status !== 501) throw new Error(j.error || "Couldn't create the account. Please try again.");
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: APP_URL, data: { ...meta, terms_accepted_at: new Date().toISOString() } } });
    if (error) {
      if (/rate limit/i.test(error.message)) throw new Error("Too many sign-ups in the last hour. Please try again in a little while.");
      if (/USERNAME_TAKEN|Database error/i.test(error.message)) throw new Error("That username was just taken. Please pick another.");
      if (/already registered|already exists/i.test(error.message)) throw new Error("An account with this email already exists. Log in, or reset your password.");
      throw error;
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error("An account with this email already exists. Log in, or reset your password.");
    if (data.session) await db.claimDevice();
    return data.session ? "signed-in" : "check-email";
  },
  async resendConfirm(email) {
    if (DEMO) return;
    const r = await fetch(`${API_BASE}/api/auth/resend`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    if (r.ok) return;
    if (r.status !== 501) throw new Error((await r.json().catch(() => ({}))).error || "Please try again in a few minutes.");
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: APP_URL } }); if (error) throw error;
  },
  // The link in our emails: /confirm?token_hash=…&type=signup|magiclink|recovery → signed in on this device.
  async verifyLink(token_hash, type) {
    if (DEMO) return;
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: ["signup", "recovery", "magiclink", "email"].includes(type) ? type : "email" });
    if (error) throw new Error("This link has expired or was already used. Log in, or ask for a new link.");
    await db.claimDevice();
  },
  async checkUsername(u) {
    if (DEMO) return { valid: /^[a-z0-9_]{3,20}$/.test(u), available: u !== "taken", message: "" };
    const r = await fetch(`${API_BASE}/api/auth/username?u=${encodeURIComponent(u)}`); return r.json();
  },
  async forgotUsername(email) {
    if (DEMO) return "If that email has an account, we've sent the username to it.";
    const r = await fetch(`${API_BASE}/api/auth/forgot-username`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Please try again."); return j.message;
  },
  async resetPassword(email) {
    if (DEMO) return;
    const r = await fetch(`${API_BASE}/api/auth/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    if (r.ok) return;
    if (r.status !== 501) throw new Error((await r.json().catch(() => ({}))).error || "Please try again in a few minutes.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL }); if (error) throw error;
  },
  async updatePassword(password) { if (DEMO) return; const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; },
  async signOut() { if (DEMO) { localStorage.removeItem(LS); try { sessionStorage.removeItem("ao-demo"); } catch {} location.href = "/"; return; } await supabase.auth.signOut(); },
  async token() { if (DEMO) return "demo"; try { const { data } = await supabase.auth.getSession(); return data.session?.access_token; } catch { return null; } },

  async profile() {
    if (DEMO) return DEMO_GYM ? { ...demoData().profile, account_type: "gym", gym_name: "Demo Gymnastics", full_name: "Coach Dana" } : demoData().profile;
    const { data: s } = await supabase.auth.getSession();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", s.session.user.id).maybeSingle();
    if (error) throw error;
    return data || { subscription_status: "none" };
  },

  async updateProfile(patch) {
    if (DEMO) { const d = demoData(); Object.assign(d.profile, patch); save(d); return d.profile; }
    const { data: s } = await supabase.auth.getSession();
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", s.session.user.id).select().single();
    if (error) throw friendly(error);
    return data;
  },

  async list(table, filter = {}) {
    const [col, asc] = ORDER[table] || ["created_at", true];
    if (DEMO) {
      let rows = DEMO_GYM && table === "gymnasts" ? [] : demoData()[table] || [];
      for (const [k, v] of Object.entries(filter)) rows = rows.filter((r) => r[k] === v);
      return [...rows].sort((a, b) => (a[col] || "") === (b[col] || "") ? 0 : ((a[col] || "") > (b[col] || "") ? 1 : -1) * (asc ? 1 : -1));
    }
    let q = supabase.from(table).select("*");
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    if (table !== "skill_status") q = q.order(col, { ascending: asc });
    const { data, error } = await q;
    if (error) throw friendly(error);
    return data;
  },
  async insert(table, row) {
    if (DEMO) {
      const d = demoData();
      if (table === "gymnasts" && d.gymnasts.length >= 6) throw new Error("Maximum 6 athletes per family.");
      const r = { id: uid(), created_at: new Date().toISOString(), ...row };
      d[table].push(r); save(d); return r;
    }
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) throw friendly(error);
    return data;
  },
  async update(table, id, patch) {
    if (DEMO) { const d = demoData(); const r = d[table].find((x) => x.id === id); Object.assign(r, patch); save(d); return r; }
    const { data, error } = await supabase.from(table).update(patch).eq("id", id).select().single();
    if (error) throw friendly(error);
    return data;
  },
  async remove(table, id) {
    if (DEMO) {
      const d = demoData(); d[table] = d[table].filter((x) => x.id !== id);
      if (table === "gymnasts") for (const t of ["scores", "meets", "costs", "skill_status", "ai_notes", "stats", "goals", "coach_notes", "family_events", "budgets"]) d[t] = d[t].filter((x) => x.gymnast_id !== id);
      save(d); return;
    }
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw friendly(error);
  },
  async setSkill(gymnast_id, skill_key, status) {
    if (DEMO) {
      const d = demoData(); const r = d.skill_status.find((x) => x.gymnast_id === gymnast_id && x.skill_key === skill_key);
      if (r) r.status = status; else d.skill_status.push({ gymnast_id, skill_key, status });
      save(d); return;
    }
    const { error } = await supabase.from("skill_status").upsert({ gymnast_id, skill_key, status, updated_at: new Date().toISOString() }, { onConflict: "gymnast_id,skill_key" });
    if (error) throw friendly(error);
  },
};

function friendly(e) {
  const m = e?.message || "Something went wrong.";
  if (/JWT|session/i.test(m)) return new Error("Your session expired. Please sign in again.");
  return new Error(m);
}

// ---------- server API (AI + billing) ----------
// Upload photos straight from the phone to private storage (one-time links from the server), then save their details.
export async function uploadPhotos(items, onProgress) {
  if (DEMO) { const d = demoData(); for (const [i, it] of items.entries()) { d.photos = d.photos || []; d.photos.unshift({ id: uid(), url: it.preview, mine: true, gymnast_id: it.gymnastId, meet_id: it.meetId || null, caption: it.caption || null, shared: !!it.shared, taken_at: it.taken_at, width: it.width, height: it.height, created_at: new Date().toISOString() }); onProgress?.(i + 1); } save(d); return { saved: items.length }; }
  let done = 0, saved = 0;
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    const { uploads } = await api("photos/upload-url", { count: chunk.length });
    await Promise.all(chunk.map(async (it, j) => {
      const { error } = await supabase.storage.from("photos").uploadToSignedUrl(uploads[j].path, uploads[j].token, it.blob, { contentType: "image/jpeg" });
      if (error) throw new Error("A photo didn't upload. Check your connection and try again.");
      it.path = uploads[j].path; onProgress?.(++done);
    }));
    saved += (await api("photos", { items: chunk.map(({ path, gymnastId, meetId, caption, shared, taken_at, width, height }) => ({ path, gymnastId, meetId, caption, shared, taken_at, width, height })) })).saved;
  }
  return { saved };
}
export async function uploadBook(blob) {
  if (DEMO) return { path: "demo/books/book.pdf" };
  const { uploads: [u] } = await api("photos/upload-url", { kind: "book" });
  const { error } = await supabase.storage.from("photos").uploadToSignedUrl(u.path, u.token, blob, { contentType: "application/pdf" });
  if (error) throw new Error("The book didn't upload. Try again.");
  return { path: u.path };
}

export async function api(path, body, method = "POST", query = null) {
  if (DEMO) return demoApi(path, body ?? query);
  const token = await db.token();
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString()}` : "";
  const r = await fetch(`${API_BASE}/api/${path}${qs}`, {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  let j = {};
  try { j = await r.json(); } catch {}
  if (r.status === 401 && j.code === "signed_in_elsewhere") await signedOutElsewhere();
  if (!r.ok) { const err = new Error(j.error || `Request failed (${r.status})`); err.status = r.status; err.upgrade = j.upgrade; throw err; }
  return j;
}

// Another device signed in to this account: sign this one out and say why.
let leaving = false;
async function signedOutElsewhere() {
  if (leaving) return; leaving = true;
  try { await supabase.auth.signOut({ scope: "local" }); } catch {}
  try { sessionStorage.removeItem("gp-sport-chosen"); } catch {}
  location.href = "/login?kicked=1";
}

async function demoApi(path, body) {
  await new Promise((r) => setTimeout(r, path === "club/schedule-read" || path === "club/lookup" ? 1600 : path.startsWith("club/") || path === "me" ? 250 : 700));
  if (path === "photos") {
    const d = demoData(); d.photos = d.photos || [];
    if (body?.remove) { d.photos = d.photos.filter((p) => p.id !== body.remove); save(d); return { removed: true }; }
    if (body?.update) { const p = d.photos.find((x) => x.id === body.update.id); if (p) { Object.assign(p, body.update.caption !== undefined ? { caption: body.update.caption } : {}, body.update.shared !== undefined ? { shared: body.update.shared } : {}, body.update.meetId !== undefined ? { meet_id: body.update.meetId } : {}); save(d); } return { ok: true }; }
    return { printsEnabled: true, bookPrintable: true, photos: d.photos.filter((p) => (!body?.gymnast || p.gymnast_id === body.gymnast)) };
  }
  if (path === "photos/order") throw Object.assign(new Error("Checkout is switched off in demo mode — in the app this opens secure payment and the prints ship to your door."), { status: 400 });
  if (path === "photos/orders") return { orders: [] };
  if (path === "roster/find") { const q = String(body?.q || "").toLowerCase(); return { results: q.length < 2 ? [] : [["Maya Patel", "Level 5", "F", "Demo Gymnastics"], ["Maya Johnson", "Level 3", "F", "Queen City Gymnastics"], ["Arjun Patel", "Level 6", "M", "Demo Gymnastics"], ["Ella Brooks", "Level 4", "F", "Demo Gymnastics"], ["Liam Ortiz", "Level 4", "M", "Carolina Elite"], ["Sofia Kim", "Level 5", "F", "Demo Gymnastics"]].filter(([n]) => n.toLowerCase().includes(q)).map(([n, level, gender, gym], i) => ({ id: `demo-r${i}-${gym === "Demo Gymnastics" ? "mine" : "other"}-${n}`, name: `${n.split(" ")[0]} ${n.split(" ")[1][0]}.`, level, gender, sport: "Gymnastics", gym, myGym: gym === "Demo Gymnastics", mine: false, pending: false })) }; }
  if (path === "roster/request") {
    const d = demoData(); const id = String(body?.rosterId || ""); const nm = id.split("-").slice(3).join(" ") || "Athlete"; const [first] = nm.split(" ");
    if (id.includes("-other-") && !body?.code) return { requested: true, gym: "their gym" };
    if (!d.gymnasts.some((g) => g.name === first)) { d.gymnasts.push({ id: uid(), name: first, program: "WAG", level: "Level 4", sport: "Gymnastics", gender: "F", club: "Demo Gymnastics", created_at: new Date().toISOString() }); save(d); }
    return { linked: true, name: first, gym: "Demo Gymnastics", meets: 2 };
  }
  if (path === "club/roster-requests") return body?.id ? { approved: true } : { requests: [{ id: "rq1", athlete: "Ruby Stone", level: "Level 4", parent: "Kate Stone", email: "kate@example.com", created_at: new Date().toISOString() }] };
  if (path === "tickets/organizer") { const d = demoData(); d.events = d.events || [{ id: "ev1", name: "Queen City Classic 2027", start_date: "2027-01-23", end_date: "2027-01-24", location: "Charlotte, NC", status: "on_sale", payouts: true, sold: 214, checkedIn: 0, orders: 96, gross_cents: 287400, sessions: ["Session 1 · Sat 8:00 AM", "Session 2 · Sat 1:00 PM"], ticket_types: [{ id: "adult", name: "Adult day pass", price: 15 }, { id: "child", name: "Child (6-12)", price: 8 }], updates: [], public_url: location.origin + "/tickets/demo-listing", door_url: location.origin + "/door/demo-listing?k=demo" }];
    if (body?.name) { if (body.id) Object.assign(d.events.find((e) => e.id === body.id) || {}, body); else d.events.unshift({ ...body, id: uid(), payouts: false, sold: 0, checkedIn: 0, orders: 0, gross_cents: 0, updates: [], status: body.status === "on_sale" ? "draft" : body.status, public_url: location.origin + "/tickets/demo-listing", door_url: location.origin + "/door/demo-listing?k=demo" }); save(d); return { id: "x" }; }
    save(d); return { listings: d.events }; }
  if (path === "tickets/organizer-connect") return { ready: true };
  if (path === "tickets/attendees") return { attendees: [["Dan Patel", "dan@example.com", 3, 0], ["Jen Brooks", "jen@example.com", 2, 0], ["Carlos Ortiz", "carlos@example.com", 4, 0]].map(([name, email, tickets, checkedIn]) => ({ name, email, tickets, checkedIn, types: "Adult day pass, Child (6-12)", session: "Session 1 · Sat 8:00 AM" })) };
  if (path === "tickets/update") { const d = demoData(); const e = (d.events || []).find((x) => x.id === body.id); if (e) { e.updates = [{ text: body.text, at: new Date().toISOString() }, ...(e.updates || [])]; save(d); } return { posted: true, emailed: 96 }; }
  if (path.startsWith("club/") && path !== "club/checkout") { const out = demoCenter(path, body, demoData(), save, uid, DEMO_GYM); if (out) return out; }
  if (path === "ai/coach") return { reply: "**Demo mode:** in the live app, Coach G answers here using your child's real results, skills and coach notes for their sport.\n\nQuick tip: beam scores usually jump fastest by fixing *small* things first — pointed feet, holding each position a full second, and sticking the dismount. Ask the coach which of those matters most right now." };
  if (path === "ai/scoresheet" && body?.sport && body.sport !== "Gymnastics") return { event_name: "Demo Fall Splash", event_date: new Date().toISOString().slice(0, 10), results: body.sport === "Swimming" ? [{ metric: "50 Free", value: 34.88, unit: "sec", place: 3 }, { metric: "50 Back", value: 41.5, unit: "sec", place: 5 }] : [{ metric: "Routine score", value: 92.4, unit: "pts", place: 2 }, { metric: "Deductions", value: 0.5, unit: "pts" }], confidence: "medium", notes: "Demo mode: sample results, not read from your photo." };
  if (path === "ai/scoresheet") return { scores: { meet_name: "Demo Invitational", meet_date: new Date().toISOString().slice(0, 10), level: null, vault: 9.15, bars: 8.9, beam: 8.85, floor: 9.1, pommel: null, rings: null, pbars: null, highbar: null, aa_place: 2, confidence: "medium", notes: "Demo mode: sample numbers, not read from your photo." } };
  if (path === "ai/video") return { feedback: "**Demo mode** — the live app reviews your frames.\n\n**What looks good**\n- Strong, tight body line\n\n**Top 3 things to improve**\n- Keep knees together through the turn (common 0.1–0.2 deduction)\n- Point feet on the way up\n- Chest up on landing to avoid a step\n\n**Ask the coach**\n- Which drill fixes the leg separation fastest?" };
  if (path === "scores/online") {
    const name = body?.athleteName || "your athlete";
    if (body?.athleteName && /zz/i.test(body.athleteName)) throw Object.assign(new Error(`We couldn't find ${name} on that page yet.`), { status: 404 });
    return { scores: { meet_name: "Demo Turkey Invitational", meet_date: new Date().toISOString().slice(0, 10), level: null, vault: 9.3, bars: 9.05, beam: 9.1, floor: 9.25, pommel: null, rings: null, pbars: null, highbar: null, aa_place: 1, confidence: "high", notes: "Demo mode: sample scores. The live app reads the MeetScoresOnline page you link." }, found: true, source_url: body?.url || null };
  }
  if (path === "share/link") return { url: body?.enable === false ? null : `https://app.athleteorbit.example/api/share?k=demo${(body?.gymnastId || "").slice(0, 8)}${body?.rotate ? Date.now() % 1000 : ""}` };
  if (path === "billing/change") { const d = demoData(); Object.assign(d.profile, { subscription_tier: body.tier }); save(d); return { tier: body.tier }; }
  if (path.startsWith("tickets/") || path.startsWith("admin/listing")) return demoTickets(path, body);
  if (path === "health") return { demo: true };
  if (path === "ai/meetday") return { arrive: "7:15 AM", maps: "https://www.google.com/maps/dir/?api=1&destination=Charlotte%2C%20NC", motivation: "Tell Maya you love watching her flip — that's the whole pep talk. Today is for doing what she does in practice.", nutrition: "Oatmeal with banana 2–3 hours before; pretzels and water between rotations, a turkey wrap after awards.", focus: "Hips square on beam turns — her coach's note from last week.", ai: true };
  if (path === "ai/tips") return { tips: body?.kind === "nutrition"
    ? "**Demo mode** — the live app tailors this to your child's sport, schedule and next event.\n\n**Everyday fueling**\n- Three meals + 2 snacks; half the plate fruit and veg, a quarter whole grains, a quarter protein\n- Water bottle at school and practice\n\n**Before practice**\n- 1–2 hours before: banana + peanut butter toast, or yogurt + granola\n\n**After**\n- Within an hour: chocolate milk, or turkey wrap + fruit\n\n**Event day**\n- Familiar breakfast 2–3 hours before; pack pretzels, grapes, water\n\n**Sleep**\n- 9–11 hours for school-age athletes\n\nFor allergies, medical needs or any weight concern, talk to your pediatrician or a registered sports dietitian."
    : "**Demo mode** — the live app reads your child's results, skills and coach notes.\n\n**Biggest win this week**\nSharper finishes: hold every landing or finish position a full second.\n\n**3 improvement tips**\n- Core: 3 × 20-second hollow holds daily — tighter body lines\n- Flexibility: 5 minutes of split stretching after practice\n- Visualization: picture one perfect rep before bed\n\n**Mindset**\nPick one cue word per event, like \"tight\".\n\n**Ask the coach**\n- What's the one thing to fix before the next event?\n- Which drill can we safely do at home?" };
  if (path === "ai/readiness") return { plan: "**Readiness snapshot:** Demo mode — the live app writes a plan from your checklist and scores.\n\n**Focus next**\n- Beam: full turn consistency\n- Bars: kip cast height" };
  if (path === "ai/trip") return { plan: "**Demo mode** — the live app writes this from your meet's city, dates and session time.\n\n**Travel plan**\n- Drive up Friday afternoon; book a refundable hotel 10–15 minutes from the venue\n- Ask the host gym about its hotel block\n\n**Meet-day timeline**\n- 6:30 wake, light breakfast\n- 7:15 arrive for 8:00 march-in\n\n**Family time nearby**\n- After awards: a well-known museum or park downtown (check hours)\n\n**Gymnast care**\n- Early night, water bottle, familiar snacks" };
  if (path === "ai/family") return { reply: "**Demo mode:** in the live app I answer from your real costs, budget and calendar.\n\nFrom the sample data: this season you've spent about **$1,328** across three kids, with **$269 unpaid**. Heads-up: **Nov 22** has Maya's Turkey Invitational in Raleigh and Zoe's swim meet in Charlotte on the same day." };
  if (path === "calendar-link") return { url: "", demo: true };
  if (path === "me") { const d = demoData(); return { referral_code: "DEMO42", referrals: 2, subscription_status: d.profile.subscription_status, plan: d.profile.subscription_plan, username: d.profile.username, account_type: d.profile.account_type, pro: ["active", "trialing"].includes(d.profile.subscription_status) || new Date(d.profile.trial_ends_at || 0) > new Date(), tier: ["active", "trialing"].includes(d.profile.subscription_status) ? (d.profile.subscription_tier === "plus" ? "basic" : d.profile.subscription_tier) || "basic" : new Date(d.profile.trial_ends_at || 0) > new Date() ? "pro" : null, subscription_tier: d.profile.subscription_tier || null, trial: new Date(d.profile.trial_ends_at || 0) > new Date(), trial_ends_at: d.profile.trial_ends_at, admin: true, email_enabled: true, sms_enabled: false, ...demoMeExtras(d, DEMO_GYM), ...(DEMO_GYM ? { account_type: "gym" } : {}) }; }
  if (path === "admin/stats") return { totals: { accounts: 128, parents: 121, gymOwners: 7, children: 214 }, signups: { last7: 23, last30: 128 }, subscriptions: { paying: 41, trialing: 18, byTier: { basic: 31, pro: 10 }, trialConversion: 38, pastDue: 1, byPlan: { monthly: 22, quarterly: 8, semiannual: 4, yearly: 7 }, viaGym: 36 },
    gyms: { active: 3, byPlan: { monthly: 1, quarterly: 0, semiannual: 1, yearly: 1 }, list: [{ name: "Sample Gymnastics", code: "SAMPLE-1A2B3C", plan: "yearly", families: 22, seats: 50 }] },
    revenue: { mrr: 1112, arr: 13344, fromParents: 594, fromGyms: 518 }, support: { open: 2 }, marketing: { sources: { facebook: 41, flyer: 33, referral: 22, instagram: 18, direct: 14 }, referrals: 22 }, recent: [{ name: "Sample Parent", username: "sample_parent", email: "parent@example.com", type: "parent", status: "trialing", plan: "monthly", created_at: new Date().toISOString() }], demo: true };
  if (path === "support/send") return { ok: true };
  if (path === "admin/support") return body ? { ok: true } : { messages: [{ id: "d1", email: "parent@example.com", name: "Sample parent", topic: "Billing", message: "How do I switch to the yearly plan?", ai_draft: "Hi! Go to More > Manage billing and choose Yearly. Your remaining monthly time is credited automatically.", status: "open", created_at: new Date().toISOString() }] };
  if (path.startsWith("billing") || path.startsWith("club")) return { url: "/?checkout=demo" };
  return {};
}

// Demo ticketing: one meet on sale, tickets bought in the demo go straight to "paid".
function demoTickets(path, body) {
  const d = demoData();
  d.demo_listing ||= { id: "demo-listing", name: "Queen City Classic", host: "Demo Gymnastics", location: "Charlotte, NC", sport: "Gymnastics", start_date: localDay(), end_date: localDay(),
    sessions: ["Session 1 · 8:00 AM", "Session 2 · 1:00 PM"], ticket_types: [{ id: "adult", name: "Adult day pass", price: 15 }, { id: "child", name: "Child (6-12)", price: 8 }], buyer_fee_cents: 150, status: "on_sale", platform_pct: 0 };
  d.demo_tickets ||= [{ code: "QC7HK2MP", type_name: "Adult day pass", session_label: "Session 1 · 8:00 AM", used_at: null }, { code: "QC9WX4RT", type_name: "Child (6-12)", session_label: "Session 1 · 8:00 AM", used_at: null }];
  save(d);
  const l = d.demo_listing;
  if (path === "tickets/listing" || path === "tickets/search") return path === "tickets/search" ? { listings: [l] } : { listing: l };
  if (path === "tickets/paid") return { link: "/my-tickets/demo-order?t=demo" };
  if (path === "tickets/order") return { listing: l, order: { id: "demo-order", buyer_name: "Demo Parent", status: "paid" }, tickets: d.demo_tickets };
  if (path === "tickets/mine") return { orders: [{ id: "demo-order", link: "/my-tickets/demo-order?t=demo", listing: l }] };
  if (path === "tickets/door") return { listing: l, sold: d.demo_tickets.length + 41, checkedIn: d.demo_tickets.filter((t) => t.used_at).length + 17 };
  if (path === "tickets/checkin") {
    const t = d.demo_tickets.find((x) => x.code === String(body?.code || "").toUpperCase().trim());
    if (!t) return { ok: false, reason: "not_found" };
    if (t.used_at) return { ok: false, reason: "used", used_at: t.used_at };
    t.used_at = new Date().toISOString(); save(d); return { ok: true, type_name: t.type_name, session_label: t.session_label };
  }
  if (path === "admin/listings") return body ? { id: l.id } : { listings: [{ ...l, sold: 43, checkedIn: 17, gross_cents: 52100, our_cents: 6450, owed_cents: 0, stripe_account: "acct_demo", public_url: `${location.origin}/tickets/demo-listing`, door_url: `${location.origin}/door/demo-listing?k=demo`, organizer_name: "Demo Gymnastics" }] };
  if (path === "tickets/door-search") { const q = String(body?.q || "").toLowerCase(); return { results: q.length < 2 || !"demo parent".includes(q) ? [] : [{ name: "Demo Parent", tickets: d.demo_tickets }] }; }
  if (path === "admin/listing-notify") return { notified: 37 };
  if (path === "admin/listing-connect") return { url: "https://connect.stripe.com/setup/demo" };
  return {};
}
