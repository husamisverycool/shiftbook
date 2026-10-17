/**
 * Agency settings: effective-dated values in a data table, never literals in code (CLAUDE.md).
 */
import { eq } from "drizzle-orm";
import type { Tx } from "./db/client";
import * as s from "./db/schema";

const effective = (date: string, from: string, to: string | null) => from <= date && (to === null || date <= to);

/** The agency setting in effect on a date (one row at most). */
export async function settingOn<T>(tx: Tx, key: string, date: string): Promise<T | undefined> {
  const rows = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, key));
  const inEffect = rows.filter((r) => effective(date, r.effectiveFrom, r.effectiveTo));
  if (inEffect.length > 1) throw new Error(`Agency setting ${key} has ${inEffect.length} rows in effect on ${date}.`);
  return inEffect[0]?.value as T | undefined;
}

/** The date in a time zone as YYYY-MM-DD; an unknown zone is read as UTC rather than failing the page. */
export function dateIn(zone: unknown, now: Date): string {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", { timeZone: typeof zone === "string" ? zone : "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    format = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  }
  const part = (type: string) => format.formatToParts(now).find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The agency's time zone setting, as screens show moments in it; missing or unknown → UTC (as agencyToday reads it). */
export async function agencyZone(tx: Tx, now: Date = new Date()): Promise<string> {
  const zone = await settingOn<unknown>(tx, "time_zone", now.toISOString().slice(0, 10));
  if (typeof zone !== "string") return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

/** Today's date where the agency is (its time zone setting), as YYYY-MM-DD. */
export async function agencyToday(tx: Tx, now: Date = new Date()): Promise<string> {
  return dateIn(await settingOn<unknown>(tx, "time_zone", now.toISOString().slice(0, 10)), now);
}
