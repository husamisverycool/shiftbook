/**
 * Display formatting for the screens. Money stays integer cents until it is shown: the amount is
 * handed to Intl as an exact decimal string, never as a floating-point number.
 */
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 2437 → "40:37"; null → "—". */
export function hoursMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(minutes);
  return `${sign}${Math.trunc(m / 60)}:${pad2(m % 60)}`;
}

/** Minutes after midnight → a clock time in the locale ("7:00 AM" / "7:00"); 1440 is midnight. */
export function clock(minute: number | null, locale: string): string {
  if (minute === null) return "—";
  const d = new Date(Date.UTC(2000, 0, 1, Math.trunc(minute / 60) % 24, minute % 60));
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
}

/**
 * The locale numbers and money are written in: US Spanish writes them as US pay stubs and banks do
 * ("$1,234.56", CLDR es-US), as the explanations already group numbers (decision 0028).
 */
export const numberLocale = (locale: string): string => (locale.startsWith("es") ? "es-US" : locale);

/** Integer cents → "$1,234.56" in both languages, exactly. */
export function money(cents: number, locale: string): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const exact = `${sign}${Math.trunc(abs / 100)}.${pad2(abs % 100)}`;
  return new Intl.NumberFormat(numberLocale(locale), { style: "currency", currency: "USD" }).format(exact as Intl.StringNumericLiteral);
}

/** A difference: "+$36.50", "-$54.75", "$0.00" (slice e corrections). */
export function signedMoney(cents: number, locale: string): string {
  const abs = Math.abs(cents);
  const exact = `${cents < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${pad2(abs % 100)}`;
  return new Intl.NumberFormat(numberLocale(locale), { style: "currency", currency: "USD", signDisplay: "exceptZero" }).format(exact as Intl.StringNumericLiteral);
}

/** A difference in hours: "+2:00", "-1:30", "0:00". */
export function signedHours(minutes: number): string {
  return minutes > 0 ? `+${hoursMinutes(minutes)}` : hoursMinutes(minutes);
}

/** "2026-10-05" → "Mon, Oct 5". */
export function shortDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/** "2026-10-05" → "October 5, 2026". */
export function longDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/** A pay period: "Oct 5 – 11, 2026" / "5–11 oct 2026". */
export function dateRange(start: string, end: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).formatRange(new Date(`${start}T00:00:00Z`), new Date(`${end}T00:00:00Z`));
}

/** "7:30", "07:30", "7:30 PM", "19:30" → minutes after midnight; null when not a time. */
export function parseClock(text: string): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  const ap = m[3]?.toLowerCase();
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "a" && h === 12) h = 0;
    if (ap === "p" && h !== 12) h += 12;
  } else if (h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}
