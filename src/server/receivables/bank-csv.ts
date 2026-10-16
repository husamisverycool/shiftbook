/**
 * Reading a bank's activity CSV (slice h, decision H5; QuickBooks Online "Upload from file", Zoho
 * Books "Import Statement"). Pure: text in, lines out. The header row may sit below summary lines
 * (Bank of America) or be missing (Wells Fargo); amounts come as one signed column, a deposits and a
 * withdrawals column, or an amount and a type. Amounts become integer cents by reading the digits,
 * never through floating point.
 */
import { createHash } from "node:crypto";
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
  field: "date" | "amount" | "description";
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
    const sample = rows.slice(r + 1, r + 6).map((row) => row[date] ?? "");
    // A type column only matters when the amounts carry no sign of their own.
    const unsigned = amounts.kind === "signed" && rows.slice(r + 1).every((row) => !/^\s*[-(]/.test(row[amounts.amount] ?? ""));
    return {
      headerRow: r,
      date,
      description,
      reference: columnOf(header, HEADS.reference),
      amounts: amounts.kind === "signed" && unsigned && type !== null ? { kind: "typed", amount: amounts.amount, type } : amounts,
      dateFormat: guessDateFormat(sample),
    };
  }
  return null;
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

const DEBIT = /^(debit|dr|d|withdrawal|withdrawals|wd|payment|check|chk|fee|ach debit|debit card)$/i;
const CREDIT = /^(credit|cr|c|deposit|deposits|dep|ach credit|wire in|incoming wire)$/i;

/** The file's lines under a mapping, and the cells it could not read. */
export function readBankLines(rows: string[][], mapping: BankMapping): { lines: BankFileLine[]; problems: BankFileProblem[] } {
  const lines: BankFileLine[] = [];
  const problems: BankFileProblem[] = [];
  const start = mapping.headerRow === null ? 0 : mapping.headerRow + 1;
  for (let r = start; r < rows.length; r++) {
    const row = rows[r]!;
    const rowNumber = r + 1;
    const cell = (i: number | null) => (i === null ? "" : (row[i] ?? "").trim());
    const postedOn = readDate(cell(mapping.date), mapping.dateFormat);
    if (!postedOn) {
      // Summary and total lines after the activity (Bank of America) carry no date: left out.
      if (cell(mapping.date) === "" || !/\d/.test(cell(mapping.date))) continue;
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
      amountCents = amt === null ? null : DEBIT.test(type) ? -Math.abs(amt) : CREDIT.test(type) ? Math.abs(amt) : null;
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
  return { lines, problems };
}

/**
 * A line's identity across imports: its date, amount, description and reference, and which of the
 * file's identical lines it is (two identical deposits on one day are two lines).
 */
export function fingerprints(lines: BankFileLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const key = [l.postedOn, l.amountCents, l.description.toLowerCase(), (l.reference ?? "").toLowerCase()].join("|");
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return createHash("sha256").update(`${key}|${n}`).digest("hex");
  });
}
