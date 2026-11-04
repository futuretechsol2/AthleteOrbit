// Subscription catalog shared by the app and the server.
// Each plan maps to one Stripe recurring price (set the price IDs in the server settings).
export const TERMS = [
  { key: "monthly", label: "Monthly", months: 1, every: "month" },
  { key: "quarterly", label: "3 months", months: 3, every: "3 months" },
  { key: "semiannual", label: "6 months", months: 6, every: "6 months" },
  { key: "yearly", label: "Yearly", months: 12, every: "year" },
];

// Three family tiers. Each term (monthly … yearly) is its own Stripe price: STRIPE_PRICE_{BASIC|PLUS|PRO}_{TERM}.
export const TIER_ORDER = ["basic", "plus", "pro"];
export const TIERS = {
  basic: {
    name: "Basic", tagline: "Organize the season", highlights: ["Scores, calendar and costs", "Reminders and packing lists", "Up to 6 athletes, any sport"], prices: { monthly: 9.99, quarterly: 26.99, semiannual: 49.99, yearly: 79 },
    features: ["Up to 6 athletes, any sport, with photos", "Scores & results with trends", "Family calendar", "Costs & budgets", "News & gym announcements", "Email reminders + packing lists"],
  },
  plus: {
    name: "Plus", tagline: "Scores that find you", popular: true, highlights: ["Scores pulled in for you", "Qualifying and skills tracker", "Live page for grandparents"], prices: { monthly: 15.99, quarterly: 42.99, semiannual: 79.99, yearly: 129 },
    features: ["Everything in Basic", "Auto-pull scores from MeetScoresOnline", "Qualifying-score tracker (State, Regionals, move-ups)", "Skills & level checklists, goals, coach notes", "Practice hours & injury watch", "Live share page for grandparents & co-parents", "Calendar sync + season card"],
  },
  pro: {
    name: "Pro", tagline: "Your AI coach", highlights: ["AI coach and meet-day AI tips", "Video technique check", "Trip and hotel planner"], prices: { monthly: 24.99, quarterly: 66.99, semiannual: 124.99, yearly: 199 },
    features: ["Everything in Plus", "AI coach chat for every sport", "Weekly improvement + nutrition tips", "Video technique check", "Snap score sheets & result photos", "Level-up plans", "Trip & hotel booking planner with AI itinerary", "Family assistant for costs & schedules"],
  },
};
// Which tier unlocks each feature.
export const FEATURE_TIER = {
  results: "basic", calendar: "basic", costs: "basic", news: "basic", packing: "basic",
  onlineScores: "plus", skills: "plus", goals: "plus", calendarSync: "plus", seasonCard: "plus", practice: "plus", qualifiers: "plus", share: "plus",
  coach: "pro", tips: "pro", video: "pro", snap: "pro", levelPlan: "pro", trip: "pro", family: "pro",
};
export const FEATURE_LABEL = { onlineScores: "Online score pull", skills: "Skills & level checklists", goals: "Goals & coach notes", calendarSync: "Calendar sync", seasonCard: "Season card", practice: "Practice & wellness log", qualifiers: "Qualifying-score tracker", share: "Family share page",
  coach: "The AI coach", tips: "Improvement & nutrition tips", video: "Video check", snap: "Photo score import", levelPlan: "Level-up plans", trip: "Trip & hotel planner", family: "Family assistant" };
export const hasFeature = (tier, f) => !!tier && TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(FEATURE_TIER[f] || "basic");
export const tierName = (t) => TIERS[t]?.name || "";

export const PLANS = {
  parent: {
    name: "AthleteOrbit Plus",
    who: "For families",
    prices: { monthly: 15.99, quarterly: 42.99, semiannual: 79.99, yearly: 129 },
    trialDays: 7,
    features: ["Results, skills, events and costs for up to 6 children, any sport", "AI coach: improvement and nutrition tips", "Snap results sheets, video technique check", "Reminders, packing lists and trip plans", "Free for 7 days, no card"],
  },
  gym: {
    name: "AthleteOrbit for Gyms",
    who: "For gyms and booster clubs",
    prices: { monthly: 99, quarterly: 269, semiannual: 499, yearly: 899 },
    seats: 50,
    trialDays: 0,
    features: ["Plus for up to 50 families (auto score pull, skills, calendar sync)", "One gym code to share", "Announcements by app and email", "Meet reminders and packing lists for every family", "Families-joined dashboard"],
  },
};

export const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
// kind: "gym" | a tier name ("basic" | "plus" | "pro"); "parent" means Plus (older code).
export const pricesFor = (kind) => (kind === "gym" ? PLANS.gym.prices : (TIERS[kind] || TIERS.plus).prices);
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
  ["Scores, results and trends", "basic"], ["Family calendar and reminders", "basic"], ["Costs and budgets", "basic"], ["Meet-day reminders", "basic"], ["Buy meet tickets in the app", "basic"],
  ["Scores pulled in automatically", "plus"], ["Qualifying-score tracker", "plus"], ["Skills, goals and practice log", "plus"], ["Family share page", "plus"], ["Calendar sync and season card", "plus"],
  ["AI coach and personal meet-day tips", "pro"], ["Improvement and nutrition tips", "pro"], ["Video check and photo score import", "pro"], ["Trip and hotel planner", "pro"],
];
