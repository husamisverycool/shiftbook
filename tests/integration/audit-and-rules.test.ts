import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencies, auditEvents, jurisdictionRules, overtimeRules } from "../../src/server/db/schema";
import { databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
let agencyId = "";

beforeAll(async () => {
  const [a] = await owner.db.insert(agencies).values({ name: "Audit test agency" }).returning();
  agencyId = a!.id;
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("audit log is append-only (SPEC §19)", () => {
  it("accepts new events from the app", async () => {
    await app.withAgency(agencyId, (tx) =>
      tx.insert(auditEvents).values({
        agencyId,
        actorLabel: "test",
        action: "create",
        entityType: "client",
        entityId: "c-1",
        after: { name: "x" },
      }),
    );
    const rows = await owner.db.select().from(auditEvents).where(eq(auditEvents.agencyId, agencyId));
    expect(rows).toHaveLength(1);
  });

  it("rejects updates and deletes from the app", async () => {
    expect(
      await databaseError(app.withAgency(agencyId, (tx) => tx.update(auditEvents).set({ reason: "rewrite history" }))),
    ).toMatch(/permission denied for table audit_events/);
    expect(await databaseError(app.withAgency(agencyId, (tx) => tx.delete(auditEvents)))).toMatch(
      /permission denied for table audit_events/,
    );
  });

  it("rejects updates and deletes even from the schema owner", async () => {
    expect(await databaseError(owner.db.update(auditEvents).set({ reason: "rewrite history" }))).toMatch(
      /audit_events is append-only \(UPDATE rejected\)/,
    );
    expect(await databaseError(owner.db.delete(auditEvents))).toMatch(/audit_events is append-only \(DELETE rejected\)/);
  });
});

describe("reference wage-rule data", () => {
  it("is readable by the app and carries a citation on every row", async () => {
    const rules = await app.db.select().from(overtimeRules);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r.citation.length).toBeGreaterThan(10);
    const juris = await app.db.select().from(jurisdictionRules);
    expect(new Set(juris.map((j) => j.jurisdiction))).toEqual(new Set(["US", "IL", "MA", "CA"]));
  });

  it("cannot be changed by the app", async () => {
    expect(await databaseError(app.db.execute(sql`update overtime_rules set threshold_minutes = 1`))).toMatch(
      /permission denied for table overtime_rules/,
    );
  });
});
