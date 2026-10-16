/** "2026-08-03" → "Aug 3, 2026" / "3 ago 2026": a date in a table. */
export function mediumDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/** When something happened, in the person's own time zone: "Oct 16, 2026, 3:04 PM". */
export function mediumDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
