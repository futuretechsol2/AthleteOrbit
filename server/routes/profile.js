// Save the signed-in parent's own profile settings through the server (checks the sign-in token itself),
// instead of a direct database update that silently matches nothing when the browser's token is stale.
import { handler, readJson, requireUser, deps, HttpError } from "../lib.js";
import { SPORT_NAMES } from "../../src/data/sports.js";

const str = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
export default handler(["POST"], async (req) => {
  const { user } = await requireUser(req);
  const b = await readJson(req), patch = {};
  if ("full_name" in b) { const v = str(b.full_name, 80); if (!v || v.length < 2) throw new HttpError(400, "Enter your full name."); patch.full_name = v; }
  if ("sports" in b) {
    if (!Array.isArray(b.sports)) throw new HttpError(400, "Pick at least one sport.");
    patch.sports = [...new Set(b.sports.filter((s) => SPORT_NAMES.includes(s)))].slice(0, 20);
  }
  for (const k of ["email_reminders", "sms_reminders"]) if (k in b) patch[k] = !!b[k];
  if ("phone" in b) patch.phone = str(b.phone, 30);
  if ("home_city" in b) patch.home_city = str(b.home_city, 80);
  if ("home_airport" in b) patch.home_airport = str(b.home_airport, 10)?.toUpperCase() || null;
  if ("avatar" in b) {
    const a = b.avatar == null || b.avatar === "" ? null : String(b.avatar);
    if (a && (!/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(a) || a.length > 400000)) throw new HttpError(400, "That photo couldn't be saved. Try a smaller picture.");
    patch.avatar = a;
  }
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to save.");
  const sb = deps.supabase();
  const { data, error } = await sb.from("profiles").update(patch).eq("id", user.id).select("*");
  if (error) throw error;
  if (!data?.length) throw new HttpError(404, "We couldn't find your profile. Please sign out and sign in again.");
  return { profile: data[0] };
});
