import { createHash } from "node:crypto";
import type { BankFileLine } from "./bank-csv";

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
