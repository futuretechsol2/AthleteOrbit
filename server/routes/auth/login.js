// Log in with a username (or email) + password. Emails also work straight from the app;
// usernames come here so we never reveal which email belongs to which username.
import { handler, readJson, deps, HttpError, throttle, clientIp } from "../../lib.js";

const WRONG = "Wrong username or password.";

export default handler(["POST"], async (req) => {
  const { identifier, password } = await readJson(req);
  const id = String(identifier || "").trim().toLowerCase();
  if (!id || !password) throw new HttpError(400, "Enter your username or email and password.");
  const t = throttle(`login|${clientIp(req)}|${id}`);
  let email = id;
  if (!id.includes("@")) {
    const { data } = await deps.supabase().from("profiles").select("email").eq("username", id).maybeSingle();
    if (!data?.email) { t.fail(); throw new HttpError(401, WRONG); }
    email = data.email;
  }
  const { data, error } = await deps.supabaseAnon().auth.signInWithPassword({ email, password: String(password) });
  if (error) {
    if (/confirm/i.test(error.message)) throw new HttpError(403, "Please confirm your email first. Check your inbox for the link we sent.");
    t.fail(); throw new HttpError(401, WRONG);
  }
  t.clear();
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
});
