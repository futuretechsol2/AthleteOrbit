// "Forgot username": emails the username to the account's address. Always answers the same way.
import { handler, readJson, deps, sendEmail, emailLayout, esc, throttle, clientIp } from "../../lib.js";

export default handler(["POST"], async (req) => {
  const { email } = await readJson(req);
  const e = String(email || "").trim().toLowerCase();
  const t = throttle(`forgot|${clientIp(req)}`, { max: 5 });
  t.fail();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    const { data } = await deps.supabase().from("profiles").select("username,full_name").eq("email", e).maybeSingle();
    if (data?.username) {
      const app = process.env.APP_URL || "";
      await sendEmail({ to: e, subject: "Your AthleteOrbit username", html: emailLayout({ title: "Your AthleteOrbit username",
        body: `<p>Hi${data.full_name ? ` ${esc(data.full_name.split(" ")[0])}` : ""}, your username is:</p><p style="font:700 24px Georgia,serif">${esc(data.username)}</p><p><a href="${esc(app)}/login" style="color:#E5523F;font-weight:bold">Log in to AthleteOrbit</a></p><p style="color:#7B8197;font-size:13px">Didn't ask for this? You can ignore this email.</p>` }) }).catch(() => {});
    }
  }
  return { ok: true, message: "If that email has an account, we've sent the username to it." };
});
