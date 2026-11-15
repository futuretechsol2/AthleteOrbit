// GET /api/health — what's set up and what's missing (setting NAMES only, never values).
import { handler, deps } from "../lib.js";
import { TIER_ORDER, TERMS } from "../../src/data/plans.js";
import { checkSkus } from "./photos.js";

export const REQUIRED = [
  "APP_URL", "VITE_APP_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  ...[...TIER_ORDER, "gym"].flatMap((t) => TERMS.map(({ key }) => `STRIPE_PRICE_${t.toUpperCase()}_${key.toUpperCase()}`)),
  "CRON_SECRET", "LINK_SECRET", "SENDGRID_API_KEY", "EMAIL_FROM", "BUSINESS_NAME", "BUSINESS_ADDRESS", "ADMIN_EMAILS",
];
export const OPTIONAL = ["STRIPE_REFERRAL_COUPON", "STRIPE_PORTAL_CONFIG", "SUPPORT_INBOX_EMAIL", "TWILIO_ACCOUNT_SID", "BOOKING_AID", "PRODIGI_API_KEY"];

export default handler(["GET"], async () => {
  const has = (k) => !!(process.env[k] && !/^(price_\.\.\.|sk_live_or_test|your-|https:\/\/YOUR-)/.test(process.env[k]));
  const missing = REQUIRED.filter((k) => !has(k));
  if (!has("ANTHROPIC_API_KEY") && !has("OPENAI_API_KEY")) missing.push("ANTHROPIC_API_KEY (or OPENAI_API_KEY)");
  const checks = { stripeMode: has("STRIPE_SECRET_KEY") ? (process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : "test") : null, database: false, schemaUpToDate: false };
  if (has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY")) {
    try {
      const sb = deps.supabase();
      const a = await sb.from("profiles").select("id", { count: "exact", head: true });
      checks.database = !a.error;
      const b = await sb.from("meet_listings").select("id").limit(1);
      const c = await sb.from("club_meets").select("id").limit(1);
      const d = await sb.from("photos").select("id").limit(1);
      checks.schemaUpToDate = !b.error && !c.error && !d.error;
      const st = await sb.storage.from("photos").createSignedUrls(["health-check.jpg"], 60).catch(() => ({ error: true }));
      checks.photoStorage = !(st?.error && /bucket/i.test(String(st.error.message || st.error)));
    } catch {}
  }
  if (has("PRODIGI_API_KEY")) checks.printProducts = await checkSkus().catch(() => "couldn't check");
  const ok = !missing.length && checks.database && checks.schemaUpToDate;
  return { ok, missing, optionalMissing: OPTIONAL.filter((k) => !has(k)), checks };
});
