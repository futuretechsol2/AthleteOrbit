import React, { useEffect, useRef, useState } from "react";
import { db } from "../lib/db.js";
import { APP } from "../config.js";
import { Button, Field, ErrorNote } from "../ui.jsx";
import { ContactSheet } from "./Extras.jsx";

// Password rules: 8+ characters with at least one letter and one number.
export function passwordIssues(pw) {
  const out = [];
  if (pw.length < 8) out.push("at least 8 characters");
  if (!/[A-Za-z]/.test(pw)) out.push("a letter");
  if (!/\d/.test(pw)) out.push("a number");
  return out;
}
function strength(pw) {
  let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

function PasswordInput({ value, onChange, autoComplete, id, label = "Password", meter }) {
  const [show, setShow] = useState(false);
  const s = strength(value);
  return (
    <Field label={label}>
      <div className="pw">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} required />
        <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
      </div>
      {meter && value && (
        <span className="pw-meter" aria-live="polite"><span className={`pw-bar s${s}`}><i /></span>{["Too weak", "Weak", "Fair", "Good", "Strong"][s]}</span>
      )}
    </Field>
  );
}

export function AuthShell({ nav, children }) {
  return (
    <div className="auth">
      <button className="logo-btn" onClick={() => nav("/")} aria-label={`${APP.name} home`}><Logo /></button>
      {children}
    </div>
  );
}

export function Login({ nav }) {
  const [id, setId] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const [mode, setMode] = useState("login"); const [msg, setMsg] = useState(""); const [contact, setContact] = useState(false);
  useEffect(() => { setErr(null); setMsg(""); }, [mode]);
  async function submit(e) {
    e.preventDefault(); setErr(null); setMsg(""); setBusy(true);
    try {
      if (mode === "login") { await db.signIn(id, pw); nav("/", { replace: true }); }
      else if (mode === "password") { await db.resetPassword(id.trim()); setMsg("If that email has an account, a reset link is on its way."); }
      else { setMsg(await db.forgotUsername(id.trim())); }
    } catch (e2) { setErr(e2); }
    setBusy(false);
  }
  return (
    <AuthShell nav={nav}>
      <form className="card form" onSubmit={submit}>
        <h2>{mode === "login" ? "Log in" : mode === "password" ? "Reset your password" : "Find your username"}</h2>
        {mode === "login" && /kicked=1/.test(location.search) && <div className="note note-warn">You were signed out because your account was opened on another device. AthleteOrbit stays signed in on one device at a time — to let family follow along, use “Share with family” instead.</div>}
        {mode !== "login" && <p className="muted small">{mode === "password" ? "We'll email you a link to choose a new password." : "We'll email your username to you."}</p>}
        <Field label={mode === "login" ? "Username or email" : "Email"}>
          <input id="login-id" value={id} onChange={(e) => setId(e.target.value)} autoComplete={mode === "login" ? "username" : "email"} type={mode === "login" ? "text" : "email"} autoCapitalize="none" required />
        </Field>
        {mode === "login" && <PasswordInput id="login-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />}
        <ErrorNote error={err} />
        {mode === "login" && err && /confirm your email/i.test(err.message) && id.includes("@") && <button type="button" className="link" onClick={async () => { try { await db.resendConfirm(id.trim()); setErr(null); setMsg("We sent a new confirmation link. Tap it and you're in."); } catch (e2) { setErr(e2); } }}>Send me a new confirmation link</button>}
        {msg && <div className="note note-ok">{msg}</div>}
        <Button className="wide" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Log in" : "Send"}</Button>
        {mode === "login" && <p className="muted small center">Logging in here signs out any other device using this account.</p>}
        <div className="auth-links">
          {mode === "login" ? <>
            <button type="button" className="link" onClick={() => setMode("password")}>Forgot password?</button>
            <button type="button" className="link" onClick={() => setMode("username")}>Forgot username?</button>
          </> : <button type="button" className="link" onClick={() => setMode("login")}>Back to log in</button>}
        </div>
      </form>
      <p className="center">New to {APP.name}? <button className="link" onClick={() => nav("/register")}>Create an account</button></p>
      <p className="center small"><a href="/?demo">▶ Just looking? Try the demo — no sign-up</a></p>
      <button type="button" className="link center" onClick={() => setContact(true)}>Need help? Contact us</button>
      {contact && <ContactSheet email={id.includes("@") ? id : ""} onClose={() => setContact(false)} />}
    </AuthShell>
  );
}

export function Register({ nav, initialType = "parent" }) {
  const [f, setF] = useState({ account_type: initialType, full_name: "", username: "", email: "", password: "", confirm: "", gym_name: "", agree: false });
  const [u, setU] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const timer = useRef();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  useEffect(() => {
    clearTimeout(timer.current);
    const name = f.username.trim().toLowerCase();
    if (!name) return setU(null);
    if (!/^[a-z0-9_]{3,20}$/.test(name)) return setU({ valid: false, available: false, message: "3–20 characters: letters, numbers or _" });
    timer.current = setTimeout(() => db.checkUsername(name).then(setU).catch(() => setU(null)), 350);
    return () => clearTimeout(timer.current);
  }, [f.username]);
  const gym = f.account_type === "gym";
  async function submit(e) {
    e.preventDefault(); setErr(null);
    const issues = passwordIssues(f.password);
    if (!f.full_name.trim()) return setErr(new Error("Enter your name."));
    if (u && !u.available) return setErr(new Error(u.message || "Pick a different username."));
    if (issues.length) return setErr(new Error(`Password needs ${issues.join(", ")}.`));
    if (f.password !== f.confirm) return setErr(new Error("Passwords don't match."));
    if (gym && f.gym_name.trim().length < 2) return setErr(new Error("Enter your gym's name."));
    if (!f.agree) return setErr(new Error("Please confirm you're 18+ and agree to the Terms and Privacy Policy."));
    setBusy(true);
    try {
      const r = await db.signUp({ email: f.email.trim(), password: f.password, username: f.username.trim(), full_name: f.full_name.trim(), account_type: f.account_type, gym_name: gym ? f.gym_name.trim() : null });
      if (r === "signed-in") nav("/", { replace: true }); else setSent(true);
    } catch (e2) { setErr(e2); }
    setBusy(false);
  }
  if (sent) return <CheckEmail email={f.email} username={f.username.toLowerCase()} nav={nav} />;
  return (
    <AuthShell nav={nav}>
      <form className="card form" onSubmit={submit} noValidate>
        <h2>Create your account</h2>
        <div className="seg" role="radiogroup" aria-label="Account type">
          <button type="button" role="radio" aria-checked={!gym} className={!gym ? "on" : ""} onClick={() => setF({ ...f, account_type: "parent" })}>I'm a parent</button>
          <button type="button" role="radio" aria-checked={gym} className={gym ? "on" : ""} onClick={() => setF({ ...f, account_type: "gym" })}>I run a gym</button>
        </div>
        <Field label="Your full name"><input id="reg-name" value={f.full_name} onChange={set("full_name")} autoComplete="name" required /></Field>
        {gym && <Field label="Gym or club name"><input id="reg-gym" value={f.gym_name} onChange={set("gym_name")} placeholder="Axcelerate Gymnastics" required /></Field>}
        <Field label="Username" hint={u ? undefined : "You can log in with this or your email"}>
          <input id="reg-username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.replace(/\s/g, "").toLowerCase() })} autoComplete="username" autoCapitalize="none" maxLength={20} required />
          {u && <span className={`field-hint ${u.available ? "ok-text" : "warn-text"}`}>{u.available ? "✓ Available" : u.message}</span>}
        </Field>
        <Field label="Email" hint="For your receipts, reminders and password resets"><input id="reg-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" required /></Field>
        <PasswordInput id="reg-pw" value={f.password} onChange={set("password")} autoComplete="new-password" meter />
        <span className="field-hint pw-rules">8+ characters with a letter and a number.</span>
        <PasswordInput id="reg-pw2" label="Confirm password" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" />
        <label className="check small"><input id="reg-agree" type="checkbox" checked={f.agree} onChange={set("agree")} /> <span>I'm 18 or older and agree to the <a href="/terms.html" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>
        <ErrorNote error={err} />
        <Button className="wide" disabled={busy}>{busy ? "Creating your account…" : "Create account"}</Button>
        <p className="muted small center">{gym ? "Next you'll pick your gym plan and get a code for your families." : "Everything free for 7 days. No card needed."}</p>
      </form>
      <p className="center">Already have an account? <button className="link" onClick={() => nav("/login")}>Log in</button></p>
    </AuthShell>
  );
}

function CheckEmail({ email, username, nav }) {
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(null);
  return (
    <AuthShell nav={nav}>
      <div className="card form center">
        <div className="empty-icon">📬</div>
        <h2>Check your email</h2>
        <p>We sent a confirmation link to <b>{email}</b>. Tap <b>Confirm my email</b> and the app opens with you already signed in.</p><p className="muted small">Nothing after a minute? Check spam or promotions. Your username is <b>{username}</b>.</p>
        <ErrorNote error={err} />{msg && <div className="note note-ok">{msg}</div>}
        <Button kind="ghost" onClick={async () => { setErr(null); try { await db.resendConfirm(email); setMsg("Sent again. Check spam too."); } catch (e) { setErr(e); } }}>Resend the email</Button>
        <Button onClick={() => nav("/login")}>Go to log in</Button>
      </div>
    </AuthShell>
  );
}

export function NewPassword({ onDone }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  return (
    <div className="auth">
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); const i = passwordIssues(pw); if (i.length) return setErr(new Error(`Password needs ${i.join(", ")}.`)); setBusy(true); try { await db.updatePassword(pw); onDone(); } catch (e2) { setErr(e2); setBusy(false); } }}>
        <h2>Choose a new password</h2>
        <PasswordInput id="new-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" meter />
        <ErrorNote error={err} />
        <Button className="wide" disabled={busy}>Save password</Button>
      </form>
    </div>
  );
}

export function Logo({ small }) {
  return (
    <span className={`logo ${small ? "small" : ""}`}>
      <svg viewBox="0 0 512 512" aria-hidden><rect width="512" height="512" rx="112" fill="#16213E" /><ellipse cx="256" cy="268" rx="178" ry="78" fill="none" stroke="#FF6B5B" strokeWidth="30" transform="rotate(-24 256 268)" /><circle cx="256" cy="268" r="62" fill="#FBF7F2" /><circle cx="410" cy="182" r="34" fill="#F4C95D" /></svg>
      <b>{APP.name}</b>
    </span>
  );
}
