import { handler, requireUser, deps } from "../../lib.js";

// Required by the App Store: parents can delete their account and all data from inside the app.
export default handler(["POST"], async (req) => {
  const { user, profile } = await requireUser(req);
  if (profile.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    const stripe = deps.stripe();
    const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: "all", limit: 20 });
    for (const s of subs.data) if (!["canceled", "incomplete_expired"].includes(s.status)) await stripe.subscriptions.cancel(s.id);
  }
  const { error } = await deps.supabase().auth.admin.deleteUser(user.id); // cascades to every table
  if (error) throw error;
  return { deleted: true };
});
