/**
 * Reading a bank's activity CSV (slice h, decision H5; QuickBooks Online "Upload from file", Zoho
 * Books "Import Statement"). Pure: text in, lines out. The header row may sit below summary lines
 * (Bank of America) or be missing (Wells Fargo); amounts come as one signed column, a deposits and a
 * withdrawals column, or an amount and a type. Amounts become integer cents by reading the digits,
 * never through floating point.
 */
import { isIsoDate } from "@shiftbook/rules";
import { readCsv } from "../../exports/csv";
import type { BankMapping } from "../db/schema";

export const BANK_FILE_LIMITS = { bytes: 1_048_576, lines: 1000 } as const;

export interface BankFileLine {
  rowNumber: number;
  postedOn: string;
  description: string;
  reference: string | null;
  amountCents: number;
}

export interface BankFileProblem {
  rowNumber: number;
  /** "header": the line chosen as the header reads as a transaction (it would be left out). */
  field: "date" | "amount" | "description" | "header";
  text: string;
}

/** The file's rows (blank rows dropped), as text. */
export function bankRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const delimiter = (clean.split(/\r?\n/, 1)[0] ?? "").includes("\t") && !(clean.split(/\r?\n/, 1)[0] ?? "").includes(",") ? "\t" : ",";
  return readCsv(clean, delimiter).filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z#]+/g, " ").trim();
const HEADS = {
  date: ["posting date", "transaction date", "posted date", "date"],
  description: ["description", "details", "payee", "memo", "transaction description", "name"],
  reference: ["check or slip #", "check or slip", "check number", "check #", "reference", "ref", "transaction id", "reference number"],
  amount: ["amount", "transaction amount"],
  deposits: ["deposits", "deposit", "credit", "credits", "credit amount"],
  withdrawals: ["withdrawals", "withdrawal", "debit", "debits", "debit amount"],
  type: ["type", "transaction type", "credit debit", "dr cr"],
};

const DEBIT = /^(debit|dr|d|withdrawal|withdrawals|wd|payment|check|chk|fee|ach debit|debit card)$/i;
const CREDIT = /^(credit|cr|c|deposit|deposits|dep|ach credit|wire in|incoming wire)$/i;
/** "ACH_CREDIT" reads as "ACH CREDIT". */
const typeWord = (text: string) => text.trim().replace(/[_\s]+/g, " ");

/** The column whose header names this field, or null. */
function columnOf(header: string[], names: readonly string[]): number | null {
  const cells = header.map(norm);
  for (const name of names) {
    const i = cells.indexOf(norm(name));
    if (i >= 0) return i;
  }
  return null;
}

/**
 * The mapping the file most likely needs: the first of its first ten rows that names a date and an
 * amount (or deposits) column is the header (Zoho: the best match for each field is chosen).
 */
export function guessMapping(rows: string[][]): BankMapping | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const header = rows[r]!;
    const date = columnOf(header, HEADS.date);
    const description = columnOf(header, HEADS.description);
    const amount = columnOf(header, HEADS.amount);
    const deposits = columnOf(header, HEADS.deposits);
    const withdrawals = columnOf(header, HEADS.withdrawals);
    const type = columnOf(header, HEADS.type);
    if (date === null || description === null) continue;
    const amounts: BankMapping["amounts"] | null =
      deposits !== null && withdrawals !== null ? { kind: "split", deposits, withdrawals } : amount !== null ? { kind: "signed", amount } : null;
    if (!amounts) continue;
    const body = rows.slice(r + 1);
    // A type column only matters when the amounts carry no sign of their own, and only when what it
    // holds says credit or debit (Chase's ACH_CREDIT and CHECK_DEPOSIT are kinds of deposit, not signs).
    const unsigned = amounts.kind === "signed" && body.every((row) => !/^\s*[-(]/.test(row[amounts.amount] ?? ""));
    const types = type === null ? [] : body.map((row) => (row[type] ?? "").trim()).filter((v) => v !== "");
    const signsByType = types.length > 0 && types.every((v) => DEBIT.test(typeWord(v)) || CREDIT.test(typeWord(v)));
    return {
      headerRow: r,
      date,
      description,
      reference: columnOf(header, HEADS.reference),
      amounts: amounts.kind === "signed" && unsigned && signsByType && type !== null ? { kind: "typed", amount: amounts.amount, type } : amounts,
      // Every line's date counts: a day past 12 anywhere settles the order (review nit).
      dateFormat: guessDateFormat(body.map((row) => row[date] ?? "")),
    };
  }
  return null;
}

/**
 * A first mapping for a file whose header names nothing Granite knows (or that has none, like Wells
 * Fargo's): no header row when the first line already holds a date; the date column is the first
 * whose cells read as dates, the amount the first other whose cells read as amounts, the description
 * the one with the most words. The person checks it on the Map columns step.
 */
export function firstMapping(rows: string[][]): BankMapping {
  const columns = Math.max(1, ...rows.slice(0, 30).map((r) => r.length));
  const anyDate = (cell: string) => (["MM/DD/YYYY", "YYYY-MM-DD", "DD/MM/YYYY"] as const).some((f) => readDate(cell, f) !== null);
  const headerRow = (rows[0] ?? []).some((c) => anyDate(c)) ? null : 0;
  const body = rows.slice(headerRow === null ? 0 : 1, (headerRow === null ? 0 : 1) + 20);
  const cells = (c: number) => body.map((row) => (row[c] ?? "").trim());
  const all = Array.from({ length: columns }, (_, c) => c);
  const date = all.find((c) => cells(c).filter((v) => v !== "").length > 0 && cells(c).filter((v) => v !== "").every(anyDate)) ?? 0;
  const amount =
    all.find((c) => c !== date && cells(c).some((v) => /\d/.test(v) && (readCents(v) ?? 0) !== 0) && cells(c).every((v) => v === "" || (/\d/.test(v) && readCents(v) !== null))) ?? Math.min(date + 1, columns - 1);
  const letters = (c: number) => cells(c).reduce((sum, v) => sum + (v.match(/[a-z]/gi)?.length ?? 0), 0);
  const description = all.filter((c) => c !== date && c !== amount).sort((a, b) => letters(b) - letters(a) || a - b)[0] ?? amount;
  return { headerRow, date, description, reference: null, amounts: { kind: "signed", amount }, dateFormat: guessDateFormat(cells(date)) };
}

/**
 * A remembered mapping used on a new file: the columns as the person chose them, the header row
 * found in this file (a bank's summary lines above it vary from file to file), none when its first
 * line is already a transaction.
 */
export function alignMapping(rows: string[][], mapping: BankMapping): BankMapping {
  const guess = guessMapping(rows);
  if (guess) return { ...mapping, headerRow: guess.headerRow };
  return readDate((rows[0]?.[mapping.date] ?? "").trim(), mapping.dateFormat) !== null ? { ...mapping, headerRow: null } : mapping;
}

export function guessDateFormat(samples: string[]): BankMapping["dateFormat"] {
  if (samples.some((s) => /^\d{4}-\d{1,2}-\d{1,2}/.test(s.trim()))) return "YYYY-MM-DD";
  if (samples.some((s) => /^(1[3-9]|2\d|3[01])\/\d{1,2}\/\d{2,4}/.test(s.trim()))) return "DD/MM/YYYY";
  return "MM/DD/YYYY";
}

/** "10/05/2026", "2026-10-05", "5/10/26" → ISO, or null. */
export function readDate(text: string, format: BankMapping["dateFormat"]): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  if (format === "YYYY-MM-DD") {
    const x = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (!x) return null;
    [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  } else {
    const x = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(t);
    if (!x) return null;
    const [a, b, yy] = [Number(x[1]), Number(x[2]), x[3]!];
    [m, d] = format === "MM/DD/YYYY" ? [a, b] : [b, a];
    y = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  }
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/**
 * "1,234.56", "-1234.5", "(12.00)", "$ 7", "+3.10" → cents; "" → 0 (an empty cell); anything else
 * (three decimals, letters) → null.
 */
export function readCents(text: string): number | null {
  let t = text.trim().replace(/[$\s]/g, "").replace(/USD$/i, "");
  if (t === "") return 0;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    sign = -sign;
    t = t.slice(1);
  } else if (t.startsWith("+")) t = t.slice(1);
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? sign * cents : null;
}

/** The file's lines under a mapping, and the cells it could not read. */
export function readBankLines(rows: string[][], mapping: BankMapping): { lines: BankFileLine[]; problems: BankFileProblem[] } {
  const lines: BankFileLine[] = [];
  const problems: BankFileProblem[] = [];
  /** Lines whose date cell holds no date at all: totals and summaries, unless nothing reads (a wrong date column). */
  const undated: BankFileProblem[] = [];
  const start = mapping.headerRow === null ? 0 : mapping.headerRow + 1;
  const head = mapping.headerRow === null ? null : rows[mapping.headerRow];
  if (head && readDate((head[mapping.date] ?? "").trim(), mapping.dateFormat) !== null) problems.push({ rowNumber: mapping.headerRow! + 1, field: "header", text: (head[mapping.date] ?? "").trim() });
  for (let r = start; r < rows.length; r++) {
    const row = rows[r]!;
    const rowNumber = r + 1;
    const cell = (i: number | null) => (i === null ? "" : (row[i] ?? "").trim());
    const postedOn = readDate(cell(mapping.date), mapping.dateFormat);
    if (!postedOn) {
      // Summary and total lines after the activity (Bank of America) carry no date: left out.
      if (cell(mapping.date) === "") continue;
      if (!/\d/.test(cell(mapping.date))) {
        undated.push({ rowNumber, field: "date", text: cell(mapping.date) });
        continue;
      }
      problems.push({ rowNumber, field: "date", text: cell(mapping.date) });
      continue;
    }
    let amountCents: number | null;
    const a = mapping.amounts;
    if (a.kind === "signed") amountCents = readCents(cell(a.amount));
    else if (a.kind === "split") {
      const dep = readCents(cell(a.deposits));
      const wd = readCents(cell(a.withdrawals));
      amountCents = dep === null || wd === null ? null : Math.abs(dep) - Math.abs(wd);
    } else {
      const amt = readCents(cell(a.amount));
      const type = cell(a.type);
      amountCents = amt === null ? null : DEBIT.test(typeWord(type)) ? -Math.abs(amt) : CREDIT.test(typeWord(type)) ? Math.abs(amt) : null;
    }
    if (amountCents === null || amountCents === 0) {
      problems.push({ rowNumber, field: "amount", text: a.kind === "split" ? `${cell(a.deposits)} / ${cell(a.withdrawals)}` : cell(a.kind === "signed" ? a.amount : a.amount) });
      continue;
    }
    const description = cell(mapping.description).replace(/\s+/g, " ");
    if (description === "") {
      problems.push({ rowNumber, field: "description", text: "" });
      continue;
    }
    lines.push({ rowNumber, postedOn, description: description.slice(0, 500), reference: cell(mapping.reference).slice(0, 100) || null, amountCents });
  }
  // Nothing read at all: the date column is likely the wrong one, so each line says why (review nit).
  if (lines.length === 0) problems.push(...undated);
  return { lines, problems: problems.sort((a, b) => a.rowNumber - b.rowNumber) };
}
