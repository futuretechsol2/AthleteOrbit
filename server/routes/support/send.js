// "Contact us": saves the question, emails the team (with an AI-drafted reply), and confirms to the parent.
import { handler, readJson, deps, env, HttpError, sendEmail, emailLayout, esc, callClaude } from "../../lib.js";

const TOPICS = ["Account or sign-in", "Billing", "Gym / club plan", "Bug or problem", "Feature idea", "Other"];

export default handler(["POST"], async (req) => {
  const b = await readJson(req);
  if (b.website) return { ok: true }; // spam trap field, real people never fill it
  const sb = deps.supabase();
  let userId = null, accountEmail = null;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    const { data } = await sb.auth.getUser(auth.slice(7));
    if (data?.user) { userId = data.user.id; accountEmail = data.user.email; }
  }
  const email = String(b.email || accountEmail || "").trim().slice(0, 200);
  const message = String(b.message || "").trim().slice(0, 4000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email so we can reply.");
  if (message.length < 5) throw new HttpError(400, "Tell us a little more about your question.");
  const topic = TOPICS.includes(b.topic) ? b.topic : "Other";
  const since = new Date(deps.now().getTime() - 86400000).toISOString();
  const { count } = await sb.from("support_messages").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since);
  if ((count || 0) >= 5) throw new HttpError(429, "We've got your earlier messages and will reply soon.");

  let ai_draft = null;
  if (process.env.ANTHROPIC_API_KEY) {
    ai_draft = await callClaude({
      system: `You draft short, friendly support replies for AthleteOrbit, an app for gymnastics parents (scores, meets, costs, skills, AI coach; Pro is $9.99/month or $79/year with a 7-day trial; billing is managed under More > Manage billing; accounts can be deleted under More > Delete account; gym plans give every family Pro with a gym code). Draft a reply for a human to review. If you don't know an answer, say the team will check. Never promise refunds or features.`,
      messages: [{ role: "user", content: `Topic: ${topic}\nMessage: ${message}` }], maxTokens: 400,
    }).catch(() => null);
  }
  const rec = { user_id: userId, email, name: String(b.name || "").slice(0, 80) || null, phone: String(b.phone || "").slice(0, 30) || null, topic, message, ai_draft };
  const ins = await sb.from("support_messages").insert(rec);
  if (ins.error) throw ins.error;

  const app = process.env.APP_URL || "";
  await Promise.all([
    process.env.SUPPORT_INBOX_EMAIL && sendEmail({
      to: env("SUPPORT_INBOX_EMAIL"), replyTo: email, subject: `[AthleteOrbit support] ${topic}: ${message.slice(0, 50)}`,
      html: emailLayout({ title: `New question: ${topic}`, body: `<p><b>From:</b> ${esc(rec.name || "")} &lt;${esc(email)}&gt;${rec.phone ? ` · ${esc(rec.phone)}` : ""}${userId ? " · signed-in parent" : ""}</p>
<p style="white-space:pre-wrap;background:#F7F3ED;padding:12px;border-radius:10px">${esc(message)}</p>
${ai_draft ? `<p><b>Suggested reply</b> (review before sending):</p><p style="white-space:pre-wrap;border-left:3px solid #FF6B5B;padding-left:12px">${esc(ai_draft)}</p>` : ""}
<p>Reply to this email, or answer from the in-app inbox: <a href="${esc(app)}/?inbox=1">${esc(app)}/?inbox=1</a></p>` }),
    }).catch((e) => console.error(e)),
    sendEmail({ to: email, subject: "We got your message — AthleteOrbit", html: emailLayout({ title: "Thanks, we got your message",
      body: `<p>Our team usually replies within one business day. Here's what you sent:</p><p style="white-space:pre-wrap;background:#F7F3ED;padding:12px;border-radius:10px">${esc(message)}</p>` }) }).catch((e) => console.error(e)),
  ]);
  return { ok: true };
});
