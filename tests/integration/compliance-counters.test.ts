/**
 * The Illinois hours counters with opening balances (slice j step 3a, decision J5). The demo: Fatima
 * Haddad has 590 hours (35,400 minutes) at Prairie Line before Shiftbook, up to 2026-07-31, and her
 * hours in the demo's paid week; she is near 720.
 */
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addOpeningBalance, balanceChoices, countersView, removeOpeningBalance } from "../../src/server/compliance/counter-balances";
import { EQUAL_PAY_KINDS } from "../../src/server/compliance/kinds";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const TODAY = "2026-10-16";
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const marcus = workerId("marcus-bell");
const prairie = clientId("il");
const view = (over: Partial<Parameters<typeof countersView>[2]> = {}) => inAgency((tx) => countersView(tx, TODAY, { clientId: null, show: "all", q: "", ...over }));

beforeEach(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("hours counters (J5)", () => {
  it("one row per worker and Illinois client; the demo's opening balance makes Fatima Haddad near 720", async () => {
    const v = await view();
    expect(v.rule).toMatchObject({ jurisdiction: "IL", triggerMinutes: 43_200, windowMonths: 12 });
    const fatima = v.rows.find((r) => r.workerId === workerId("fatima-haddad"))!;
    expect(fatima).toMatchObject({ clientName: "Prairie Line Manufacturing (demo)", balanceMinutes: 35_400, near: true, crossed720: null, windowStart12: "2025-10-17" });
    expect(fatima.minutes12).toBeGreaterThan(36_000);
    expect(fatima.balances.map((b) => [b.minutes, b.throughOn, b.by])).toEqual([[35_400, "2026-07-31", "Demo setup"]]);
    // Most hours first; the filters.
    expect(v.rows[0]!.workerId).toBe(workerId("fatima-haddad"));
    expect((await view({ show: "near" })).rows.map((r) => r.workerName)).toEqual(["Fatima Haddad"]);
    expect((await view({ show: "crossed" })).rows).toEqual([]);
    expect((await view({ q: "MARCUS" })).rows.map((r) => r.workerName)).toEqual(["Marcus Bell"]);
    // Only Illinois day and temporary labor (Harborview in Massachusetts has none).
    expect(v.clients.map((c) => c.name)).toEqual(["Prairie Line Manufacturing (demo)"]);
  });

  it("the Owner adds a balance (checked) and removes a wrong one with a reason; it stays listed", async () => {
    const input = { workerId: marcus, clientId: prairie, minutes: 6000, throughOn: "2026-06-30", note: "Payroll export from the old system" };
    expect(await inAgency((tx) => addOpeningBalance(tx, coordinator, input, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => addOpeningBalance(tx, theOwner, { ...input, minutes: 0 }, TODAY))).toEqual({ ok: false, error: "invalid", field: "minutes" });
    expect(await inAgency((tx) => addOpeningBalance(tx, theOwner, { ...input, throughOn: "2026-10-17" }, TODAY))).toEqual({ ok: false, error: "invalid", field: "throughOn" });
    expect(await inAgency((tx) => addOpeningBalance(tx, theOwner, { ...input, note: " " }, TODAY))).toEqual({ ok: false, error: "invalid", field: "note" });
    expect(await inAgency((tx) => addOpeningBalance(tx, theOwner, input, TODAY))).toEqual({ ok: true });
    let row = (await view()).rows.find((r) => r.workerId === marcus)!;
    expect(row.balanceMinutes).toBe(6000);
    const [b] = row.balances;
    expect(await inAgency((tx) => removeOpeningBalance(tx, theOwner, b!.id, ""))).toEqual({ ok: false, error: "invalid", field: "reason" });
    expect(await inAgency((tx) => removeOpeningBalance(tx, theOwner, b!.id, "Entered for the wrong worker"))).toEqual({ ok: true });
    row = (await view()).rows.find((r) => r.workerId === marcus)!;
    expect([row.balanceMinutes, row.balances.map((x) => [x.removedBy, x.removedReason])]).toEqual([0, [["Test owner", "Entered for the wrong worker"]]]);
    const events = await owner.db.select().from(s.auditEvents).where(eq(s.auditEvents.entityType, "hours_opening_balance"));
    expect(events.map((e) => e.action).sort()).toEqual(["create", "update"]);
    expect((await inAgency((tx) => balanceChoices(tx))).some((c) => c.workerId === marcus && c.clientId === prairie)).toBe(true);
  });

  it("the run counts a balance: 715 hours before Shiftbook and a week of work cross 720 on the Monday at noon", async () => {
    // 42,900 minutes up to 2026-10-04; Monday 2026-10-05 8 h → 43,380 > 43,200, so it crosses Monday at 7:00 + 300 min = 12:00.
    await inAgency((tx) => addOpeningBalance(tx, theOwner, { workerId: marcus, clientId: prairie, minutes: 42_900, throughOn: "2026-10-04", note: "Before Shiftbook" }, TODAY));
    // Only this week counts: the demo's earlier week is set aside.
    await owner.db.update(s.timeEntries).set({ status: "rejected" }).where(eq(s.timeEntries.workerId, marcus));
    for (const d of ["2026-10-05", "2026-10-06"]) {
      await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: periodId("w2"), workerNameRaw: "Marcus Bell", workerId: marcus, assignmentId: assignmentId("marcus-bell"), workDate: d, inMinute: 420, outMinute: 900, breakMinutes: 0, minutes: 480, confidence: "high", status: "reviewed" });
    }
    await inAgency((tx) => computeRun(tx, theOwner, periodId("w2")));
    const [o] = await owner.db.select().from(s.obligations).where(and(inArray(s.obligations.kind, [...EQUAL_PAY_KINDS]), eq(s.obligations.workerId, marcus)));
    expect([o?.kind, o?.crossedOn, (o?.facts as s.ObligationEvidence).crossedAtMinute]).toEqual(["il_equal_pay_720h", "2026-10-05", 720]);
    const row = (await view()).rows.find((r) => r.workerId === marcus)!;
    expect([row.crossed720, row.dutyId, row.near]).toEqual(["2026-10-05", o!.id, false]);
  });
});
