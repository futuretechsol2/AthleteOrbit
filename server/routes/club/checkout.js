// A gym owner or booster club buys AthleteOrbit Pro for every family in the gym, for 1, 3, 6 or 12 months at a time.
import { handler, readJson, requireUser, deps, env, HttpError } from "../../lib.js";
import { TERMS } from "../../../src/data/plans.js";
import { priceFor } from "../billing/checkout.js";

export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  const { clubName, plan } = await readJson(req);
  const name = String(clubName || profile.gym_name || "").trim().slice(0, 80);
  if (name.length < 2) throw new HttpError(400, "Enter your gym or club name.");
  const term = TERMS.some((t) => t.key === plan) ? plan : "yearly";
  const price = priceFor("gym", term);
  const stripe = deps.stripe();
  let customer = profile.stripe_customer_id;
  if (!customer) {
    customer = (await stripe.customers.create({ email: user.email, name, metadata: { supabase_user_id: user.id } })).id;
    await deps.supabase().from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
  }
  const app = env("APP_URL");
  const session = await stripe.checkout.sessions.create({
    mode: "subscription", customer, client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { kind: "club", club_name: name, supabase_user_id: user.id, plan: term } },
    allow_promotion_codes: true,
    success_url: `${app}/?club=success`, cancel_url: `${app}/?checkout=cancel`,
  });
  return { url: session.url };
});
