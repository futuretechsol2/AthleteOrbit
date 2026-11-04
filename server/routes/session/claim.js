// Called right after a sign-in: this device becomes the only active one for the account.
import { handler, requireUser, deps } from "../../lib.js";
export default handler(["POST"], async (req) => {
  req._claim = true;
  const { user, profile } = await requireUser(req);
  if (profile._sid) await deps.supabase().from("profiles").update({ active_session: profile._sid, active_session_at: deps.now().toISOString() }).eq("id", user.id);
  return { ok: true };
});
