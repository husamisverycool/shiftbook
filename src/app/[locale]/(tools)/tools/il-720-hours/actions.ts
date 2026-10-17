"use server";

// The free Illinois 720-hour checker (docs/patterns/tools/il-720-hours.md; SPEC §27 item 2). Anyone
// may use it, with no account. Stateless: the file is read, counted and forgotten — nothing is
// stored, and nothing from it is logged (not even on failure).
import { isIsoDate } from "@shiftbook/rules";
import { tableFromCsv, tableFromXlsx } from "@/server/intake/structured";
import { checkHours, MAX_ROWS, parseHoursTable, type Column, type PairResult, type RowProblem } from "@/server/tools/il-hours";

export type CheckResult =
  | { ok: true; pairs: PairResult[]; problems: RowProblem[]; days: number; asOf: string }
  | { ok: false; error: "missing"; missing: Column[] }
  | { ok: false; error: "unreadable" | "tooLarge" | "empty" | "nothing" | "generic" };

const MAX_BYTES = 5 * 1024 * 1024;

/** Rows pasted from a spreadsheet arrive tab-separated; a CSV's commas are read as CSV. */
function pastedTable(text: string): string[][] {
  if (text.includes("\t")) return text.split(/\r?\n/).map((line) => line.split("\t"));
  const t = tableFromCsv(new TextEncoder().encode(text));
  return [t.header, ...t.rows];
}

export async function checkHoursAction(form: FormData): Promise<CheckResult> {
  try {
    const asOfRaw = form.get("asOf");
    const asOf = typeof asOfRaw === "string" && isIsoDate(asOfRaw) ? asOfRaw : new Date().toISOString().slice(0, 10);
    const file = form.get("file");
    const pasted = form.get("pasted");
    let table: string[][] = [];
    let rowNumbers: number[] | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return { ok: false, error: "tooLarge" };
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isXlsx = /\.xlsx$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b);
      try {
        const t = isXlsx ? await tableFromXlsx(bytes, { dates: "iso" }) : tableFromCsv(bytes);
        table = [t.header, ...t.rows];
        rowNumbers = t.rowNumbers;
      } catch {
        return { ok: false, error: "unreadable" };
      }
    } else if (typeof pasted === "string" && pasted.trim() !== "") {
      if (pasted.length > MAX_BYTES) return { ok: false, error: "tooLarge" };
      table = pastedTable(pasted.trim());
    } else return { ok: false, error: "nothing" };
    if (table.length - 1 > MAX_ROWS) return { ok: false, error: "tooLarge" };
    const parsed = parseHoursTable(table, rowNumbers);
    if (parsed.missing.length > 0) return { ok: false, error: "missing", missing: parsed.missing };
    if (parsed.rows.length === 0) return { ok: false, error: "empty" };
    const { pairs } = checkHours(parsed.rows, asOf);
    const rank = { over: 0, near: 1, ok: 2 } as const;
    pairs.sort((a, b) => rank[a.status] - rank[b.status] || b.minutes12 - a.minutes12 || a.worker.localeCompare(b.worker));
    return { ok: true, pairs, problems: parsed.problems.slice(0, 200), days: parsed.rows.length, asOf };
  } catch {
    return { ok: false, error: "generic" };
  }
}
