// Builds the family's alert list from data already in the app (no server needed).
import { db, api } from "./db.js";
import { today, fmt } from "../ui.jsx";
import { seasonOf, budgetStatus } from "../data/family.js";

export async function loadFamily() {
  const [gymnasts, meets, costs, budgets, events, imports, practice] = await Promise.all([
    db.list("gymnasts"), db.list("meets"), db.list("costs"), db.list("budgets"), db.list("family_events"), db.list("score_imports").catch(() => []), db.list("practice_logs").catch(() => []),
  ]);
  return { gymnasts, meets, costs, budgets, events, imports, practice };
}

export function buildAlerts({ gymnasts, meets, costs, budgets, events, imports = [], practice = [] }, announcements = []) {
  const t = today(), name = (id) => gymnasts.find((g) => g.id === id)?.name || "Family";
  const out = [];
  const wk = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  for (const g of gymnasts) {
    const pain = practice.filter((p) => p.gymnast_id === g.id && p.practiced_on >= wk && Number(p.pain) >= 3);
    if (pain.length >= 2 || pain.some((p) => Number(p.pain) >= 6)) out.push({ level: "warn", icon: "🩹", go: ["skills", { gymnastId: g.id, tab: "practice" }], text: `${g.name} reported pain ${pain.length}× this week${pain[0]?.pain_area ? ` (${pain[0].pain_area})` : ""} — worth a doctor or PT check` });
  }
  for (const i of imports.filter((x) => x.status === "pending")) out.push({ level: "urgent", icon: "🎉", go: ["scores", { gymnastId: i.gymnast_id }], text: `${name(i.gymnast_id)}'s scores${i.data?.scores?.meet_name ? ` from ${i.data.scores.meet_name}` : ""} are in — review & save` });
  const unpaid = costs.filter((c) => !c.paid);
  if (unpaid.length) out.push({ level: "warn", icon: "💵", go: ["costs"], text: `${fmt.money(unpaid.reduce((a, c) => a + Number(c.amount), 0))} unpaid across ${unpaid.length} item${unpaid.length > 1 ? "s" : ""}` });
  for (const m of meets) {
    if (m.status === "Skipped" || m.status === "Completed") continue;
    const d = fmt.daysUntil(m.start_date);
    if (m.entry_deadline && m.status === "Planned") {
      const dd = fmt.daysUntil(m.entry_deadline);
      if (dd >= 0 && dd <= 7) out.push({ level: "urgent", icon: "⏰", go: ["meets", { meetId: m.id }], text: `Entry deadline for ${m.name} (${name(m.gymnast_id)}) ${dd === 0 ? "is today" : `in ${dd} day${dd > 1 ? "s" : ""}`}` });
    }
    if (d >= 0 && d <= 14) {
      const list = Array.isArray(m.checklist) ? m.checklist : [];
      const left = list.filter((i) => !i.done).length;
      out.push({ level: d <= 2 ? "urgent" : "info", icon: "🏅", go: ["meets", { meetId: m.id }], text: `${name(m.gymnast_id)}: ${m.name} ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}${d <= 3 && left ? ` · ${left} items not packed` : ""}` });
    }
  }
  // Family events (birthdays, trips) no longer raise alerts — only sport events, deadlines, money and gym posts do.
  for (const b of budgetStatus(budgets, costs, seasonOf(t))) {
    if (b.pct >= 0.9) out.push({ level: b.pct >= 1 ? "urgent" : "warn", icon: "📊", go: ["costs"], text: `${b.gymnast_id ? name(b.gymnast_id) : "Family"} ${b.category || "budget"}: ${fmt.money(b.spent)} of ${fmt.money(b.amount)} (${Math.round(b.pct * 100)}%)` });
  }
  let seen = ""; try { seen = localStorage.getItem("gp-ann-seen") || ""; } catch {}
  for (const a of announcements) if (a.created_at > seen) out.push({ level: "info", icon: "📣", go: ["news"], text: `Gym announcement: ${a.title}` });
  const rank = { urgent: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

export async function loadAnnouncements() {
  try { return (await api("news", null, "GET")).announcements || []; } catch { return []; }
}
