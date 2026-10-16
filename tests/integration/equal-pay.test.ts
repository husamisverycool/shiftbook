/**
 * Slice (c) step 5 through the weekly run: the Illinois equal-pay counter (820 ILCS 175/42) reads the
 * hours worked in earlier periods, records the 720-hour crossing as an obligation due before the next
 * pay period, keeps it in step when the run's hours change, and never records it twice.
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@shiftbook/rules";
import { agencies, assignments, auditEvents, obligations, payPeriods, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { addEntry } from "../../src/server/review/service";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const period = periodId("w2"); // Monday 2026-10-05 to Sunday 2026-10-11
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const marcus = workerId("marcus-bell");

beforeEach(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

/** 105 earlier days of 6h 40m at Prairie Line (42,000 minutes, 700 hours), paid in an earlier period; the demo's own earlier week is set aside so the count is exact. */
async function earlierHours() {
  await inAgency((tx) => tx.update(timeEntries).set({ status: "rejected" }).where(and(eq(timeEntries.workerId, marcus), lt(timeEntries.workDate, "2026-10-05"))));
  const [assignment] = await inAgency((tx) => tx.select().from(assignments).where(eq(assignments.workerId, marcus)));
  const [old] = await inAgency((tx) => tx.insert(payPeriods).values({ agencyId: actor.agencyId, startsOn: "2025-11-03", endsOn: "2025-11-09" }).returning());
  await inAgency((tx) =>
    tx.insert(timeEntries).values(
      Array.from({ length: 105 }, (_, i) => ({ agencyId: actor.agencyId, payPeriodId: old!.id, workerNameRaw: "Marcus Bell", workerId: marcus, assignmentId: assignment!.id, workDate: addDays("2025-11-02", i), minutes: 400, status: "locked" as const })),
    ),
  );
}

async function weekOfWork() {
  const ids: string[] = [];
  for (const day of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]) {
    const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: marcus, workDate: day, inMinute: 420, outMinute: 900, breakMinutes: 0 }, ["other"], "test week"));
    if (!added.ok) throw new Error(added.error);
    ids.push(added.entryId);
  }
  return ids;
}

describe("the Illinois equal-pay counter through the weekly run", () => {
  it("records the 720-hour crossing as an obligation due before the next pay period, once", async () => {
    const since = new Date();
    await earlierHours();
    const ids = await weekOfWork();
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.filter((b) => b.workerId === marcus)).toEqual([]);
    const codes = run.warnings.filter((w) => w.workerId === marcus).map((w) => w.code);
    expect(codes).toContain("equal_pay_obligation");
    expect(codes).toContain("equal_pay_rate_missing");
    const rows = await inAgency((tx) => tx.select().from(obligations));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "il_equal_pay_720h", jurisdiction: "IL", workerId: marcus, clientId: clientId("il"), payRunId: run.runId, crossedOn: "2026-10-07", dueOn: "2026-10-12", status: "open" });
    expect(rows[0]!.evidence).toMatchObject({ crossedAtMinute: 660, windowStart: "2025-10-08", thresholdMinutes: 43_200, minutesAfter: 1200, entryIds: ids.slice(2).sort() });
    expect(rows[0]!.message).toContain("Prairie Line");

    // Computing again changes nothing and logs nothing new.
    await inAgency((tx) => computeRun(tx, actor, period));
    expect(await inAgency((tx) => tx.select().from(obligations))).toHaveLength(1);
    const logged = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "obligation"), eq(auditEvents.action, "create"), gte(auditEvents.occurredAt, since))));
    expect(logged).toHaveLength(1);
  });

  it("moves the crossing when the run's hours change, and logs the change", async () => {
    const since = new Date();
    await earlierHours();
    const ids = await weekOfWork();
    await inAgency((tx) => computeRun(tx, actor, period));
    await inAgency((tx) => tx.update(timeEntries).set({ status: "rejected" }).where(eq(timeEntries.id, ids[2]!)));
    await inAgency((tx) => computeRun(tx, actor, period));
    const rows = await inAgency((tx) => tx.select().from(obligations));
    expect(rows.map((r) => [r.crossedOn, r.evidence.crossedAtMinute, r.evidence.minutesAfter])).toEqual([["2026-10-08", 660, 720]]);
    const actions = (await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "obligation"), gte(auditEvents.occurredAt, since))))).map((e) => e.action).sort();
    expect(actions).toEqual(["create", "create", "delete"]);
  });

  it("does not count earlier hours on clerical work, or warn without earlier hours", async () => {
    await earlierHours();
    const [assignment] = await inAgency((tx) => tx.select().from(assignments).where(eq(assignments.workerId, marcus)));
    await owner.db.execute(`update job_orders set day_and_temporary_labor = false where id = '${assignment!.jobOrderId}'`);
    await weekOfWork();
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.warnings.filter((w) => w.workerId === marcus && w.code.includes("equal_pay"))).toEqual([]);
    expect(await inAgency((tx) => tx.select().from(obligations))).toEqual([]);
  });
});
