// The four kinds of accounts. "gym" is the gym owner (business tools); "coach" runs a team without the business
// side; "organizer" runs meets only. Everything that isn't "parent" is a business account.
export const ROLES = [
  { key: "parent", label: "Parent", icon: "👪", blurb: "Follow your athlete: schedule, scores, tickets — free through your gym" },
  { key: "coach", label: "Coach", icon: "🧑‍🏫", blurb: "Roll call, results, skills, practice plans and parent updates" },
  { key: "gym", label: "Gym owner", icon: "🏛️", blurb: "Everything coaches get, plus classes, tuition billing, staff and reports" },
  { key: "organizer", label: "Meet organizer", icon: "🏟️", blurb: "Registration, sessions & rotations, officials, tickets, live scores, music" },
];
export const ROLE_KEYS = ROLES.map((r) => r.key);
export const roleOf = (p) => (ROLE_KEYS.includes(p?.account_type) ? p.account_type : "parent");
export const isBusiness = (p) => roleOf(p) !== "parent";
export const runsTeam = (p) => ["gym", "coach"].includes(roleOf(p));       // Coach OS
export const runsGym = (p) => roleOf(p) === "gym";                          // classes, billing, staff, reports
export const runsMeets = (p) => ["gym", "organizer"].includes(roleOf(p));   // sells tickets, hosts meets
export const roleLabel = (p) => ROLES.find((r) => r.key === roleOf(p)).label;
