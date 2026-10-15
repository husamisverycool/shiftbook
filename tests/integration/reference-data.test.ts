import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { jurisdictionRules, minimumWageRules, overtimeRules } from "../../src/server/db/schema";
import {
  REFERENCE_JURISDICTION_RULES,
  REFERENCE_MINIMUM_WAGE_RULES,
  REFERENCE_OVERTIME_RULES,
} from "../../src/server/rules/reference-data";
import { openAppDb } from "./helpers";

const app = openAppDb();
afterAll(() => app.close());

const sortBy = <T>(rows: T[], key: (r: T) => string) => [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

describe("reference wage-rule data in the database matches src/server/rules/reference-data.ts", () => {
  it("overtime rules", async () => {
    const rows = await app.db.select().from(overtimeRules);
    const fromDb = rows.map((r) => ({
      jurisdiction: r.jurisdiction,
      ruleCode: r.ruleCode,
      kind: r.kind,
      thresholdMinutes: r.thresholdMinutes,
      multiplier: { num: r.multiplierNum, den: r.multiplierDen },
      earningType: r.earningType,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      citation: r.citation,
    }));
    const key = (r: { jurisdiction: string; ruleCode: string }) => `${r.jurisdiction}:${r.ruleCode}`;
    expect(sortBy(fromDb, key)).toEqual(sortBy(REFERENCE_OVERTIME_RULES, key));
  });

  it("jurisdiction rules (with local scope)", async () => {
    const rows = await app.db.select().from(jurisdictionRules);
    const fromDb = rows.map(({ jurisdiction, county, city, ruleCode, effectiveFrom, effectiveTo, citation }) => ({
      jurisdiction,
      county,
      city,
      ruleCode,
      effectiveFrom,
      effectiveTo,
      citation,
    }));
    const key = (r: { jurisdiction: string; county?: string | null; city?: string | null; ruleCode: string }) =>
      `${r.jurisdiction}:${r.county ?? ""}:${r.city ?? ""}:${r.ruleCode}`;
    expect(sortBy(fromDb, key)).toEqual(sortBy(REFERENCE_JURISDICTION_RULES, key));
  });

  it("minimum wage rules", async () => {
    const rows = await app.db.select().from(minimumWageRules);
    const fromDb = rows.map(({ jurisdiction, county, city, rateCents, effectiveFrom, effectiveTo, citation }) => ({
      jurisdiction,
      county,
      city,
      rateCents,
      effectiveFrom,
      effectiveTo,
      citation,
    }));
    const key = (r: { jurisdiction: string; effectiveFrom: string }) => `${r.jurisdiction}:${r.effectiveFrom}`;
    expect(sortBy(fromDb, key)).toEqual(sortBy(REFERENCE_MINIMUM_WAGE_RULES, key));
  });
});

describe("app role privileges", () => {
  it("can read every table in the schema", async () => {
    const tables = await app.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '__drizzle_migrations'`,
    );
    for (const { table_name } of tables) {
      const [row] = await app.db.execute<{ ok: boolean }>(
        sql`select has_table_privilege('shiftbook_app', ${`public.${table_name}`}, 'SELECT') as ok`,
      );
      expect({ table: table_name, select: row!.ok }).toEqual({ table: table_name, select: true });
    }
  });
});
