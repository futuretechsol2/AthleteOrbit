// Travel search links for a meet. Affiliate IDs are optional; without them links still work.
// To use links from any affiliate program, set a URL template with these placeholders:
// {origin} {dest} {depart} {return} {adults} {children} {aid}
export const DEFAULT_FLIGHTS = "https://www.google.com/travel/flights?q=Flights%20to%20{dest}%20from%20{origin}%20on%20{depart}%20through%20{return}";
export const DEFAULT_HOTELS = "https://www.booking.com/searchresults.html?ss={dest}&checkin={depart}&checkout={return}&group_adults={adults}&group_children={children}&no_rooms=1&aid={aid}";

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

// Default stay: arrive the day before the meet, leave the day after it ends.
export function tripDates(meet) {
  const depart = addDays(meet.start_date, -1);
  const ret = addDays(meet.end_date || meet.start_date, 1);
  return { depart, return: ret };
}

function fill(tpl, v) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(v[k] ?? "")).replace(/([?&])aid=(&|$)/, "$1").replace(/[?&]$/, "");
}

export function travelLinks({ dest, origin, depart, ret, adults = 2, children = 1 }, cfg = {}) {
  if (!dest) return [];
  const v = { dest, origin: origin || "", depart, return: ret, adults, children, aid: cfg.bookingAid || "" };
  const links = [];
  links.push({ kind: "hotel", label: "Hotels for meet dates", note: "Compare prices; filter by distance to the venue", url: fill(cfg.hotelsUrl || DEFAULT_HOTELS, v) });
  links.push({ kind: "map", label: "Hotels near the venue (map)", note: "See what's walking distance", url: `https://www.google.com/maps/search/${encodeURIComponent(`hotels near ${dest}`)}` });
  if (origin) links.push({ kind: "flight", label: `Flights from ${origin}`, note: "Use the date grid to find the cheapest days", url: fill(cfg.flightsUrl || DEFAULT_FLIGHTS, v) });
  links.push({ kind: "drive", label: "Driving directions", note: "Often cheaper than flying under 6 hours", url: `https://www.google.com/maps/dir/?api=1&${origin ? `origin=${encodeURIComponent(origin)}&` : ""}destination=${encodeURIComponent(dest)}` });
  return links;
}
