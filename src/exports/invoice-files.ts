/**
 * Files made with each invoice (slice g): the invoice's lines as CSV (decision G8: the Beeline
 * default invoice fields Tabulado has) and the SAP Fieldglass supplier "Time Sheet Invoice Upload"
 * (decision G9; research §4.2: header components, one blank line, the column headings, the rows).
 * Pure: the invoice's issued lines in, bytes out. Amounts are the invoice's cents, never recomputed.
 */
import { addDays, formatCents, roundHalfUpBig, type Fraction } from "@shiftbook/rules";
import { writeCsv } from "./csv";
import { ExportError } from "./errors";
import { twoDecimals } from "./lines";

export interface InvoiceFileLine {
  /** Names the worker in a refusal, so the run can offer to skip them. */
  workerId?: string;
  workerName: string;
  worksite: string | null;
  poNumber: string | null;
  workweekStart: string;
  type: string;
  minutes: number;
  rate: Fraction;
  amountCents: number;
  /** The Fieldglass time sheets the line's hours came from, and the worker's Fieldglass id. */
  timeSheetIds?: string[];
  vmsWorkerId?: string | null;
}

export interface InvoiceFileInput {
  number: string;
  issuedOn: string;
  period: { startsOn: string; endsOn: string };
  lines: InvoiceFileLine[];
}

/**
 * A name or PO the agency typed, written so a spreadsheet opening the CSV never reads it as a formula
 * (OWASP CSV injection: a leading =, +, -, @, tab or carriage return gets a leading apostrophe).
 */
const text = (value: string | null) => (value === null ? "" : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

/** 6234 → "62.34"; −2650 → "-26.50". */
const signed2 = (n: number) => (n < 0 ? `-${twoDecimals(-n)}` : twoDecimals(n));
/** Minutes as decimal hours to two places, rounded half up (display only; the minutes column is exact). */
const hours = (minutes: number) => signed2(Number(roundHalfUpBig(BigInt(Math.abs(minutes)) * 100n, 60n)) * (minutes < 0 ? -1 : 1));
/** Cents per hour → dollars with four decimals, rounded half up. */
const rate4 = (r: Fraction) => {
  const t = roundHalfUpBig(BigInt(r.num) * 100n, BigInt(r.den)).toString().padStart(5, "0");
  return `${t.slice(0, -4)}.${t.slice(-4)}`;
};
const weekEnding = (start: string, period: { endsOn: string }) => {
  const end = addDays(start, 6);
  return end > period.endsOn ? period.endsOn : end;
};

export const INVOICE_CSV_HEADER = ["Invoice Number", "Invoice Date", "Period Start", "Period End", "Worker", "Worksite", "PO Number", "Week Ending", "Earning Type", "Hours", "Minutes", "Rate", "Amount"] as const;

export function invoiceCsv(input: InvoiceFileInput): Uint8Array {
  const rows: string[][] = [[...INVOICE_CSV_HEADER]];
  for (const l of input.lines) {
    rows.push([
      input.number,
      input.issuedOn,
      input.period.startsOn,
      input.period.endsOn,
      text(l.workerName),
      text(l.worksite),
      text(l.poNumber),
      weekEnding(l.workweekStart, input.period),
      l.type,
      hours(l.minutes),
      String(l.minutes),
      rate4(l.rate),
      signed2(l.amountCents),
    ]);
  }
  return writeCsv(rows, { eol: "\r\n" });
}

export const FIELDGLASS_COLUMNS = ["Invoice Code", "TIMESHEET ID", "Job Seeker ID", "Paid Amount", "Total Billing Amount"] as const;

/**
 * One row per Fieldglass time sheet: its billing total is the sum of the invoice lines whose hours
 * came from it. A line whose hours came from no time sheet, or from two, cannot be placed: refused,
 * naming the worker.
 */
export function fieldglassUpload(input: InvoiceFileInput): Uint8Array {
  const sheets = new Map<string, { worker: string | null; cents: number }>();
  for (const l of input.lines) {
    const ids = [...new Set(l.timeSheetIds ?? [])];
    const week = weekEnding(l.workweekStart, input.period);
    if (ids.length === 0) throw new ExportError("missing_payroll_id", `${l.workerName}: the ${l.type} line for the week ending ${week} has hours that did not come from a SAP Fieldglass time sheet, so the upload cannot bill them on one. Upload the client's time sheet download for these hours, or turn this client's VMS file off.`, l.workerId);
    if (ids.length > 1) throw new ExportError("unsupported_earning_type", `${l.workerName}: the ${l.type} line for the week ending ${week} has hours from two SAP Fieldglass time sheets (${ids.join(", ")}), and its amount cannot be split between them.`, l.workerId);
    const s = sheets.get(ids[0]!) ?? { worker: text(l.vmsWorkerId ?? null) || null, cents: 0 };
    s.cents += l.amountCents;
    sheets.set(ids[0]!, s);
  }
  const rows: string[][] = [["Type", "Time Sheet Invoice Upload"], ["Transaction", "True"], [], [...FIELDGLASS_COLUMNS]];
  for (const [id, s] of [...sheets].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (s.cents < 0) throw new ExportError("invalid_pay_line", `Time sheet ${id} would be billed ${formatCents(s.cents)}; a Fieldglass upload invoices approved time sheets, never credits.`);
    rows.push([input.number, id, s.worker ?? "", "0.00", signed2(s.cents)]);
  }
  return writeCsv(rows, { eol: "\r\n" });
}
