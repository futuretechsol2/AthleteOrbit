// Sport catalog. Everything that changes by sport lives here: wording, levels, skills,
// result metrics, packing lists, colors and what the AI coach knows.
// Skill lists are typical benchmarks to help parents follow progress; coaches decide readiness.
import { SKILLS as GYM_SKILLS, LEVELS as GYM_LEVELS, skillKey } from "./skills.js";

export const SPORTS = {
  Gymnastics: {
    icon: "🤸", color: "#FF6B5B", tint: "#FFE9E4",
    event: "Meet", events: "Meets", results: "Scores", level: "Level",
    gymnastics: true, photoImport: true, video: true,
    coach: "a veteran gymnastics club coach and experienced judge (USA Gymnastics Development Program Levels 1-10 for girls and boys, and Xcel)",
    packing: ["Competition leo / uniform", "Team warm-ups", "Grips + wrist bands", "Tape and pre-wrap", "Water bottle", "Healthy snacks", "Hair kit: gel, hairspray, clips", "Flip-flops or slides", "Warm layer for waiting", "Cash or card for admission and parking", "Meet info: session time, address, report time"],
  },
  Swimming: {
    icon: "🏊", color: "#1E88E5", tint: "#E3F0FC",
    event: "Meet", events: "Meets", results: "Times", level: "Group",
    photoImport: true, video: true,
    coach: "an experienced age-group swim coach (USA Swimming age-group meets, short and long course)",
    levels: ["Learn to swim", "Novice", "Age group", "Senior / high school"],
    metrics: [["50 Free", "sec", "lower"], ["100 Free", "sec", "lower"], ["50 Back", "sec", "lower"], ["50 Breast", "sec", "lower"], ["50 Fly", "sec", "lower"], ["100 IM", "sec", "lower"], ["200 Free", "sec", "lower"]],
    skills: {
      "Learn to swim": { Water: ["Blow bubbles and float on back", "Front glide with kick, 5 m"], Freestyle: ["Freestyle 25 m with side breathing"], Backstroke: ["Backstroke 25 m"] },
      Novice: { Freestyle: ["Bilateral breathing", "High-elbow catch"], Backstroke: ["Steady head, continuous arms"], Breaststroke: ["Legal breaststroke kick", "Pull-breathe-kick-glide timing"], Starts: ["Dive from the block", "Streamline off every wall"] },
      "Age group": { Freestyle: ["Flip turn", "6-beat kick through the race"], Butterfly: ["Legal butterfly 25 m", "Two kicks per stroke"], Breaststroke: ["Legal pullout"], Starts: ["Backstroke start", "Underwater dolphin kicks off walls"], Racing: ["Legal IM transitions", "Even pacing in 100s"] },
      "Senior / high school": { Racing: ["Negative split 200s", "Race-pace sets at goal pace"], Turns: ["Fast open turns on breast/fly", "5+ dolphin kicks off every wall"], Starts: ["Relay exchange starts"], Training: ["Dryland strength routine", "Reading the pace clock on intervals"] },
    },
    packing: ["Team suit + a spare", "Goggles x2", "Swim cap x2", "Towels x2", "Team shirt and warm-ups", "Flip-flops", "Sharpie for heat/lane on arm", "Water bottle", "Healthy snacks", "Warm layer / parka", "Folding chair for deck or stands", "Heat sheet / Meet Mobile app"],
  },
  "Cheer & Dance": {
    icon: "📣", color: "#AB47BC", tint: "#F4E8F7",
    event: "Competition", events: "Competitions", results: "Scores", level: "Level",
    photoImport: true, video: true,
    coach: "an experienced all-star cheer and competitive dance coach and judge (cheer levels 1-7; dance by age division and style)",
    levels: ["Cheer Level 1", "Cheer Level 2", "Cheer Level 3", "Cheer Level 4", "Cheer Level 5+", "Dance – Beginner", "Dance – Intermediate", "Dance – Advanced"],
    metrics: [["Routine score", "pts", "higher"], ["Placement", "place", "lower"], ["Deductions", "pts", "lower"]],
    skills: {
      "Cheer Level 1": { Tumbling: ["Forward and backward roll", "Cartwheel", "Round-off"], Stunts: ["Prep level stunt", "Thigh stand"], Jumps: ["Toe touch with arms"] },
      "Cheer Level 2": { Tumbling: ["Back walkover", "Standing back handspring"], Stunts: ["Extended prep", "Half-twist up to prep"], Jumps: ["Toe touch to back handspring"] },
      "Cheer Level 3": { Tumbling: ["Round-off back handspring back tuck", "Standing back handspring series"], Stunts: ["Extended liberty", "Full-twist down from prep"] },
      "Cheer Level 4": { Tumbling: ["Round-off back handspring layout", "Standing back tuck"], Stunts: ["Extended stretch / bow-and-arrow", "Full up to extended"] },
      "Cheer Level 5+": { Tumbling: ["Round-off back handspring full", "Standing full or back-handspring full"], Stunts: ["Double-down dismount", "Extended single-leg with release"] },
      "Dance – Beginner": { Technique: ["Chaîné turns across the floor", "Single pirouette"], Leaps: ["Split leap", "Grand battement"], Performance: ["Counts and musicality", "Facials and projection"] },
      "Dance – Intermediate": { Technique: ["Double pirouette", "Fouetté prep"], Leaps: ["Switch leap", "Calypso"], Flexibility: ["Center split", "Needle / tilt"] },
      "Dance – Advanced": { Technique: ["Multiple fouettés", "Turn sequences (à la seconde)"], Leaps: ["Switch leap with ring", "Tour jeté"], Performance: ["Clean formations and spacing", "Choreography retention under pressure"] },
    },
    packing: ["Uniform / costume", "Bow / hair accessories", "Cheer or dance shoes", "Makeup kit", "Hairspray, brush, bobby pins", "Team warm-ups", "Water bottle", "Healthy snacks", "Safety pins and a small sewing kit", "Competition schedule and check-in time"],
  },
  Soccer: {
    icon: "⚽", color: "#2E9E5B", tint: "#E3F4EA",
    event: "Game", events: "Games", results: "Stats", level: "Age group",
    photoImport: false, video: true,
    coach: "an experienced youth soccer coach (recreational, travel and academy, U8-U19)",
    levels: ["U8", "U10", "U12", "U14", "U16+"],
    metrics: [["Goals", "goals", "higher"], ["Assists", "assists", "higher"], ["Minutes played", "min", "higher"], ["Shots on target", "shots", "higher"], ["Saves", "saves", "higher"]],
    skills: {
      U8: { "Ball control": ["Dribble with both feet", "Stop the ball with the sole"], Passing: ["Inside-foot pass 5 m"], Play: ["Spread out, don't bunch"] },
      U10: { "Ball control": ["First touch away from pressure", "Cut and turn moves"], Passing: ["Pass with weaker foot"], Shooting: ["Laces shot on target"] },
      U12: { Passing: ["One-touch passing", "Driven pass 20 m"], Defending: ["Jockey and delay"], Tactics: ["Know your position's role"] },
      U14: { Passing: ["Switching the field", "Through balls"], Shooting: ["Finish first time"], Fitness: ["Repeat sprints"], Tactics: ["Pressing as a unit"] },
      "U16+": { Tactics: ["Shape in and out of possession", "Set-piece roles"], Technique: ["Long passing both feet", "Heading with power"], Fitness: ["90-minute fitness"] },
    },
    packing: ["Jersey, shorts, socks", "Cleats", "Shin guards", "Ball", "Water bottle", "Snacks", "Warm layer / rain jacket", "Folding chair for parents", "Field address and kickoff time"],
  },
  Basketball: {
    icon: "🏀", color: "#E67E22", tint: "#FCEEDF",
    event: "Game", events: "Games", results: "Stats", level: "Age group",
    photoImport: false, video: true,
    coach: "an experienced youth basketball coach (recreational, AAU and school teams)",
    levels: ["Under 10", "10U-12U", "13U-14U", "High school"],
    metrics: [["Points", "pts", "higher"], ["Rebounds", "reb", "higher"], ["Assists", "ast", "higher"], ["Steals", "stl", "higher"], ["Free-throw %", "%", "higher"]],
    skills: {
      "Under 10": { Ballhandling: ["Dribble with either hand", "Stop on two feet"], Shooting: ["BEEF form shot", "Layup strong side"] },
      "10U-12U": { Ballhandling: ["Crossover", "Change of pace"], Shooting: ["Layup both sides", "Free-throw routine"], Defense: ["Stance and slides"] },
      "13U-14U": { Shooting: ["Catch-and-shoot from mid-range", "Floater"], Passing: ["Pick-and-roll reads"], Defense: ["Help-side positioning"] },
      "High school": { Shooting: ["Three-point range with legs", "Pull-up jumper"], IQ: ["Read help defense", "Run set plays"], Conditioning: ["Full-game conditioning"] },
    },
    packing: ["Jersey and shorts", "Basketball shoes", "Socks x2", "Water bottle", "Snacks", "Ankle braces / tape", "Warm-up shirt", "Gym address and game time"],
  },
  Tennis: {
    icon: "🎾", color: "#C0CA33", tint: "#F5F7DD",
    event: "Match", events: "Matches", results: "Results", level: "Level",
    photoImport: false, video: true,
    coach: "an experienced junior tennis coach (USTA junior pathway from red ball through tournament play)",
    levels: ["Red ball", "Orange ball", "Green ball", "Yellow ball / tournaments"],
    metrics: [["Matches won", "wins", "higher"], ["Games won", "games", "higher"], ["UTR rating", "UTR", "higher"], ["First-serve %", "%", "higher"], ["Double faults", "DF", "lower"]],
    skills: {
      "Red ball": { Strokes: ["Forehand rally of 5", "Backhand contact in front"], Serve: ["Underhand / basic serve in"], Movement: ["Ready position and split step"] },
      "Orange ball": { Strokes: ["Cross-court rally of 10", "Volley with continental grip"], Serve: ["Overhead serve in"], Scoring: ["Keeps score in a match"] },
      "Green ball": { Strokes: ["Topspin forehand", "Two-handed or one-handed backhand drive"], Serve: ["Second serve with spin"], Tactics: ["Hit to the open court"] },
      "Yellow ball / tournaments": { Serve: ["Kick or slice second serve", "First-serve % above 60"], Tactics: ["Construct points to the net", "Return-of-serve patterns"], "Match play": ["Between-point routine", "Handles pressure tiebreaks"] },
    },
    packing: ["Racquets x2", "Fresh can of balls", "Tennis shoes", "Hat / visor and sunscreen", "Water + electrolyte drink", "Snacks (banana, pretzels)", "Towel", "Extra shirt and socks", "Overgrip / dampener", "Draw sheet and match time"],
  },
};

export const SPORT_NAMES = Object.keys(SPORTS);
export const sportOf = (child) => (child?.program && child.program !== "Other" ? "Gymnastics" : child?.sport && SPORTS[child.sport] ? child.sport : "Gymnastics");
export const conf = (sport) => SPORTS[sport] || SPORTS.Gymnastics;

export function levelsFor(sport, program) {
  return sport === "Gymnastics" ? GYM_LEVELS[program || "WAG"] : SPORTS[sport]?.levels || [];
}

// Unified skill list for one child at one level: [{ event, skill, key }]
export function skillsForChild(child, level = child.level) {
  const sport = sportOf(child);
  const byCat = sport === "Gymnastics" ? (GYM_SKILLS[child.program] || {})[level] || {} : (SPORTS[sport]?.skills || {})[level] || {};
  const prefix = sport === "Gymnastics" ? child.program : sport;
  const out = [];
  for (const [event, list] of Object.entries(byCat)) for (const skill of list) out.push({ event, skill, key: skillKey(prefix, level, event, skill) });
  return out;
}
export function nextLevel(child) {
  const order = levelsFor(sportOf(child), child.program);
  return order[order.indexOf(child.level) + 1] || null;
}
export const usesScores = (child) => sportOf(child) === "Gymnastics";
