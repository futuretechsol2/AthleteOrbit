// Sign-up, resend and password-reset emails sent by OUR server through SendGrid.
// Why: Supabase's built-in mailer allows only a few emails an hour ("email rate limit exceeded"),
// and its links can land on a Vercel log-in page. These links go to APP_URL/confirm, which signs the person in.
import { handler, readJson, deps, env, HttpError, throttle, clientIp, sendEmail, emailEnabled, emailLayout, esc, USERNAME_RE, RESERVED } from "../../lib.js";

const appUrl = () => env("APP_URL").replace(/\/$/, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const button = (href, label) => `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#FF6B5B;color:#fff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:999px;display:inline-block">${esc(label)}</a></p>
<p style="font-size:13px;color:#7B8197">Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${esc(href)}</span></p>`;
const linkFor = (props, type) => `${appUrl()}/confirm?token_hash=${encodeURIComponent(props.hashed_token)}&type=${type}`;
function limit(req, key) {
  const t = throttle(`mail|${key}|${clientIp(req)}`, { max: 6, windowMs: 15 * 60 * 1000 });
  t.fail();
}
const needMail = () => { if (!emailEnabled()) throw Object.assign(new HttpError(501, "Email isn't set up on the server yet."), { code: "email_off" }); };

export const register = handler(["POST"], async (req) => {
  needMail();
  const b = await readJson(req);
  const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
  const username = String(b.username || "").trim().toLowerCase(), full_name = String(b.full_name || "").trim().slice(0, 80);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new HttpError(400, "Password needs 8+ characters with a letter and a number.");
  if (!USERNAME_RE.test(username) || RESERVED.has(username)) throw new HttpError(400, "Pick a username with 3–20 letters, numbers or _.");
  if (!full_name) throw new HttpError(400, "Enter your name.");
  limit(req, "register");
  const sb = deps.supabase();
  const { data: taken } = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) throw new HttpError(409, "That username is taken. Please pick another.");
  const gym = b.account_type === "gym";
  const data = { username, full_name, account_type: gym ? "gym" : "parent", gym_name: gym ? String(b.gym_name || "").trim().slice(0, 80) || null : null, terms_accepted_at: deps.now().toISOString(),
    ...(b.ref ? { ref: String(b.ref).slice(0, 12) } : {}), ...(b.source ? { source: String(b.source).slice(0, 120) } : {}) };
  const { data: out, error } = await sb.auth.admin.generateLink({ type: "signup", email, password, options: { data } });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) throw new HttpError(409, "An account with this email already exists. Log in, or reset your password.");
    if (/USERNAME_TAKEN|Database error/i.test(error.message)) throw new HttpError(409, "That username was just taken. Please pick another.");
    throw new HttpError(400, error.message);
  }
  await sendEmail({ to: email, subject: "Confirm your email to start AthleteOrbit", html: emailLayout({ title: `Welcome, ${full_name.split(" ")[0]}!`,
    body: `<p>Tap the button to confirm your email. You'll be signed in right away — no extra log-in.</p>${button(linkFor(out.properties, "signup"), "Confirm my email")}<p>Your username: <b>${esc(username)}</b></p>` }) });
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
