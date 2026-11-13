// Team inbox: list questions and reply by email, from inside the app.
import { handler, readJson, requireUser, deps, HttpError, sendEmail, emailLayout, esc } from "../../lib.js";

export function isAdmin(user, profile) {
  const list = String(process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!profile?.is_admin || list.includes(String(user.email || "").toLowerCase());
}

export default handler(["GET", "POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  if (!isAdmin(user, profile)) throw new HttpError(403, "Team members only.");
  const sb = deps.supabase();
  if (req.method === "GET") {
    const { data, error } = await sb.from("support_messages").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { messages: data };
  }
  const { id, reply, status } = await readJson(req);
  const { data: m } = await sb.from("support_messages").select("*").eq("id", id).maybeSingle();
  if (!m) throw new HttpError(404, "Message not found.");
  const patch = {};
  if (reply && reply.trim()) {
    await sendEmail({ to: m.email, subject: `Re: your AthleteOrbit question (${m.topic || "support"})`,
      html: emailLayout({ title: "Reply from the AthleteOrbit team", body: `<p style="white-space:pre-wrap;line-height:1.6">${esc(reply.trim())}</p>
<p style="color:#7B8197;font-size:13px;margin-top:16px">Your question:</p><p style="white-space:pre-wrap;color:#7B8197;font-size:13px">${esc(m.message)}</p>` }) });
    Object.assign(patch, { reply: reply.trim(), replied_at: deps.now().toISOString(), status: "answered" });
  }
  if (["open", "answered", "closed"].includes(status)) patch.status = status;
  const { error } = await sb.from("support_messages").update(patch).eq("id", id);
  if (error) throw error;
  return { ok: true };
});
