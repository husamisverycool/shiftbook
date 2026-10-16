import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { acaRows } from "../../src/server/compliance/aca";
import { wantedObligations, type GenerateInput } from "../../src/server/compliance/generate";
import { packet, type PacketLine, type PacketOrder } from "../../src/server/compliance/wc-packet";

/**
 * Compliance answer keys (slice j "Done means" 5): the duties and their dates from the rule rows, the
 * ACA full-time test, and the workers' comp premium split. Each case holds its whole input, the rule
 * rows included, and the exact output.
 */
export type ComplianceCase = { name: string; summary: string } & (
  | { kind: "duties"; input: GenerateInput; expected: unknown }
  | { kind: "aca"; input: Parameters<typeof acaRows>[0]; expected: ReturnType<typeof acaRows> }
  | { kind: "wc_packet"; input: { lines: PacketLine[]; order: PacketOrder }; expected: ReturnType<typeof packet> }
);

export function loadComplianceCases(dir: string): ComplianceCase[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ComplianceCase);
}

export function computeCompliance(c: ComplianceCase): unknown {
  switch (c.kind) {
    case "duties":
      // The English sentence and note are the record the key checks; their keys for other languages
      // (decision 0028) say the same thing, which the generator's own tests prove for every case.
      return wantedObligations(c.input).map((w) => {
        const { explain, done, ...rest } = w;
        void explain;
        return { ...rest, done: done ? { note: done.note } : null };
      });
    case "aca":
      return acaRows(c.input);
    case "wc_packet":
      return packet(c.input.lines, c.input.order);
  }
}

/** The output must equal the answer key exactly: every date, figure and explanation. */
export function checkComplianceCase(c: ComplianceCase): void {
  expect(JSON.parse(JSON.stringify(computeCompliance(c)))).toEqual(c.expected);
}
