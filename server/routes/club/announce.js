// Gym owners post announcements; members see them in the app and (optionally) by email.
import { handler, readJson, requireUser, deps, HttpError, sendEmail, emailLayout, esc, callClaude, emailEnabled } from "../../lib.js";

export default handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const { clubCode, title, body, email, remove } = await readJson(req);
  const sb = deps.supabase();
  const { data: owned } = await sb.from("clubs").select("*").eq("owner_id", user.id);
  const club = clubCode ? (owned || []).find((c) => c.code === String(clubCode).toUpperCase()) : (owned || [])[0];
  if (!club) throw new HttpError(403, "Only the gym's account owner can post announcements.");
  if (remove) { await sb.from("club_announcements").delete().eq("id", remove).eq("club_id", club.id); return { removed: true }; }
  const t = String(title || "").trim().slice(0, 120), b = String(body || "").trim().slice(0, 3000);
  if (t.length < 3 || b.length < 3) throw new HttpError(400, "Add a title and a message.");
  // Long announcements get a one-or-two sentence summary: that's what shows in the parent's alert.
  let summary = null;
  if (b.length > 220 && process.env.ANTHROPIC_API_KEY || b.length > 220 && process.env.OPENAI_API_KEY) {
    summary = await callClaude({ system: "You shorten a gym's announcement to parents into 1-2 plain sentences (max 200 characters). Keep every date, time, amount and action parents must take. Add nothing that isn't in the announcement. Return only the summary.", maxTokens: 150, messages: [{ role: "user", content: `${t}\n\n${b}` }] }).then((x) => x.slice(0, 240) || null).catch(() => null);
  }
  const ins = await sb.from("club_announcements").insert({ club_id: club.id, title: t, body: b, summary });
  if (ins.error) throw ins.error;
  let emailed = 0;
  if (email !== false && emailEnabled()) {
    const { data: members } = await sb.from("profiles").select("email,email_reminders").eq("club_id", club.id);
    for (const m of members || []) {
      if (!m.email || m.email_reminders === false) continue;
      await sendEmail({ to: m.email, subject: `${club.name}: ${t}`, html: emailLayout({ title: t, body: `${summary ? `<p style="background:#FFF4E5;border-radius:10px;padding:12px 14px;line-height:1.5"><b>In short:</b> ${esc(summary)}</p>` : ""}<p style="white-space:pre-wrap;line-height:1.6">${esc(b)}</p><p style="color:#7B8197;font-size:13px">From ${esc(club.name)} via AthleteOrbit</p>` }) }).then(() => emailed++).catch(() => {});
    }
  }
  return { posted: true, emailed, summary };
});
