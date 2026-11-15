import React from "react";
import { TERMS, PLANS, TIERS, TIER_ORDER, COMPARE, money, perMonth, savings, pricesFor } from "../data/plans.js";

// Four plan lengths side by side, with the per-month price and the saving.
export default function PlanPicker({ kind = "parent", value, onChange, compact = false }) {
  return (
    <div className={`plan-grid ${compact ? "compact" : ""}`} role="radiogroup" aria-label={`${kind === "gym" ? PLANS.gym.name : `AthleteOrbit ${(TIERS[kind] || TIERS.plus).name}`} plan length`}>
      {TERMS.map((t) => {
        const save = savings(kind, t.key);
        const best = t.key === "yearly";
        return (
          <button type="button" key={t.key} role="radio" aria-checked={value === t.key} className={`plan-card ${value === t.key ? "on" : ""}`} onClick={() => onChange?.(t.key)}>
            {best && <span className="plan-flag">Best value</span>}
            <span className="plan-term">{t.label}</span>
            <span className="plan-price">{money(pricesFor(kind)[t.key])}</span>
            <span className="plan-per">{t.months > 1 ? `${money(Math.round(perMonth(kind, t.key) * 100) / 100)}/mo` : "per month"}</span>
            {save > 0 ? <span className="plan-save">Save {save}%</span> : <span className="plan-save muted-save">Cancel anytime</span>}
          </button>
        );
      })}
    </div>
  );
}

// Basic / Plus / Pro cards. Picking one updates the term prices below it.
export function TierPicker({ value, onChange, term = "monthly", highlight }) {
  return (
    <div className="tier-grid" role="radiogroup" aria-label="Plan">
      {Object.entries(TIERS).map(([k, t]) => (
        <button type="button" key={k} role="radio" aria-checked={value === k} className={`tier-card tier-${k} ${value === k ? "on" : ""} ${highlight === k ? "need" : ""}`} onClick={() => onChange?.(k)}>
          {t.popular && <span className="plan-flag">Most popular</span>}
          <span className="tier-name">{t.name}</span>
          <span className="tier-tag">{t.tagline}</span>
          <span className="tier-price">{money(t.prices.monthly)}<small>/mo</small></span>
          <ul>{t.features.map((f) => <li key={f}>{f}</li>)}</ul>
        </button>
      ))}
    </div>
  );
}

// The simple way to choose: Monthly or Yearly, then one of three plans. 3- and 6-month terms stay one tap away.
export function SimplePlans({ tier, onTier, plan, onPlan, need, current }) {
  const [more, setMore] = React.useState(["quarterly", "semiannual"].includes(plan));
  const [compare, setCompare] = React.useState(false);
  const yearly = plan === "yearly";
  return (
    <div className="simple-plans">
      <div className="bill-toggle" role="radiogroup" aria-label="How often to pay">
        <button type="button" role="radio" aria-checked={plan === "monthly"} className={plan === "monthly" ? "on" : ""} onClick={() => onPlan("monthly")}>Monthly</button>
        <button type="button" role="radio" aria-checked={yearly} className={yearly ? "on" : ""} onClick={() => onPlan("yearly")}>Yearly <span className="save-pill">Save {savings(tier, "yearly")}%</span></button>
      </div>
      {more ? <div className="term-more">{TERMS.filter((t) => ["quarterly", "semiannual"].includes(t.key)).map((t) => <button type="button" key={t.key} className={`chip ${plan === t.key ? "on" : ""}`} onClick={() => onPlan(t.key)}>{t.label} · {money(pricesFor(tier)[t.key])}</button>)}</div>
        : <button type="button" className="link small center" onClick={() => setMore(true)}>Pay every 3 or 6 months instead</button>}
      <div className="plan-rows" role="radiogroup" aria-label="Plan">
        {TIER_ORDER.map((k) => {
          const t = TIERS[k]; const pm = Math.round(perMonth(k, plan) * 100) / 100;
          return (
            <button type="button" key={k} role="radio" aria-checked={tier === k} className={`plan-row ${tier === k ? "on" : ""} ${need === k ? "need" : ""}`} onClick={() => onTier(k)}>
              <span className="radio" aria-hidden />
              <span className="grow">
                <span className="plan-row-top"><b>{t.name}</b>{t.popular && <span className="pop">Most popular</span>}{current === k && <span className="pop cur">Your plan</span>}</span>
                <span className="plan-row-tag">{t.tagline}</span>
                <span className="plan-row-list">{t.highlights.map((h) => <span key={h}>✓ {h}</span>)}</span>
              </span>
              <span className="plan-row-price"><b>{money(pm)}</b><small>/mo</small>{plan !== "monthly" && <small className="billed">{money(t.prices[plan])} {plan === "yearly" ? "yearly" : `per ${TERMS.find((x) => x.key === plan).label.toLowerCase()}`}</small>}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="link small center" onClick={() => setCompare(!compare)}>{compare ? "Hide" : "Compare all"} features</button>
      {compare && <div className="tbl-wrap"><table className="tbl compare"><thead><tr><th></th>{TIER_ORDER.map((k) => <th key={k}>{TIERS[k].name}</th>)}</tr></thead>
        <tbody>{COMPARE.map(([label, need2]) => <tr key={label}><td>{label}</td>{TIER_ORDER.map((k) => <td key={k} className="center">{TIER_ORDER.indexOf(k) >= TIER_ORDER.indexOf(need2) ? "✓" : "–"}</td>)}</tr>)}</tbody></table></div>}
    </div>
  );
}
