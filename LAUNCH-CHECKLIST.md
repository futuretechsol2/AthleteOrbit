## v17.2 upgrade (1 minute)
Supabase → SQL Editor → paste and Run:
```sql
alter table public.gymnasts add column if not exists hide_search boolean not null default false;
alter table public.gymnasts add column if not exists search_name text check (search_name is null or char_length(search_name) <= 60);
create index if not exists gymnasts_hide_search on public.gymnasts(hide_search) where hide_search;
```
Then open https://athleteorbit.org/api/health and check "schemaUpToDate": true.

# AthleteOrbit — your launch checklist

About 2½ hours in total, spread over 2–3 sittings. Do them in order. Everything else is already built.

## 1. Name and domain — 15 min
- [ ] Search "AthleteOrbit" at https://tmsearch.uspto.gov (nothing for apps/software = good).
- [ ] Hostinger → Domains → buy `athleteorbit.org` (or `.app`). Turn on auto-renew and privacy.

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
- [ ] (Sign-up, confirm and password emails are sent by the app through SendGrid — no Supabase email setup needed.)
- [ ] Project Settings → API → copy: Project URL, `anon` key, `service_role` key.

## 4. Put the code online — 15 min
- [ ] GitHub → New repository `athleteorbit` (private) → upload the unzipped project folder.
- [ ] Vercel → Add New → Project → pick the repository → Deploy (it will show errors until step 6 — that's fine).

## 5. Stripe in one command — 5 min (needs Node.js from nodejs.org on your laptop)
In the unzipped project folder, open Terminal and run:
```
npm install
STRIPE_SECRET_KEY=sk_test_YOURKEY APP_URL=https://athleteorbit.org npm run setup:stripe
```
(Windows PowerShell: `$env:STRIPE_SECRET_KEY="sk_test_..."; $env:APP_URL="https://athleteorbit.org"; npm run setup:stripe`)
- [ ] It creates all plans, coupons (`FOUNDER` promo code for your first 25 families), the webhook and the billing portal, and writes `stripe-settings.env`.
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
| `SENDGRID_API_KEY`, `EMAIL_FROM` | SendGrid key, your verified sender email. **Required**: sign-up confirmation emails use it (no more "email rate limit exceeded") |
| `APP_URL`, `VITE_APP_URL` | `https://athleteorbit.org` — email links open the app here and sign the person in |
| `BUSINESS_NAME`, `BUSINESS_ADDRESS` | your LLC name and mailing address (required in emails) |
| `ADMIN_EMAILS`, `SUPPORT_INBOX_EMAIL` | your email (gives you the owner dashboard) |
- [ ] Deployments → ⋯ → **Redeploy**.

## 7. Connect the domain — 10 min (+ up to a few hours to take effect)
- [ ] Vercel → Settings → Domains → add `athleteorbit.org` and `www.athleteorbit.org`.
- [ ] Hostinger → Domains → DNS records → replace the `@` A record and `www` CNAME with the values Vercel shows. Leave MX (email) records alone.
- [ ] Supabase → Authentication → URL Configuration → Site URL = `https://athleteorbit.org`.

## 8. Check everything works — 15 min
- [ ] Open `https://athleteorbit.org/api/health` → should say `"ok": true`. If not, it lists exactly which setting is missing.
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

## Upgrading a live site to v12 (do these once)
1. Supabase → SQL Editor → paste all of `supabase/schema.sql` → Run (safe to run again; adds the roster, schedule and message tables).
2. In the project folder: `STRIPE_SECRET_KEY=sk_... APP_URL=https://athleteorbit.org npm run setup:stripe` → paste the new `STRIPE_PRICE_BASIC_*` / `STRIPE_PRICE_PRO_*` values into Vercel (new prices: Basic $29.99, Pro $39.99). Delete the old `STRIPE_PRICE_PLUS_*` values.
3. Vercel → Environment Variables: make sure `SENDGRID_API_KEY`, `EMAIL_FROM`, `APP_URL` and `VITE_APP_URL` are set (see step 6).
4. Upload the new project files to GitHub (replace everything). Vercel redeploys by itself.
5. Open `https://athleteorbit.org/api/health` → `"ok": true`. Then sign up with a new email: the confirm button should open the app already signed in.

## Upgrading to v13 (photos, prints, organizer tickets, find-your-athlete)
1. Supabase → SQL Editor → run all of `supabase/schema.sql` again. It creates the photo, print-order and link-request tables **and the private `photos` storage bucket**.
2. Upload the new project files to GitHub (Vercel redeploys).
3. Optional — prints: sign up at prodigi.com → Settings → API key (start with the **sandbox** key) → Vercel: `PRODIGI_API_KEY`. Open `/api/health` → `printProducts` must say `ok` for each size; if a size says "unknown product code", look up the right code in Prodigi's product catalog and set `PRINT_SKU_…` for it. Check Prodigi's price for each product is below what families pay (see `src/data/prints.js`).
4. Test: upload 3 photos from a meet weekend → they file under the right meet → order one 4×6 with Stripe test card → the order appears in Prodigi's sandbox dashboard.
5. Tickets for organizers: Account → "Run a meet? Sell tickets" (gym owners: the Tickets tab). Create an event, tap "Get paid" (Stripe Connect), put it on sale, open the door link on a phone and scan a test ticket.

## Upgrading to v15 (live scores, recruiting pages, kid view, new look)
1. **Database:** Supabase → SQL Editor → paste all of `supabase/schema.sql` → Run (safe to re-run; adds live scores, follows, athlete pages).
2. **Support email:** at Hostinger, create `support@athleteorbit.org` (or a forward to your Gmail). In SendGrid, authenticate the domain so mail from it isn't marked spam. Set `SUPPORT_INBOX_EMAIL=support@athleteorbit.org` in Vercel.
3. **Optional prices** (defaults shown in `.env.example`): `LIVE_PRO_PRICE_CENTS`, `ATHLETE_PAGE_PRICE_CENTS`, `PRINT_SKU_CERT`, `PRINT_SKU_POSTER`.
4. **Redeploy** on Vercel, then test as a real user: sign up (18+ box), open `/live`, post scores from Events → ● Live scores, follow an athlete, publish a recruiting page, try Athlete view (More → Athlete view for kids).
5. **App stores:** follow `STORE-LISTING.md`.

## Upgrading to v16 (every sport, Solo plan, Growing Up)
1. **Database:** run all of `supabase/schema.sql` again (adds game status, Solo plan, 1-athlete limit for Solo).
2. **Stripe — Solo prices:** run `node scripts/setup-stripe.mjs` again (safe to re-run; it only adds what's missing) or create 4 prices on a new "AthleteOrbit Solo" product: $15.99/mo, $44.99/3 mo, $84.99/6 mo, $149/yr. Paste the IDs into Vercel as `STRIPE_PRICE_SOLO_MONTHLY`, `_QUARTERLY`, `_SEMIANNUAL`, `_YEARLY`.
3. **Payout links ("Get paid" / "Organizer payout link"):** these need **Stripe Connect** switched on: Stripe dashboard → Connect → Get started → Platform/marketplace. Until then the app now says so clearly instead of "Something went wrong".
4. Redeploy, then open `https://athleteorbit.org/api/health` — `schemaUpToDate` must be `true`.

## If sign-up says it can't send the confirmation email
Open `https://athleteorbit.org/api/health` and read `checks.email`:
- **"SendGrid key rejected"** → SendGrid → Settings → API Keys → create a key with *Mail Send* → paste into Vercel `SENDGRID_API_KEY` → redeploy.
- **"EMAIL_FROM … isn't verified"** → SendGrid → Settings → Sender Authentication → verify that address (or authenticate the athleteorbit.org domain).
- Also check SendGrid → Billing: the free trial ends after 60 days; pick the Essentials plan (about $20/month) or move to another mail service.
Until it's fixed, the app now falls back to Supabase's own confirmation email (limited to a few an hour), so sign-up still works.

## Turn on the Solo plan ($15.99) — 3 minutes in Stripe (test mode first, then live)
Until these exist the app simply doesn't show Solo (nothing breaks).
1. Stripe → Product catalog → **+ Add product** → Name: `AthleteOrbit Solo`.
2. Add 4 recurring prices: **$15.99 every 1 month**, **$44.99 every 3 months**, **$84.99 every 6 months**, **$149 every 1 year**.
3. Copy each price ID (`price_…`) into Vercel → Settings → Environment Variables:
   `STRIPE_PRICE_SOLO_MONTHLY`, `STRIPE_PRICE_SOLO_QUARTERLY`, `STRIPE_PRICE_SOLO_SEMIANNUAL`, `STRIPE_PRICE_SOLO_YEARLY` → Redeploy.
4. Stripe → Settings → Billing → Customer portal → add the Solo product so families can switch plans.
(Or run `node scripts/setup-stripe.mjs` with your Stripe key on your own computer — it does all of this.)

## Emails not arriving in Gmail (sign-up, reset, reminders) — authenticate your domain (15 min)
Checked on Nov 15: athleteorbit.org's SPF only allows Hostinger and there are no SendGrid DKIM records, so Gmail/Yahoo
drop or spam mail that SendGrid sends "from support@athleteorbit.org".
1. SendGrid → Settings → **Sender Authentication** → **Authenticate Your Domain** → DNS host: Other → domain `athleteorbit.org` → Next.
2. SendGrid shows 3 CNAME records (like `em1234`, `s1._domainkey`, `s2._domainkey`). In **Hostinger → Domains → athleteorbit.org → DNS / Nameservers**, add each as type **CNAME** with the exact host and value.
3. Back in SendGrid click **Verify** (DNS can take 5–60 minutes).
4. Open `/api/health` → `checks.email` must say **ok**.
Sign-up no longer waits for email (accounts are ready instantly), but password resets and reminders need this.
To require email confirmation again later, set `REQUIRE_EMAIL_CONFIRM=1` in Vercel.

## Send the app's emails through your Hostinger mailbox (recommended — fixes "email never arrives")
On Nov 16 Gmail showed zero emails from SendGrid (not even in spam), while mail sent from your Hostinger mailbox
arrives fine. Use the mailbox for the app:
1. Hostinger → Emails → support@athleteorbit.org → make sure you know its password (Change password if not).
2. Vercel → Settings → Environment Variables → add:
   `SMTP_HOST` = smtp.hostinger.com · `SMTP_PORT` = 465 · `SMTP_USER` = support@athleteorbit.org · `SMTP_PASSWORD` = (that mailbox password) · `EMAIL_FROM` = support@athleteorbit.org
3. Redeploy → `/api/health` → `checks.email` should say "ok (sending through your mailbox …)".
SendGrid is then not used (you can leave its key in place). Hostinger mailboxes have a daily sending limit — check your plan.
Email confirmation is ON: new accounts must click the link in the email first. (EMAIL_CONFIRM=off turns that off.)
