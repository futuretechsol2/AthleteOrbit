// The feature tour: each feature with its short video (public/videos), the problem it solves, and a "try it" link
// into the demo. Also the end-to-end test path used by testers and in pitches.
export const FEATURES = [
  { key: "schedule", icon: "🗓️", title: "Season schedule from one photo", who: "Parents & gyms",
    problem: "The gym hands out one schedule for every level. Parents dig through it to find their own child's meets — and the session time comes out a week before.",
    how: "Snap the schedule. AthleteOrbit reads every competition and keeps only your athlete's level and girls/boys team, then finds the host, the meet website and your session time online and reminds you before each one.",
    video: "schedule", try: "/?demo&page=meets&snap=1" },
  { key: "find", icon: "🔎", title: "Find your athlete — no forms", who: "Parents",
    problem: "Every app makes parents type in their kid, level and team by hand.",
    how: "Gyms upload their roster once. Parents search a name, tap “This is my child” and the level, team and season schedule are already there.",
    video: "find", try: "/?demo&page=more&add=1" },
  { key: "coach", icon: "✦", title: "Coach G & nutrition", who: "Parents (Pro)",
    problem: "Parents don't know what to work on, how to handle nerves, or what to feed a kid on a 10-hour meet day.",
    how: "An AI coach that knows your athlete's scores, level and next event. One tap for a meet-day food plan, practice fueling or a week of meals.",
    video: "coach", try: "/?demo&page=coach&tab=nutrition" },
  { key: "photos", icon: "📸", title: "Meet photos, prints & Season Book", who: "Parents",
    problem: "Hundreds of meet photos end up scattered across phones, and many meets limit what you can share.",
    how: "Add a whole weekend at once — each photo files itself under the right meet by date. Order prints to your door, or a Season Book with every meet's photos and scores.",
    video: "photos", try: "/?demo&page=photos" },
  { key: "gym", icon: "🏛️", title: "One place for the gym and its families", who: "Gym owners",
    problem: "Group texts, paper schedules and the same questions over and over.",
    how: "Roster, season schedule, announcements with a short summary for every family, and a private message thread with each parent.",
    video: "gym", try: "/?demo=gym&tab=schedule" },
  { key: "tickets", icon: "🎟️", title: "Meet tickets & phone door scanning", who: "Meet organizers",
    problem: "Long lines at the ticket table, cash boxes, rented scanners — and no way to tell everyone the session is running late.",
    how: "Families buy QR tickets in a minute. Volunteers scan with their own phones — green or red, instantly. Send live updates to every ticket holder.",
    video: "tickets", try: "/?demo&page=events" },
];

// End-to-end path for testing and demos. Each step links into the demo.
export const TEST_PATH = [
  { group: "Getting started", steps: [["Open the landing page and tap “Try the parent demo”", "/?demo"], ["Pick Gymnastics, check the home screen: Coach G card, meet-day card, getting started", "/?demo"], ["Open the alerts bell and tap an alert", "/?demo"]] },
  { group: "Parent: season", steps: [["Meets → Add the whole season from a photo → choose any photo → check only your level is added", "/?demo&page=meets&snap=1"], ["Open a meet → Find host, website & session time", "/?demo&page=meets"], ["Tick items off the packing list", "/?demo&page=meets"], ["Scores → Add a score, then Pull scores online", "/?demo&page=scores"]] },
  { group: "Parent: athlete & gym", steps: [["More → ＋ Add → search “maya” → request to link", "/?demo&page=more&add=1"], ["My gym → read an announcement, send a message", "/?demo&page=gym"], ["Switch sport (top bar) → Swimming; then Family view", "/?demo"]] },
  { group: "Coach & photos", steps: [["Coach → Ask Coach G a question", "/?demo&page=coach&tab=chat"], ["Coach → Nutrition → Meet-day food plan", "/?demo&page=coach&tab=nutrition"], ["Photos → Add photos (several) → they file under the right meet", "/?demo&page=photos"], ["Photos → Order prints → check the total", "/?demo&page=photos"], ["Photos → Season Book → Make the book → Download PDF", "/?demo&page=photos"]] },
  { group: "Gym owner", steps: [["Gym demo → Overview: invite code, QR, flyer", "/?demo=gym"], ["Roster → Add athletes (paste a list) → approve a link request", "/?demo=gym&tab=roster"], ["Schedule → Add the season from a photo → Publish → Find host & times online", "/?demo=gym&tab=schedule"], ["Messages → reply to a parent; Announce → send to all families", "/?demo=gym&tab=messages"]] },
  { group: "Meet organizer & tickets", steps: [["Sell tickets → Who's coming → Live update", "/?demo&page=events"], ["Ticket page: choose tickets (checkout is off in the demo)", "/tickets/demo-listing?demo"], ["My tickets: QR codes to show at the door", "/my-tickets/demo-order?t=demo&demo"], ["Door scanner: type QC7HK2MP → green; again → red; find “demo” by name", "/door/demo-listing?k=demo&demo"]] },
  { group: "Account & info", steps: [["More → Download my data (CSV)", "/?demo&page=more"], ["Choose a plan → compare Basic and Pro", "/?demo"], ["About us and Contact us pages", "/about"], ["Log out", "/?demo&page=more"]] },
];
