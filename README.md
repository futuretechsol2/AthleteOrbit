# AthleteOrbit — go-live guide

AthleteOrbit is a family sports app (gymnastics first, with simple stats for any other sport): scores, meets, costs, a 341-skill checklist (WAG Levels 1–10, MAG Levels 1–10, Xcel), a dashboard, automatic meet reminders, packing lists, a trip planner with hotel and flight links, a shareable season card, gym-wide plans, and Contact us with a team inbox. **AthleteOrbit Pro** adds an AI coach, score-sheet photo import, video technique feedback, a level-up plan and AI trip plans.

- **Web app (live tonight):** React + Vite, installs to the home screen.
- **Server:** one Vercel function (`api/router.js`) serving every route in `server/routes/` (AI, billing, gym plans, reminders, support). A daily scheduled job sends reminders.
- **Database + sign-in:** Supabase, with row-level security so each family only sees its own data.
- **Payments:** Stripe subscriptions with a 7-day free trial.
- **App stores:** the same app wrapped with Capacitor (`ios/` and `android/` are already generated).

Try it with no setup: `npm install && npm run dev`, then open the page. With no keys set, it runs in **demo mode** (sample family, saved on that device only). You can add `?demo=1` to any live link to show the demo.

---

## Part 1 — Go live on the web (about 60–90 minutes)

You need these 4 accounts. All have free tiers except the Anthropic API, which is pay-as-you-go.

### 1. Supabase (database + sign-in)
1. Create a project at supabase.com.
2. **SQL Editor → New query →** paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → URL Configuration:** set Site URL to your Vercel address (step 4). Add it under Redirect URLs too.
4. **Authentication → Sign In / Providers → Email:** keep **Confirm email** on, and set the minimum password length to 8.
5. **Authentication → Emails → SMTP Settings:** turn on custom SMTP with your SendGrid details (host `smtp.sendgrid.net`, port 587, user `apikey`, password = your SendGrid API key). Supabase's built-in email only sends a few emails an hour, which isn't enough for launch.
6. **Authentication → Emails → Templates:** paste the three files from `supabase/email-templates/` (confirm sign-up, reset password, change email) so emails are branded and show the username.
7. **Authentication → Rate Limits:** raise "sign-ups and sign-ins" to about 150 per 5 minutes. Username log-ins go through your server, so they share one address in Supabase's eyes.
8. **Project Settings → API:** copy the **Project URL**, the **anon key**, and the **service_role key**. Keep the service_role key secret. The anon key goes in both `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY`.

### 2. Anthropic (AI coach)
1. At console.anthropic.com, create an API key and add billing credit ($20 is plenty to start).
2. Set a monthly spend limit there as a safety net.

### 3. Stripe (payments)
1. **Product catalog → Add product** twice, each with four recurring prices. For 3 and 6 months choose "Monthly" billing and set "every 3 months" / "every 6 months" (under More options → Custom).

   | Product | Monthly | Every 3 months | Every 6 months | Yearly |
   |---|---|---|---|---|
   | AthleteOrbit Pro (families) | $15.99 → `STRIPE_PRICE_PARENT_MONTHLY` | $42.99 → `..._PARENT_QUARTERLY` | $79.99 → `..._PARENT_SEMIANNUAL` | $129 → `..._PARENT_YEARLY` |
   | AthleteOrbit for Gyms | $99 → `STRIPE_PRICE_GYM_MONTHLY` | $269 → `..._GYM_QUARTERLY` | $499 → `..._GYM_SEMIANNUAL` | $899 → `..._GYM_YEARLY` |

   If you change a price, change it in `src/data/plans.js` too so the app shows the same number.
2. **Developers → API keys:** copy the secret key. Use test mode first.
3. **Settings → Billing → Customer portal:** turn it on. Allow cancelling, updating cards, and switching plans; add all four prices of each product under "Products" so families and gyms can move between monthly, 3-month, 6-month and yearly.
4. Do step 5 below after Vercel gives you an address.
5. **Developers → Webhooks → Add endpoint:** `https://YOUR-APP.vercel.app/api/billing/webhook`. Select the events `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Copy the signing secret (`whsec_…`).

### 3b. SendGrid (reminder and support emails, about 20 minutes)
1. Create a free SendGrid account. **Settings → Sender Authentication:** authenticate your domain (best delivery), or at least verify one sender email.
2. **Settings → API Keys:** create a key with Mail Send access. Put it in `SENDGRID_API_KEY`, and the sender in `EMAIL_FROM`.
3. Fill in `BUSINESS_NAME` and `BUSINESS_ADDRESS`. US law requires a postal address in reminder emails; a PO box or registered-agent address works.
4. Put your own email in `SUPPORT_INBOX_EMAIL` and `ADMIN_EMAILS`. Contact-us questions arrive there with an AI-drafted reply, and you can also answer from **More → Team inbox** in the app.

### 3c. Gym plans
Gym owners register with "I run a gym", pick a plan length, and pay. The app creates the gym code and emails it right away. Their **My gym** screen shows the code, a QR code, a sign-up link with the code built in, a copy-ready message for parents, a printable flyer, families joined, and announcements.

### 3d. Travel affiliate IDs (optional, earns commission)
Links work without any IDs. To earn commission on hotel bookings, join the Booking.com Affiliate Partner Program and put your ID in both `BOOKING_AID` and `VITE_BOOKING_AID`. If your program gives a different link format, paste it as a template in `TRAVEL_HOTELS_URL` / `TRAVEL_FLIGHTS_URL` (and the `VITE_` copies) using the placeholders in `.env.example`. Check each program's rules for required disclosure; the app already shows "Some links may earn AthleteOrbit a small commission".

### 3e. Text reminders (later)
Twilio requires US business texting registration (A2P 10DLC) before you can text customers, which usually takes 1–3 weeks. Once you're approved, fill in the `TWILIO_` values and set `SMS_ENABLED=true`. The "Text reminders" switch turns on in the app by itself; nothing else to change.

### 4. Vercel (hosting)
1. Put this folder in a GitHub repository, then **Vercel → Add New → Project → Import** it.
2. Add every variable from `.env.example` under **Settings → Environment Variables**, then **Deploy**.
   Use the **Vercel Pro plan ($20/month)**: the free Hobby plan is for non-commercial use only, and a paid app counts as commercial.
   The daily reminder job is already scheduled in `vercel.json` (9am Eastern). Vercel runs it automatically once `CRON_SECRET` is set.
3. Paste your Vercel address into `APP_URL` and `VITE_APP_URL`, into Supabase (step 1.3) and into the Stripe webhook (step 3.5), then redeploy.

### 5. Test before charging real money (Stripe test mode)
- [ ] Open your site: the public page shows features and both price tables.
- [ ] Register as a parent (name, username, email, password), confirm the email, log in **with the username**, log out, log in **with the email**. Try "Forgot username?" and "Forgot password?".
- [ ] Add a gymnast.
- [ ] Coach tab → Start free trial → pick **3 months** → pay with test card `4242 4242 4242 4242`. Pro should turn on within a few seconds, and More shows "free trial · 3 months".
- [ ] Register a second account with "I run a gym", buy the 6-month gym plan, and check the code email and the My gym screen.
- [ ] Add your own email to `ADMIN_EMAILS`, then open More → **Owner dashboard** and check the numbers.
- [ ] Ask Coach G a question, snap a score sheet, run a video check, build a level-up plan.
- [ ] More → Manage billing → cancel the plan. Coach tab should show the paywall again.
- [ ] Sign up as a second parent and confirm you can't see the first family's data.
- [ ] Add a meet 7 days out with a city. In Vercel → Settings → Cron Jobs → **Run** the reminder job. Check the email for the hotel and flight links, then click "Turn off meet reminder emails".
- [ ] More → Contact us: send a question. It should arrive in `SUPPORT_INBOX_EMAIL` with a suggested reply, and show in More → Team inbox.
- [ ] Buy the gym plan with the test card and check that the code email arrives. Join with a second account; Pro should switch on without a subscription.
- [ ] Then switch Stripe to live keys and live price IDs in Vercel, and redeploy.

Edit the name and support email in `src/config.js`, and prices in `src/data/plans.js`. Fill in the `[brackets]` in `public/privacy.html` and `public/terms.html`, and have both reviewed.

---

## Part 2 — App Store and Google Play (about 1–2 weeks, mostly review time)

You need: a Mac with Xcode (for iOS), Android Studio, an Apple Developer account ($99/year) and a Google Play Console account ($25 once). Register as an LLC if you want your business name shown as the seller.

1. In `.env`, set `VITE_API_BASE=https://YOUR-APP.vercel.app` and the same Supabase values.
2. Change `appId` in `capacitor.config.json` to your own reverse domain, e.g. `com.yourcompany.gympath`. Do this before the first store upload.
3. `npm run cap:ios` opens Xcode: set your team, app icon (`public/icon-1024.png`), and version, then Product → Archive → upload.
4. `npm run cap:android` opens Android Studio: Build → Generate Signed Bundle → upload the `.aab` to Play Console.
5. Store listing needs: screenshots, the privacy policy URL (`/privacy.html`), a support URL, and a review login (create a demo parent account with a test Pro plan).

**Important — paying for Pro inside the iOS app:** Apple's rules on digital subscriptions and links to outside payment have been changing, especially for the US storefront. Before you submit, check the current App Review Guidelines (section 3.1). The safest first submission is this: let people subscribe on the website and sign in to the app, and hide the in-app purchase button in the iOS build. Adding Apple In-App Purchase (for example through RevenueCat) is the long-term option. Google Play has similar billing rules, so check them too.

Already handled for review: delete account from inside the app (More → Delete account), privacy policy, camera and photo permission messages, and adults-only accounts.

---

## How it's built

| Piece | Where |
|---|---|
| Screens | `src/pages/*` (Home, Scores, Meets with packing + trip planner, Costs, Skills, Coach, More, Extras for reminders/gym/contact/inbox) |
| Reminder emails and texts | `server/routes/cron/reminders.js` (14, 7, 2, 1 days before; deadlines 7 and 2 days before) |
| Travel links | `src/data/travel.js` |
| Season card image | `src/lib/recap.js` |
| Skill catalog and levels | `src/data/skills.js` |
| Data layer (Supabase or demo) | `src/lib/db.js` |
| Photo resize and video frames (on device) | `src/lib/media.js` |
| AI endpoints | `server/routes/ai/*` (coach, scoresheet, video, readiness, trip) |
| Billing and gym plans | `server/routes/billing/*`, `server/routes/club/*` |
| Contact us and team inbox | `server/routes/support/send.js`, `server/routes/admin/support.js` |
| Database, security, free-plan limit | `supabase/schema.sql` |
| Tests | `npm test` (40 server tests) |

**Free vs Pro:** Free gives 1 child plus all the tracking, reminders, packing lists, travel links and the season card (these bring families in). Pro ($15.99/month, $42.99 for 3 months, $79.99 for 6 months or $129/year, 7-day trial) adds up to 6 children and all AI features. A gym plan ($99/month, $269/3 months, $499/6 months or $899/year, 50 families) gives every family in a gym Pro.

**Daily AI limits per family:** 40 coach messages, 15 score sheets, 10 video checks, 10 level-up plans and 10 trip plans. Change them in `api/_lib.js`.

**Privacy by design:** videos never leave the phone. The app pulls 8 small still frames on the device and sends only those. Photos and frames aren't stored.

**AI safety rules (built into every prompt):** no body, weight or diet talk; no unsupervised skill attempts; injuries go to a doctor or physical therapist; the coach makes the final call.

**AI cost estimate:** roughly $0.01–$0.05 per coach answer and $0.03–$0.10 per video check, depending on model and length. At normal use, a Pro family usually costs well under $2/month in AI.

## Accounts, log-in and plans (v4)

- **Public page** at your address: features, prices for families and gyms, FAQ, Sign up and Log in. In the App Store app, people land on Log in instead.
- **Registration:** parent or gym owner; full name, username (checked live), email, password (8+ with a letter and a number, strength meter, show/hide), confirm password, and an 18+ / Terms checkbox. Supabase sends the branded confirmation email.
- **Log in** with username or email. Forgot password and forgot username both work by email. Repeated wrong passwords are slowed down. Usernames never reveal anyone's email.
- **Account screen:** name, username, email, account type, change password, plan and renewal date, Manage billing, delete account.
- **Plans:** families and gyms each choose monthly, 3 months, 6 months or yearly.
- **Owner dashboard** (for `ADMIN_EMAILS`): revenue estimate, paying families by plan, trials, failed payments, gyms and families joined, sign-ups, newest accounts, open questions, team inbox, printable flyer.
- **Flyer** at `/flyer` (general) or from a gym's dashboard (with its code and QR). Print it or save it as a PDF.

## Family features (v3)

| Feature | Where in the app |
|---|---|
| **Family view**: every child, the next events across the family, season spending vs budget, and what needs attention | Top bar → **Family** |
| **Other sports**: add a child as "Another sport" (swimming, soccer, basketball, track, dance, cheer, or anything typed in) and log times or stats; personal records are marked automatically | More → Children → Add; then Results |
| **Goals and coach notes** for every child; coach contact on each child | Progress |
| **Budgets**: season budget (Aug 1 – Jul 31) for the family, a child, or a category; budget vs actual, cost per child and per sport | More → Costs & budget |
| **Meet planner extras**: hotel booking details, estimated trip cost vs actual spent, costs linked to a meet | Open any meet → Costs / Trip planner / Details |
| **Alerts**: unpaid fees, meets in the next 14 days, entry deadlines, calendar clashes, budgets at 90%, new gym announcements | 🔔 in the top bar; Monday email digest for unpaid fees and budgets |
| **Family calendar**: meets for every child, entry deadlines and family events in one list; clashes flagged; private subscribe link for Google, Apple or Outlook | More → Family calendar |
| **News**: headlines from official feeds (USA Gymnastics by default) and your gym's announcements; gym owners post announcements and can email every family | More → News & gym posts |
| **Family assistant (Pro)**: "How much did we spend on gymnastics this season?", "What do we need for the next meet?", "Which competitions clash with our calendar?" | Coach → Family assistant |

One shared family login is used (no separate member accounts), as you chose. Everyone who signs in sees the same data, so share the password only with people who should see costs.

## What runs on its own

- **Daily at 9am Eastern:** meet reminders (14, 7, 2 and 1 days before) and entry-deadline reminders, each sent once. Includes hotel, flight and driving links, the unpacked items, and a button back to the meet's packing list and trip planner.
- **Stripe:** trials, renewals, failed payments and cancellations update the app by themselves. Gym plans create and email their code.
- **Mondays:** one email per family with unpaid fees and any budget that's 90% used.
- **Calendar feed:** Google/Apple/Outlook calendars refresh the family calendar by themselves (every few hours).
- **News:** headlines refresh hourly from the official feeds.
- **Contact us:** each question is saved, emailed to you with an AI-drafted answer, and the parent gets an automatic "we got it" email. You review the draft and reply from your email or the Team inbox.
- **Unsubscribe:** one click in any reminder email, with no sign-in needed.

Your only regular jobs are answering Contact-us messages and checking the Stripe dashboard.

## v5 — multi-sport (Gymnastics, Swimming, Cheer & Dance, Soccer, Basketball, Tennis)
- After login, parents pick one or more sports (tiles). Tap the sport button in the top bar to switch, add or remove a sport.
- Everything follows the active sport: tab names (Scores/Times/Stats/Results, Meets/Games/Matches/Competitions), levels, skill checklists, result metrics, packing lists, AI coach prompts, video check and level-up plan.
- "Snap results" photo import works for Gymnastics, Swimming and Cheer & Dance.
- Profile photos for parents and children (resized on the device to 256px, stored on the record).
- Website: ≥900px wide shows a left sidebar; phones/app keep the bottom tab bar + floating "Ask Coach".
- Sport catalog lives in `src/data/sports.js` — edit there to add a sport or change wording.
- Run the latest `supabase/schema.sql` again (adds profiles.sports, profiles.avatar, gymnasts.photo, clubs.sport).

## v6 — simpler, paid-only with a 7-day free trial
- Every new account gets **7 days free, no card**. After that the app shows plan options (tracking is not free). Data is kept. Families covered by a gym code stay unlocked.
- Choosing a plan during the trial bills only when the trial ends (Stripe `trial_end`).
- After every login: tap a sport button (your sports first, others "＋ Add").
- **Log out**: account photo (top right) → Log out; desktop sidebar; More → Account; trial-ended and sport screens.
- AI coach **Tips** tab: weekly Improvement tips and kid-safe Nutrition tips (food-first, no calorie/weight talk, refers to pediatrician / sports dietitian).
- AI provider: Claude by default; set `AI_PROVIDER=openai` + `OPENAI_API_KEY` to use ChatGPT (photos and video frames work with both).
- Family events (birthdays, trips) no longer create alerts.
- Support contact: futuretechsol2@gmail.com · (224) 425-2043 (edit in `src/config.js`).
- Re-run `supabase/schema.sql` (adds `profiles.trial_ends_at`, updates `is_pro`).

## v7 — Basic / Plus / Pro, online scores, Back button
- **Plans** (prices in `src/data/plans.js`, features gated on the server and in the app):
  - Basic $9.99/mo — athletes with photos, scores/results, family calendar, costs & budgets, news, email reminders, packing lists.
  - Plus $15.99/mo — + auto-pull scores from MeetScoresOnline, skills & level checklists, goals & coach notes, calendar sync, season card.
  - Pro $24.99/mo — + AI coach, improvement & nutrition tips, video check, photo score import, level-up plans, trip & hotel planner, family assistant.
  - 7-day free trial = Pro. Gym codes cover families at Plus. Upgrades/downgrades happen in the app (`/api/billing/change`, prorated).
- **Online scores**: Scores → "Pull scores online": paste the MeetScoresOnline results link (or the page text). The server reads that one page, keeps the lines around the athlete's name and AI turns them into scores the parent confirms. Save the link on a meet and the daily job checks it for 4 days after the meet and alerts the parent ("scores are in").
- **Back**: every screen and pop-up is in browser history, so the phone/browser Back button (and Android's hardware Back, via @capacitor/app) steps back instead of leaving. A "‹ Back" button shows on every screen except Home.
- Re-run `supabase/schema.sql` (adds subscription_tier, stripe_subscription_id, meets.results_url, gymnasts.results_name, score_imports).

## v8 — practice & injury watch, qualifying scores, family share page (all Plus)
- **Practice log** (Progress → Practice): minutes, type, energy, pain 0–10 + body area. Weekly hours chart. Pain ≥3 twice in a week (or ≥6 once) raises an alert suggesting a doctor/PT check. The AI coach sees training load and pain.
- **Qualifying scores** (top of Scores/Results): parent enters the target (State AA, move-up score, swim cut). Shows Qualified ✓ or "0.35 to go" after every result. Targets are entered by the parent — no hard-coded USAG numbers.
- **Family share page**: one private link per child (`/api/share?k=…`) showing results, personal bests and upcoming events — never costs, hotels, notes or contacts. Rotate or turn off anytime; pauses if the plan lapses. Not indexed by search engines.
- Re-run `supabase/schema.sql` (adds practice_logs, qualifiers, gymnasts.share_key).

## v9 — one device at a time, referrals, campaign tracking, onboarding, data export
- **One signed-in device per account**: each sign-in claims the account (`/api/session/claim`) and revokes other devices' refresh tokens. Older devices are refused by the API and by database rules (`session_ok()`), checked every minute and when the app is reopened, and land on the log-in page with an explanation. `SINGLE_SESSION=off` disables it. Optional extra: Supabase Pro → Auth → Sessions → "Single session per user".
- **Give a month, get a month**: More → Invite a family. `?ref=CODE` links; referred families get `STRIPE_REFERRAL_COUPON` at checkout; the inviter gets one month of credit (or 30 more trial days).
- **Campaign tracking**: `?utm_source=facebook&utm_campaign=…` is saved with each sign-up; the owner dashboard shows sign-ups by source, plan mix and trial→paid %.
- **Getting started checklist** on Home (photo, next event, first score, skills, share with family).
- **Download my data** (CSV) under More → Account.
- Re-run `supabase/schema.sql`.

## v10 — AthleteOrbit, easier buying, meet-day coach, meet tickets
- **Renamed to AthleteOrbit** (app name, icons, emails, iOS/Android app id `com.athleteorbit.app`).
- **Easier buying**: one screen — Monthly/Yearly switch, three plan rows with 3 highlights each, "Compare all features", sticky Continue button. Landing pricing uses the same picker and remembers the plan into sign-up. Trial emails 2 days before and on the day it ends (link opens the plan screen).
- **Meet day** (new cron `/api/cron/meetday`, 10:00 UTC ≈ 6 AM Eastern): one email/SMS per meet with arrive-by time (45 min before the session), directions, what's left to pack, ticket link, a pep talk and a fueling tip. Pro/trial: written by the AI coach for that child; other plans: curated tips. Same card on Home all day.
- **Meet tickets**: owner dashboard → Meet tickets: add the meet, sessions, ticket types and prices, service fee per ticket and optional % for us; "Organizer payout link" signs the organizer up to Stripe Connect so ticket money goes straight to them. Put on sale → families with that meet on their calendar (same dates, similar name) and families of the listed gyms get the buy link by email, once. Buyers pay on `/tickets/<id>` (no account needed), get QR tickets by email and on `/my-tickets/…`; door volunteers check in at `/door/<id>?k=…` (type or scan).
- Stripe: add the event **checkout.session.completed** to your webhook, and turn on **Connect** (Express) in the Stripe dashboard.
- Re-run `supabase/schema.sql`.

## v11 — one-command Stripe setup and health check
- `npm run setup:stripe` (with `STRIPE_SECRET_KEY` and `APP_URL`) creates all plans, coupons, the webhook and the billing portal, safely re-runnable, and writes `stripe-settings.env` to paste into Vercel.
- `GET /api/health` and the owner dashboard's setup card show which settings are still missing (names only).
- Step-by-step: see LAUNCH-CHECKLIST.md.
