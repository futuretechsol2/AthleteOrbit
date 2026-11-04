import { handler, readJson, requireUser, deps, HttpError } from "../../lib.js";

export default handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const { code, leave } = await readJson(req);
  const sb = deps.supabase();
  if (leave) { await sb.from("profiles").update({ club_id: null }).eq("id", user.id); return { left: true }; }
  const c = String(code || "").trim().toUpperCase();
  const { data: club } = await sb.from("clubs").select("*").eq("code", c).maybeSingle();
  if (!club || !club.active_until || new Date(club.active_until) <= deps.now()) throw new HttpError(404, "That gym code isn't active. Check the code with your gym.");
  const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("club_id", club.id);
  if ((count || 0) >= club.seats) throw new HttpError(409, "This gym's plan is full. Ask your gym to add more families.");
  const up = await sb.from("profiles").update({ club_id: club.id }).eq("id", user.id);
  if (up.error) throw up.error;
  return { joined: true, club: { name: club.name } };
});
