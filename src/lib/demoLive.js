// Demo-mode live scores for "Queen City Classic" and a sample recruiting page. Stored in the demo store only.
const GYMS = ["Demo Gymnastics", "Queen City Gymnastics", "Carolina Elite", "Triangle Gymnastics", "Lake Norman Flyers"];
const NAMES = ["Maya Patel", "Sofia Kim", "Ella Brooks", "Harper Lewis", "Ava Chen", "Chloe Adams", "Lily Nguyen", "Zoe Carter", "Emma Ruiz", "Grace Hill", "Nora Diaz", "Ruby Stone"];
const BOYS = ["Arjun Patel", "Liam Ortiz", "Noah Reed", "Ethan Cole", "Mason Price", "Owen Ward"];
const r3 = (n) => Math.round(n * 1000) / 1000;
function seed(d) {
  if (d.live) return d.live;
  let k = 7; const rnd = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
  const rows = [];
  NAMES.forEach((name, i) => { const lv = i < 7 ? "Level 5" : "Level 4"; const s = { Vault: r3(8.6 + rnd() * 0.9), Bars: r3(8.3 + rnd() * 1.1), Beam: r3(8.4 + rnd() * 1.1), Floor: r3(8.6 + rnd() * 0.9) }; if (i % 5 === 4) delete s.Floor;
    rows.push({ id: `lv${i}`, session: "1", name, gym: name === "Maya Patel" || i % 4 === 0 ? "Demo Gymnastics" : GYMS[i % GYMS.length], level: lv, division: i % 2 ? "Senior" : "Junior", gender: "F", scores: s, source: "official" }); });
  BOYS.forEach((name, i) => { const s = { Floor: r3(11 + rnd() * 2), Pommel: r3(10 + rnd() * 2), Rings: r3(10.5 + rnd() * 2), Vault: r3(12 + rnd() * 1.5), "P-Bars": r3(10.5 + rnd() * 2), "High Bar": r3(10 + rnd() * 2) }; if (i > 3) delete s["High Bar"];
    rows.push({ id: `lb${i}`, session: "2", name, gym: name === "Arjun Patel" ? "Demo Gymnastics" : GYMS[(i + 1) % GYMS.length], level: "Level 6", division: "Open", gender: "M", scores: s, source: "official" }); });
  rows.forEach((r) => { r.aa = r3(Object.values(r.scores).reduce((a, n) => a + n, 0)); r.updated_at = new Date().toISOString(); });
  d.live = { status: "live", pro: true, rows, parent: [{ id: "pr1", session: "1", name: "Zoe", gym: "Demo Gymnastics", level: "Level 3", division: "", gender: "F", scores: { Vault: 9.05, Bars: 8.9 }, aa: 17.95, source: "parent", mine: false, share_team: true }], follows: ["sofia kim|queen city gymnastics"],
    branding: { color: "#7C3AED", tagline: "Home of the Queen City Flyers" }, sponsors: [{ name: "Carolina Smiles Pediatric Dentistry", tagline: "Proud sponsor of Queen City Classic", url: "https://www.athleteorbit.org" }, { name: "Concord Sports Physio", tagline: "Keeping athletes moving" }] };
  return d.live;
}
const meetOf = (L) => ({ id: "demo-listing", name: "Queen City Classic", host: "Demo Gymnastics", location: "Charlotte, NC", sport: "Gymnastics", start_date: new Date().toISOString().slice(0, 10), sessions: ["1", "2"], live_status: L.status, pro: L.pro, branding: L.pro ? L.branding : {}, sponsors: L.pro ? L.sponsors : [], updates: [{ text: "Session 1 awards start at 12:15 PM in the main gym.", at: new Date().toISOString() }], tickets: true });

export function demoLive(path, body, d, save, uid) {
  if (!path.startsWith("live/") && !path.startsWith("athlete/")) return null;
  const L = seed(d); const done = (o) => { save(d); return o; };
  if (path === "live/list") { const q = String(body?.q || "").toLowerCase(); return { meets: [{ ...meetOf(L), now: true }, { id: "demo-past", name: "Fall Leaf Invitational", location: "Raleigh, NC", host: "Triangle Gymnastics", start_date: "2026-10-18", live_status: "final", now: false }].filter((m) => !q || m.name.toLowerCase().includes(q) || (m.location || "").toLowerCase().includes(q)) }; }
  if (path === "live/meet") {
    const mine = d.gymnasts.filter((g) => !g.sport || g.sport === "Gymnastics");
    return { meet: meetOf(L), rows: L.rows, parentRows: L.parent, follows: L.follows, myAthletes: mine, signedIn: true, canFollow: true, owner: true };
  }
  if (path === "live/follow") { const k = `${String(body.name).toLowerCase()}|${String(body.gym || "").toLowerCase()}`; const on = !L.follows.includes(k); L.follows = on ? [...L.follows, k] : L.follows.filter((x) => x !== k); return done({ following: on }); }
  if (path === "live/report") { const g = d.gymnasts.find((x) => x.id === body.gymnastId); const old = L.parent.find((p) => p.mine && p.gymnast_id === body.gymnastId); const scores = { ...(old?.scores || {}), ...Object.fromEntries(Object.entries(body.scores || {}).map(([k, v]) => [k, Number(v)])) };
    const rec = { id: old?.id || uid(), session: body.session || "", name: g?.name || "Athlete", gym: "Demo Gymnastics", level: g?.level || "", gender: g?.program === "MAG" ? "M" : "F", scores, aa: r3(Object.values(scores).reduce((a, n) => a + n, 0)), source: "parent", mine: true, gymnast_id: body.gymnastId, share_team: !!body.share };
    L.parent = old ? L.parent.map((p) => (p.id === old.id ? rec : p)) : [rec, ...L.parent]; return done({ saved: true }); }
  if (path === "live/manage") { if (body.live_status) L.status = body.live_status; if (body.branding) L.branding = body.branding; if (body.sponsors) L.sponsors = body.sponsors; return done({ ok: true }); }
  if (path === "live/post") {
    if (body.remove) { L.rows = L.rows.filter((r) => r.id !== body.remove); return done({ removed: true }); }
    let added = 0, updated = 0;
    for (const r of body.rows || []) { const o = L.rows.find((x) => x.name.toLowerCase() === String(r.name).toLowerCase() && (x.gym || "").toLowerCase() === String(r.gym || "").toLowerCase() && (x.session || "") === (r.session || ""));
      const scores = Object.fromEntries(Object.entries(r.scores || {}).map(([k, v]) => [k, Number(v)]));
      if (o) { o.scores = { ...o.scores, ...scores }; o.aa = r3(Object.values(o.scores).reduce((a, n) => a + n, 0)); updated++; } else { L.rows.push({ ...r, id: uid(), scores, aa: r3(Object.values(scores).reduce((a, n) => a + n, 0)), source: "official" }); added++; } }
    return done({ added, updated, notified: Math.min(3, added + updated) });
  }
  if (path === "live/pro-checkout") { L.pro = true; return done({ pro: true }); }
  if (path === "athlete/page") {
    if (body?.gymnastId && body.display_name !== undefined) { d.recruit = { ...(d.recruit || {}), [body.gymnastId]: { ...body, slug: "maya-p" } }; return done({ slug: "maya-p", url: `${location.origin}/a/maya-p`, published: !!body.published }); }
    const p = d.recruit?.[body?.gymnast] || { display_name: "Maya P.", bio: "Level 5 gymnast with Demo Gymnastics, competing since age 6. Strongest events: beam and floor.", grad_year: 2031, highlights: ["1st all-around, Queen City Cup", "State qualifier 2026"], videos: [{ title: "Floor routine 2026", url: "https://www.youtube.com/" }], show_scores: true, photo_ids: [] };
    return { page: p, canPublish: true, price: 49, url: `${location.origin}/a/maya-p` };
  }
  if (path === "athlete/public") return { athlete: { name: "Maya P.", sport: "Gymnastics", level: "Level 5", club: "Demo Gymnastics", grad_year: 2031, bio: "Level 5 gymnast with Demo Gymnastics, competing since age 6. Strongest events: beam and floor.", highlights: ["1st all-around, Queen City Cup", "State qualifier 2026"], videos: [{ title: "Floor routine 2026", url: "https://www.youtube.com/" }], photos: [], best: { vault: 9.15, bars: 9.0, beam: 9.4, floor: 9.35, aa: 36.4 }, recent: [{ meet: "Queen City Cup", date: "2026-10-24", level: "Level 5", aa: 36.4 }, { meet: "Fall Leaf Invitational", date: "2026-10-18", level: "Level 5", aa: 35.95 }], contact_email: null } };
  if (path === "athlete/page-checkout") throw Object.assign(new Error("Checkout is switched off in demo mode."), { status: 400 });
  return null;
}
