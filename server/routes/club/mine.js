// For gym owners: their gym code and how many families joined.
import { handler, requireUser, deps } from "../../lib.js";
export default handler(["GET"], async (req) => {
  const { user } = await requireUser(req);
  const sb = deps.supabase();
  const { data: clubs } = await sb.from("clubs").select("*").eq("owner_id", user.id);
  const out = [];
  for (const c of clubs || []) {
    const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("club_id", c.id);
    out.push({ name: c.name, code: c.code, plan: c.plan, seats: c.seats, families: count || 0, active_until: c.active_until });
  }
  return { clubs: out };
});
