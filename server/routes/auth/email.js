// Sign-up, resend and password-reset emails sent by OUR server through SendGrid.
// Why: Supabase's built-in mailer allows only a few emails an hour ("email rate limit exceeded"),
// and its links can land on a Vercel log-in page. These links go to APP_URL/confirm, which signs the person in.
import { handler, readJson, deps, env, HttpError, throttle, clientIp, sendEmail, emailEnabled, emailLayout, esc, USERNAME_RE, RESERVED } from "../../lib.js";

const appUrl = () => env("APP_URL").replace(/\/$/, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const button = (href, label) => `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#7C3AED;color:#fff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:999px;display:inline-block">${esc(label)}</a></p>
<p style="font-size:13px;color:#7B8197">Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${esc(href)}</span></p>`;
const linkFor = (props, type) => `${appUrl()}/confirm?token_hash=${encodeURIComponent(props.hashed_token)}&type=${type}`;
function limit(req, key, max = 6) {
  const t = throttle(`mail|${key}|${clientIp(req)}`, { max, windowMs: 15 * 60 * 1000 });
  t.fail();
}
const needMail = () => { if (!emailEnabled()) throw Object.assign(new HttpError(501, "Email isn't set up on the server yet."), { code: "email_off" }); };

// Instant sign-up (default): the account is ready the moment it's created and the app signs straight in, so a
// family is never stuck waiting for an email that a spam filter ate. Set REQUIRE_EMAIL_CONFIRM=1 to make
// people click a link in their email first.
const mustConfirm = () => process.env.REQUIRE_EMAIL_CONFIRM === "1";
export const register = handler(["POST"], async (req) => {
  if (mustConfirm()) needMail();
  const b = await readJson(req);
  const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
  const username = String(b.username || "").trim().toLowerCase(), full_name = String(b.full_name || "").trim().slice(0, 80);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new HttpError(400, password.length > 72 ? "Password is too long (72 characters max)." : "Password needs at least 8 characters, including a letter and a number.");
  if (!USERNAME_RE.test(username) || RESERVED.has(username)) throw new HttpError(400, RESERVED.has(username) ? "That username is reserved. Please pick another." : "Usernames are 3–20 characters: letters, numbers or underscore (_) only — no spaces, dots or symbols.");
  if (!full_name) throw new HttpError(400, "Enter your name.");
  limit(req, "register", 40);           // a whole team signing up on the gym's Wi-Fi shares one IP
  limit(req, `register|${email}`, 5);
  const sb = deps.supabase();
  const { data: taken } = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) throw new HttpError(409, "That username is taken. Please pick another.");
  const gym = b.account_type === "gym";
  const data = { username, full_name, account_type: gym ? "gym" : "parent", gym_name: gym ? String(b.gym_name || "").trim().slice(0, 80) || null : null, terms_accepted_at: deps.now().toISOString(),
    ...(b.ref ? { ref: String(b.ref).slice(0, 12) } : {}), ...(b.source ? { source: String(b.source).slice(0, 120) } : {}) };
  if (b.adult !== true) throw new HttpError(400, "Please confirm you're 18 or older.");
  const { data: out, error } = await sb.auth.admin.generateLink({ type: "signup", email, password, options: { data } });
  if (error) {
    // The email already has an account (maybe never confirmed): email that person a one-tap sign-in link
    // instead of an error, so the right owner gets in and nobody learns which emails are registered.
    if (/already|registered|exists/i.test(error.message)) {
      // The email already has an account. One email = one family login. The app tries the password they just typed
      // (if it's theirs they're simply signed in); otherwise it offers Log in / Reset password. We also email a
      // one-tap sign-in link in case they forgot their password.
      const { data: link } = await sb.auth.admin.generateLink({ type: "magiclink", email });
      // Made earlier but the confirmation email never arrived: finish it now so the password they set works.
      if (!mustConfirm() && link?.user?.id && !link.user.email_confirmed_at) await sb.auth.admin.updateUserById(link.user.id, { email_confirm: true }).catch(() => {});
      if (link?.properties?.hashed_token && emailEnabled()) sendEmail({ to: email, subject: "You already have an AthleteOrbit account", html: emailLayout({ title: "Welcome back!",
        body: `<p>Someone (hopefully you) tried to create a new account with this email, but it already has one. Tap the button to sign in — no password needed.</p>${button(linkFor(link.properties, "magiclink"), "Sign in to AthleteOrbit")}<p style="font-size:13px;color:#7B8197">If this wasn't you, ignore this email.</p>` }) }).catch(() => {});
      return { exists: true };
    }
    if (/USERNAME_TAKEN|Database error/i.test(error.message)) throw new HttpError(409, "That username was just taken. Please pick another.");
    throw new HttpError(400, error.message);
  }
  if (!mustConfirm()) {
    const id = out?.user?.id;
    const { error: ce } = id ? await sb.auth.admin.updateUserById(id, { email_confirm: true }) : { error: new Error("no user") };
    if (ce) { if (id) await sb.auth.admin.deleteUser(id).catch(() => {}); throw new HttpError(503, "We couldn't finish creating your account just now. Please try again in a minute, or email support@athleteorbit.org."); }
    // Welcome email is a nice-to-have now — sign-up never waits on it.
    if (emailEnabled()) await sendEmail({ to: email, subject: "Welcome to AthleteOrbit", html: emailLayout({ title: `Welcome, ${full_name.split(" ")[0]}!`,
      body: `<p>Your AthleteOrbit account is ready.</p><p>Username: <b>${esc(username)}</b><br>Email: <b>${esc(email)}</b></p>${button(`${appUrl()}/`, "Open AthleteOrbit")}<p style="font-size:13px;color:#7B8197">Didn't sign up? Reply to this email and we'll remove the account.</p>` }) }).catch((e) => console.error("welcome mail", e.message));
    return { sent: false, confirmed: true };
  }
  try {
    await sendEmail({ to: email, subject: "Confirm your email to start AthleteOrbit", html: emailLayout({ title: `Welcome, ${full_name.split(" ")[0]}!`,
      body: `<p>Tap the button to confirm your email. You'll be signed in right away — no extra log-in.</p>${button(linkFor(out.properties, "signup"), "Confirm my email")}<p>Your username: <b>${esc(username)}</b></p>` }) });
  } catch (e) {
    // Our mail service refused (SendGrid plan/credits, key or sender). Don't block the family: confirm the account
    // now and let the app sign them in with the password they just chose. One email = one account still holds.
    console.error("register mail", e.message, e.detail || "");
    const id = out?.user?.id;
    if (id) {
      const { error: ce } = await sb.auth.admin.updateUserById(id, { email_confirm: true });
      if (!ce) return { sent: false, confirmed: true, reason: e.message };
      await sb.auth.admin.deleteUser(id).catch(() => {});
    }
    throw Object.assign(new HttpError(503, "We couldn't finish creating your account just now. Please try again in a minute, or email support@athleteorbit.org."), { code: "email_failed" });
  }
  return { sent: true };
});

// Always answers the same way, so nobody can test which emails have accounts.
export const resend = handler(["POST"], async (req) => {
  needMail();
  const email = String((await readJson(req)).email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  limit(req, `resend|${email}`);
  const { data: out, error } = await deps.supabase().auth.admin.generateLink({ type: "magiclink", email });
  if (!error && out?.properties?.hashed_token) await sendEmail({ to: email, subject: "Your AthleteOrbit sign-in link", html: emailLayout({ title: "Confirm your email",
    body: `<p>Tap the button to confirm your email and open AthleteOrbit.</p>${button(linkFor(out.properties, "magiclink"), "Confirm and open the app")}` }) }).catch(() => {});
  return { sent: true };
});

export const reset = handler(["POST"], async (req) => {
  needMail();
  const email = String((await readJson(req)).email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  limit(req, `reset|${email}`);
  const { data: out, error } = await deps.supabase().auth.admin.generateLink({ type: "recovery", email });
  if (!error && out?.properties?.hashed_token) await sendEmail({ to: email, subject: "Reset your AthleteOrbit password", html: emailLayout({ title: "Choose a new password",
    body: `<p>Tap the button to choose a new password. If you didn't ask for this, you can ignore this email.</p>${button(linkFor(out.properties, "recovery"), "Choose a new password")}` }) }).catch(() => {});
  return { sent: true };
});
