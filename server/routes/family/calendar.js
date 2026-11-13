// Calendar feed (.ics) parents subscribe to from Google, Apple or Outlook calendar.
import { requireFeature, handler, requireUser, deps, signToken, checkToken, HttpError } from "../../lib.js";

export function feedUrl(userId) {
  const app = (process.env.APP_URL || "").replace(/\/$/, "");
  return `${app}/api/calendar?u=${userId}&t=${signToken(`cal:${userId}`)}`;
}

// GET /api/calendar-link (signed in) returns the parent's private feed address.
export const link = handler(["GET"], async (req) => {
  const { user, profile } = await requireUser(req);
  requireFeature(profile, "calendarSync");
  const url = feedUrl(user.id);
  return { url, webcal: url.replace(/^https?:/, "webcal:"), google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, "webcal:"))}` };
});

export default handler(["GET"], async (req, res) => {
  const u = new URL(req.url || "/", "http://x");
  const id = u.searchParams.get("u");
  if (!id || !checkToken(`cal:${id}`, u.searchParams.get("t"))) throw new HttpError(403, "Invalid calendar link.");
  const sb = deps.supabase();
  const [g, m, e] = await Promise.all([
    sb.from("gymnasts").select("id,name").eq("user_id", id),
    sb.from("meets").select("*").eq("user_id", id),
    sb.from("family_events").select("*").eq("user_id", id),
  ]);
  const name = (gid) => (g.data || []).find((x) => x.id === gid)?.name || "Family";
  const ev = [];
  for (const x of m.data || []) {
    if (x.status === "Skipped") continue;
    ev.push({ uid: `meet-${x.id}`, start: x.start_date, end: x.end_date || x.start_date, summary: `${name(x.gymnast_id)}: ${x.name}`, location: x.location,
      desc: [x.session_time && `Session: ${x.session_time}`, x.host && `Host: ${x.host}`, x.hotel_name && `Hotel: ${x.hotel_name}${x.hotel_confirmation ? ` (conf ${x.hotel_confirmation})` : ""}`, `Status: ${x.status}`].filter(Boolean).join("\n") });
    if (x.entry_deadline && x.status === "Planned") ev.push({ uid: `deadline-${x.id}`, start: x.entry_deadline, end: x.entry_deadline, summary: `Entry deadline: ${x.name} (${name(x.gymnast_id)})` });
  }
  for (const x of e.data || []) ev.push({ uid: `event-${x.id}`, start: x.start_date, end: x.end_date || x.start_date, summary: x.gymnast_id ? `${name(x.gymnast_id)}: ${x.title}` : x.title, location: x.location, desc: [x.start_time && `Time: ${x.start_time}`, x.notes].filter(Boolean).join("\n") });
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=900");
  res.end(toIcs(ev));
});

export function toIcs(events) {
  const d = (s) => s.replace(/-/g, "");
  const next = (s) => { const t = new Date(`${s}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10).replace(/-/g, ""); };
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line) => line.length <= 74 ? line : line.match(/.{1,73}/g).join("\r\n ");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AthleteOrbit//Family Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:AthleteOrbit family", "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
  for (const e of events) {
    out.push("BEGIN:VEVENT", `UID:${e.uid}@gympath`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(e.start)}`, `DTEND;VALUE=DATE:${next(e.end)}`, fold(`SUMMARY:${esc(e.summary)}`));
    if (e.location) out.push(fold(`LOCATION:${esc(e.location)}`));
    if (e.desc) out.push(fold(`DESCRIPTION:${esc(e.desc)}`));
    out.push("END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n") + "\r\n";
}
