// Shared server helpers for the AthleteOrbit API (Vercel serverless functions).
// Files starting with "_" are not exposed as routes.
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import crypto from "node:crypto";
import { sportOf, conf } from "../src/data/sports.js";
import { TIER_ORDER, FEATURE_TIER, FEATURE_LABEL, hasFeature, tierName, normTier } from "../src/data/plans.js";

// Dependencies are swappable so tests can run without real Supabase/Stripe/Claude.
export const deps = {
  supabase: () => {
    if (!deps._sb) {
      deps._sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return deps._sb;
  },
  stripe: () => {
    if (!deps._stripe) deps._stripe = new Stripe(env("STRIPE_SECRET_KEY"));
    return deps._stripe;
  },
  // A fresh public (anon-key) client per call: used to sign parents in on their behalf.
  supabaseAnon: () => createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }),
  fetch: (...a) => fetch(...a),
  now: () => new Date(),
};

export function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new HttpError(500, `Server is missing the ${name} setting.`);
  }
  return v;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Wrap a handler with method check, JSON errors and CORS for the native app.
export function handler(methods, fn) {
  return async (req, res) => {
    const origin = req.headers.origin || "";
    const allowed = [process.env.APP_URL, "capacitor://localhost", "http://localhost", "https://localhost", "http://localhost:5173"].filter(Boolean);
    if (allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    }
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, "Method not allowed");
      const out = await fn(req, res);
      if (!res.writableEnded) sendJson(res, 200, out ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      sendJson(res, status, { error: status >= 500 && !e.status ? "Something went wrong. Please try again." : e.message, ...(e.upgrade ? { upgrade: e.upgrade } : {}), ...(e.code ? { code: e.code } : {}) });
    }
  };
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const raw = await readRaw(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString("utf8")); } catch { throw new HttpError(400, "Invalid JSON"); }
}

export async function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

// Verify the Supabase session token sent by the app and load the parent's profile.
export async function requireUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new HttpError(401, "Please sign in again.");
  const sb = deps.supabase();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Please sign in again.");
  const user = data.user;
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const prof = profile || { id: user.id, email: user.email, subscription_status: "none" };
  // One device at a time: the newest sign-in "claims" the account; older sessions are turned away.
  const sid = sessionIdOf(token);
  if (sid && profile && process.env.SINGLE_SESSION !== "off") {
    if (!profile.active_session) { await sb.from("profiles").update({ active_session: sid }).eq("id", user.id); prof.active_session = sid; }
    else if (profile.active_session !== sid && !req._claim) throw Object.assign(new HttpError(401, "You were signed out because your account was signed in on another device."), { code: "signed_in_elsewhere" });
  }
  prof._sid = sid;
  if (prof.club_id) {
    const { data: club } = await sb.from("clubs").select("id,name,active_until").eq("id", prof.club_id).maybeSingle();
    prof._club = club || null;
  }
  return { user, profile: prof };
}

// Supabase access tokens carry the sign-in session id (already verified by getUser above).
export function sessionIdOf(token) {
  try { const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); return typeof p.session_id === "string" ? p.session_id : null; } catch { return null; }
}

// Every new account gets a 7-day free trial (no card). After that, tracking needs a plan.
export function trialActive(profile) {
  return !!profile?.trial_ends_at && new Date(profile.trial_ends_at) > deps.now();
}
// Which plan this family has right now: own subscription tier, else the 7-day trial (everything = Pro),
// else a gym plan (Basic). null = nothing active.
export function tierOf(profile) {
  if (["active", "trialing"].includes(profile?.subscription_status)) return normTier(profile.subscription_tier) || "basic";
  if (trialActive(profile)) return "pro";
  const until = profile?._club?.active_until;
  if (until && new Date(until) > deps.now()) return "basic";
  return null;
}
export function requireFeature(profile, feature) {
  const tier = tierOf(profile);
  if (!tier) throw new HttpError(402, "Your free trial has ended. Choose a AthleteOrbit plan to keep going.");
  if (!hasFeature(tier, feature)) {
    const need = FEATURE_TIER[feature];
    throw Object.assign(new HttpError(402, `${FEATURE_LABEL[feature] || "This feature"} is part of AthleteOrbit ${tierName(need)}. Upgrade under More > Your plan.`), { upgrade: need });
  }
  return tier;
}
export function isPaid(profile) {
  if (["active", "trialing"].includes(profile?.subscription_status)) return true;
  if (trialActive(profile)) return true;
  const until = profile?._club?.active_until;
  return !!until && new Date(until) > deps.now();
}

export function requirePaid(profile) {
  if (!isPaid(profile)) throw new HttpError(402, "Your free trial has ended. Choose a AthleteOrbit plan to keep going.");
}

export const DAILY_LIMITS = { photos: 400, schedule: 12, lookup: 25, online: 30, tips: 20, coach: 40, scoresheet: 15, video: 10, readiness: 10, trip: 10, family: 40 };

// Fair-use limit per parent per day, then log the use.
export async function useQuota(userId, kind) {
  const sb = deps.supabase();
  const since = new Date(deps.now().getTime() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await sb.from("ai_usage").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", kind).gte("created_at", since);
  if (error) throw error;
  if ((count || 0) >= DAILY_LIMITS[kind]) {
    throw new HttpError(429, `Daily limit reached for this feature (${DAILY_LIMITS[kind]} per day). It resets in 24 hours.`);
  }
  const ins = await sb.from("ai_usage").insert({ user_id: userId, kind });
  if (ins.error) throw ins.error;
}

// Load a gymnast only if it belongs to this parent.
export async function loadGymnast(userId, gymnastId) {
  if (!gymnastId) return null;
  const sb = deps.supabase();
  const { data } = await sb.from("gymnasts").select("*").eq("id", gymnastId).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "Gymnast not found.");
  return data;
}

// ---- Claude ----------------------------------------------------------------
export const SAFETY_RULES = `
Safety and care rules (always follow):
- You support parents of youth athletes. Never tell anyone to attempt a new or risky skill without a qualified coach spotting and proper mats or equipment.
- Nutrition: give general, food-first fueling for growing kids only — balanced meals, carbs + protein around training, hydration, practice/meet-day timing and snack ideas, sleep and recovery. Never give calorie or macro targets, weight goals, diets, fasting, cutting, or supplements. Never comment on body weight, shape or appearance. Allergies, medical conditions, low energy, missed periods or weight concerns → pediatrician or a registered dietitian (ideally a sports dietitian).
- Pain, injury, numbness, head impacts or skills done through pain: advise stopping and seeing a doctor or physical therapist. Do not diagnose.
- Mental blocks and fear are normal; be calm and supportive, never shaming. Suggest working with the coach, and a licensed professional if anxiety affects daily life.
- Respect the coach: frame advice as questions or ideas to discuss with the coach, not orders that override them.
- Be honest about uncertainty, especially when judging from photos or a few video frames.
- Keep it short, warm and practical. Use plain words a busy parent understands.`;

// AI provider: Claude (default) or ChatGPT. Set AI_PROVIDER=openai + OPENAI_API_KEY to use ChatGPT.
export function aiProvider() {
  const p = (process.env.AI_PROVIDER || "").toLowerCase();
  if (p === "openai" || p === "chatgpt") return "openai";
  if (!p && !process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}

async function callOpenAI({ system, messages, maxTokens }) {
  const toPart = (b) => (b.type === "text" ? { type: "text", text: b.text } : { type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
  const msgs = [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.map(toPart) }))];
  const r = await deps.fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env("OPENAI_API_KEY")}` },
    body: JSON.stringify({ model: env("OPENAI_MODEL", "gpt-4o"), max_tokens: maxTokens, messages: msgs }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("OpenAI error", r.status, t.slice(0, 500));
    throw new HttpError(502, "The AI coach is busy right now. Please try again in a minute.");
  }
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || "").trim();
}

// tools: pass [WEB_SEARCH] to let Claude look things up online (Anthropic only). With tools, the answer's
// text arrives in several pieces (citations split it), so pieces are joined without separators.
export const WEB_SEARCH = { type: "web_search_20250305", name: "web_search", max_uses: 3 };
export const canSearchWeb = () => aiProvider() === "anthropic" && !!process.env.ANTHROPIC_API_KEY;
export async function callClaude({ system, messages, maxTokens = 1200, tools }) {
  if (aiProvider() === "openai") return callOpenAI({ system, messages, maxTokens });
  let msgs = messages, text = "";
  for (let turn = 0; turn < 3; turn++) {
    const r = await deps.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"), max_tokens: maxTokens, system, messages: msgs, ...(tools ? { tools } : {}) }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("Claude error", r.status, t.slice(0, 500));
      throw new HttpError(502, "The AI coach is busy right now. Please try again in a minute.");
    }
    const j = await r.json();
    text += (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(tools ? "" : "\n");
    // A long search can pause; send the paused turn back unchanged to let it finish.
    if (tools && j.stop_reason === "pause_turn") { msgs = [...msgs, { role: "assistant", content: j.content }]; continue; }
    break;
  }
  return text.trim();
}

export function imageBlock(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new HttpError(400, "Please send a JPG, PNG or WebP image.");
  if (m[2].length > 5_000_000) throw new HttpError(413, "Image is too large. Try a smaller photo.");
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

export function extractJson(text) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new HttpError(422, "Couldn't read that score sheet. Try a clearer, straight-on photo.");
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch { throw new HttpError(422, "Couldn't read that score sheet. Try a clearer, straight-on photo."); }
}

// Summary of one child's season for the AI's context (no other family's data).
export async function gymnastContext(userId, g) {
  if (!g) return "No child selected.";
  const sport = sportOf(g), c = conf(sport);
  const sb = deps.supabase();
  const since = new Date(deps.now().getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const [{ data: scores }, { data: stats }, { data: skills }, { data: meets }, { data: notes }, { data: goals }, { data: practice }, { data: quals }] = await Promise.all([
    sb.from("scores").select("*").eq("user_id", userId).eq("gymnast_id", g.id).order("meet_date", { ascending: false }).limit(10),
    sb.from("stats").select("*").eq("user_id", userId).eq("gymnast_id", g.id).order("event_date", { ascending: false }).limit(20),
    sb.from("skill_status").select("skill_key,status").eq("user_id", userId).eq("gymnast_id", g.id),
    sb.from("meets").select("name,start_date,status").eq("user_id", userId).eq("gymnast_id", g.id).gte("start_date", deps.now().toISOString().slice(0, 10)).order("start_date").limit(3),
    sb.from("coach_notes").select("noted_on,body").eq("user_id", userId).eq("gymnast_id", g.id).order("noted_on", { ascending: false }).limit(5),
    sb.from("goals").select("title,done,target_date").eq("user_id", userId).eq("gymnast_id", g.id),
    sb.from("practice_logs").select("*").eq("user_id", userId).eq("gymnast_id", g.id).gte("practiced_on", since),
    sb.from("qualifiers").select("*").eq("user_id", userId).eq("gymnast_id", g.id),
  ]);
  const pl = practice || [];
  const mins = pl.reduce((a, p) => a + Number(p.minutes || 0), 0);
  const pain = pl.filter((p) => Number(p.pain) >= 3);
  const ev = ["vault", "bars", "beam", "floor", "pommel", "rings", "pbars", "highbar"];
  const scoreLines = sport === "Gymnastics" ? (scores || []).map((s) =>
    `${s.meet_date} ${s.meet_name} (${s.level || g.level}): ` + ev.filter((k) => s[k] != null).map((k) => `${k} ${s[k]}`).join(", ") + (s.aa_place ? `, AA place ${s.aa_place}` : ""))
    : (stats || []).map((s) => `${s.event_date}${s.event_name ? ` ${s.event_name}` : ""}: ${s.metric} ${s.value}${s.unit ? ` ${s.unit}` : ""}`);
  const prefix = sport === "Gymnastics" ? g.program : sport;
  const skillLines = (skills || []).filter((s) => s.skill_key.startsWith(`${prefix}|${g.level}|`))
    .map((s) => `${s.skill_key.split("|").slice(2).join(" - ")}: ${s.status}`);
  return [
    `Athlete: ${g.name}, sport ${sport}${sport === "Gymnastics" ? ` (program ${g.program})` : ""}, ${c.level.toLowerCase()} ${g.level}${g.club ? `, club ${g.club}` : ""}.`,
    scoreLines.length ? `Recent ${c.results.toLowerCase()} (newest first):\n${scoreLines.join("\n")}` : `No ${c.results.toLowerCase()} logged yet.`,
    skillLines.length ? `Skill checklist at current level:\n${skillLines.join("\n")}` : "Skill checklist not filled in yet.",
    (goals || []).length ? `Goals: ${goals.map((x) => `${x.title}${x.done ? " (done)" : x.target_date ? ` (by ${x.target_date})` : ""}`).join("; ")}` : "",
    (notes || []).length ? `Recent coach notes: ${notes.map((n) => `${n.noted_on}: ${n.body}`).join(" | ")}` : "",
    (meets || []).length ? `Upcoming ${c.events.toLowerCase()}: ${meets.map((m) => `${m.name} on ${m.start_date} (${m.status})`).join("; ")}` : "",
    pl.length ? `Last 14 days of training: ${pl.length} sessions, ${Math.round(mins / 60 * 10) / 10} hours.${pain.length ? ` Pain reported ${pain.length} time(s): ${pain.map((p) => `${p.practiced_on} ${p.pain}/10${p.pain_area ? ` ${p.pain_area}` : ""}`).join("; ")} — remind the parent to have this checked by a doctor or physical therapist.` : " No pain reported."}` : "",
    (quals || []).length ? `Qualifying targets: ${quals.map((q) => `${q.name}: ${q.metric} ${q.better === "lower" ? "≤" : "≥"} ${q.target}${q.by_date ? ` by ${q.by_date}` : ""}`).join("; ")}` : "",
  ].filter(Boolean).join("\n\n");
}

// ---- Email (SendGrid) and text messages (Twilio) ----------------------------
export function emailEnabled() { return !!process.env.SENDGRID_API_KEY && !!process.env.EMAIL_FROM; }
export function smsEnabled() { return process.env.SMS_ENABLED === "true" && !!process.env.TWILIO_ACCOUNT_SID; }

export async function sendEmail({ to, subject, html, text, replyTo, unsubscribeUrl }) {
  if (!emailEnabled()) return { skipped: true };
  const headers = unsubscribeUrl ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  const r = await deps.fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${env("SENDGRID_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: env("EMAIL_FROM"), name: env("EMAIL_FROM_NAME", "AthleteOrbit") },
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      subject,
      content: [{ type: "text/plain", value: text || stripHtml(html) }, { type: "text/html", value: html }],
      ...(headers ? { headers } : {}),
    }),
  });
  if (!r.ok) { console.error("SendGrid", r.status, (await r.text().catch(() => "")).slice(0, 300)); throw new Error("email failed"); }
  return { sent: true };
}

export async function sendSms({ to, body }) {
  if (!smsEnabled()) return { skipped: true };
  const sid = env("TWILIO_ACCOUNT_SID");
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", env("TWILIO_FROM"));
  const r = await deps.fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!r.ok) { console.error("Twilio", r.status, (await r.text().catch(() => "")).slice(0, 300)); throw new Error("sms failed"); }
  return { sent: true };
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function stripHtml(h) { return String(h || "").replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|h\d|li|tr)>/g, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim(); }

// Branded email wrapper with the business address required for reminder emails (CAN-SPAM).
export function emailLayout({ title, body, unsubscribeUrl }) {
  const app = process.env.APP_URL || "";
  return `<!doctype html><html><body style="margin:0;background:#FBF7F2;font-family:Arial,Helvetica,sans-serif;color:#16213E">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font:700 22px Georgia,serif;margin-bottom:16px">AthleteOrbit</div>
<div style="background:#fff;border:1px solid #ECE6DD;border-radius:16px;padding:20px">
<h1 style="font:700 20px Georgia,serif;margin:0 0 12px">${esc(title)}</h1>${body}</div>
<p style="font-size:12px;color:#7B8197;margin-top:16px;line-height:1.5">${esc(process.env.BUSINESS_NAME || "AthleteOrbit")} · ${esc(process.env.BUSINESS_ADDRESS || "")}<br>
${unsubscribeUrl ? `<a href="${esc(unsubscribeUrl)}" style="color:#7B8197">Turn off meet reminder emails</a> · ` : ""}<a href="${esc(app)}" style="color:#7B8197">Open AthleteOrbit</a></p>
</div></body></html>`;
}

// Signed links (unsubscribe) that work without signing in.
export function signToken(value) {
  return crypto.createHmac("sha256", env("LINK_SECRET")).update(String(value)).digest("base64url").slice(0, 32);
}
export function checkToken(value, token) {
  const a = Buffer.from(signToken(value)), b = Buffer.from(String(token || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Calendar helpers in the business's time zone.
export function todayIn(tz = process.env.APP_TIMEZONE || "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(deps.now());
}
export function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function prettyDate(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// Best-effort throttle for sign-in attempts (per server instance).
const attempts = new Map();
export function throttle(key, { max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const now = deps.now().getTime();
  const list = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new HttpError(429, "Too many attempts. Please wait 15 minutes or reset your password.");
  return { fail: () => { list.push(now); attempts.set(key, list); }, clear: () => attempts.delete(key) };
}
export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const RESERVED = new Set(["admin", "support", "gympath", "root", "help", "info", "billing", "team", "staff", "moderator"]);
