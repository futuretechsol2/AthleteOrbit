# AthleteOrbit — your launch checklist

About 2½ hours in total, spread over 2–3 sittings. Do them in order. Everything else is already built.

## 1. Name and domain — 15 min
- [ ] Search "AthleteOrbit" at https://tmsearch.uspto.gov (nothing for apps/software = good).
- [ ] Hostinger → Domains → buy `athleteorbit.com` (or `.app`). Turn on auto-renew and privacy.

## 2. Create the accounts — 30 min
- [ ] **GitHub** (free) — holds the code.
- [ ] **Vercel Pro** ($20/mo) — runs the website and server. Sign in with GitHub.
- [ ] **Supabase Pro** ($25/mo) — database and log-in.
- [ ] **Stripe** (free; fees per payment) — fill in business details and your bank account.
- [ ] **SendGrid** (free to start) — sends emails. Verify your sender email.
- [ ] **Anthropic** (pay as you go) — console.anthropic.com → API key for the AI coach.
- [ ] Recommended: form an LLC first so Stripe payouts and the privacy policy use the business name.

## 3. Database — 10 min
- [ ] Supabase → New project (region: East US).
- [ ] SQL Editor → paste all of `supabase/schema.sql` → Run.
- [ ] Authentication → Email Templates → paste the 3 files from `supabase/email-templates/`.
- [ ] Project Settings → API → copy: Project URL, `anon` key, `service_role` key.

## 4. Put the code online — 15 min
- [ ] GitHub → New repository `athleteorbit` (private) → upload the unzipped project folder.
- [ ] Vercel → Add New → Project → pick the repository → Deploy (it will show errors until step 6 — that's fine).

## 5. Stripe in one command — 5 min (needs Node.js from nodejs.org on your laptop)
In the unzipped project folder, open Terminal and run:
```
npm install
STRIPE_SECRET_KEY=sk_test_YOURKEY APP_URL=https://athleteorbit.com npm run setup:stripe
```
(Windows PowerShell: `$env:STRIPE_SECRET_KEY="sk_test_..."; $env:APP_URL="https://athleteorbit.com"; npm run setup:stripe`)
- [ ] It creates all plans, coupons (`FOUNDING` promo code for your first 25 families), the webhook and the billing portal, and writes `stripe-settings.env`.
- [ ] Vercel → Settings → Environment Variables → paste the file's contents → Save. Then delete the file.
- [ ] Stripe → Settings → Connect → turn on (Express) — needed for meet ticket payouts.

## 6. The other settings — 10 min
Vercel → Settings → Environment Variables → add:
| Name | Value |
|---|---|
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` | Supabase `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key |
| `STRIPE_SECRET_KEY` | the same `sk_test_...` key |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `SENDGRID_API_KEY`, `EMAIL_FROM` | SendGrid key, your verified sender email |
| `BUSINESS_NAME`, `BUSINESS_ADDRESS` | your LLC name and mailing address (required in emails) |
| `ADMIN_EMAILS`, `SUPPORT_INBOX_EMAIL` | your email (gives you the owner dashboard) |
- [ ] Deployments → ⋯ → **Redeploy**.

## 7. Connect the domain — 10 min (+ up to a few hours to take effect)
- [ ] Vercel → Settings → Domains → add `athleteorbit.com` and `www.athleteorbit.com`.
- [ ] Hostinger → Domains → DNS records → replace the `@` A record and `www` CNAME with the values Vercel shows. Leave MX (email) records alone.
- [ ] Supabase → Authentication → URL Configuration → Site URL = `https://athleteorbit.com`.

## 8. Check everything works — 15 min
- [ ] Open `https://athleteorbit.com/api/health` → should say `"ok": true`. If not, it lists exactly which setting is missing.
- [ ] Sign up with your own email → confirm the email → add your kids.
- [ ] Choose a plan and pay with test card `4242 4242 4242 4242`, any future date, any CVC.
- [ ] Log in on a second phone → the first one should be signed out.
- [ ] More → Owner dashboard should show "✅ Setup complete".

## 9. Go live — 10 min
- [ ] Run step 5 again with your **`sk_live_`** key; paste the new file into Vercel (skip `CRON_SECRET` and `LINK_SECRET` this time), replace `STRIPE_SECRET_KEY` with the live key → Redeploy.

## Later (not needed for launch)
- [ ] **Texts:** Twilio account + A2P 10DLC registration (takes 1–3 weeks), then set `SMS_ENABLED=true`.
- [ ] **App stores:** Apple Developer ($99/year) and Google Play ($25 once); `npm run cap:ios` / `npm run cap:android`.
- [ ] Email MeetScoresOnline asking for permission or a data partnership.
- [ ] Ask one meet organizer to try tickets: owner dashboard → Meet tickets → New meet.
