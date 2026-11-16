import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deps, signToken } from "../server/lib.js";
import { fakeSupabase, call } from "./fake.js";
import { ROUTES } from "../api/router.js";
import { runDigest } from "../server/routes/cron/reminders.js";
import { parseFeed } from "../server/routes/family/news.js";

Object.assign(process.env, { ANTHROPIC_API_KEY: "test", APP_URL: "https://app.test", LINK_SECRET: "link", SENDGRID_API_KEY: "sg", EMAIL_FROM: "hi@g.test", APP_TIMEZONE: "America/New_York" });
const NOW = new Date("2026-10-26T14:00:00Z"); // Monday Oct 26 2026
let T, emails, claude, feedXml;
beforeEach(() => {
  T = {
    profiles: [{ id: "u1", email: "mom@x.com", subscription_status: "active", subscription_tier: "pro", email_reminders: true, club_id: "c1" }, { id: "u2", email: "dad@x.com", subscription_status: "active", subscription_tier: "pro", email_reminders: true }],
    gymnasts: [{ id: "g1", user_id: "u1", name: "Maya", program: "WAG", level: "Level 5", sport: "Gymnastics" }, { id: "g2", user_id: "u1", name: "Arjun", program: "Other", level: "U12", sport: "Soccer" }],
    meets: [
      { id: "m1", user_id: "u1", gymnast_id: "g1", name: "Turkey Invitational", location: "Raleigh, NC", start_date: "2026-11-22", status: "Registered", session_time: "Sat 8:00 AM", estimated_cost: 450, checklist: [{ text: "Grips", done: true }, { text: "Leo", done: false }] },
      { id: "m2", user_id: "u1", gymnast_id: "g2", name: "Fall Cup", location: "Orlando, FL", start_date: "2026-11-21", end_date: "2026-11-22", status: "Planned", entry_deadline: "2026-11-01", checklist: [] },
    ],
    costs: [
      { id: "c1", user_id: "u1", gymnast_id: "g1", spent_on: "2026-09-01", category: "Tuition", amount: 300, paid: true },
      { id: "c2", user_id: "u1", gymnast_id: "g1", spent_on: "2026-10-01", category: "Hotel", amount: 149, paid: false, meet_id: "m1", description: "Turkey hotel" },
      { id: "c3", user_id: "u1", gymnast_id: "g2", spent_on: "2026-10-05", category: "Equipment", amount: 60, paid: true },
      { id: "c4", user_id: "u1", gymnast_id: "g1", spent_on: "2026-05-01", category: "Tuition", amount: 999, paid: true },
    ],
    budgets: [{ id: "b1", user_id: "u1", season: "2026-27", gymnast_id: null, category: null, amount: 500 }],
    family_events: [{ id: "e1", user_id: "u1", title: "Grandma visit", start_date: "2026-11-22" }],
    scores: [{ user_id: "u1", gymnast_id: "g1", meet_name: "Fall Classic", meet_date: "2026-09-14", vault: 9.1, bars: 8.65, beam: 8.9, floor: 9.05 }],
    goals: [{ user_id: "u1", gymnast_id: "g1", title: "Kip on bars", done: false }],
    stats: [{ user_id: "u1", gymnast_id: "g2", event_date: "2026-10-04", metric: "Goals", value: 2, unit: "goals" }],
    clubs: [{ id: "c1", name: "Axcelerate", code: "AXC-1", owner_id: "u2", active_until: "2027-10-01T00:00:00Z" }],
    club_announcements: [{ id: "a1", club_id: "c1", title: "Picture day", body: "Wear team leo", created_at: "2026-10-20T00:00:00Z" }],
    ai_usage: [], digests_sent: [],
  };
  deps._sb = fakeSupabase(T, { tok1: { id: "u1", email: "mom@x.com" }, tok2: { id: "u2", email: "dad@x.com" } });
  deps.supabase = () => deps._sb; deps.now = () => NOW;
  emails = []; claude = [];
  feedXml = `<?xml version="1.0"?><rss><channel><title>USA Gymnastics</title>
<item><title>American women take team silver &#8211; Worlds</title><link>https://usagym.org/a/</link><pubDate>Wed, 21 Oct 2026 21:27:18 +0000</pubDate></item>
<item><title><![CDATA[Weekly Preview]]></title><link>https://usagym.org/b/</link><pubDate>Tue, 20 Oct 2026 10:00:00 +0000</pubDate></item></channel></rss>`;
  deps.fetch = async (url, init) => {
    if (url.includes("sendgrid")) { emails.push(JSON.parse(init.body)); return { ok: true }; }
    if (url.includes("usagym")) return { ok: true, text: async () => feedXml };
    claude.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ content: [{ type: "text", text: "You spent $509." }] }) };
  };
});

test("calendar link is private and the feed is valid iCalendar", async () => {
  const l = await call(ROUTES["calendar-link"], { method: "GET", token: "tok1" });
  assert.match(l.json.google, /^https:\/\/calendar\.google\.com\/calendar\/r\?cid=webcal/);
  const bad = await call(ROUTES.calendar, { method: "GET", url: "/api/router?path=calendar&u=u1&t=nope" });
  assert.equal(bad.status, 403);
  const forged = await call(ROUTES.calendar, { method: "GET", url: `/api/router?path=calendar&u=u1&t=${signToken("u1")}` });
  assert.equal(forged.status, 403, "unsubscribe token can't open the calendar");
  const r = await call(ROUTES.calendar, { method: "GET", url: `/api/router?path=calendar&u=u1&t=${signToken("cal:u1")}` });
  const ics = r.json.html;
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /SUMMARY:Maya: Turkey Invitational/); assert.match(ics, /DTSTART;VALUE=DATE:20261121\r\nDTEND;VALUE=DATE:20261123/);
  assert.match(ics, /SUMMARY:Entry deadline: Fall Cup \(Arjun\)/); assert.match(ics, /SUMMARY:Grandma visit/);
  assert.match(ics, /LOCATION:Raleigh\\, NC/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
});

test("news: official feed headlines + this family's club announcements", async () => {
  const items = parseFeed(feedXml, "USA Gymnastics");
  assert.equal(items[0].title, "American women take team silver – Worlds"); assert.equal(items[1].title, "Weekly Preview");
  const r = await call(ROUTES.news, { method: "GET", token: "tok1" });
  assert.equal(r.json.news.length, 2); assert.equal(r.json.news[0].source, "USA Gymnastics");
  assert.equal(r.json.announcements[0].title, "Picture day");
  const other = await call(ROUTES.news, { method: "GET", token: "tok2" });
  assert.equal(other.json.announcements.length, 1, "gym owner sees own gym's posts");
});

test("only the gym owner can announce; members get it by email", async () => {
  const no = await call(ROUTES["club/announce"], { token: "tok1", body: { clubCode: "AXC-1", title: "Hi all", body: "Spam" } });
  assert.equal(no.status, 403);
  const r = await call(ROUTES["club/announce"], { token: "tok2", body: { clubCode: "axc-1", title: "Meet schedule changed", body: "Session 2 now starts at 1pm.", email: true } });
  assert.equal(r.json.emailed, 1); assert.equal(emails[0].personalizations[0].to[0].email, "mom@x.com");
  assert.equal(T.club_announcements.length, 2);
});

test("Monday digest: unpaid fees + budget over 90%, once per week", async () => {
  const r = await runDigest();
  assert.equal(r.sent, 1);
  assert.match(emails[0].subject, /\$149 in unpaid/); const h = emails[0].content[1].value;
  assert.match(h, /Turkey hotel/); assert.match(h, /Family total: \$509 of \$500 \(102%\)/);
  const again = await runDigest();
  assert.equal(again.sent, 0);
  deps.now = () => new Date("2026-10-27T14:00:00Z");
  assert.equal((await runDigest()).skipped, "not Monday");
});
