import React, { useCallback, useEffect, useMemo, useState } from "react";
import { db, api, DEMO, rememberSource } from "./lib/db.js";
import { APP } from "./config.js";
import { Button, Field, Sheet, ErrorNote, Spinner, Avatar } from "./ui.jsx";
import Home from "./pages/Home.jsx";
import Scores from "./pages/Scores.jsx";
import Meets from "./pages/Meets.jsx";
import Costs from "./pages/Costs.jsx";
import Skills from "./pages/Skills.jsx";
import Coach from "./pages/Coach.jsx";
import More, { GymnastForm, openExternal } from "./pages/More.jsx";
import { ContactSheet } from "./pages/Extras.jsx";
import Family from "./pages/Family.jsx";
import Stats from "./pages/Stats.jsx";
import Progress from "./pages/Progress.jsx";
import GymPage, { FindAthleteFirst } from "./pages/Center.jsx";
import Photos from "./pages/Photos.jsx";
import { Events } from "./pages/Tickets.jsx";
import { loadFamily, buildAlerts } from "./lib/alerts.js";
import { SPORTS, SPORT_NAMES, conf, sportOf, usesScores } from "./data/sports.js";
import { PLANS, TIERS, TIER_ORDER, FEATURE_TIER, hasFeature, money, normTier } from "./data/plans.js";
import PlanPicker, { TierPicker, SimplePlans } from "./components/PlanPicker.jsx";
import { Login, Register, NewPassword, Logo } from "./pages/Auth.jsx";
import Landing from "./pages/Landing.jsx";
import Flyer from "./pages/Flyer.jsx";
import GymOwner from "./pages/GymOwner.jsx";
import Admin from "./pages/Admin.jsx";
import { TicketPage, MyTickets, DoorPage } from "./pages/Tickets.jsx";

// Five tabs everywhere (phone tab bar, desktop sidebar). Labels follow the active sport.
const NAV = (S) => [["home", "Home", "⌂"], ["meets", S.events, "🗓"], ["scores", S.results, "★"], ["coach", "Coach", "✦"], ["more", "More", "≡"]];
const CHILD_PAGES = ["scores", "skills", "coach", "meets"];
const Results = (p) => (usesScores(p.gymnast) ? <Scores {...p} /> : <Stats {...p} />);
const NATIVE = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// Demo only: flip between the parent view and the gym-owner view without leaving the page.
function demoRole(e, role) { try { sessionStorage.setItem("ao-demo", role); history.replaceState(null, "", location.pathname); e.preventDefault(); location.reload(); } catch {} }

// Tiny router for the public pages: /, /login, /register, /flyer, /welcome.
function usePath() {
  const [path, setPath] = useState(() => location.pathname + location.search);
  useEffect(() => { const f = () => setPath(location.pathname + location.search); addEventListener("popstate", f); return () => removeEventListener("popstate", f); }, []);
  const nav = useCallback((to, { replace = false } = {}) => { history[replace ? "replaceState" : "pushState"](null, "", to); setPath(to); scrollTo(0, 0); }, []);
  return [path, nav];
}

// In-app pages live in the browser history, so the phone/browser Back button (and our ‹ Back button)
// steps back through screens instead of leaving the app.
function usePageNav() {
  const [page, setPageState] = useState(() => (history.state?.gp ? { ...history.state.gp, params: null } : { name: "home", params: null, depth: 0 }));
  useEffect(() => {
    if (!history.state?.gp) history.replaceState({ ...(history.state || {}), gp: { name: "home", params: null, depth: 0 } }, "");
    const onPop = (e) => {
      if (e.state?.sheet) return;
      const gp = e.state?.gp;
      if (!gp) return;
      setPageState((cur) => { const n = cur.name === gp.name && (cur.depth || 0) === (gp.depth || 0) ? cur : { ...gp, params: null }; ref.current = n; return n; });
    };
    addEventListener("popstate", onPop);
    let sub;
    if (NATIVE) import("@capacitor/app").then(({ App: Cap }) => { sub = Cap.addListener("backButton", ({ canGoBack }) => { if ((history.state?.gp?.depth || 0) > 0 || history.state?.sheet) history.back(); else if (canGoBack) history.back(); else Cap.exitApp(); }); }).catch(() => {});
    return () => { removeEventListener("popstate", onPop); sub?.then?.((h) => h.remove()); };
  }, []);
  const ref = React.useRef(page); ref.current = page;
  const setPage = useCallback((next, { replace = false } = {}) => {
    const cur = ref.current;
    if (cur.name === next.name && !next.params && !cur.params) return;
    const gp = { ...next, depth: replace ? cur.depth || 0 : (cur.depth || 0) + 1 };
    try { history[replace ? "replaceState" : "pushState"]({ gp }, ""); } catch {}
    ref.current = gp; setPageState(gp);
  }, []);
  const back = useCallback(() => { if ((history.state?.gp?.depth || 0) > 0) history.back(); else setPage({ name: "home", params: null }, { replace: true }); }, [setPage]);
  return [page, setPage, back];
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);
  const [path, nav] = usePath();
  useEffect(() => {
    rememberSource();
    const sp = new URLSearchParams(location.search);
    const gym = sp.get("gym"), plan = sp.get("plan");
    if (gym) store("gp-gym-code", gym.toUpperCase().slice(0, 20));
    if (plan) store("gp-plan", plan);
    const tierQ = sp.get("tier"); if (TIERS[tierQ]) store("gp-tier", tierQ);
  }, []);
  useEffect(() => {
    // Opened from an email link (confirm sign-up, reset password): that sign-in claims the device too.
    const fromLink = /access_token=|type=(signup|recovery|magiclink)/.test(location.hash);
    db.session().then((s) => { setSession(s); if (s && fromLink) db.claimDevice(); }).catch(() => setSession(null));
    return db.onAuth((s, e) => { setSession(s); if (e === "PASSWORD_RECOVERY") setRecovery(true); });
  }, []);
  const route = path.split("?")[0];
  const query = new URLSearchParams(path.split("?")[1] || "");
  if (route === "/flyer") return <Flyer />;
  if (route === "/confirm") return <ConfirmLink query={query} nav={nav} onRecovery={() => setRecovery(true)} />;
  // Ticket pages work without an account (grandparents, other teams' parents, door volunteers).
  const tix = /^\/(tickets|my-tickets|door)\/([A-Za-z0-9-]{3,64})$/.exec(route);
  if (tix && session !== undefined) {
    const P = { tickets: TicketPage, "my-tickets": MyTickets, door: DoorPage }[tix[1]];
    return <P id={tix[2]} nav={nav} session={session} />;
  }
  if (route === "/welcome") return <Landing nav={nav} />;
  if (session === undefined) return <div className="boot"><Logo /></div>;
  if (recovery) return <NewPassword onDone={() => setRecovery(false)} />;
  if (!session || (DEMO && (route === "/login" || route === "/register"))) {
    if (route === "/login") return <Login nav={nav} />;
    if (route === "/register") return <Register nav={nav} initialType={query.get("type") === "gym" ? "gym" : "parent"} />;
    return NATIVE ? <Login nav={nav} /> : <Landing nav={nav} />;
  }
  return <Main session={session} nav={nav} />;
}

// Landing spot for the links in our emails: confirms the email and signs the person in on this device.
function ConfirmLink({ query, nav, onRecovery }) {
  const [err, setErr] = useState(null);
  useEffect(() => {
    const type = query.get("type") || "signup";
    db.verifyLink(query.get("token_hash") || "", type)
      .then(() => { if (type === "recovery") onRecovery(); nav("/", { replace: true }); })
      .catch(setErr);
  }, []);
  return (
    <div className="center-screen">
      <Logo />
      {!err ? <Spinner label="Confirming your email and signing you in…" /> : <>
        <ErrorNote error={err} />
        <Button onClick={() => nav("/login", { replace: true })}>Go to log in</Button>
      </>}
    </div>
  );
}

function Main({ session, nav }) {
  const [gymnasts, setGymnasts] = useState(null);
  const [profile, setProfile] = useState(null);
  const [current, setCurrent] = useState(() => { try { return localStorage.getItem("gp-current") || "family"; } catch { return "family"; } });
  const [lastChild, setLastChild] = useState(() => { try { return localStorage.getItem("gp-last-child") || ""; } catch { return ""; } });
  const [alerts, setAlerts] = useState([]); const [showAlerts, setShowAlerts] = useState(false);
  const [page, setPage, goBack] = usePageNav();
  const [paywall, setPaywall] = useState(false);
  const [banner, setBanner] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [me, setMe] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([db.list("gymnasts"), db.profile()]);
      setGymnasts(g); setProfile(p); setLoadErr(null);
    } catch (e) { setLoadErr(e); }
    api("me", null, "GET").then(setMe).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // Check every minute and whenever the app comes back to the front: if the account was opened on
  // another device, this one is signed out (api() handles the redirect).
  useEffect(() => {
    if (DEMO) return;
    const check = () => { if (document.visibilityState === "visible") api("me", null, "GET").then(setMe).catch(() => {}); };
    const t = setInterval(check, 60000); document.addEventListener("visibilitychange", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  useEffect(() => { if (["/login", "/register"].includes(location.pathname)) nav("/", { replace: true }); }, []);

  // Links from emails: ?meet=<id> opens that meet, ?inbox=1 opens the team inbox, ?gym=CODE joins a gym plan.
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const meet = sp.get("meet"), inbox = sp.get("inbox"), club = sp.get("club"), pg = sp.get("page");
    if (["costs", "meets", "scores", "gym", "photos", "events", "coach"].includes(pg)) { history.replaceState(null, "", location.pathname); setPage({ name: pg, params: pg === "gym" ? { tab: "messages", t: Date.now() } : null }); }
    if (pg === "messages") { history.replaceState(null, "", location.pathname); setPage({ name: "home", params: { tab: "messages", t: Date.now() } }); }
    if (pg === "plans") { history.replaceState(null, "", location.pathname); setPaywall(true); }
    let gym = null; try { gym = localStorage.getItem("gp-gym-code"); } catch {}
    if (!meet && !gym && !inbox && !club) return;
    if (meet || inbox || club || sp.get("gym")) history.replaceState(null, "", location.pathname);
    if (meet) setPage({ name: "meets", params: { meetId: meet, t: Date.now() } });
    if (inbox) setPage({ name: "more", params: { inbox: true, t: Date.now() } });
    if (club) { setBanner("Thanks! Your gym code is on its way by email. It also appears on your gym page."); setPage({ name: "more", params: null }); }
    if (gym) {
      api("club/join", { code: gym }).then((r) => { try { localStorage.removeItem("gp-gym-code"); } catch {} setBanner(r.linked ? `You're in! We found your athlete on ${r.club.name}'s roster.` : `You're in! Now find your athlete on ${r.club.name}'s roster.`); refresh(); setPage({ name: "gym", params: r.linked ? null : { tab: "find", t: Date.now() } }); })
        .catch(() => setBanner("We couldn't apply your gym code. Enter it under My gym."));
    }
  }, []);

  // Back from Stripe checkout: poll briefly until the webhook marks the plan active.
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("checkout");
    if (!q) return;
    history.replaceState(null, "", location.pathname);
    if (q === "success") {
      setBanner("Welcome to Pro! Activating your trial…");
      let n = 0;
      const t = setInterval(async () => {
        n++; const p = await db.profile().catch(() => null);
        if (p && ["active", "trialing"].includes(p.subscription_status)) { setProfile(p); setBanner("You're on Pro. Enjoy the AI coach!"); clearInterval(t); setTimeout(() => setBanner(null), 4000); }
        if (n > 15) { clearInterval(t); setBanner("Payment received. If Pro isn't active in a minute, pull to refresh."); }
      }, 2000);
      return () => clearInterval(t);
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("gp-current", current); } catch {}
    if (current !== "family") { setLastChild(current); try { localStorage.setItem("gp-last-child", current); } catch {} }
  }, [current]);
  // Child-specific screens need one child: leaving the family view picks the last child you looked at.
  useEffect(() => {
    if (current === "family" && CHILD_PAGES.includes(page.name) && gymnasts?.length) setCurrent(gymnasts.find((g) => g.id === lastChild)?.id || gymnasts[0].id);
  }, [page.name, gymnasts]);
  useEffect(() => {
    if (!gymnasts?.length) return;
    let live = true;
    loadFamily().then((f) => live && setAlerts(buildAlerts(f, me))).catch(() => {});
    return () => { live = false; };
  }, [page, gymnasts, me]);
  useEffect(() => { window.scrollTo(0, 0); }, [page.name]);
  // A plan picked on the pricing page opens checkout once the family is set up.
  useEffect(() => {
    if (!me || !gymnasts?.length || profile?.account_type === "gym") return;
    if (read("gp-plan") && !me.pro) setPaywall(true);
  }, [me, gymnasts]);

  // Sports: what the parent picked, plus any sport a child already has.
  const sports = useMemo(() => {
    if (!profile) return [];
    const picked = (profile.sports || []).filter((x) => SPORTS[x]);
    return [...new Set([...picked, ...(gymnasts || []).map(sportOf)])];
  }, [profile, gymnasts]);
  const [sportPref, setSportPref] = useState(() => read("gp-sport"));
  const [sportSheet, setSportSheet] = useState(false);
  const [meMenu, setMeMenu] = useState(false);

  if (loadErr) return <div className="center-screen"><ErrorNote error={loadErr} /><Button onClick={refresh}>Try again</Button></div>;
  if (!gymnasts || !profile) return <div className="boot"><Logo /></div>;
  const gymOwner = profile.account_type === "gym" && !gymnasts.length;
  if (gymOwner) return <GymShell profile={profile} me={me} session={session} refresh={refresh} page={page} setPage={setPage} goBack={goBack} banner={banner} />;
  const saveSports = async (list, pick) => {
    await db.updateProfile({ sports: list });
    if (pick) { setSportPref(pick); store("gp-sport", pick); }
    await refresh();
  };
  let chosen = false; try { chosen = sessionStorage.getItem("gp-sport-chosen") === "1"; } catch {}
  if (!sports.length || !chosen) return <SportPicker name={profile.full_name} sports={sports} gymnasts={gymnasts} onPick={async (x) => {
    if (!sports.includes(x)) await saveSports([...sports, x], x); else { setSportPref(x); store("gp-sport", x); }
    try { sessionStorage.setItem("gp-sport-chosen", "1"); } catch {}
    const k = gymnasts.find((g) => sportOf(g) === x); setCurrent(k ? k.id : "family"); setPage({ name: "home", params: null });
  }} />;

  const sport = sports.includes(sportPref) ? sportPref : sports[0];
  const S = conf(sport);
  const kids = gymnasts.filter((g) => sportOf(g) === sport);
  const switchSport = (x) => { setSportPref(x); store("gp-sport", x); setSportSheet(false); const k = gymnasts.find((g) => sportOf(g) === x); setCurrent(k ? k.id : "family"); setPage({ name: "home", params: null }); };
  const paid = me ? !!me.pro : ["active", "trialing"].includes(profile.subscription_status) || (profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date());
  if (me && !paid) return <TrialEnded me={me} profile={profile} />;
  const trialDays = me?.trial && !["active", "trialing"].includes(profile.subscription_status) && me.trial_ends_at ? Math.max(0, Math.ceil((new Date(me.trial_ends_at) - Date.now()) / 86400000)) : null;
  const go = (name, params = null) => setPage({ name, params: params ? { ...params, t: Date.now() } : null });
  const openPaywall = (need) => setPaywall(typeof need === "string" ? need : true);
  const tier = me?.tier || (paid ? "pro" : null);
  const can = (f) => hasFeature(tier, f);
  const upgrade = (f) => openPaywall(FEATURE_TIER[f] || true);
  const familyMode = current === "family" && kids.length > 0 && gymnasts.length > 1 && page.name === "home";
  const gymnast = kids.find((g) => g.id === current) || kids.find((g) => g.id === lastChild) || kids[0];
  const props = { gymnast, gymnasts, kids, sport, profile, paid, tier, can, upgrade, refresh, go, openPaywall, params: page.params, session, me, pickChild: (id) => { const g = gymnasts.find((x) => x.id === id); if (g && sportOf(g) !== sport) { setSportPref(sportOf(g)); store("gp-sport", sportOf(g)); } setCurrent(id); go("home"); } };
  const FAMILY_WIDE = ["costs", "gym", "admin", "more", "photos", "events"];
  const needsKid = !gymnast && !familyMode && !FAMILY_WIDE.includes(page.name);

  const P = { home: familyMode ? Family : Home, scores: Results, skills: Progress, coach: Coach, more: More, meets: Meets, costs: Costs, gym: GymPage, admin: Admin, photos: Photos, events: Events }[page.name] || Home;
  const navActive = ["costs", "gym", "admin", "photos", "events"].includes(page.name) ? "more" : page.name;
  const tabs = NAV(S);

  return (
    <div className="app" style={{ "--accent": S.color, "--accent-tint": S.tint }}>
      <header className="topbar">
        {page.name !== "home" ? <button className="back-btn" onClick={goBack} aria-label="Back">‹ <span>Back</span></button> : <Logo small />}
        <button className="sport-btn" onClick={() => setSportSheet(true)} aria-label={`Sport: ${sport}. Change sport`}><span aria-hidden>{S.icon}</span><b>{sport}</b><span aria-hidden className="caret">▾</span></button>
        {(kids.length > 1 || gymnasts.length > 1) ? (
          <div className="switcher" role="tablist" aria-label="Child">
            {gymnasts.length > 1 && <button className={familyMode ? "on" : ""} onClick={() => { setCurrent("family"); go("home"); }}>Family</button>}
            {kids.map((g) => <button key={g.id} className={!familyMode && g.id === gymnast?.id ? "on" : ""} onClick={() => { setCurrent(g.id); if (page.name === "home" || familyMode) go("home"); }}>{g.photo ? <Avatar src={g.photo} name={g.name} size={20} className="chip-avatar" /> : null}{g.name}</button>)}
          </div>
        ) : gymnast ? <span className="who"><Avatar src={gymnast.photo} name={gymnast.name} size={26} />{gymnast.name}</span> : <span className="grow" />}
        <button className="bell" aria-label={`Alerts (${alerts.length})`} onClick={() => setShowAlerts(true)}>🔔{alerts.length > 0 && <span className="badge">{alerts.length}</span>}</button>
        <button className="me-btn" onClick={() => setMeMenu(true)} aria-label="Account and log out"><Avatar src={profile.avatar} name={profile.full_name || profile.username || "Me"} size={32} /></button>
        {DEMO && <a className="demo-tag" href="/?demo=gym" onClick={(e) => demoRole(e, "gym")} title="See the demo as a gym owner">Demo<span className="hide-sm"> · gym view</span> ›</a>}
      </header>
      <nav className="sidebar" aria-label="Main">
        <Logo />
        {tabs.map(([k, label, icon]) => <button key={k} className={navActive === k ? "on" : ""} onClick={() => go(k)} aria-current={navActive === k ? "page" : undefined}><span aria-hidden>{icon}</span>{label}</button>)}
        <button className={page.name === "coach" ? "on" : ""} onClick={() => go("coach")}><span aria-hidden>✦</span>AI Coach</button>
        <hr />
        <button onClick={() => go("costs")} className={page.name === "costs" ? "on" : ""}><span aria-hidden>💵</span>Costs & budget</button>
        <button onClick={() => go("gym")} className={page.name === "gym" ? "on" : ""}><span aria-hidden>🏛️</span>My gym{me?.unread_messages ? <span className="badge inline">{me.unread_messages}</span> : null}</button>
        <button className="sidebar-bottom" onClick={() => logOut()}><span aria-hidden>⎋</span>Log out</button>
      </nav>
      {banner && <div className="banner">{banner}</div>}
      {trialDays !== null && <button className="trial-bar" onClick={openPaywall}>🎁 {trialDays === 0 ? "Last day" : `${trialDays} day${trialDays > 1 ? "s" : ""} left`} of your free Pro trial · <u>Choose a plan</u></button>}
      {meMenu && (
        <Sheet title={profile.full_name || profile.username || "Your account"} onClose={() => setMeMenu(false)}>
          <div className="me-menu">
            <Avatar src={profile.avatar} name={profile.full_name || profile.username || "Me"} size={64} />
            <button className="list-row" onClick={() => { setMeMenu(false); setSportSheet(true); }}><span aria-hidden>{S.icon}</span><span className="grow">Change sport</span><span aria-hidden>›</span></button>
            <button className="list-row" onClick={() => { setMeMenu(false); go("gym"); }}><span aria-hidden>🏛️</span><span className="grow">My gym: posts & messages</span>{me?.unread_messages ? <span className="badge inline">{me.unread_messages}</span> : <span aria-hidden>›</span>}</button>
            <button className="list-row" onClick={() => { setMeMenu(false); go("more"); }}><span aria-hidden>⚙️</span><span className="grow">Account, photo & children</span><span aria-hidden>›</span></button>
            <Button kind="ghost" className="wide" onClick={() => logOut()}>Log out</Button>
          </div>
        </Sheet>
      )}
      <main className="content">
        {needsKid ? <AddFirstKid S={S} sport={sport} canAdd={!gymnasts.length || paid} openPaywall={openPaywall} onSaved={(rec) => { if (rec?.id) setCurrent(rec.id); refresh(); }} />
          : <P key={`${page.name}-${familyMode ? "family" : gymnast?.id}-${sport}`} {...props} />}
      </main>
      {false && <button className="fab" onClick={() => (can("coach") ? go("coach") : upgrade("coach"))}><span aria-hidden>✦</span> Ask Coach</button>}
      {showAlerts && (
        <Sheet title="Alerts" onClose={() => setShowAlerts(false)}>
          {!alerts.length && <p className="muted center">All clear. Nothing needs your attention.</p>}
          {alerts.map((a, i) => (
            <button key={i} className={`alert-row a-${a.level}`} onClick={() => { setShowAlerts(false); const gid = a.go[1]?.gymnastId; if (gid) { const g = gymnasts.find((x) => x.id === gid); if (g) { setSportPref(sportOf(g)); store("gp-sport", sportOf(g)); setCurrent(gid); } } go(...a.go); }}><span aria-hidden>{a.icon}</span><span className="grow">{a.text}</span><span aria-hidden>›</span></button>
          ))}
          <p className="muted small center">Event, deadline and unpaid-fee reminders are also emailed to you.</p>
        </Sheet>
      )}
      {sportSheet && <SportSheet sports={sports} active={sport} gymnasts={gymnasts} onPick={switchSport} onAdd={async (x) => { await saveSports([...new Set([...sports, x])]); switchSport(x); }}
        onRemove={async (x) => { if (gymnasts.some((g) => sportOf(g) === x)) return alert(`Move or delete the ${x} athletes under More first.`); await saveSports(sports.filter((y) => y !== x)); if (x === sport) switchSport(sports.find((y) => y !== x)); }} onClose={() => setSportSheet(false)} />}
      <nav className="tabbar">
        {tabs.map(([k, label, icon]) => (
          <button key={k} className={navActive === k ? "on" : ""} onClick={() => go(k)} aria-current={navActive === k ? "page" : undefined}>
            <span className="tab-icon" aria-hidden>{icon}</span>{label}
          </button>
        ))}
      </nav>
      {paywall && <Paywall me={me} need={typeof paywall === "string" ? paywall : null} onDone={refresh} onClose={() => { setPaywall(false); store("gp-plan", null); }} />}
    </div>
  );
}

// First screen after sign-up: pick one or more sports (tiles). Can be changed anytime from the top bar.
// Shown after every login: tap a sport to open the app for it. Your sports come first; tapping a new one adds it.
function SportPicker({ name, sports, gymnasts, onPick }) {
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(null);
  const order = [...sports, ...SPORT_NAMES.filter((x) => !sports.includes(x))];
  const pick = async (x) => { setBusy(x); setErr(null); try { await onPick(x); } catch (e) { setErr(e); setBusy(""); } };
  return (
    <div className="onboard">
      <Logo />
      <h1>{name ? `Hi ${name.split(" ")[0]}! ` : ""}{sports.length ? "Which sport today?" : "Choose your sport"}</h1>
      <p className="muted">{sports.length ? "Tap a sport to open it. You can switch anytime from the top bar." : "Tap your child's sport. Everything in the app — results, skills, events, packing and the AI coach — speaks that sport. Add more sports anytime."}</p>
      <div className="sport-grid">
        {order.map((x) => {
          const kids = gymnasts.filter((g) => sportOf(g) === x);
          const mine = sports.includes(x);
          return (
            <button key={x} className={`sport-tile ${mine ? "on" : ""}`} style={{ "--c": SPORTS[x].color, "--t": SPORTS[x].tint }} onClick={() => pick(x)} disabled={!!busy}>
              <span className="sport-icon" aria-hidden>{SPORTS[x].icon}</span><b>{x}</b>
              <small>{busy === x ? "Opening…" : mine ? (kids.length ? kids.map((k) => k.name).join(", ") : "Your sport") : "＋ Add"}</small>
            </button>
          );
        })}
      </div>
      <ErrorNote error={err} />
      <Button kind="ghost" className="wide" onClick={() => logOut()}>Log out</Button>
    </div>
  );
}

function SportSheet({ sports, active, gymnasts, onPick, onAdd, onRemove, onClose }) {
  const others = SPORT_NAMES.filter((x) => !sports.includes(x));
  return (
    <Sheet title="Your sports" onClose={onClose}>
      <div className="stack">
        {sports.map((x) => {
          const n = gymnasts.filter((g) => sportOf(g) === x).length;
          return (
            <div key={x} className={`sport-row ${x === active ? "on" : ""}`} style={{ "--c": SPORTS[x].color, "--t": SPORTS[x].tint }}>
              <button className="grow sport-row-main" onClick={() => onPick(x)}><span className="sport-icon" aria-hidden>{SPORTS[x].icon}</span><span className="grow"><b>{x}</b><small className="muted"> · {n ? `${n} athlete${n > 1 ? "s" : ""}` : "no athletes yet"}</small></span>{x === active && <span className="pill">Showing</span>}</button>
              {sports.length > 1 && <button className="icon-btn sm" aria-label={`Remove ${x}`} onClick={() => onRemove(x)}>✕</button>}
            </div>
          );
        })}
        {others.length > 0 && <><h3>Add another sport</h3>
          <div className="sport-grid compact">
            {others.map((x) => <button key={x} className="sport-tile" style={{ "--c": SPORTS[x].color, "--t": SPORTS[x].tint }} onClick={() => onAdd(x)}><span className="sport-icon" aria-hidden>{SPORTS[x].icon}</span><b>{x}</b></button>)}
          </div></>}
      </div>
    </Sheet>
  );
}

// Search the gym rosters first; typing the athlete in is the fallback.
function FirstKidChooser({ sport, onSaved }) {
  const [manual, setManual] = useState(false);
  return manual ? <div className="card"><GymnastForm row={{}} sport={sport} onSaved={onSaved} /><button className="link center" onClick={() => setManual(false)}>← Search gym rosters instead</button></div>
    : <FindAthleteFirst onManual={() => setManual(true)} onLinked={() => onSaved(null)} />;
}

function AddFirstKid({ S, sport, canAdd, openPaywall, onSaved }) {
  return (
    <div className="stack">
      <section className="hero hero-light">
        <p className="eyebrow">{S.icon} {sport}</p>
        <h1>Add your {sport.toLowerCase()} athlete</h1>
        <p className="hero-sub">Then log {S.results.toLowerCase()}, follow skills by {S.level.toLowerCase()}, plan {S.events.toLowerCase()} and ask the AI coach.</p>
      </section>
      {canAdd ? <FirstKidChooser sport={sport} onSaved={onSaved} />
        : <div className="card"><p>Your plan isn't active. Choose a plan to add athletes.</p><Button className="wide" onClick={openPaywall}>Choose a plan</Button></div>}
    </div>
  );
}

// Gym-owner accounts: their gym dashboard, gym posts and account settings.
function GymShell({ profile, me, session, refresh, page, setPage, goBack, banner }) {
  const go = (name, params = null) => setPage({ name, params: params ? { ...params, t: Date.now() } : null });
  const props = { profile, me, session, refresh, go, params: page.params, gymnasts: [], paid: !!me?.pro, openPaywall: () => {}, can: () => true, upgrade: () => {} };
  const P = { home: GymOwner, more: More, admin: Admin, events: Events }[page.name] || GymOwner;
  useEffect(() => { const pg = new URLSearchParams(location.search).get("page"); if (pg === "events" || pg === "messages") { history.replaceState(null, "", location.pathname); setPage({ name: pg === "events" ? "events" : "home", params: pg === "messages" ? { tab: "messages", t: Date.now() } : null }); } }, []);
  const nav = [["home", "My gym", "⌂"], ["events", "Tickets", "🎟"], ["more", "Account", "≡"]];
  return (
    <div className="app">
      <header className="topbar">{page.name !== "home" ? <button className="back-btn" onClick={goBack} aria-label="Back">‹ <span>Back</span></button> : <Logo small />}<span className="who">{profile.gym_name || "Gym account"}</span><button className="link" onClick={() => logOut()}>Log out</button>{DEMO && <a className="demo-tag" href="/?demo" onClick={(e) => demoRole(e, "1")} title="Switch to the parent demo">Demo<span className="hide-sm"> · parent view</span> ›</a>}</header>
      {banner && <div className="banner">{banner}</div>}
      <main className="content"><P key={page.name} {...props} /></main>
      <nav className="tabbar">{nav.map(([k, l, i]) => <button key={k} className={page.name === k || (k === "more" && page.name === "admin") ? "on" : ""} onClick={() => go(k)}><span className="tab-icon" aria-hidden>{i}</span>{l}</button>)}</nav>
    </div>
  );
}

const EVERY = { monthly: "month", quarterly: "3 months", semiannual: "6 months", yearly: "year" };
// Basic or Pro, then plan length. New subscribers go to Stripe checkout; current ones switch in place.
function PlanChooser({ me, need, onDone }) {
  const current = ["active", "trialing", "past_due"].includes(me?.subscription_status) ? normTier(me?.subscription_tier) || "basic" : null;
  const [tier, setTier] = useState(need || (current === "pro" ? "pro" : current ? "pro" : TIERS[read("gp-tier")] ? read("gp-tier") : "basic"));
  const initial = Object.keys(EVERY).includes(read("gp-plan")) ? read("gp-plan") : me?.plan && current ? me.plan : "yearly";
  const [plan, setPlan] = useState(initial); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [done, setDone] = useState(false);
  const price = money(TIERS[tier].prices[plan]);
  const inTrial = !!me?.trial;
  const same = current === tier && me?.plan === plan;
  async function go() {
    setBusy(true); setErr(null);
    try {
      if (current) { await api("billing/change", { tier, plan }); setDone(true); onDone?.(); }
      else { const { url } = await api("billing/checkout", { tier, plan }); store("gp-plan", null); store("gp-tier", null); openExternal(url); }
    } catch (e) { setErr(e); }
    setBusy(false);
  }
  if (done) return <div className="empty"><div className="empty-icon">🎉</div><h3>You're on AthleteOrbit {TIERS[tier].name}</h3><p className="muted">New features are unlocked now.</p></div>;
  return (
    <>
      {need && <p className="need-note">🔒 {FEATURE_LABEL_NEED(need)}</p>}
      <SimplePlans tier={tier} onTier={setTier} plan={plan} onPlan={setPlan} need={need} current={current} />
      <div className="buy-bar">
      <Button className="wide buy-btn" onClick={go} disabled={busy || DEMO && !current || same}>{busy ? "One moment…" : same ? "Your current plan" : current ? `Switch to ${TIERS[tier].name} · ${price}` : `Continue with ${TIERS[tier].name} · ${price}`}</Button>
      <p className="trust"><span>✓ Cancel anytime</span><span>✓ {inTrial && !current ? "No charge until your trial ends" : "Secure checkout"}</span><span>✓ Up to 6 athletes</span></p>
      </div>
      {DEMO && !current && <p className="muted small center">Checkout is switched off in demo mode.</p>}
      <p className="muted small center">{current ? "Upgrades start now (you pay only the difference); downgrades credit the rest. " : ""}{price} every {EVERY[plan]}, renews automatically. Payment by Stripe.</p>
      <ErrorNote error={err} />
    </>
  );
}
const FEATURE_LABEL_NEED = (t) => `This is part of ${TIERS[t]?.name}. Pick a plan to unlock it:`;
function Paywall({ me, need, onClose, onDone }) {
  return <Sheet title="Choose your plan" onClose={onClose}><PlanChooser me={me} need={need} onDone={onDone} /></Sheet>;
}

// After the 7-day trial, tracking needs a plan. Data is kept; it unlocks as soon as they subscribe.
function TrialEnded({ me, profile }) {
  return (
    <div className="onboard">
      <Logo />
      <h1>Your free trial has ended</h1>
      <p className="muted">Everything you logged is saved. Pick a plan to keep tracking results, skills, events and costs — and keep the AI coach.</p>
      <div className="card"><PlanChooser me={me} /></div>
      <p className="center small muted">Your gym has a AthleteOrbit plan? Ask them for the gym code. Questions? {APP.supportEmail} · {APP.supportPhone}</p>
      <Button kind="ghost" className="wide" onClick={() => logOut()}>Log out</Button>
    </div>
  );
}

async function logOut() {
  try { sessionStorage.removeItem("gp-sport-chosen"); } catch {}
  store("gp-current", null);
  await db.signOut();
  if (!DEMO) location.href = "/login";
}
