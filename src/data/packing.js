// Starting packing list for a meet. Parents can tick, add and remove items.
const COMMON = ["Competition leo / uniform", "Team warm-ups", "Grips + wrist bands", "Tape and pre-wrap", "Water bottle", "Healthy snacks (banana, pretzels, granola bar)",
  "Hair kit: gel, hairspray, clips, scrunchie", "Flip-flops or slides", "Warm layer for waiting", "Cash or card for admission and parking", "Phone charger / battery pack", "Meet info: session time, address, report time"];
const MAG = ["Competition singlet", "Competition shorts and long pants", "Dowel grips (rings, high bar)", "Socks for pommel horse and rings", "Water bottle", "Healthy snacks",
  "Team warm-ups", "Tape and pre-wrap", "Flip-flops or slides", "Warm layer for waiting", "Cash or card for admission and parking", "Meet info: session time, address, report time"];
const OTHER = ["Uniform / team suit", "Gear for the sport", "Water bottle", "Healthy snacks", "Warm layer", "Towel", "Phone charger / battery pack", "Cash or card for admission and parking", "Event info: time, address, check-in"];
import { SPORTS } from "./sports.js";
// Accepts a child record (preferred) or a gymnastics program string.
export function defaultPacking(child) {
  const c = typeof child === "string" ? { program: child } : child || {};
  const list = c.program === "MAG" ? MAG : c.program && c.program !== "Other" ? COMMON : SPORTS[c.sport]?.packing || OTHER;
  return [...list, ...(list.some((x) => /charger/i.test(x)) ? [] : ["Phone charger / battery pack"])].map((text) => ({ text, done: false }));
}
