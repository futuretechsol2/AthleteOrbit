import { handler, requireUser, deps, env, HttpError } from "../../lib.js";

export default handler(["POST"], async (req) => {
  const { profile } = await requireUser(req);
  if (!profile.stripe_customer_id) throw new HttpError(400, "No billing account yet. Start your free trial first.");
  const s = await deps.stripe().billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: env("APP_URL"), ...(process.env.STRIPE_PORTAL_CONFIG ? { configuration: process.env.STRIPE_PORTAL_CONFIG } : {}) });
  return { url: s.url };
});
