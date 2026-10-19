/**
 * New Jersey's primary-language pay statement (SPEC §16): a temporary laborer placed in New Jersey
 * whose primary language is not English gets the pay statement in that language too (Temporary
 * Workers' Bill of Rights, N.J.S.A. 34:8D-3; NJDOL publishes the forms in several languages).
 * Tabulado writes pay stubs in English and Spanish; another language is flagged for the agency.
 */
import { eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

export const PAY_STATEMENT_CITATION = "N.J.S.A. 34:8D-3 (Temporary Workers' Bill of Rights: notices and statements in the laborer's primary language)";

/** The language the worker's pay statements must also be in, or null when English is enough. */
export function payStatementLanguage(placedStates: string[], preferredLanguage: string): string | null {
  if (!placedStates.includes("NJ")) return null;
  const lang = preferredLanguage.trim().toLowerCase();
  return lang === "" || lang === "en" ? null : lang;
}

/** The pay stub's language: the worker's own when the flag asks for one Tabulado writes (Spanish). */
export function payStubLocale(flag: string | null, requested: "en" | "es"): "en" | "es" {
  return flag === "es" ? "es" : requested;
}

/** The states a worker has been placed in (their job orders' worksites). */
export async function placedStates(tx: Tx, workerId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ state: s.worksites.state })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .where(eq(s.assignments.workerId, workerId));
  return rows.map((r) => r.state);
}
