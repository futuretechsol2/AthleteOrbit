// Demo-mode stand-ins for the gym features (roster, season schedule, online lookup, messages, announcements).
// Everything lives in the browser's demo store; nothing is sent anywhere.
import { meetMatches, sessionFor, levelKey, shortName, parseGender } from "../data/levels.js";
import { defaultPacking } from "../data/packing.js";

const iso = (days) => { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
export const DEMO_CLUB = { name: "Demo Gymnastics", code: "DEMO-4F2A9C", plan: "trial", seats: 50, families: 23, active_until: new Date(Date.now() + 26 * 86400000).toISOString() };

// What the "AI" reads from any schedule photo in the demo.
const SAMPLE = () => [
  { name: "Snowflake Classic", start_date: iso(24), end_date: iso(25), location: "Raleigh, NC", host: null, levels: ["Level 3", "Level 4", "Level 5"], gender: "F", sport: "Gymnastics" },
  { name: "Blackjack Boys Invitational", start_date: iso(31), location: "Charlotte, NC", host: null, levels: ["Level 4", "Level 5", "Level 6"], gender: "M", sport: "Gymnastics" },
  { name: "Carolina Optionals Cup", start_date: iso(38), end_date: iso(39), location: "Greensboro, NC", host: null, levels: ["Level 8", "Level 9", "Level 10"], gender: "F", sport: "Gymnastics" },
  { name: "Sweetheart Invitational", start_date: iso(66), location: "Columbia, SC", host: null, levels: ["Level 3", "Level 4", "Level 5"], gender: "F", sport: "Gymnastics" },
  { name: "Palmetto Men's Open", start_date: iso(73), end_date: iso(74), location: "Greenville, SC", host: null, levels: ["Level 6", "Level 7"], gender: "M", sport: "Gymnastics" },
  { name: "Team Showcase & Banquet", start_date: iso(110), location: "Concord, NC", host: "Demo Gymnastics", levels: [], gender: null, sport: "Gymnastics" },
];
const FOUND = { "Snowflake Classic": { host: "Triangle Gymnastics Academy", website: "https://example.com/snowflake-classic", venue: "Raleigh Convention Center, 500 S Salisbury St", sessions: [{ levels: ["Level 3"], gender: "F", text: "Sat · Session 1 · open stretch 8:00 AM" }, { levels: ["Level 4", "Level 5"], gender: "F", text: "Sat · Session 3 · open stretch 1:15 PM, march-in 1:45 PM" }] },
  "Blackjack Boys Invitational": { host: "Queen City Gymnastics", website: "https://example.com/blackjack-invite", venue: "Cabarrus Arena, 4751 NC-49, Concord", sessions: [{ levels: ["Level 4", "Level 5"], gender: "M", text: "Sat · Session 1 · warm-up 8:30 AM" }, { levels: ["Level 6"], gender: "M", text: "Sat · Session 2 · warm-up 12:30 PM" }] } };
const lookupFor = (m) => FOUND[m.name] || (/turkey/i.test(m.name) ? { host: m.host || "Demo Gym", website: "https://example.com/turkey-invitational", venue: "NC State Fairgrounds, Raleigh", sessions: [{ levels: [], gender: null, text: "Sat · Session 2 · open stretch 11:30 AM, march-in 12:00 PM" }] } : null);

function center(d) {
  if (d.center) return d.center;
  const id = (n) => `r${n}`;
  d.center = {
    roster: [["Maya Patel", "Level 5", "F"], ["Arjun Patel", "Level 6", "M"], ["Ella Brooks", "Level 4", "F"], ["Sofia Kim", "Level 5", "F"], ["Harper Lewis", "Level 3", "F"], ["Liam Ortiz", "Level 4", "M"], ["Noah Reed", "Level 6", "M"], ["Chloe Adams", "Level 8", "F"], ["Mila Park", "Xcel Gold", "F"], ["Ethan Cole", "Level 5", "M"], ["Grace Hill", "Level 9", "F"], ["Ruby Stone", "Level 4", "F"]]
      .map(([name, level, gender], i) => ({ id: id(i), name, level, gender, program: /xcel/i.test(level) ? "Xcel" : gender === "M" ? "MAG" : "WAG", sport: "Gymnastics", group_name: null, parent_email: null, families: i > 1 && i % 3 ? 1 : 0 })),
    meets: [],
    threads: { demo: [{ id: "m1", sender: "family", body: "Hi Coach — is Friday practice still 5–8 pm the week of Thanksgiving?", created_at: ago(190) }, { id: "m2", sender: "gym", body: "Hi! No practice Thursday or Friday that week. We're back Saturday 9–12.", created_at: ago(35) }],
      f2: [{ id: "m3", sender: "family", body: "Ella has a dentist appointment Tuesday — she'll be 30 minutes late.", created_at: ago(64) }], f3: [{ id: "m4", sender: "family", body: "What leo do the boys wear for Blackjack?", created_at: ago(1500) }, { id: "m5", sender: "gym", body: "Navy competition singlet + white pants. Thanks!", created_at: ago(1400) }] },
    names: { demo: { name: "Demo Parent", athletes: "Maya (Level 5), Arjun (Level 6)" }, f2: { name: "Jen Brooks", athletes: "Ella (Level 4)" }, f3: { name: "Carlos Ortiz", athletes: "Liam (Level 4)" } },
    unreadFamily: 1, unreadGym: { f2: 1 },
    announcements: [{ id: "a1", title: "Thanksgiving week schedule + picture day", summary: "No practice Thu–Fri of Thanksgiving week. Picture day is the Saturday after at 10 am — wear the team leo.", body: "Hello families!\n\nA few dates for the next two weeks:\n• No practice Thursday or Friday of Thanksgiving week. Saturday practice runs 9–12 as usual.\n• Picture day is the Saturday after Thanksgiving. Photos start at 10 am — wear the team leo and bring a hair bow.\n• Meet fees for January are due by Dec 1.\n\nThank you!\nCoach Dana", created_at: ago(300) }],
    joined: true, linked: [],
  };
  return d.center;
}

// Copy matching competitions into the demo family's meets.
function sync(d, c) {
  let added = 0;
  for (const g of d.gymnasts) for (const cm of c.meets.filter((m) => m.status === "published")) {
    const row = d.meets.find((m) => m.gymnast_id === g.id && (m.club_meet_id === cm.id || (m.name === cm.name && m.start_date === cm.start_date)));
    const session = sessionFor(cm, g);
    if (meetMatches(cm, g) && !row) { d.meets.push({ id: `cm-${cm.id}-${g.id}`, gymnast_id: g.id, club_meet_id: cm.id, name: cm.name, start_date: cm.start_date, end_date: cm.end_date || null, location: cm.location, host: cm.host, website: cm.website || null, venue: cm.venue || null, session_time: session, status: "Planned", info_source: cm.info_source || null, info_checked_at: cm.info_checked_at || null, checklist: defaultPacking(g), created_at: new Date().toISOString() }); added++; }
    else if (row && meetMatches(cm, g)) Object.assign(row, { club_meet_id: cm.id, host: cm.host || row.host, website: cm.website || row.website, venue: cm.venue || row.venue, session_time: session || row.session_time, info_source: cm.info_source || row.info_source, info_checked_at: cm.info_checked_at || row.info_checked_at });
  }
  return added;
}

export function demoCenter(path, body, d, save, uid, gymRole) {
  const c = center(d), b = body || {};
  const done = (out) => { save(d); return out; };
  if (path === "club/mine") return { clubs: gymRole ? [DEMO_CLUB] : [] };
  if (path === "club/trial") return { code: DEMO_CLUB.code, active_until: DEMO_CLUB.active_until };
  if (path === "club/join") { c.joined = !b.leave; return done({ joined: true, club: { name: DEMO_CLUB.name }, linked: 0, rosterSize: c.roster.length }); }
  if (path === "club/home") {
    if (!gymRole && !c.joined) return { club: null };
    return { club: { name: DEMO_CLUB.name, sport: "Gymnastics" }, announcements: c.announcements, unread: gymRole ? 0 : c.unreadFamily, rosterSize: c.roster.length,
      linked: d.gymnasts.filter((g) => c.linked.includes(g.id)).map((g) => g.name), unlinked: d.gymnasts.filter((g) => g.sport === "Gymnastics" && !c.linked.includes(g.id)).map((g) => g.name) };
  }
  if (path === "club/announce") {
    if (b.remove) { c.announcements = c.announcements.filter((a) => a.id !== b.remove); return done({ removed: true }); }
    const text = String(b.body || ""); const summary = text.length > 220 ? `${text.replace(/\s+/g, " ").split(/(?<=[.!?])\s/).slice(0, 2).join(" ").slice(0, 200)}` : null;
    c.announcements.unshift({ id: uid(), title: b.title, body: text, summary, created_at: new Date().toISOString() });
    return done({ posted: true, emailed: b.email === false ? 0 : DEMO_CLUB.families, summary });
  }
  if (path === "club/roster") {
    if (b.remove) c.roster = c.roster.filter((r) => r.id !== b.remove);
    else if (b.update?.id) { const r = c.roster.find((x) => x.id === b.update.id); if (r) Object.assign(r, { name: b.update.name, level: b.update.level, gender: parseGender(b.update.gender) || r.gender }); }
    else if (Array.isArray(b.rows)) {
      const have = new Set(c.roster.map((r) => `${r.name.toLowerCase()}|${levelKey(r.level)}`)); let added = 0;
      for (const r of b.rows) { const k = `${String(r.name).toLowerCase()}|${levelKey(r.level)}`; if (!r.name || have.has(k)) continue; have.add(k); const gender = parseGender(r.gender) || "F"; c.roster.push({ id: uid(), name: r.name, level: r.level || "Team", gender, program: /xcel|gold|silver|bronze|platinum|diamond/i.test(r.level || "") ? "Xcel" : gender === "M" ? "MAG" : "WAG", sport: "Gymnastics", parent_email: r.parent_email || null, group_name: r.group || null, families: 0 }); added++; }
      return done({ added, skipped: b.rows.length - added, linked: 0 });
    }
    return done({ club: { name: DEMO_CLUB.name, code: DEMO_CLUB.code }, roster: [...c.roster].sort((a, z) => a.name.localeCompare(z.name)) });
  }
  if (path === "club/roster-search") {
    const q = String(b.q || "").toLowerCase().trim(), lvl = b.level || "";
    const rows = c.roster.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!lvl || levelKey(r.level) === levelKey(lvl)));
    return { total: c.roster.length, levels: [...new Set(c.roster.map((r) => r.level))].sort((a, z) => a.localeCompare(z, undefined, { numeric: true })),
      results: rows.sort((a, z) => a.name.localeCompare(z.name)).map((r) => ({ id: r.id, name: shortName(r.name), level: r.level, program: r.program, gender: r.gender, sport: r.sport, mine: d.gymnasts.some((g) => g.roster_id === r.id), full: false })) };
  }
  if (path === "club/roster-claim") {
    const r = c.roster.find((x) => x.id === b.rosterId); if (!r) throw Object.assign(new Error("We couldn't find that athlete on your gym's roster."), { status: 404 });
    const first = r.name.split(/\s+/)[0]; let g = d.gymnasts.find((x) => x.name.toLowerCase() === first.toLowerCase() && !x.roster_id);
    const rec = { level: r.level, program: r.program, gender: r.gender, sport: "Gymnastics", club: DEMO_CLUB.name, roster_id: r.id };
    if (g) Object.assign(g, rec); else { g = { id: uid(), name: first, created_at: new Date().toISOString(), ...rec }; d.gymnasts.push(g); }
    c.linked.push(g.id); r.families = (r.families || 0) + 1;
    return done({ linked: true, name: first, meets: sync(d, c) });
  }
  if (path === "club/schedule-read") return { competitions: SAMPLE(), demo: true };
  if (path === "club/schedule-apply") {
    const per = {}; let added = 0;
    for (const g of d.gymnasts) for (const m of b.competitions || []) {
      if (!meetMatches(m, g) || d.meets.some((x) => x.gymnast_id === g.id && x.name === m.name && x.start_date === m.start_date)) continue;
      d.meets.push({ id: uid(), gymnast_id: g.id, name: m.name, start_date: m.start_date, end_date: m.end_date || null, location: m.location || null, host: m.host || null, status: "Planned", checklist: defaultPacking(g), created_at: new Date().toISOString() });
      added++; per[g.name] = (per[g.name] || 0) + 1;
    }
    return done({ added, perAthlete: per, shared: b.share ? (b.competitions || []).length : 0 });
  }
  if (path === "club/signups") {
    c.rsvps ||= {}; c.fees ||= {};
    const list = (m) => c.roster.filter((r) => meetMatches(m, r)).map((r, i) => { const x = (c.rsvps[m.id] ||= {})[r.id] ?? (i % 3 === 0 ? { status: "going", paid: i % 2 === 0 } : i % 3 === 1 ? { status: null } : { status: "going", paid: false }); c.rsvps[m.id][r.id] = x;
      return { gymnast_id: r.id, name: r.name, level: r.level, family: `${r.name.split(" ")[1]} family`, email: "family@example.com", status: x.status, paid: !!x.paid }; });
    const counts = (l) => ({ expected: l.length, going: l.filter((a) => a.status === "going").length, notGoing: l.filter((a) => a.status === "not_going").length, noAnswer: l.filter((a) => !a.status).length, paid: l.filter((a) => a.paid).length });
    const out = (m) => ({ id: m.id, name: m.name, start_date: m.start_date, levels: m.levels || [], fee_cents: c.fees[m.id]?.fee_cents ?? 9500, fee_due: c.fees[m.id]?.fee_due ?? null });
    const pub = c.meets.filter((m) => m.status !== "suggested");
    if (!b.meet) return done({ meets: pub.map((m) => ({ ...out(m), counts: counts(list(m)) })) });
    const m = c.meets.find((x) => x.id === b.meet); if (!m) return { meets: [] };
    if (b.fee_cents !== undefined) { c.fees[m.id] = { fee_cents: b.fee_cents, fee_due: b.fee_due }; return done({ saved: true }); }
    if (b.gymnast_id) { const x = ((c.rsvps[m.id] ||= {})[b.gymnast_id] ||= {}); if (b.paid !== undefined) x.paid = b.paid; if (b.status !== undefined) x.status = b.status; return done({ saved: true }); }
    if (b.nudge) { const l = list(m); return done({ nudged: b.nudge === "unpaid" ? l.filter((a) => a.status === "going" && !a.paid).length : l.filter((a) => !a.status).length }); }
    const l = list(m); return done({ meet: out(m), athletes: l, counts: counts(l) });
  }
  if (path === "club/schedule") {
    if (b.remove) { c.meets = c.meets.filter((m) => m.id !== b.remove); d.meets = d.meets.filter((m) => m.club_meet_id !== b.remove); }
    else if (b.publish) { const m = c.meets.find((x) => x.id === b.publish); if (m) m.status = "published"; sync(d, c); }
    else if (b.update?.id) { const m = c.meets.find((x) => x.id === b.update.id); if (m) Object.assign(m, b.update); sync(d, c); }
    else if (Array.isArray(b.add)) {
      let saved = 0;
      for (const m of b.add) { if (c.meets.some((x) => x.name === m.name && x.start_date === m.start_date)) continue; c.meets.push({ id: uid(), status: "published", sessions: [], ...m }); saved++; }
      return done({ saved, skipped: b.add.length - saved, added: sync(d, c) });
    }
    return done({ competitions: [...c.meets].sort((a, z) => (a.start_date > z.start_date ? 1 : -1)).map((m) => ({ ...m, athletes: c.roster.filter((r) => meetMatches(m, r)).length, families: Math.max(1, Math.round(c.roster.filter((r) => meetMatches(m, r)).length * 0.7)) })) });
  }
  if (path === "club/lookup") {
    const now = new Date().toISOString();
    if (b.clubMeetId) {
      const m = c.meets.find((x) => x.id === b.clubMeetId); const f = m && lookupFor(m);
      if (m) Object.assign(m, { info_checked_at: now }, f ? { host: m.host || f.host, website: f.website, venue: f.venue, sessions: f.sessions, info_source: f.website } : {});
      sync(d, c); return done({ found: !!f, ...(m || {}) });
    }
    const m = d.meets.find((x) => x.id === b.meetId); const f = m && lookupFor(m); const g = m && d.gymnasts.find((x) => x.id === m.gymnast_id);
    const patch = { info_checked_at: now, ...(f ? { host: m.host || f.host, website: f.website, venue: f.venue, info_source: f.website, session_time: sessionFor({ sessions: f.sessions }, g || {}) || m.session_time || null } : {}) };
    if (m) Object.assign(m, patch);
    return done({ found: !!f, ...patch });
  }
  if (path === "club/messages") {
    if (gymRole) {
      if (b.body && b.familyId) { (c.threads[b.familyId] ||= []).push({ id: uid(), sender: "gym", body: b.body, created_at: new Date().toISOString() }); if (b.familyId === "demo") c.unreadFamily++; return done({ sent: true }); }
      if (b.family) { delete c.unreadGym[b.family]; return done({ who: c.names[b.family] || { name: "Parent", athletes: "" }, messages: c.threads[b.family] || [] }); }
      return { threads: Object.entries(c.threads).map(([family_id, t]) => ({ family_id, unread: c.unreadGym[family_id] || 0, last: t.at(-1), ...(c.names[family_id] || { name: "Parent", athletes: "" }) })).sort((a, z) => (a.last.created_at < z.last.created_at ? 1 : -1)) };
    }
    if (b.body) { c.threads.demo.push({ id: uid(), sender: "family", body: b.body, created_at: new Date().toISOString() }); c.unreadGym.demo = (c.unreadGym.demo || 0) + 1; return done({ sent: true }); }
    c.unreadFamily = 0;
    return done({ club: c.joined ? { name: DEMO_CLUB.name } : null, messages: c.joined ? c.threads.demo : [] });
  }
  return null;
}
// Extra fields for the demo "me" answer.
// Floor Music demo: a few real (generated, royalty-free) tracks so the music table actually plays.
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const DEMO_TRACKS = ["/demo-music/floor-1.mp3", "/demo-music/floor-2.mp3", "/demo-music/floor-3.mp3"];
const OTHER_GYM = [["Ava Ruiz", "Level 4", "Queen City Flyers"], ["Lily Kim", "Level 4", "Carolina Elite"], ["Ella Chen", "Level 3", "Tidal Gym"], ["Nora Diaz", "Level 5", "Queen City Flyers"]];
export function demoMusic(path, body, d, save) {
  const c = center(d), b = body || {};
  const girls = c.roster.filter((r) => r.gender !== "M" && r.program !== "MAG");
  c.music ||= { levels: { "Level 4": { id: "m-l4", title: "Level 4 team floor 2026-27", duration: 43, url: DEMO_TRACKS[1] }, "Level 5": { id: "m-l5", title: "Level 5 team floor 2026-27", duration: 41, url: DEMO_TRACKS[0] } }, athletes: {} };
  const lk = (l) => String(l || "").toLowerCase();
  const pick = (r) => c.music.athletes[r.id] || Object.entries(c.music.levels).find(([l]) => lk(l) === lk(r.level))?.[1] || null;
  if (path === "music/upload-url") return { path: `demo/${uid()}.mp3`, token: "demo" };
  if (path === "music") {
    if (b.gymnast || b.gymnast_id) {
      const g = (d.gymnasts || []).find((x) => x.id === (b.gymnast || b.gymnast_id));
      if (!g || g.program === "MAG" || g.gender === "M") return { eligible: false, music: null };
      d.ownMusic ||= {};
      if (b.path) { d.ownMusic[g.id] = { id: uid(), title: b.title || "Floor music", duration: b.duration, url: b.preview || DEMO_TRACKS[2], scope: "athlete" }; save(d); return { saved: true }; }
      if (b.remove) { delete d.ownMusic[g.id]; save(d); return { removed: true }; }
      const own = d.ownMusic[g.id]; const gym = !own && { id: "m-l5", title: "Level 5 team floor 2026-27", duration: 41, url: DEMO_TRACKS[0], scope: "level" };
      return { eligible: true, music: own || gym, from: own ? "family" : "Demo Gymnastics", gym: "Demo Gymnastics" };
    }
    if (b.remove) { for (const k of Object.keys(c.music.levels)) if (c.music.levels[k].id === b.remove) delete c.music.levels[k]; for (const k of Object.keys(c.music.athletes)) if (c.music.athletes[k].id === b.remove) delete c.music.athletes[k]; save(d); return { removed: true }; }
    if (b.path) {
      const m = { id: uid(), title: b.title || "Floor music", duration: b.duration || null, url: b.preview || DEMO_TRACKS[2] };
      if (b.roster_id) { c.music.athletes[b.roster_id] = { ...m, scope: "athlete" }; save(d); return { saved: true, athletes: 1 }; }
      c.music.levels[b.level] = { ...m, scope: "level" }; save(d); return { saved: true, athletes: girls.filter((r) => lk(r.level) === lk(b.level) && !c.music.athletes[r.id]).length };
    }
    const levels = [...new Set(girls.map((r) => r.level || "No level"))].sort((a, b2) => a.localeCompare(b2, undefined, { numeric: true }))
      .map((level) => ({ level, girls: girls.filter((r) => (r.level || "No level") === level).length, music: c.music.levels[level] ? { ...c.music.levels[level], scope: "level" } : null }));
    const athletes = girls.map((r) => { const m = pick(r); return { roster_id: r.id, name: r.name, level: r.level, music: m && { ...m, scope: c.music.athletes[r.id] ? "athlete" : "level" } }; });
    return { club: { name: DEMO_CLUB.name }, levels, athletes, desk_url: `${location.origin}/music/gym-demo?k=demo&demo`, counts: { girls: girls.length, ready: athletes.filter((a) => a.music).length } };
  }
  if (path === "music/desk") { // uploaded demo files live only until the page closes
    for (const m of [...Object.values(c.music.levels), ...Object.values(c.music.athletes)]) if (String(m.url).startsWith("blob:")) m.url = DEMO_TRACKS[2];
    const mine = girls.map((r) => ({ id: r.id, name: r.name, level: r.level, gym: DEMO_CLUB.name, music: pick(r) }));
    const others = String(b.id || "").startsWith("gym-") ? [] : OTHER_GYM.map(([name, level, gym], i) => ({ id: `o${i}`, name, level, gym, music: i === 3 ? null : { id: `o${i}`, title: `${name.split(" ")[0]} — floor`, duration: 40, url: DEMO_TRACKS[(i + 2) % 3], scope: "athlete" } }));
    const athletes = [...mine, ...others].sort((a, b2) => (a.level || "").localeCompare(b2.level || "", undefined, { numeric: true }) || a.name.localeCompare(b2.name));
    return { title: String(b.id || "").startsWith("gym-") ? `${DEMO_CLUB.name} · Floor music` : "Holiday Flip Invitational", gyms: [DEMO_CLUB.name, "Queen City Flyers", "Carolina Elite", "Tidal Gym"], notOnApp: [], athletes, counts: { athletes: athletes.length, ready: athletes.filter((a) => a.music).length } };
  }
  return null;
}

export function demoMeExtras(d, gymRole) {
  const c = center(d);
  return { unread_messages: gymRole ? Object.values(c.unreadGym).reduce((a, n) => a + n, 0) : c.joined ? c.unreadFamily : 0, owns_club: gymRole ? DEMO_CLUB : null, web_lookup: true,
    last_announcement: !gymRole && c.joined && c.announcements[0] ? { id: c.announcements[0].id, title: c.announcements[0].title, summary: c.announcements[0].summary || c.announcements[0].body.slice(0, 160), created_at: c.announcements[0].created_at } : null,
    club: !gymRole && c.joined ? { name: DEMO_CLUB.name, active_until: DEMO_CLUB.active_until } : null };
}

// ---------- Coach OS demo: a realistic season for the sample team (3 meets, 4 weeks of roll calls, notes) ----------
import { analyze, RATINGS } from "../data/coach.js";
import { eventsFor, totalOf } from "../data/live.js";
const DEMO_MEETS = [["Fall Classic", -54], ["Pumpkin Invitational", -33], ["Turkey Invitational", -6]];
const dayOff = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const BASE = (level) => ({ "Level 3": 8.95, "Level 4": 9.0, "Level 5": 8.9, "Level 6": 8.8, "Level 8": 8.85, "Level 9": 8.9, "Xcel Gold": 9.05 }[level] || 8.9);
// Each athlete's story: + improving, - slipping on an event, ~ steady
const STORY = { r0: ["+", "Bars"], r2: ["+", "Vault"], r3: ["-", "Beam"], r4: ["~", "Bars"], r5: ["+", "Rings"], r7: ["-", "Bars"], r8: ["+", "Floor"], r10: ["~", "Beam"], r11: ["+", "Bars"] };
function seedCoach(c) {
  if (c.coach) return c.coach;
  const results = [], attendance = [], notes = [];
  for (const r of c.roster) {
    const evs = eventsFor("Gymnastics", r.gender), [kind, ev] = STORY[r.id] || ["~", evs[1]];
    DEMO_MEETS.forEach(([name, off], i) => {
      const scores = {};
      for (const e of evs) {
        let v = BASE(r.level) + ((hash(r.id + e) % 40) - 20) / 100 + (kind === "+" ? i * 0.12 : kind === "-" && e === ev ? -i * 0.2 : ((hash(r.id + e + i) % 10) - 5) / 100);
        if (e === ev && kind !== "-") v -= 0.35; // their weakest event
        scores[e] = Math.round(Math.min(9.85, Math.max(7.6, v)) * 40) / 40;
      }
      results.push({ id: `res-${r.id}-${i}`, roster_id: r.id, meet_name: name, meet_date: dayOff(off), level: r.level, scores, aa: totalOf(scores, "Gymnastics"), place: 1 + (hash(r.id + name) % 8), source: i === 2 ? "scorecard" : "manual" });
    });
    for (let back = 27; back >= 1; back--) {
      const dt = new Date(Date.now() - back * 86400000); if (![1, 3, 5].includes(dt.getDay())) continue;
      const h = hash(r.id + back);
      const status = r.id === "r4" && back < 16 && h % 3 !== 0 ? "absent" : r.id === "r6" && h % 5 === 0 ? "late" : h % 17 === 0 ? "excused" : h % 23 === 0 ? "absent" : "present";
      attendance.push({ roster_id: r.id, day: dt.toISOString().slice(0, 10), status });
    }
  }
  const at = (n) => new Date(Date.now() - n * 86400000).toISOString();
  notes.push({ id: "n1", roster_id: "r0", kind: "evaluation", visibility: "parent", status: "published", created_at: at(9), ratings: { Technique: 4, "Strength & flexibility": 4, Consistency: 3, "Training effort": 5, "Competition mindset": 4 }, strengths: "Beam confidence and clean leaps; great work ethic.", weaknesses: "Kip timing on bars — she pulls early.", next_steps: "Glide swings and kip drills 3x a week." });
  notes.push({ id: "n2", roster_id: "r0", kind: "plan", visibility: "parent", status: "published", created_at: at(8), plan: { focus: "Bars: consistent kip", current: "Kip in about 2 of 5 turns; bars 8.6–8.8", target: "Kip in 4 of 5 turns; bars 9.0+ by States", review_date: dayOff(12), goals: [{ text: "Glide swings with full extension x10 each practice", drills: "Strap bar glides; pike compression on panel", done: true }, { text: "Kip on strap bar with spot, 3 sets of 5", drills: "Kip drill on low bar with spotter", done: true }, { text: "Independent kip on low bar, 3 of 5", drills: "Kip → cast series", done: false }] } });
  notes.push({ id: "n3", roster_id: "r3", kind: "note", visibility: "private", status: "published", created_at: at(4), body: "Hesitating on beam series since the Pumpkin meet. Talk with her about confidence; keep it light." });
  notes.push({ id: "n4", roster_id: "r2", kind: "evaluation", visibility: "private", status: "published", created_at: at(20), ratings: { Technique: 3, Consistency: 4, "Training effort": 5 }, strengths: "Powerful vault, fearless.", weaknesses: "Bent arms on bars cast.", next_steps: "Cast handstand drills." });
  return (c.coach = { results, attendance, notes });
}
const summary = (c, k, r) => {
  const rs = k.results.filter((x) => x.roster_id === r.id), a = analyze(rs, "Gymnastics");
  const last30 = k.attendance.filter((x) => x.roster_id === r.id && x.day >= dayOff(-30)), counted = last30.filter((x) => x.status !== "excused");
  const ev = k.notes.filter((n) => n.roster_id === r.id && n.kind === "evaluation").sort((x, y) => (x.created_at > y.created_at ? -1 : 1))[0];
  const plan = k.notes.find((n) => n.roster_id === r.id && n.kind === "plan");
  return { id: r.id, name: r.name, level: r.level, group: r.group_name, sport: "Gymnastics", gender: r.gender, meets: rs.length, last_total: a.totals.at(-1) ?? null, trend: a.trend, improving: a.improving, declining: a.declining, bigDrop: a.bigDrop, weakest: a.weakest,
    attendance: { marked: last30.length, missed: last30.filter((x) => x.status === "absent").length, rate: counted.length ? Math.round((counted.filter((x) => x.status !== "absent").length / counted.length) * 100) : null },
    last_eval: ev?.created_at || null, plan: plan ? { id: plan.id, status: plan.status, review: plan.plan?.review_date } : null };
};
export function demoCoach(path, body, d, save) {
  const c = center(d), k = seedCoach(c), b = body || {}, done = (o) => { save(d); return o; };
  const sums = () => c.roster.map((r) => summary(c, k, r));
  const why = (s) => { const w = []; if (s.attendance.missed >= 3) w.push(`missed ${s.attendance.missed} practices in 30 days`); if (s.bigDrop) w.push(`total down ${Math.abs(s.trend)} at the last meet`); if (!s.last_eval) w.push("never evaluated"); if (s.plan?.review && s.plan.review <= dayOff(0)) w.push("plan review is due"); return w; };
  if (path === "coach/dashboard") {
    const ss = sums(), t = dayOff(0), att = k.attendance.filter((a) => a.day === t), l14 = k.attendance.filter((a) => a.day >= dayOff(-14) && a.status !== "excused");
    return { club: { name: DEMO_CLUB.name, sport: "Gymnastics", code: DEMO_CLUB.code },
      counts: { athletes: c.roster.length, groups: new Set(c.roster.map((r) => r.level)).size, meets: c.meets.filter((m) => m.status === "published").length || 3, pendingEvals: ss.filter((s) => !s.last_eval).length, unread: 1, drafts: k.notes.filter((n) => n.status === "draft").length },
      attendance: { today: { marked: att.length, present: att.filter((a) => a.status !== "absent" && a.status !== "excused").length }, rate14: l14.length ? Math.round((l14.filter((a) => a.status !== "absent").length / l14.length) * 100) : null },
      upcoming: (c.meets.filter((m) => m.status === "published").length ? c.meets.filter((m) => m.status === "published") : [{ id: "u1", name: "Holiday Flip Invitational", start_date: dayOff(15), location: "Concord, NC" }, { id: "u2", name: "NC Compulsory State Championships", start_date: dayOff(22), location: "Raleigh, NC" }]).slice(0, 4),
      attention: ss.map((s) => ({ ...s, why: why(s) })).filter((s) => s.why.some((w) => !/evaluat/.test(w))).sort((a, b2) => b2.why.length - a.why.length).slice(0, 8).map(({ id, name, level, why: w }) => ({ id, name, level, why: w })),
      improved: ss.filter((s) => s.improving).sort((a, b2) => Math.abs(b2.trend) - Math.abs(a.trend)).slice(0, 5).map(({ id, name, level, trend }) => ({ id, name, level, trend })),
      milestones: ss.filter((s) => s.plan?.review && s.plan.review >= t).map(({ id, name, plan }) => ({ id, name, review: plan.review })) };
  }
  if (path === "coach/athletes") return { athletes: sums(), ratings: RATINGS };
  if (path === "coach/athlete") {
    const r = c.roster.find((x) => x.id === b.id); if (!r) return { athlete: null };
    const rs = k.results.filter((x) => x.roster_id === r.id).sort((x, y) => (x.meet_date > y.meet_date ? 1 : -1));
    const s = summary(c, k, r);
    return { athlete: { ...s, parent_email: r.parent_email, family_linked: r.id === "r0" || r.id === "r1" }, events: eventsFor("Gymnastics", r.gender), lowerBetter: false, results: rs, analysis: analyze(rs, "Gymnastics"),
      attendance: { last30: s.attendance, history: k.attendance.filter((x) => x.roster_id === r.id).sort((x, y) => (x.day > y.day ? -1 : 1)) }, notes: k.notes.filter((n) => n.roster_id === r.id).sort((x, y) => (x.created_at > y.created_at ? -1 : 1)), ratings: RATINGS };
  }
  if (path === "coach/attendance") {
    const day = b.day || dayOff(0);
    if (b.marks) { for (const m of b.marks) { k.attendance = k.attendance.filter((a) => !(a.roster_id === m.roster_id && a.day === day)); if (m.status) k.attendance.push({ roster_id: m.roster_id, day, status: m.status }); } return done({ saved: b.marks.length }); }
    return { day, athletes: c.roster.map((r) => ({ id: r.id, name: r.name, level: r.level, group: r.group_name, status: k.attendance.find((a) => a.roster_id === r.id && a.day === day)?.status || null, last30: summary(c, k, r).attendance })).sort((x, y) => (x.level || "").localeCompare(y.level || "", undefined, { numeric: true }) || x.name.localeCompare(y.name)) };
  }
  if (path === "coach/results") {
    if (b.rows) { for (const row of b.rows) { const scores = Object.fromEntries(Object.entries(row.scores || {}).filter(([e, v]) => e !== "place" && v !== "" && v != null).map(([e, v]) => [e, Number(v)])); k.results = k.results.filter((x) => !(x.roster_id === row.roster_id && x.meet_name === row.meet_name && x.meet_date === row.meet_date)); k.results.push({ id: `res-${Math.random()}`, roster_id: row.roster_id, meet_name: row.meet_name, meet_date: row.meet_date, scores, aa: totalOf(scores, "Gymnastics"), place: Number(row.place) || null, source: row.source || "manual" }); } return done({ saved: b.rows.length }); }
    if (b.remove) { k.results = k.results.filter((x) => x.id !== b.remove); return done({ removed: true }); }
    const meets = [...new Map(k.results.map((x) => [`${x.meet_date}|${x.meet_name}`, { meet_name: x.meet_name, meet_date: x.meet_date }])).values()].sort((a, b2) => (a.meet_date > b2.meet_date ? -1 : 1));
    return { meets, results: k.results };
  }
  if (path === "coach/scorecard") return { meet_name: "Holiday Flip Invitational", meet_date: dayOff(0), level: "Level 4", mine: 3, rows: [
    { name: "Ava Ruiz", gym: "Queen City Flyers", scores: { Vault: 9.35, Bars: 9.2, Beam: 9.4, Floor: 9.3 }, aa: 37.25, place: 1, roster_id: null },
    { name: "Ella Brooks", gym: "Demo Gymnastics", scores: { Vault: 9.4, Bars: 9.05, Beam: 9.2, Floor: 9.25 }, aa: 36.9, place: 2, roster_id: "r2", matched: "Ella Brooks" },
    { name: "Ruby Stone", gym: "Demo Gymnastics", scores: { Vault: 9.1, Bars: 9.0, Beam: 9.15, Floor: 9.2 }, aa: 36.45, place: 3, roster_id: "r11", matched: "Ruby Stone" },
    { name: "Lily Kim", gym: "Carolina Elite", scores: { Vault: 9.1, Bars: 9.15, Beam: 9.0, Floor: 9.2 }, aa: 36.45, place: 4, roster_id: null },
    { name: "Liam Ortiz", gym: "Demo Gymnastics", scores: { Floor: 9.1, Vault: 9.2 }, aa: null, place: 2, roster_id: "r5", matched: "Liam Ortiz" }] };
  if (path === "coach/notes") {
    if (b.remove) { k.notes = k.notes.filter((n) => n.id !== b.remove); return done({ removed: true }); }
    if (b.id) { const n = k.notes.find((x) => x.id === b.id); if (n) Object.assign(n, Object.fromEntries(Object.entries(b).filter(([x]) => x !== "id"))); return done({ saved: true }); }
    const id = `n${Math.random().toString(36).slice(2)}`;
    k.notes.push({ id, created_at: new Date().toISOString(), visibility: "private", status: b.kind === "note" || b.kind === "evaluation" ? "published" : "draft", ...b });
    return done({ saved: true, id });
  }
  if (path === "coach/draft") {
    const r = c.roster.find((x) => x.id === b.roster_id), s = summary(c, k, r), first = r.name.split(" ")[0], rs = k.results.filter((x) => x.roster_id === r.id), a = analyze(rs, "Gymnastics");
    const w = s.weakest || "Bars", x = a.events[w];
    if (b.kind === "report") return { draft: { kind: "report", visibility: "parent", body: `Hi! A quick update on ${first}.\n\n${first} has competed in ${s.meets} meets this season, and her all-around went from ${a.totals[0]?.toFixed(3)} to ${a.totals.at(-1)?.toFixed(3)}. ${((l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l.at(-1)}` : l[0]))(Object.entries(a.events).filter(([, e]) => e.pbLast).map(([e]) => e)) || "Her scores"} ${Object.values(a.events).some((e) => e.pbLast) ? "were personal bests at the last meet" : "have been steady"}.\n\nAttendance over the last month: ${s.attendance.rate ?? "—"}%. ${b.observations ? b.observations + "\n\n" : ""}Our focus over the next few weeks is ${w.toLowerCase()} — she's working hard on it in practice.\n\nThank you for your support!` } };
    return { draft: { kind: "plan", plan: { focus: `${w}: consistency`, current: `${w} ${x ? x.last.toFixed(3) : "—"} at the last meet (best ${x ? x.best.toFixed(3) : "—"})`, target: `${w} ${x ? (Math.round((x.best + 0.2) * 20) / 20).toFixed(2) : "9.0"}+ within 6 weeks`, review_date: dayOff(35), goals: [
      { text: `${w} basics: 10 clean repetitions of the core skill each practice`, drills: w === "Bars" ? "Glide swings; kip drill on strap bar" : w === "Beam" ? "Series on low beam; 3-in-a-row challenge" : w === "Vault" ? "Run + hurdle drills; handspring onto mats" : "Turn and leap drills; routine run-throughs at half speed", done: false },
      { text: "One full routine each practice with coach feedback", drills: "Video one rep a week and compare", done: false },
      { text: b.observations ? `Work on: ${b.observations}` : "Confidence: finish every skill, then reset", drills: "Pressure sets — stick 3 in a row", done: false }] } }, missing: rs.length < 3 ? "More meet results would sharpen the targets." : "A recent evaluation would help target the right skills." };
  }
  if (path === "coach/ask") {
    const ss = sums(), q = String(b.question || "").toLowerCase();
    if (/miss|absen|practice|attend/.test(q)) { const m = ss.filter((s) => s.attendance.missed >= 3); return { answer: m.length ? m.map((s) => `- ${s.name} (${s.level}) missed ${s.attendance.missed} of ${s.attendance.marked} practices in the last 30 days (${s.attendance.rate}% attendance).`).join("\n") : "Nobody has missed more than three practices in the last 30 days.", athletes: m.map((s) => s.id), missing: null }; }
    const ev = ["vault", "bars", "beam", "floor"].find((e) => q.includes(e));
    if (ev && /improv|most|best/.test(q)) { const E = ev[0].toUpperCase() + ev.slice(1); const rows = c.roster.map((r) => { const a = analyze(k.results.filter((x) => x.roster_id === r.id), "Gymnastics").events[E]; const rs = k.results.filter((x) => x.roster_id === r.id).sort((x, y) => (x.meet_date > y.meet_date ? 1 : -1)); const f = rs[0]?.scores[E], l = rs.at(-1)?.scores[E]; return a && f != null ? { r, d: l - f, f, l } : null; }).filter(Boolean).sort((x, y) => y.d - x.d).slice(0, 4);
      return { answer: `${E} improvement from the first to the latest meet:\n` + rows.map((x) => `- ${x.r.name}: ${x.f.toFixed(3)} → ${x.l.toFixed(3)} (${x.d >= 0 ? "+" : ""}${x.d.toFixed(3)})`).join("\n"), athletes: rows.map((x) => x.r.id), missing: null }; }
    if (/not improv|haven|plateau|declin/.test(q)) { const m = ss.filter((s) => !s.improving && s.meets >= 3); return { answer: m.map((s) => `- ${s.name}: all-around ${s.trend != null ? (s.trend >= 0 ? "+" : "") + s.trend : "—"} at the last meet${s.weakest ? `; lowest event ${s.weakest}` : ""}`).join("\n") || "Everyone with 3+ meets improved.", athletes: m.map((s) => s.id), missing: null }; }
    if (/compare/.test(q)) { const r = c.roster.find((x) => q.includes(x.name.split(" ")[0].toLowerCase())) || c.roster[0]; const rs = k.results.filter((x) => x.roster_id === r.id).sort((x, y) => (x.meet_date > y.meet_date ? 1 : -1)).slice(-2);
      return { answer: `${r.name}: ${rs[0].meet_name} → ${rs[1].meet_name}\n` + Object.keys(rs[1].scores).map((e) => `- ${e}: ${rs[0].scores[e]?.toFixed(3)} → ${rs[1].scores[e]?.toFixed(3)} (${(rs[1].scores[e] - rs[0].scores[e] >= 0 ? "+" : "") + (rs[1].scores[e] - rs[0].scores[e]).toFixed(3)})`).join("\n") + `\n- All-around: ${rs[0].aa.toFixed(3)} → ${rs[1].aa.toFixed(3)}`, athletes: [r.id], missing: null }; }
    const att = ss.map((s) => ({ ...s, why: why(s) })).filter((s) => s.why.some((w) => !/evaluat/.test(w)));
    return { answer: "This week, focus on:\n" + att.map((s) => `- ${s.name} (${s.level}): ${s.why.join("; ")}`).join("\n"), athletes: att.map((s) => s.id), missing: `${ss.filter((s) => !s.last_eval).length} athletes have no evaluation yet — evaluations make these answers sharper.` };
  }
  if (path === "coach/ambassador") return { code: DEMO_CLUB.code, families: 23, paying: 9, trialing: 6, rate: 0.1 };
  if (path === "coach/family") {
    const g = (d.gymnasts || []).find((x) => x.id === b.gymnast); const rid = g && (g.name === "Maya" ? "r0" : g.name === "Arjun" ? "r1" : null); if (!rid) return { linked: false };
    const r = c.roster.find((x) => x.id === rid), rs = k.results.filter((x) => x.roster_id === rid).sort((x, y) => (x.meet_date > y.meet_date ? 1 : -1));
    return { linked: true, gym: DEMO_CLUB.name, events: eventsFor("Gymnastics", r.gender), results: rs, analysis: analyze(rs, "Gymnastics"),
      feedback: k.notes.filter((n) => n.roster_id === rid && n.visibility === "parent" && n.status === "published").sort((x, y) => (x.created_at > y.created_at ? -1 : 1)).map((n) => ({ ...n, date: n.created_at.slice(0, 10) })) };
  }
  return null;
}
