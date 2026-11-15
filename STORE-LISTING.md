# AthleteOrbit — App Store & Google Play kit

Icons, splash screens and native projects are already generated (`ios/`, `android/`, `assets/`).
I can't publish for you — the stores need your own developer accounts, ID verification and signing keys.

## 1. Accounts (one time)
| Store | Cost | Sign up | Notes |
|---|---|---|---|
| Apple App Store | $99/year | developer.apple.com/programs | Enroll as an **organization** (FutureTech AI) — needs a D-U-N-S number (free, ~1 week). Needs a Mac with Xcode. |
| Google Play | $25 once | play.google.com/console | Organization account. New personal accounts must run a 14-day closed test with 12 testers first. |

## 2. Build
```bash
npm install
VITE_API_BASE=https://athleteorbit.org npm run build   # the app must call your live API
npx cap sync
npx cap open ios        # Xcode: set Team, bump version, Product → Archive → Distribute
npx cap open android    # Android Studio: Build → Generate Signed Bundle (.aab)
```
Keep the Android signing key safe — losing it means you can't update the app.

## 3. ⚠️ Payments rule — decide before you submit
Apple and Google require their own in-app billing for **digital subscriptions** (Basic/Pro, Live Scoring Pro, recruiting page). Physical goods and real-world events (**prints, Season Books, meet tickets**) can use Stripe.
Options, simplest first:
1. **US link-out:** in the US storefronts, apps may now link to web checkout. Rules have been changing — confirm the current Apple guideline 3.1.1 / Google Play payments policy before submitting.
2. **Sign-in only app:** the app shows no prices or buy buttons; people subscribe on athleteorbit.org (like Netflix/Spotify "reader" style). Ask me to add a native switch that hides purchase screens.
3. **Add in-app purchases** (RevenueCat makes this easier) — Apple/Google take 15% (small business program).

## 4. Listing text

**App name (30):** AthleteOrbit: Live Scores
**Subtitle — Apple (30):** Sports family schedule & coach
**Short description — Google (80):** Live meet scores, your athlete's season from one photo, AI coach and meet photos.

**Keywords — Apple (100):**
`gymnastics,meet scores,live scores,swim,cheer,competition,schedule,sports parent,athlete,coach,team`

**Promotional text (170):**
Follow every routine live — free. Snap your gym's schedule and see only your athlete's meets, with reminders, scores, an AI coach and meet photos in one app.

**Description:**
AthleteOrbit is the all-in-one app for sports families, gyms and meet organizers.

LIVE SCORES — FREE
• Follow any meet live from the stands or from home — no account needed
• Star your athlete and get an alert when new scores post
• Share a score card, or order it as a printed certificate or poster

YOUR SEASON, ORGANIZED
• Snap a photo of the gym's schedule — AthleteOrbit builds each athlete's calendar by level
• Session times, host sites and reminders 14, 7, 2 and 1 days out
• Scores, qualifying tracker, skills, goals, costs and packing lists
• Up to 6 athletes in any sport: gymnastics, swimming, cheer, dance, soccer, basketball, tennis and more

COACH G (PRO)
• Ask anything about your athlete's training, nerves or meet day
• Event-day food plans and nutrition tips written for your child

MEET PHOTOS & KEEPSAKES
• Photos sorted by event, prints delivered to your door, Season Book of every meet

FOR KIDS
• Athlete view: kids see their meets, scores, skills and photos — they can't change anything, message anyone or buy anything. Leaving it needs the parent's PIN.

FOR GYMS
• Upload your roster, publish the season schedule per level, message every family

FOR MEET ORGANIZERS
• Sell tickets online and scan them at the door
• Post live scores by typing them or uploading your results file
• Live Scoring Pro: TV scoreboard, your branding, sponsors and export

Accounts are for parents and guardians 18+. Athletes under 18 use their parent's account.
7-day free trial. Basic $29.99/month, Pro $39.99/month (longer terms save more).

**Category:** Sports (secondary: Lifestyle)
**Age rating:** 4+ (Apple) / Everyone (Google). Do **not** opt into "Made for Kids" / Designed for Families — the account holder is the parent.
**URLs:** Marketing https://athleteorbit.org · Support https://athleteorbit.org/contact · Privacy https://athleteorbit.org/privacy.html · Terms https://athleteorbit.org/terms.html
**Support email:** support@athleteorbit.org
**Copyright:** © 2026 FutureTech AI

## 5. Privacy answers (App Privacy / Data safety)
| Data | Collected | Linked to user | Purpose |
|---|---|---|---|
| Name, email | Yes | Yes | Account, support |
| Photos (meet photos, schedule photos) | Yes | Yes | App functionality |
| Athlete info (name, level, scores) | Yes | Yes | App functionality |
| Purchase history | Yes | Yes | Prints, tickets, subscriptions |
| Location, contacts, ads tracking | No | — | — |
No data sold. No third-party advertising. Data encrypted in transit. Users can delete their account (More → Account).

## 6. Screenshots
Required: iPhone 6.9" (1320×2868) and 6.5"; Google phone (min 1080px). Use the demo (`/?demo`): Live scores, Home, Season schedule, Coach G, Photos, Tickets. The 3D flyers' phone art works for the Play feature graphic (1024×500).

## 7. Review tips
• Give reviewers a demo login (a test account you create) and say where Live scores and Athlete view are.
• Apple 4.2 "minimum functionality": the app must feel native — push reminders and the camera schedule snap help.
• Typical review: Apple 1–3 days, Google 1–7 days.
