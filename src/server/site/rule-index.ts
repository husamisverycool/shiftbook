/**
 * The website's index of rules (slice aa; docs/patterns/site.md, after Linear's /method contents): every
 * rule Tabulado pays by, grouped by rule book (federal, then each state), each with its law, the date its
 * current version took effect when the table dates it, and the next dated version when one is on file.
 * Read straight from the reference rule tables, so the page lists exactly what the engine applies.
 */
import { toDayNumber } from "@shiftbook/rules";
import {
  REFERENCE_EQUAL_PAY_RULES,
  REFERENCE_GUARANTEE_RULES,
  REFERENCE_JURISDICTION_RULES,
  REFERENCE_MINIMUM_WAGE_RULES,
  REFERENCE_OVERTIME_RULES,
  REFERENCE_PREMIUM_RULES,
} from "../rules/reference-data";
import { SITE_STATES } from "./state-week";

export const RULE_BOOKS = ["US", ...SITE_STATES] as const;
export type RuleBook = (typeof RULE_BOOKS)[number];

/** A table row's start date when it is a real date, not the "always" placeholder. */
const ALWAYS = "2000-01-01";

export interface IndexedRule {
  code: string;
  /** A city or county, for local minimum wages. */
  scope: string | null;
  /** The law, without its gloss (the text before " — "). */
  citation: string;
  /** When the version in force today took effect; null when the table carries it as always in force. */
  since: string | null;
  rateCents: number | null;
  /** The next dated version, when one is on file. */
  next: { from: string; rateCents: number | null } | null;
}

export interface RuleBookIndex {
  book: RuleBook;
  rules: IndexedRule[];
  /** Places whose own minimum wage holds the week for a person until their rates are on file. */
  heldPlaces: number;
}

type Row = { jurisdiction: string; code: string; scope: string | null; effectiveFrom: string; effectiveTo: string | null; citation: string; rateCents: number | null };

const ROWS: Row[] = [
  ...REFERENCE_OVERTIME_RULES.map((r) => ({ jurisdiction: r.jurisdiction, code: r.ruleCode, scope: null, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, citation: r.citation, rateCents: null })),
  ...REFERENCE_MINIMUM_WAGE_RULES.map((r) => ({ jurisdiction: r.jurisdiction, code: "minimum_wage", scope: r.scopeName ?? null, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, citation: r.citation, rateCents: r.rateCents })),
  ...REFERENCE_PREMIUM_RULES.map((r) => ({ jurisdiction: r.jurisdiction, code: r.ruleCode, scope: null, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, citation: r.citation, rateCents: null })),
  ...REFERENCE_GUARANTEE_RULES.map((r) => ({ jurisdiction: r.jurisdiction, code: r.ruleCode, scope: null, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, citation: r.citation, rateCents: null })),
  ...REFERENCE_EQUAL_PAY_RULES.map((r) => ({ jurisdiction: r.jurisdiction, code: r.ruleCode, scope: null, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, citation: r.citation, rateCents: null })),
];

export function ruleIndex(today: string): RuleBookIndex[] {
  const day = toDayNumber(today);
  const inForce = (r: Row) => toDayNumber(r.effectiveFrom) <= day && (r.effectiveTo === null || toDayNumber(r.effectiveTo) >= day);
  return RULE_BOOKS.map((book) => {
    const mine = ROWS.filter((r) => r.jurisdiction === book);
    const keys = [...new Set(mine.map((r) => `${r.code}|${r.scope ?? ""}`))];
    const rules = keys.flatMap((key): IndexedRule[] => {
      const versions = mine.filter((r) => `${r.code}|${r.scope ?? ""}` === key).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      const current = versions.find(inForce);
      if (!current) return [];
      const next = versions.find((r) => toDayNumber(r.effectiveFrom) > day);
      return [
        {
          code: current.code,
          scope: current.scope,
          citation: current.citation.split(" — ")[0]!,
          since: current.effectiveFrom === ALWAYS ? null : current.effectiveFrom,
          rateCents: current.rateCents,
          next: next ? { from: next.effectiveFrom, rateCents: next.rateCents } : null,
        },
      ];
    });
    const heldPlaces = REFERENCE_JURISDICTION_RULES.filter((r) => r.jurisdiction === book && r.ruleCode === "local_minimum_wage").length;
    return { book, rules, heldPlaces };
  });
}
