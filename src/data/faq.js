// Frequently asked questions — the /faq page shows all of them; the landing page shows the starred ones.
import { PLANS, TIERS } from "./plans.js";
import { APP } from "../config.js";
const B = TIERS.basic.prices.monthly, P = TIERS.pro.prices.monthly;
export const FAQ_GROUPS = [
  { group: "Getting started", items: [
    ["Who is AthleteOrbit for?", "Parents and guardians, athletes, gym and club owners, and meet organizers. Parents run the family account; athletes under 18 use their parent's account (with a read-only Athlete view); gyms manage their roster, schedule and messages; organizers sell tickets and post live scores.", true],
    ["Is it an app or a website?", "Both. Use it at athleteorbit.org in any browser on a phone or computer, add it to your home screen, or download the AthleteOrbit app for iPhone and Android. It's the same account and the same data everywhere.", true],
    ["Which sports and activities does it support?", "Gymnastics, swimming, cheer & dance, soccer, basketball, tennis, volleyball, baseball & softball, martial arts, music & performing arts, and academic & STEM competitions."],
    ["How do I add my child?", "Tap Add athlete and search their name first — if their gym uses AthleteOrbit, they're already on the roster with level, team and season schedule. Otherwise add them yourself in a few seconds."],
  ] },
  { group: "Live scores", items: [
    ["Do I need an account or subscription to watch live scores?", "No. Live score pages are free for everyone — open the link from your gym or the meet, or find the meet at athleteorbit.org/live. No sign-up needed.", true],
    ["Who posts the scores?", "Official scores are posted by the meet organizer during or after the meet. Parents can also add their own athlete's scores as they happen; those are marked “Parent-reported” and replaced automatically when official scores arrive."],
    ["Who can see parent-reported scores?", "Your own family, plus families on your athlete's team (same gym) if you choose to share. They are never shown on the public page as official results."],
    ["Can I get a notification when my athlete's score posts?", "Yes — tap Follow next to any athlete on a live page. Following is included in Basic and Pro (and free during the trial)."],
  ] },
  { group: "For athletes and kids", items: [
    ["Can my child use the app?", "Yes, in Athlete view. A parent turns it on and sets a 4-digit PIN. The athlete can see their meets, scores, skills, goals, photos and Coach G tips, but can't change anything, message anyone or see billing. The PIN is needed to leave Athlete view."],
    ["Why can't kids create their own account?", "Accounts are for adults 18 or older. That keeps children's information under their parent's control. Athletes 18 or older can create their own account."],
    ["What is the athlete recruiting page?", "A shareable page for older athletes with highlights, best scores, videos and graduation year — useful for college coaches. It's private until a parent publishes it, and included in Pro (or $49/year with Basic)."],
  ] },
  { group: "For gyms and clubs", items: [
    ["How do gym plans work?", `Start free for 30 days. Upload your roster and a photo of your season schedule; up to ${PLANS.gym.seats} families join with your code and get Basic included — their athlete's meets, your announcements and messages with you.`, true],
    ["Do I have to type in every athlete?", "No. Paste your roster from a spreadsheet or upload a CSV. Parents then find their athlete by name and link in one tap."],
    ["Can parents message coaches privately?", "Yes. Each family has a private thread with the gym. Announcements go to every family with a short summary."],
  ] },
  { group: "For meet organizers", items: [
    ["How do online tickets work?", "Create your event, connect your bank with Stripe once, and share the buy link. Families get QR tickets by email. You keep 100% of the ticket price; buyers pay a small service fee.", true],
    ["Do we need scanners at the door?", "No. Volunteers open the door link on their own phones and scan QR codes with the camera — green for valid, red if used. They can also find a buyer by name."],
    ["How do we post live scores?", "From the event page: type scores by session and rotation, or upload the results file exported from your scoring software after each rotation. Live Scoring Pro ($149 per meet, free when you sell tickets with AthleteOrbit) adds a TV scoreboard, your branding, sponsor banners and a results export."],
    ["Can we show sponsors?", "Yes. Live Scoring Pro meets can show sponsor banners on the live page and TV scoreboard. Want a local sponsor found for your meet? Contact us — we share sponsor revenue 50/50."],
  ] },
  { group: "Photos and prints", items: [
    ["Who can see my photos?", "Only your family. You can choose to share photos from a competition with families of your gym at that same competition."],
    ["How do prints and Season Books work?", "Pick photos, choose sizes and pay — a professional lab prints and ships to your door (US). The Season Book puts every meet's photos and scores in one keepsake; download the PDF or order a hardcover."],
  ] },
  { group: "Plans and billing", items: [
    ["How much does it cost?", `Families: Basic $${B}/month or Pro $${P}/month, cheaper yearly, with a ${PLANS.parent.trialDays}-day free trial and no card needed. Families in a gym's plan get Basic included. Live score pages are always free to watch.`, true],
    ["Can I cancel anytime?", "Yes, under More › Manage billing. You keep your plan until the end of the period you paid for. See the Terms for refunds."],
  ] },
  { group: "Privacy and safety", items: [
    ["Is my family's information private?", "Yes. Each family sees only its own data, other families see only first names and last initials on rosters, photos are private by default, and we never sell data or show ads based on it.", true],
    ["Is AthleteOrbit part of USA Gymnastics or another governing body?", "No. AthleteOrbit is independent and made by FutureTech AI. Skill lists are typical benchmarks; your coach decides readiness."],
    ["How do I contact you?", `Email ${APP.supportEmail} or use the Contact us page. We reply within one business day.`],
  ] },
];
export const TOP_FAQ = FAQ_GROUPS.flatMap((g) => g.items.filter((i) => i[2]).map(([q, a]) => [q, a]));
