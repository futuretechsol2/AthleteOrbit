# AthleteOrbit launch plan: live by Thursday, November 14

Today is Thursday, October 22. That leaves about 3 weeks. Each block is a few evenings. The details for every step are in README.md.

## Before go-live (v10): the app is now AthleteOrbit. Re-run supabase/schema.sql; in Stripe add the webhook event checkout.session.completed and enable Connect (Express) for meet tickets.

## Also (v7): create Stripe products Basic, Plus, Pro with 4 prices each (see .env.example) and turn on plan switching in the Stripe customer portal.

## Also (v6): re-run supabase/schema.sql in the SQL editor (multi-sport, photos, 7-day trial). Set SUPPORT_INBOX_EMAIL=futuretechsol2@gmail.com and choose AI_PROVIDER (anthropic or openai).

## Week 1 (Oct 22–28): accounts and money
- [ ] Form an LLC (NC: about $125 online) and open a business bank account; you need both for Stripe payouts. **Do this first: it can take days.**
- [ ] Buy a domain (e.g. athleteorbit.app or gympathapp.com) and check the name is free to use (USPTO trademark search, app stores, Instagram).
- [ ] Create accounts: Supabase, Vercel (Pro plan), Stripe, Anthropic, SendGrid, GitHub.
- [ ] Stripe: verify the business, then create the 8 prices (README step 3).
- [ ] SendGrid: authenticate your domain so emails don't land in spam (DNS records; can take up to 48 hours).
- [ ] Apply for Twilio texting registration now if you want texts later (1–3 weeks).

## Week 2 (Oct 29–Nov 4): deploy and test
- [ ] Run `supabase/schema.sql`, set up sign-in settings, SMTP and email templates (README step 1).
- [ ] Deploy to Vercel with all settings; connect your domain.
- [ ] Fill in `src/config.js` (support email and phone) and the `[brackets]` in privacy and terms.
- [ ] Run the full test list in README step 5 in Stripe **test mode**, on an iPhone and an Android phone.
- [ ] Ask 3–5 gym parents you know to sign up and use it for a week; fix what confuses them.

## Week 3 (Nov 5–13): go live and prepare to pitch
- [ ] Switch Stripe to live keys and live price IDs; make one real purchase and refund it.
- [ ] Create your gym owner pitch account; print 50 flyers from `/flyer`.
- [ ] Prepare a 2-minute demo on your phone: family view → snap a score sheet → meet trip planner → AI coach → gym dashboard.
- [ ] Line up 3 gym owners in the Charlotte/Concord area for a 15-minute demo. Offer the first 3 gyms a launch code (Stripe → Coupons → e.g. 50% off the first 6 months).
- [ ] Set a monthly spend limit on Anthropic and alerts in Stripe.

## Launch day, Nov 14
- [ ] Post in your gym's parent group and NC gymnastics parent groups (follow each group's rules).
- [ ] Hand out flyers at the meet; QR goes straight to sign-up.
- [ ] Watch the Owner dashboard and Team inbox; answer every question the same day.

## After launch
- App Store and Google Play: 1–2 weeks of review (README Part 2).
- Turn on texts when Twilio approves you.
- Weekly: check sign-ups, trials that didn't convert, and open questions.
