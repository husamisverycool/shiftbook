/**
 * Reading a sample of the payroll system's own import file (decision 0040; Avionté's mapping step:
 * "create a mapping from a file"): the columns are checked against the layout Granite writes, and the
 * company's own codes and ids in it are offered, so the agency sets Granite up from a file it already
 * has. Pure: the settings page reads the file in the browser and nothing is sent or kept.
 */
import { readCsv } from "./csv";
import { PAYCHEX_HEADER } from "./paychex-flex";
import { PAYLOCITY_HEADER } from "./paylocity";

export interface SampleReading {
  /** The file's columns are the layout Granite writes (with or without its header row). */
  layoutMatches: boolean;
  /** Paychex: the client id on the data rows, when every row has the same one. */
  clientId: string | null;
  /** The pay codes found, in order of first appearance. */
  codes: string[];
  rows: number;
  /** What does not match, in plain words. */
  problems: string[];
}

const norm = (h: string) => h.trim().toLowerCase();

export function readPayrollSample(format: "paychex_flex_csv" | "paylocity_time_csv", text: string): SampleReading {
  const header: readonly string[] = format === "paychex_flex_csv" ? PAYCHEX_HEADER : PAYLOCITY_HEADER;
  const codeAt = format === "paychex_flex_csv" ? 4 : 2;
  const rows = readCsv(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim() !== ""));
  const problems: string[] = [];
  if (rows.length === 0) return { layoutMatches: false, clientId: null, codes: [], rows: 0, problems: ["The file is empty."] };
  const first = rows[0]!;
  const hasHeader = first.length >= header.length && header.every((h, i) => norm(first[i] ?? "") === norm(h));
  const data = hasHeader ? rows.slice(1) : rows;
  // Paychex reads its first 16 (Deltek) or 17 (Paychex's overview) columns; extra empty columns are allowed.
  const width = data.reduce((m, r) => Math.max(m, r.length), first.length);
  const layoutMatches = (hasHeader || data.every((r) => r.length >= header.length)) && width >= header.length;
  if (!hasHeader && first.some((c) => /[a-z]/i.test(c) && header.map(norm).includes(norm(c)))) problems.push(`The columns are not in the order ${format === "paychex_flex_csv" ? "Paychex" : "Paylocity"} reads them: ${header.join(", ")}.`);
  else if (!layoutMatches) problems.push(`Expected ${header.length} columns (${header.join(", ")}); the file has ${width}.`);
  const codes: string[] = [];
  for (const r of data) {
    const code = (r[codeAt] ?? "").trim();
    if (code && !codes.includes(code)) codes.push(code);
  }
  let clientId: string | null = null;
  if (format === "paychex_flex_csv") {
    const ids = new Set(data.map((r) => (r[0] ?? "").trim()).filter(Boolean));
    if (ids.size === 1) clientId = [...ids][0]!;
    else if (ids.size > 1) problems.push("The file holds more than one client id; Granite writes one.");
  }
  return { layoutMatches, clientId, codes, rows: data.length, problems };
}
