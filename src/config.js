// Edit these to match your Stripe prices and brand.
export const APP = {
  name: "AthleteOrbit",
  tagline: "Your athlete's season, coached.",
  supportEmail: "support@athleteorbit.org",
  supportPhone: "",                        // shown in Contact us when set
  supportHours: "Mon–Fri, 9am–5pm ET",
  // Public links (live scores, tickets) always point at the website, also from inside the phone app.
  site: (typeof location !== "undefined" && /^https?:$/.test(location.protocol) ? location.origin : "https://athleteorbit.org"),
  // Plan prices live in src/data/plans.js (and must match your Stripe prices).
};
