// Subscription catalog shared by the app and the server.
// Each plan maps to one Stripe recurring price (set the price IDs in the server settings).
export const TERMS = [
  { key: "monthly", label: "Monthly", months: 1, every: "month" },
  { key: "quarterly", label: "3 months", months: 3, every: "3 months" },
  { key: "semiannual", label: "6 months", months: 6, every: "6 months" },
  { key: "yearly", label: "Yearly", months: 12, every: "year" },
];

// Two family plans. Each term (monthly … yearly) is its own Stripe price: STRIPE_PRICE_{BASIC|PRO}_{TERM}.
// (Older subscriptions on the retired "plus" tier are treated as Basic, which now includes everything Plus had.)
export const TIER_ORDER = ["basic", "pro"];
export const normTier = (t) => (t === "plus" ? "basic" : TIER_ORDER.includes(t) ? t : null);
export const TIERS = {
  basic: {
    name: "Basic", tagline: "Your whole season, organized for you", popular: true,
    highlights: ["Season schedule from a photo — only your athlete's meets", "Scores pulled in, qualifying tracker, reminders", "Meet photos sorted by event — order prints"],
    prices: { monthly: 29.99, quarterly: 80.99, semiannual: 149.99, yearly: 239 },
    features: ["Season schedule from one photo, filtered to each athlete's level", "Host, website and session times found online for you", "Reminders 14, 7, 2 and 1 days out + meet-day message", "Scores pulled in automatically, qualifying-score tracker", "Message your gym and get every announcement", "Meet photos sorted into each event, prints delivered to your door", "Costs & budgets, packing lists, skip-the-line tickets", "Skills, goals, practice & injury watch, family share page", "Up to 6 athletes, any sport"],
  },
  pro: {
    name: "Pro", tagline: "Everything, plus your AI coach",
    highlights: ["Coach G: ask anything about your athlete, any time", "Event-day food plans and nutrition written for your child", "Season Book: photos + results in one keepsake"],
    prices: { monthly: 39.99, quarterly: 107.99, semiannual: 199.99, yearly: 319 },
    features: ["Everything in Basic", "AI coach chat for every sport", "Meet-day pep talk and fueling tips written for your child", "Event-day food plans, practice fueling, week of meals", "Weekly improvement tips", "Season Book: every event's photos and results, ready to print", "Snap score sheets & result photos", "Level-up plans", "Trip & hotel planner"],
  },
};
// Which plan unlocks each feature.
export const FEATURE_TIER = {
  results: "basic", calendar: "basic", costs: "basic", news: "basic", packing: "basic", schedule: "basic", messages: "basic",
  onlineScores: "basic", skills: "basic", goals: "basic", calendarSync: "basic", seasonCard: "basic", practice: "basic", qualifiers: "basic", share: "basic",
  photos: "basic", coach: "pro", tips: "pro", snap: "pro", levelPlan: "pro", trip: "pro", seasonBook: "pro",
};
export const FEATURE_LABEL = { onlineScores: "Online score pull", skills: "Skills & level checklists", goals: "Goals & coach notes", calendarSync: "Calendar sync", seasonCard: "Season card", practice: "Practice & wellness log", qualifiers: "Qualifying-score tracker", share: "Family share page",
  coach: "The AI coach", tips: "Improvement & nutrition tips", snap: "Photo score import", levelPlan: "Level-up plans", trip: "Trip & hotel planner", photos: "Photos & prints", seasonBook: "Season Book" };
export const hasFeature = (tier, f) => !!tier && TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(FEATURE_TIER[f] || "basic");
export const tierName = (t) => TIERS[t]?.name || "";

export const PLANS = {
  parent: {
    name: "AthleteOrbit",
    who: "For families",
    prices: { monthly: 29.99, quarterly: 80.99, semiannual: 149.99, yearly: 239 },
    trialDays: 7,
    features: ["Results, skills, events and costs for up to 6 children, any sport", "AI coach: improvement and nutrition tips", "Snap results sheets, meet photos and printed season books", "Reminders, packing lists and trip plans", "Free for 7 days, no card"],
  },
  gym: {
    name: "AthleteOrbit for Gyms",
    who: "For gyms and booster clubs",
    prices: { monthly: 99, quarterly: 269, semiannual: 499, yearly: 899 },
    seats: 50,
    trialDays: 0,
    features: ["Every family gets AthleteOrbit Basic (up to 50 families)", "Upload your roster — parents find their athlete in seconds", "Snap the season schedule: each athlete sees only their meets", "Messages with parents + announcements to everyone", "Meet reminders, session times and packing lists for every family"],
  },
};

export const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
// kind: "gym" | a plan name ("basic" | "pro"); anything else means Basic.
export const pricesFor = (kind) => (kind === "gym" ? PLANS.gym.prices : (TIERS[kind] || TIERS.basic).prices);
export function perMonth(kind, term) {
  const t = TERMS.find((x) => x.key === term); return pricesFor(kind)[term] / t.months;
}
export function savings(kind, term) {
  const t = TERMS.find((x) => x.key === term); const p = pricesFor(kind); const full = p.monthly * t.months;
  return Math.round((1 - p[term] / full) * 100);
}
// Stripe price -> our term name. Quarterly = every 3 months, semiannual = every 6 months.
export function termFromRecurring(rec) {
  if (!rec) return "monthly";
  if (rec.interval === "year") return "yearly";
  if (rec.interval === "month") return { 1: "monthly", 3: "quarterly", 6: "semiannual", 12: "yearly" }[rec.interval_count || 1] || "monthly";
  return "monthly";
}
export const priceEnv = (kind, term) => `STRIPE_PRICE_${kind.toUpperCase()}_${term.toUpperCase()}`;
export const termLabel = (term) => TERMS.find((t) => t.key === term)?.label || term;

// Rows of the "compare plans" table: [label, first tier that has it].
export const COMPARE = [
  ["Season schedule from a photo, per athlete", "basic"], ["Host, website and session times found online", "basic"], ["Reminders and meet-day message", "basic"], ["Messages and announcements from your gym", "basic"],
  ["Scores pulled in automatically", "basic"], ["Qualifying-score tracker", "basic"], ["Costs, budgets and packing lists", "basic"], ["Skills, goals and practice log", "basic"], ["Family share page, tickets", "basic"],
  ["AI coach and personal meet-day tips", "pro"], ["Improvement and nutrition tips", "pro"], ["Video check and photo score import", "pro"], ["Trip and hotel planner", "pro"],
];
