/**
 * Civil-date arithmetic on ISO strings without the Date object (the engine never reads a clock).
 * Day numbers count from 1970-01-01 = 0. Algorithms: H. Hinnant, "chrono-Compatible Low-Level Date
 * Algorithms" (days_from_civil / civil_from_days).
 */
import { floorDiv, mod } from "./int";
import type { IsoDate, Weekday } from "./types";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = floorDiv(y, 400);
  const yoe = y - era * 400;
  const mp = mod(month + 9, 12);
  const doy = floorDiv(153 * mp + 2, 5) + day - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146_097 + doe - 719_468;
}

function civilFromDays(days: number): [number, number, number] {
  const z = days + 719_468;
  const era = floorDiv(z, 146_097);
  const doe = z - era * 146_097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36_524) - floorDiv(doe, 146_096), 365);
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const day = doy - floorDiv(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return [year, month, day];
}

export function isIsoDate(value: string): boolean {
  const m = ISO.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [y2, mo2, d2] = civilFromDays(daysFromCivil(y, mo, d));
  return y === y2 && mo === mo2 && d === d2;
}

export function toDayNumber(date: IsoDate): number {
  const m = ISO.exec(date);
  if (!m || !isIsoDate(date)) throw new Error(`not an ISO date: ${date}`);
  return daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function fromDayNumber(days: number): IsoDate {
  const [y, m, d] = civilFromDays(days);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function weekdayOf(date: IsoDate): Weekday {
  return mod(toDayNumber(date) + 4, 7) as Weekday; // 1970-01-01 was a Thursday
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + n);
}

/** First day of the workweek (fixed, recurring 7-day period, 29 C.F.R. § 778.105) containing `date`. */
export function workweekStart(date: IsoDate, startsOn: Weekday): IsoDate {
  const days = toDayNumber(date);
  return fromDayNumber(days - mod(mod(days + 4, 7) - startsOn, 7));
}

/** True when `date` falls inside [from, to] (to = null means open-ended). ISO strings sort by date. */
export function isEffective(date: IsoDate, from: IsoDate, to: IsoDate | null): boolean {
  return from <= date && (to === null || date <= to);
}
