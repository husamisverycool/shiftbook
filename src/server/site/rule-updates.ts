/**
 * The website's "rule changes, before they happen" card (slice aa; docs/patterns/site.md, after
 * Linear's changelog and Ramp's live counters): the minimum-wage rows of Tabulado's own dated rule tables
 * for the states it covers — the changes still to come, then the latest that took effect.
 */
import { toDayNumber } from "@shiftbook/rules";
import { REFERENCE_MINIMUM_WAGE_RULES } from "../rules/reference-data";
import { SITE_STATES, type SiteState } from "./state-week";

export interface RuleUpdate {
  state: SiteState;
  /** A city or county the rate is for; null for the whole state. */
  scope: string | null;
  rateCents: number;
  effectiveFrom: string;
  /** Days from today to the change; zero or less once it is in force. */
  daysUntil: number;
  citation: string;
}

export function ruleUpdates(today: string, limit = 4): RuleUpdate[] {
  const rows = REFERENCE_MINIMUM_WAGE_RULES.filter((r): r is typeof r & { jurisdiction: SiteState } => (SITE_STATES as readonly string[]).includes(r.jurisdiction)).map((r) => ({
    state: r.jurisdiction,
    scope: r.scopeName ?? null,
    rateCents: r.rateCents,
    effectiveFrom: r.effectiveFrom,
    daysUntil: toDayNumber(r.effectiveFrom) - toDayNumber(today),
    citation: r.citation,
  }));
  const upcoming = rows.filter((r) => r.daysUntil > 0).sort((a, b) => a.daysUntil - b.daysUntil || a.state.localeCompare(b.state));
  const latest = rows.filter((r) => r.daysUntil <= 0).sort((a, b) => b.daysUntil - a.daysUntil || (a.scope ?? "").localeCompare(b.scope ?? ""));
  return [...upcoming, ...latest].slice(0, limit);
}
