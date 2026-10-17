/**
 * An invoice line's detail ("Regular · week of October 5, 2026") as parts a screen can say in the
 * reader's language, as decision 0030 does for the engine's messages: read from the line as issued
 * (its kind of pay, its week and its PO) and kept only when those parts, said in English, give
 * exactly the detail the PDF printed. Otherwise the screen shows the printed English. The PDF and
 * the stored text stay as issued.
 */
import en from "../../../messages/en.json";
import { fill, longDate } from "../files/invoice-documents";

const t = en.invoice;
export type EarningKey = keyof typeof t.earning;

export interface LineDetailParts {
  type: EarningKey;
  /** Overtime the client's settings do not bill ("Overtime (not billable)"). */
  notBillable: boolean;
  /** The workweek's first day (YYYY-MM-DD). */
  week: string;
  /** The line's PO when the invoice prints one on each line: its number, or "none". */
  po: { po: string } | "none" | null;
  /** A correction's hours before and after, as printed ("8:00"). */
  wasNow: { was: string; now: string } | null;
}

const SEPARATOR = " · ";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "was {was} h, now {now} h" → a pattern that reads the two values back.
const WAS_NOW = new RegExp(`^${escape(t.wasNow).replace(escape("{was}"), "(.+?)").replace(escape("{now}"), "(.+?)")}$`);

/** The parts said in English, as the run printed them. */
export function lineDetailEnglish(p: LineDetailParts): string {
  return [
    `${t.earning[p.type]}${p.notBillable ? ` (${t.notBillable})` : ""}`,
    fill(t.weekOf, { date: longDate(p.week) }),
    ...(p.po === "none" ? [t.noPo] : p.po ? [fill(t.poLine, { po: p.po.po })] : []),
    ...(p.wasNow ? [fill(t.wasNow, p.wasNow)] : []),
  ].join(SEPARATOR);
}

export function lineDetailParts(printed: string, line: { type: string; workweekStart: string; poNumber: string | null }): LineDetailParts | null {
  if (!Object.hasOwn(t.earning, line.type)) return null;
  const type = line.type as EarningKey;
  const parts = printed.split(SEPARATOR);
  const notBillable = parts[0] === `${t.earning[type]} (${t.notBillable})`;
  let po: LineDetailParts["po"] = null;
  let wasNow: LineDetailParts["wasNow"] = null;
  let at = 2;
  if (line.poNumber !== null && parts[at] === fill(t.poLine, { po: line.poNumber })) {
    po = { po: line.poNumber };
    at++;
  } else if (parts[at] === t.noPo) {
    po = "none";
    at++;
  }
  const hours = parts[at] === undefined ? null : WAS_NOW.exec(parts[at]!);
  if (hours) wasNow = { was: hours[1]!, now: hours[2]! };
  const read: LineDetailParts = { type, notBillable, week: line.workweekStart, po, wasNow };
  return lineDetailEnglish(read) === printed ? read : null;
}
