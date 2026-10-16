/**
 * The compliance rule rows the proposed answer keys were built from (scripts/data/compliance-rules.json)
 * are the rows the migrations store: a changed rule row means the answer keys must be proposed again.
 */
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { complianceRules } from "../../src/server/compliance/sync";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { openAppDb } from "./helpers";

const app = openAppDb();
afterAll(() => app.close());

describe("the compliance rule rows of the answer keys", () => {
  it("equal the rows the migrations store", async () => {
    const stored = await app.withAgency(DEMO_AGENCY.id, (tx) => complianceRules(tx));
    const pick = (r: Record<string, unknown>) => Object.fromEntries(["code", "jurisdiction", "area", "subjectKind", "anchor", "offsetDays", "businessDays", "remindDays", "fixedDates", "lookbackDays", "windowDays", "socGroups", "roles", "citation", "sourceUrl", "effectiveFrom", "effectiveTo"].map((k) => [k, r[k]]));
    const order = (rows: Record<string, unknown>[]) => rows.map(pick).sort((a, b) => `${a.code}|${a.effectiveFrom}`.localeCompare(`${b.code}|${b.effectiveFrom}`));
    expect(order(stored as unknown as Record<string, unknown>[])).toEqual(order(JSON.parse(readFileSync("scripts/data/compliance-rules.json", "utf8"))));
  });
});
