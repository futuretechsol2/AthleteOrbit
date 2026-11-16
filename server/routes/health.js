// GET /api/health — what's set up and what's missing (setting NAMES only, never values).
import { handler, deps } from "../lib.js";
import { TIER_ORDER, TERMS } from "../../src/data/plans.js";
import { checkSkus } from "./photos.js";

export const REQUIRED = [
  "APP_URL", "VITE_APP_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  ...[...TIER_ORDER.filter((t) => t !== "solo"), "gym"].flatMap((t) => TERMS.map(({ key }) => `STRIPE_PRICE_${t.toUpperCase()}_${key.toUpperCase()}`)),
  "CRON_SECRET", "LINK_SECRET", "SENDGRID_API_KEY", "EMAIL_FROM", "BUSINESS_NAME", "BUSINESS_ADDRESS", "ADMIN_EMAILS",
];
// Solo ($15.99) is optional: until its 4 prices exist the app simply doesn't offer it.
export const OPTIONAL = [...TERMS.map(({ key }) => `STRIPE_PRICE_SOLO_${key.toUpperCase()}`), "STRIPE_REFERRAL_COUPON", "STRIPE_PORTAL_CONFIG", "SUPPORT_INBOX_EMAIL", "TWILIO_ACCOUNT_SID", "BOOKING_AID", "PRODIGI_API_KEY"];

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
      const e = await sb.from("meet_listings").select("live_enabled,live_status,branding").limit(1);
      const f = await sb.from("live_scores").select("id,status").limit(1);
      const g = await sb.from("athlete_pages").select("id").limit(1);
      checks.schemaUpToDate = !b.error && !c.error && !d.error && !e.error && !f.error && !g.error;
      if (!checks.schemaUpToDate) checks.schemaFix = "Supabase → SQL Editor → paste supabase/schema.sql → Run";
      const st = await sb.storage.from("photos").createSignedUrls(["health-check.jpg"], 60).catch(() => ({ error: true }));
      checks.photoStorage = !(st?.error && /bucket/i.test(String(st.error.message || st.error)));
    } catch {}
  }
  if (has("SENDGRID_API_KEY")) checks.email = await checkSendgrid().catch(() => "couldn't check");
  if (has("PRODIGI_API_KEY")) checks.printProducts = await checkSkus().catch(() => "couldn't check");
  const ok = !missing.length && checks.database && checks.schemaUpToDate;
  return { ok, missing, optionalMissing: OPTIONAL.filter((k) => !has(k)), checks };
});

// Is SendGrid able to send from EMAIL_FROM? (Sign-up, reset and reminder emails depend on it.)
async function checkSendgrid() {
  const h = { authorization: `Bearer ${process.env.SENDGRID_API_KEY}` };
  const sc = await deps.fetch("https://api.sendgrid.com/v3/scopes", { headers: h });
  if (sc.status === 401 || sc.status === 403) return "SendGrid key rejected — make a new API key (Mail Send) and paste it into SENDGRID_API_KEY";
  const scopes = (await sc.json().catch(() => ({}))).scopes || [];
  if (!scopes.includes("mail.send")) return "SendGrid key can't send mail — give it the Mail Send permission";
  const from = String(process.env.EMAIL_FROM || "").toLowerCase(), domain = from.split("@")[1];
  const [vs, dm] = await Promise.all([
    deps.fetch("https://api.sendgrid.com/v3/verified_senders?limit=100", { headers: h }).then((r) => r.json()).catch(() => ({})),
    deps.fetch("https://api.sendgrid.com/v3/whitelabel/domains", { headers: h }).then((r) => r.json()).catch(() => []),
  ]);
  const sender = (vs.results || []).some((x) => String(x.from_email).toLowerCase() === from && x.verified);
  const dom = (Array.isArray(dm) ? dm : []).some((d) => d.valid && (domain === d.domain || domain?.endsWith(`.${d.domain}`)));
  if (dom) return "ok";
  if (sender) return `Sender verified, but ${domain} isn't domain-authenticated in SendGrid, so Gmail/Yahoo will block or spam these emails. SendGrid → Settings → Sender Authentication → Authenticate your domain, then add the DNS records it shows at Hostinger.`;
  return `EMAIL_FROM (${from}) isn't verified in SendGrid — verify it under Settings → Sender Authentication`;
}
