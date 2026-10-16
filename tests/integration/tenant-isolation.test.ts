import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencies, authTokens, clients, sessions, TENANT_TABLES, timeEntries, payPeriods, userLogins, users } from "../../src/server/db/schema";
import { databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
let agencyA = "";
let agencyB = "";

beforeAll(async () => {
  const [a] = await owner.db.insert(agencies).values({ name: "Agency A (test)" }).returning();
  const [b] = await owner.db.insert(agencies).values({ name: "Agency B (test)" }).returning();
  agencyA = a!.id;
  agencyB = b!.id;
  await owner.db.insert(clients).values([
    { agencyId: agencyA, name: "A client 1", code: "A1" },
    { agencyId: agencyA, name: "A client 2", code: "A2" },
    { agencyId: agencyB, name: "B client 1", code: "B1" },
  ]);
  const [periodB] = await owner.db
    .insert(payPeriods)
    .values({ agencyId: agencyB, startsOn: "2026-10-05", endsOn: "2026-10-11" })
    .returning();
  await owner.db.insert(timeEntries).values({
    agencyId: agencyB,
    payPeriodId: periodB!.id,
    workerNameRaw: "B worker",
    minutes: 480,
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("tenant isolation (SPEC §21)", () => {
  it("has row-level security enabled and forced on every table with an agency_id", async () => {
    const rows = await owner.db.execute<{ relname: string; rls: boolean; forced: boolean }>(sql`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind = 'r'
        and exists (select 1 from information_schema.columns col
                    where col.table_schema = 'public' and col.table_name = c.relname
                      and col.column_name = 'agency_id')
      order by c.relname`);
    const tables = rows.map((r) => r.relname);
    expect(tables.sort()).toEqual([...TENANT_TABLES].sort());
    for (const row of rows) {
      expect({ table: row.relname, rls: row.rls, forced: row.forced }).toEqual({
        table: row.relname,
        rls: true,
        forced: true,
      });
    }
  });

  it("shows agency A only its own clients and its own agency row", async () => {
    await app.withAgency(agencyA, async (tx) => {
      const visibleClients = await tx.select().from(clients);
      expect(visibleClients.map((c) => c.code).sort()).toEqual(["A1", "A2"]);
      const visibleAgencies = await tx.select().from(agencies);
      expect(visibleAgencies.map((a) => a.id)).toEqual([agencyA]);
      expect(await tx.select().from(timeEntries)).toHaveLength(0);
    });
  });

  it("shows nothing at all when no agency is set", async () => {
    expect(await app.db.select().from(clients)).toHaveLength(0);
    expect(await app.db.select().from(agencies)).toHaveLength(0);
    expect(await app.db.select().from(timeEntries)).toHaveLength(0);
  });

  it("refuses to write a row into another agency", async () => {
    const message = await databaseError(
      app.withAgency(agencyA, (tx) => tx.insert(clients).values({ agencyId: agencyB, name: "sneaky", code: "X" })),
    );
    expect(message).toMatch(/violates row-level security policy/);
  });

  it("cannot change or delete another agency's rows, even by id", async () => {
    const [bClient] = await owner.db.select().from(clients).where(eq(clients.code, "B1"));
    await app.withAgency(agencyA, async (tx) => {
      const updated = await tx.update(clients).set({ name: "hijacked" }).where(eq(clients.id, bClient!.id)).returning();
      expect(updated).toHaveLength(0);
      const deleted = await tx.delete(clients).where(eq(clients.id, bClient!.id)).returning();
      expect(deleted).toHaveLength(0);
    });
    const [still] = await owner.db.select().from(clients).where(eq(clients.id, bClient!.id));
    expect(still!.name).toBe("B client 1");
  });

  it("keeps another agency's logins, sessions and sign-in links out of reach of an agency's transaction (decision 0025)", async () => {
    const [bUser] = await owner.db.insert(users).values({ agencyId: agencyB, name: "B person", email: "b.person@b.example", role: "owner" }).returning();
    await owner.db.insert(userLogins).values({ userId: bUser!.id, agencyId: agencyB, email: "b.person@b.example" });
    await owner.db.insert(sessions).values({ agencyId: agencyB, userId: bUser!.id, tokenHash: "a".repeat(64), expiresAt: new Date(Date.now() + 60_000) });
    await owner.db.insert(authTokens).values({ agencyId: agencyB, userId: bUser!.id, purpose: "reset", tokenHash: "b".repeat(64), createdByLabel: "test", expiresAt: new Date(Date.now() + 60_000) });
    await app.withAgency(agencyA, async (tx) => {
      expect(await tx.select().from(userLogins)).toHaveLength(0);
      expect(await tx.select().from(sessions)).toHaveLength(0);
      expect(await tx.select().from(authTokens)).toHaveLength(0);
      const moved = await tx.update(sessions).set({ endedAt: new Date() }).returning();
      expect(moved).toHaveLength(0);
    });
    // Sign-in mode is set for one transaction only, and only by the sign-in service.
    await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.auth', 'on', true)`);
      expect(await tx.select().from(sessions).where(eq(sessions.agencyId, agencyB))).toHaveLength(1);
    });
    expect(await app.db.select().from(sessions)).toHaveLength(0);
    expect(await app.db.select().from(userLogins)).toHaveLength(0);
  });

  it("does not leak the agency setting between transactions", async () => {
    await app.withAgency(agencyA, async (tx) => {
      expect(await tx.select().from(clients)).toHaveLength(2);
    });
    expect(await app.db.select().from(clients)).toHaveLength(0);
  });
});
