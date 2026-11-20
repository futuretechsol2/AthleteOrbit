// Sign-up, resend and password-reset emails sent by OUR server (your SMTP mailbox, or SendGrid).
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
// family is never stuck waiting for an email that a spam filter ate. Set EMAIL_CONFIRM=off for that (old REQUIRE_EMAIL_CONFIRM=1 to make
// people click a link in their email first.
// Default: new accounts must click the link in their email before they can use the app.
// (Set EMAIL_CONFIRM=off in Vercel to let people in instantly instead.)
const mustConfirm = () => process.env.EMAIL_CONFIRM !== "off";
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
  const { data: taken } = await sb.from("profiles").select("id,email").eq("username", username).maybeSingle();
  // Their own earlier (unconfirmed) sign-up holding this username doesn't count as "taken".
  if (taken && String(taken.email || "").toLowerCase() !== email) throw new HttpError(409, "That username is taken. Please pick another.");
  const gym = ["gym", "coach", "organizer"].includes(b.account_type);
  const data = { username, full_name, account_type: gym ? b.account_type : "parent", gym_name: gym ? String(b.gym_name || "").trim().slice(0, 80) || null : null, terms_accepted_at: deps.now().toISOString(),
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
      let { data: link } = await sb.auth.admin.generateLink({ type: "magiclink", email });
      // Made earlier but the confirmation email never arrived: finish it now so the password they set works.
      if (!mustConfirm() && link?.user?.id && !link.user.email_confirmed_at) { await sb.auth.admin.updateUserById(link.user.id, { email_confirm: true }).catch(() => {}); return { exists: true }; }
      const unconfirmed = !!link?.user && !link.user.email_confirmed_at;
      // Signing up again before ever confirming: the details typed NOW win (password, username, name). Otherwise the
      // confirm link signs them in but their new password "doesn't work" later — the old one from the first try does.
      // Updating a user cancels any link already made for them, so make the emailed link AFTER the update.
      if (unconfirmed) { await adoptDetails(sb, link.user.id, password, data); const { data: fresh } = await sb.auth.admin.generateLink({ type: "magiclink", email }); if (fresh?.properties?.hashed_token) link = fresh; }
      // Never confirmed (an earlier sign-up whose email didn't arrive): send the confirmation email again.
      if (link?.properties?.hashed_token && emailEnabled()) await sendEmail({ to: email, subject: unconfirmed ? "Confirm your email to start AthleteOrbit" : "You already have an AthleteOrbit account", html: emailLayout({ title: unconfirmed ? "Confirm your email" : "Welcome back!",
        body: unconfirmed ? `<p>Tap the button to confirm your email. You'll be signed in right away.</p>${button(linkFor(link.properties, "magiclink"), "Confirm my email")}`
          : `<p>Someone (hopefully you) tried to create a new account with this email, but it already has one. Tap the button to sign in — no password needed.</p>${button(linkFor(link.properties, "magiclink"), "Sign in to AthleteOrbit")}<p style="font-size:13px;color:#7B8197">If this wasn't you, ignore this email.</p>` }) }).catch((e) => console.error("exists mail", e.message));
      return unconfirmed ? { sent: true } : { exists: true };
    }
    if (/USERNAME_TAKEN|Database error/i.test(error.message)) throw new HttpError(409, "That username was just taken. Please pick another.");
    throw new HttpError(400, error.message);
  }
  // A brand-new account already has today's password and details. Only an older, never-confirmed account that Supabase
  // handed back needs them applied — and that update cancels the link just made, so make a fresh one afterwards.
  let props = out?.properties, linkType = "signup";
  const older = out?.user?.created_at && deps.now().getTime() - Date.parse(out.user.created_at) > 60000;
  if (out?.user?.id && !out.user.email_confirmed_at && older) {
    await adoptDetails(sb, out.user.id, password, data);
    const { data: fresh } = await sb.auth.admin.generateLink({ type: "magiclink", email });
    if (fresh?.properties?.hashed_token) { props = fresh.properties; linkType = "magiclink"; }
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
      body: `<p>Tap the button to confirm your email. You'll be signed in right away — no extra log-in.</p>${button(linkFor(props, linkType), "Confirm my email")}<p>Your username: <b>${esc(username)}</b></p>` }) });
  } catch (e) {
    // Our mail service refused (SendGrid plan/credits, key or sender). Don't block the family: confirm the account
    // now and let the app sign them in with the password they just chose. One email = one account still holds.
    console.error("register mail", e.message, e.detail || "");
    // No email = no confirmation link, so undo the account and say so (they can simply try again).
    if (out?.user?.id) await sb.auth.admin.deleteUser(out.user.id).catch(() => {});
    throw Object.assign(new HttpError(503, "We couldn't send your confirmation email just now, so your account wasn't created. Please try again in a minute, or email support@athleteorbit.org."), { code: "email_failed" });
  }
  return { sent: true };
});

// Always answers the same way, so nobody can test which emails have accounts.
async function adoptDetails(sb, id, password, data) {
  const { error } = await sb.auth.admin.updateUserById(id, { password, user_metadata: data });
  if (error) console.error("adoptDetails", error.message);
  const patch = { username: data.username, full_name: data.full_name, account_type: data.account_type, gym_name: data.gym_name };
  const { error: pe } = await sb.from("profiles").update(patch).eq("id", id);
  if (pe) { delete patch.username; await sb.from("profiles").update(patch).eq("id", id); } // username clash: keep the old one
}
// People forget whether they used a username or an email — accept either.
async function emailFrom(v) {
  const x = v.trim().toLowerCase();
  if (!x.includes("@") && /^[a-z0-9_]{3,20}$/.test(x)) { const { data: p } = await deps.supabase().from("profiles").select("email").eq("username", x).maybeSingle(); if (p?.email) return String(p.email).toLowerCase(); }
  return x;
}
export const resend = handler(["POST"], async (req) => {
  needMail();
  const email = await emailFrom(String((await readJson(req)).email || ""));
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter the email address (or username) you signed up with.");
  limit(req, `resend|${email}`);
  const { data: out, error } = await deps.supabase().auth.admin.generateLink({ type: "magiclink", email });
  if (!error && out?.properties?.hashed_token) await sendEmail({ to: email, subject: "Your AthleteOrbit sign-in link", html: emailLayout({ title: "Confirm your email",
    body: `<p>Tap the button to confirm your email and open AthleteOrbit.</p>${button(linkFor(out.properties, "magiclink"), "Confirm and open the app")}` }) }).catch(() => {});
  return { sent: true };
});

export const reset = handler(["POST"], async (req) => {
  needMail();
  const email = await emailFrom(String((await readJson(req)).email || ""));
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter the email address (or username) you signed up with.");
  limit(req, `reset|${email}`);
  const { data: out, error } = await deps.supabase().auth.admin.generateLink({ type: "recovery", email });
  if (!error && out?.properties?.hashed_token) await sendEmail({ to: email, subject: "Reset your AthleteOrbit password", html: emailLayout({ title: "Choose a new password",
    body: `<p>Tap the button to choose a new password. If you didn't ask for this, you can ignore this email.</p>${button(linkFor(out.properties, "recovery"), "Choose a new password")}` }) }).catch(() => {});
  return { sent: true };
});
