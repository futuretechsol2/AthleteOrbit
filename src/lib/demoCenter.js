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
