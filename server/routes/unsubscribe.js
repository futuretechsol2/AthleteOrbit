// One-click "turn off reminder emails" link from the footer of every reminder.
import { handler, deps, checkToken, HttpError, esc } from "../lib.js";

export default handler(["GET", "POST"], async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  const u = url.searchParams.get("u"), t = url.searchParams.get("t");
  if (!u || !checkToken(u, t)) throw new HttpError(400, "This link is invalid or expired.");
  const { error } = await deps.supabase().from("profiles").update({ email_reminders: false }).eq("id", u);
  if (error) throw error;
  if (req.method === "POST") return { ok: true };
  res.statusCode = 200; res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reminders off</title>
<body style="font-family:Arial,sans-serif;background:#FBF7F2;color:#16213E;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px">
<div style="max-width:420px;background:#fff;border:1px solid #ECE6DD;border-radius:16px;padding:24px;text-align:center">
<h1 style="font:700 22px Georgia,serif">Meet reminder emails are off</h1>
<p>You can turn them back on any time in AthleteOrbit under More &gt; Reminders &amp; travel.</p>
<a href="${esc(process.env.APP_URL || "/")}" style="color:#E5523F;font-weight:bold">Open AthleteOrbit</a></div></body>`);
});
