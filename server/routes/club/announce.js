// Gym owners post announcements; members see them in the app and (optionally) by email.
import { handler, readJson, requireUser, deps, HttpError, sendEmail, emailLayout, esc } from "../../lib.js";

export default handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const { clubCode, title, body, email } = await readJson(req);
  const sb = deps.supabase();
  const { data: club } = await sb.from("clubs").select("*").eq("code", String(clubCode || "").toUpperCase()).eq("owner_id", user.id).maybeSingle();
  if (!club) throw new HttpError(403, "Only the gym's account owner can post announcements.");
  const t = String(title || "").trim().slice(0, 120), b = String(body || "").trim().slice(0, 3000);
  if (t.length < 3 || b.length < 3) throw new HttpError(400, "Add a title and a message.");
  const ins = await sb.from("club_announcements").insert({ club_id: club.id, title: t, body: b });
  if (ins.error) throw ins.error;
  let emailed = 0;
  if (email) {
    const { data: members } = await sb.from("profiles").select("email,email_reminders").eq("club_id", club.id);
    for (const m of members || []) {
      if (!m.email || m.email_reminders === false) continue;
      await sendEmail({ to: m.email, subject: `${club.name}: ${t}`, html: emailLayout({ title: t, body: `<p style="white-space:pre-wrap;line-height:1.6">${esc(b)}</p><p style="color:#7B8197;font-size:13px">From ${esc(club.name)} via AthleteOrbit</p>` }) }).then(() => emailed++).catch(() => {});
    }
  }
  return { posted: true, emailed };
});
