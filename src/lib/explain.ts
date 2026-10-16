/**
 * A duty's "worked out from" line as a message key and its values (decision 0028), so each screen
 * says it in the reader's language. The English `message` stays the record; the generator's tests
 * render every case's English template with PLAIN and check it is that exact sentence. Pure: the
 * screens and the tests share it.
 */
import { formatClock, formatDuration, formatHours } from "@shiftbook/rules";

/** A value: text as it is, or a date, a length of time, a count, hours, a clock time, month-days or a language to write the reader's way. */
export type ExplainValue = string | { date: string } | { duration: number } | { count: number } | { hours: number } | { clock: number } | { monthDays: string[] } | { language: string };

export interface ExplainPart {
  key: string;
  values?: Record<string, ExplainValue>;
}

export interface Explain {
  /** Said one after the other (each key under `compliance.explain`). */
  parts: ExplainPart[];
  /** Added at the end as "(citation)." — none when the parts carry their own. */
  citation: string | null;
  /** The rule whose citation it is, so a screen can show the citation in the reader's language. */
  citationCode?: string | null;
}

export interface ExplainFormat {
  date: (iso: string) => string;
  duration: (minutes: number) => string;
  count: (n: number) => string;
  hours: (minutes: number) => string;
  clock: (minute: number) => string;
  monthDays: (mmdd: string[]) => string;
  language: (code: string) => string;
}

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The stored English sentence's own way of writing values (ISO dates, "12h 30m", "1,800"). */
export const PLAIN: ExplainFormat = {
  date: (d) => d,
  duration: formatDuration,
  count: thousands,
  hours: formatHours,
  clock: formatClock,
  monthDays: (l) => l.join(", "),
  language: (c) => c,
};

/**
 * The reader's way: their language's dates, numbers, month names and language names; a length of time
 * as every screen writes hours, "670:00", in both languages (the stored English keeps "670h 00m").
 */
export function readerFormat(locale: string, units: { hours: (n: number) => string }): ExplainFormat {
  // US Spanish groups thousands as US English does ("4,160"), as the citations write them.
  const number = new Intl.NumberFormat(locale.startsWith("es") ? "es-US" : locale);
  const duration = (minutes: number) => `${minutes < 0 ? "-" : ""}${Math.trunc(Math.abs(minutes) / 60)}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
  return {
    date: (d) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)),
    duration,
    count: (n) => number.format(n),
    hours: (minutes) => (minutes % 60 === 0 ? units.hours(minutes / 60) : duration(minutes)),
    clock: (minute) => new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(minute / 60), minute % 60))),
    monthDays: (l) => l.map((md) => new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`2000-${md}T00:00:00Z`))).join(", "),
    language: (c) => {
      try {
        return new Intl.DisplayNames(locale, { type: "language" }).of(c) ?? c;
      } catch {
        return c;
      }
    },
  };
}

function valueText(v: ExplainValue, f: ExplainFormat): string {
  if (typeof v === "string") return v;
  if ("date" in v) return f.date(v.date);
  if ("duration" in v) return f.duration(v.duration);
  if ("count" in v) return f.count(v.count);
  if ("hours" in v) return f.hours(v.hours);
  if ("clock" in v) return f.clock(v.clock);
  if ("monthDays" in v) return f.monthDays(v.monthDays);
  return f.language(v.language);
}

/**
 * The line in a language: `t` reads `compliance.explain.<key>` in it; `cite`, when given, says a rule's
 * citation in it (the stored text otherwise). `withoutCitation`: the facts alone, as one sentence, for a
 * page that gives the rule's citation beside them (compliance/[id].md: About lists what the duty was
 * worked out from; What the law asks gives the citation).
 */
export function renderExplain(e: Explain, t: (key: string, values: Record<string, string>) => string, f: ExplainFormat, cite?: (code: string, stored: string) => string, opts: { withoutCitation?: boolean } = {}): string {
  const said = e.parts.map((p) => t(p.key, Object.fromEntries(Object.entries(p.values ?? {}).map(([k, v]) => [k, valueText(v, f)])))).join("");
  if (!e.citation) return said;
  if (opts.withoutCitation) return `${said}.`;
  return `${said} (${cite && e.citationCode ? cite(e.citationCode, e.citation) : e.citation}).`;
}
