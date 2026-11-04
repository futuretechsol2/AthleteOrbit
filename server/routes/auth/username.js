// Is this username free? Used live on the registration form.
import { handler, deps, USERNAME_RE, RESERVED } from "../../lib.js";

export default handler(["GET"], async (req) => {
  const u = new URL(req.url || "/", "http://x").searchParams.get("u") || "";
  const name = u.trim().toLowerCase();
  if (!USERNAME_RE.test(name)) return { valid: false, available: false, message: "3–20 characters: letters, numbers or _" };
  if (RESERVED.has(name)) return { valid: true, available: false, message: "That username is reserved." };
  const { data } = await deps.supabase().from("profiles").select("id").eq("username", name).maybeSingle();
  return { valid: true, available: !data, message: data ? "That username is taken." : "Available" };
});
