/**
 * Parsing of values as written on timesheets. Integer-only: hours like "9.05" become whole minutes
 * through string arithmetic, never through floating point.
 */
import { isIsoDate, roundHalfUp } from "@shiftbook/rules";

export interface ClockReading {
  /** Minutes after midnight. Without AM/PM, a 12-hour reading is returned as written (1:00–12:59 → 60–779). */
  minute: number;
  meridiem: "AM" | "PM" | "24h" | null;
}

/** "5:58 AM" → 358; "3:31 PM" → 931; "23:30" → 1410 (24h); "11:30" → 690 with no meridiem. */
export function parseClockText(text: string): ClockReading | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*([AaPp]\.?\s*[Mm]\.?)?\s*$/.exec(text);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (minute > 59) return null;
  const mer = m[3]?.replace(/[.\s]/g, "").toUpperCase() as "AM" | "PM" | undefined;
  if (mer) {
    if (hour < 1 || hour > 12) return null;
    const h = (hour % 12) + (mer === "PM" ? 12 : 0);
    return { minute: h * 60 + minute, meridiem: mer };
  }
  if (hour > 23) return null;
  if (hour >= 13 || hour === 0) return { minute: hour * 60 + minute, meridiem: "24h" };
  return { minute: hour * 60 + minute, meridiem: null };
}

/** "10/05/2026" or "10/5/26" → "2026-10-05"; impossible dates → null. */
export function parseUsDate(text: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/.exec(text);
  if (!m) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${String(year).padStart(4, "0")}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/** "2026-10-05" → itself if real. */
export function parseIsoDateText(text: string): string | null {
  const t = text.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && isIsoDate(t) ? t : null;
}

/** Decimal hours as written → whole minutes, rounded half-up: "9.05" → 543, "7.5" → 450, "0.62" → 37. */
export function parseDecimalHours(text: string): number | null {
  const m = /^\s*(\d{1,3})(?:\.(\d{1,4}))?\s*$/.exec(text);
  if (!m) return null;
  const whole = Number(m[1]);
  const fraction = m[2] ?? "";
  const scale = 10 ** fraction.length;
  const numerator = (whole * scale + (fraction ? Number(fraction) : 0)) * 60;
  return roundHalfUp(numerator, scale);
}

/** Whole minutes as written ("30") → 30. */
export function parseWholeMinutes(text: string): number | null {
  const m = /^\s*(\d{1,4})\s*$/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * A pair of clock readings without AM/PM can mean several times of day. Returns every in/out
 * interpretation whose shift lasts more than 0 and at most 16 hours, without crossing midnight.
 */
export function clockInterpretations(inR: ClockReading, outR: ClockReading): { inMinute: number; outMinute: number }[] {
  const options = (r: ClockReading) => (r.meridiem === null ? [r.minute % 720, (r.minute % 720) + 720] : [r.minute]);
  const result: { inMinute: number; outMinute: number }[] = [];
  for (const i of options(inR)) {
    for (const o of options(outR).concat(outR.minute === 720 && outR.meridiem === null ? [1440] : [])) {
      const out = o === 0 ? 1440 : o;
      if (out > i && out - i <= 16 * 60) result.push({ inMinute: i, outMinute: out });
    }
  }
  return result;
}
