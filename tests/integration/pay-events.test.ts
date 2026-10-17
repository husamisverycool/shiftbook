/**
 * Slice G2: pay events a person enters (missed meal, bonus), a rate card's shift differential and
 * minimum day, and holiday policies — each through the weekly run, audited, with hand arithmetic.
 * Luis Hernandez (California, $19.50/h) works 8 hours on Thursday October 8, 2026.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agencies, auditEvents, billLines, bonuses, clientBillingProfiles, payLines, payRuns, rateCards, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { addEntry } from "../../src/server/review/service";
import { deleteHolidayPolicy, HolidayRefusedError, saveHolidayPolicy } from "../../src/server/catalog/holidays";
import { PayEventRefusedError, payEventsView, recordBonus, recordConfirmation, removePayEvent } from "../../src/server/run/pay-events";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const period = periodId("w2");
const luis = workerId("luis-hernandez");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
let assignmentId = "";

beforeEach(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
    await tx.update(clientBillingProfiles).set({ vmsFormat: null }).where(eq(clientBillingProfiles.clientId, clientId("ca")));
  });
  const added = await inAgency((tx) => addEntry(tx, actor, period, { workerId: luis, workDate: "2026-10-08", inMinute: 420, outMinute: 930, breakMinutes: 30 }, ["other"], "test week"));
  if (!added.ok) throw new Error(added.error);
  const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, added.entryId)));
  assignmentId = entry!.assignmentId!;
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

const luisLines = async (runId: string) =>
  (await inAgency((tx) => tx.select().from(payLines).where(and(eq(payLines.payRunId, runId), eq(payLines.workerId, luis))))).map((l) => [l.type, l.minutes, l.amountCents]);
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    if (e instanceof PayEventRefusedError || e instanceof HolidayRefusedError) return e instanceof PayEventRefusedError ? e.code : e.problems;
    throw e;
  }
};

describe("pay events entered by a person", () => {
  it("a confirmed missed meal period pays one hour at the regular rate; entered once, with a reason, audited, and removable", async () => {
    const meal = { workerId: luis, assignmentId, workDate: "2026-10-08", kind: "meal_period_missed" as const, scheduledMinutes: null, reassigned: false, reason: "Supervisor confirmed no lunch" };
    expect(await refusal(inAgency((tx) => recordConfirmation(tx, actor, period, { ...meal, reason: " " })))).toBe("reason_required");
    expect(await refusal(inAgency((tx) => recordConfirmation(tx, actor, period, { ...meal, workDate: "2026-09-01" })))).toBe("outside_period");
    const id = await inAgency((tx) => recordConfirmation(tx, actor, period, meal));
    expect(await refusal(inAgency((tx) => recordConfirmation(tx, actor, period, meal)))).toBe("already_recorded");
    let run = await inAgency((tx) => computeRun(tx, actor, period));
    // 8 h × $19.50 = $156.00; the premium is one hour at the $19.50 regular rate.
    expect(await luisLines(run.runId)).toEqual(expect.arrayContaining([["REG", 480, 15_600], ["MEAL_PREMIUM", 60, 1_950]]));
    const audited = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "premium_confirmation"), eq(auditEvents.entityId, id))));
    expect(audited.map((a) => [a.action, a.reason])).toEqual([["create", "Supervisor confirmed no lunch"]]);
    const view = await inAgency((tx) => payEventsView(tx, period));
    expect(view.events.map((e) => [e.workerName, e.eventKind, e.date])).toEqual([["Luis Hernández", "meal_period_missed", "2026-10-08"]]);
    expect(view.options.some((o) => o.workerId === luis && o.assignments.some((a) => a.assignmentId === assignmentId))).toBe(true);
    await inAgency((tx) => removePayEvent(tx, actor, period, { kind: "confirmation", id }, "Entered by mistake"));
    run = await inAgency((tx) => computeRun(tx, actor, period));
    expect((await luisLines(run.runId)).some(([t]) => t === "MEAL_PREMIUM")).toBe(false);
  });

  it("a nondiscretionary bonus is paid with its workweek; a bad amount or a week outside the period is refused", async () => {
    const bonus = { workerId: luis, assignmentId, workweekStart: "2026-10-05", amountCents: 5_000, kind: "nondiscretionary" as const, reason: "Perfect attendance" };
    expect(await refusal(inAgency((tx) => recordBonus(tx, actor, period, { ...bonus, amountCents: 0 })))).toBe("bad_amount");
    expect(await refusal(inAgency((tx) => recordBonus(tx, actor, period, { ...bonus, workweekStart: "2026-10-06" })))).toBe("outside_period");
    await inAgency((tx) => recordBonus(tx, actor, period, bonus));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(await luisLines(run.runId)).toEqual(expect.arrayContaining([["BONUS", 0, 5_000]]));
  });

  it("the exact same bonus again is refused unless the person confirms it is a second one", async () => {
    const bonus = { workerId: luis, assignmentId, workweekStart: "2026-10-05", amountCents: 5_000, kind: "nondiscretionary" as const, reason: "Perfect attendance" };
    await inAgency((tx) => recordBonus(tx, actor, period, bonus));
    expect(await refusal(inAgency((tx) => recordBonus(tx, actor, period, bonus)))).toBe("duplicate_bonus");
    await inAgency((tx) => recordBonus(tx, actor, period, { ...bonus, confirmDuplicate: true }));
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect((await luisLines(run.runId)).filter(([t]) => t === "BONUS")).toEqual([["BONUS", 0, 5_000], ["BONUS", 0, 5_000]]);
  });

  it("a bonus of an earlier, locked period cannot be removed through this one", async () => {
    // The week of September 28 belongs to the demo's first period, already paid.
    const [row] = await inAgency((tx) => tx.insert(bonuses).values({ agencyId: actor.agencyId, workerId: luis, assignmentId, workweekStart: "2026-09-28", amountCents: 2_500, kind: "nondiscretionary", note: "Earlier week" }).returning({ id: bonuses.id }));
    const id = row!.id;
    expect(await refusal(inAgency((tx) => removePayEvent(tx, actor, period, { kind: "bonus", id }, "Wrong period")))).toBe("not_found");
    expect((await inAgency((tx) => payEventsView(tx, period))).events.some((e) => e.id === id)).toBe(false);
  });

  it("a role that does not change hours cannot enter or remove pay events", async () => {
    const billing: Actor = { ...actor, role: "billing" };
    const bonus = { workerId: luis, assignmentId, workweekStart: "2026-10-05", amountCents: 5_000, kind: "nondiscretionary" as const, reason: "Perfect attendance" };
    expect(await refusal(inAgency((tx) => recordBonus(tx, billing, period, bonus)))).toBe("not_allowed");
    const meal = { workerId: luis, assignmentId, workDate: "2026-10-08", kind: "meal_period_missed" as const, scheduledMinutes: null, reassigned: false, reason: "No lunch" };
    expect(await refusal(inAgency((tx) => recordConfirmation(tx, billing, period, meal)))).toBe("not_allowed");
    const id = await inAgency((tx) => recordBonus(tx, actor, period, bonus));
    expect(await refusal(inAgency((tx) => removePayEvent(tx, billing, period, { kind: "bonus", id }, "No")))).toBe("not_allowed");
  });
});

describe("a rate card's further terms", () => {
  it("a differential pays and bills its own line, and a minimum day tops up only a day a person confirmed short", async () => {
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, luis), eq(timeEntries.workDate, "2026-10-08"))));
    const cards = await inAgency((tx) => tx.select().from(rateCards));
    const card = cards.find((c) => c.assignmentId === null && c.payRateCents === 1950 && c.jobOrderId !== null);
    expect(card).toBeDefined();
    // $1.00/h paid, $1.50/h billed on every shift; a 10-hour minimum day, billed.
    await inAgency((tx) => tx.update(rateCards).set({ diffName: "Night", diffPayCents: 100, diffBillCents: 150, contractMinimumMinutes: 600, billsContractMinimum: true }).where(eq(rateCards.jobOrderId, card!.jobOrderId)));
    // Without a confirmation the minimum day pays nothing.
    const unconfirmed = await inAgency((tx) => computeRun(tx, actor, period));
    expect((await luisLines(unconfirmed.runId)).some(([t]) => t === "MIN_GUARANTEE")).toBe(false);
    // Scheduled 8 hours and worked them all, so California reporting time pay owes nothing extra.
    await inAgency((tx) => recordConfirmation(tx, actor, period, { workerId: luis, assignmentId, workDate: "2026-10-08", kind: "reported_short", scheduledMinutes: 480, reassigned: false, reason: "Sent home before the 10-hour day" }));
    // The same day cannot also be a holiday not worked: only one of the two pays.
    expect(await refusal(inAgency((tx) => recordConfirmation(tx, actor, period, { workerId: luis, assignmentId, workDate: "2026-10-08", kind: "holiday_not_worked", scheduledMinutes: null, reassigned: false, reason: "Holiday" })))).toBe("holiday_and_short_day");
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    // 8 h × $1.00 = $8.00 differential; the 2 hours short of 10 at $19.50 = $39.00.
    expect(await luisLines(run.runId)).toEqual(expect.arrayContaining([["DIFF", 480, 800], ["MIN_GUARANTEE", 120, 3_900]]));
    const billed = (await inAgency((tx) => tx.select().from(billLines).where(and(eq(billLines.payRunId, run.runId), eq(billLines.workerId, luis))))).map((l) => [l.type, l.minutes, l.amountCents, l.ruleId]);
    expect(billed).toEqual(expect.arrayContaining([["DIFF", 480, 1_200, "bill_shift_differential"], ["MIN_GUARANTEE", 120, expect.any(Number), "bill_contract_minimum"]]));
    expect(entry).toBeDefined();
  });
});

describe("holiday policies", () => {
  it("refuses a second policy for the same client holding the same date", async () => {
    const policy = { clientId: clientId("ca"), name: "Plant shutdown", dates: ["2026-12-24"], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: null, billNotWorked: false };
    await inAgency((tx) => saveHolidayPolicy(tx, { ...actor, role: "owner" }, null, policy));
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, { ...actor, role: "owner" }, null, { ...policy, name: "Another" })))).toEqual(["overlap"]);
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, { ...actor, role: "owner" }, null, { ...policy, dates: ["2026-12-31"], workedMultiplier: { num: 4, den: 1 } })))).toEqual(["worked_multiplier"]);
  });

  const ownerActor: Actor = { ...actor, role: "owner" };
  const shutdown = { clientId: clientId("ca"), name: "Plant shutdown", dates: ["2026-10-09", "2026-12-24"], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: null, billNotWorked: false };

  it("only the Owner changes holidays; a change needs a reason and is audited before and after", async () => {
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, actor, null, shutdown)))).toEqual(["not_allowed"]);
    const id = await inAgency((tx) => saveHolidayPolicy(tx, ownerActor, null, shutdown));
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, ownerActor, id, { ...shutdown, notWorkedMinutes: 240 })))).toEqual(["reason"]);
    expect(await refusal(inAgency((tx) => deleteHolidayPolicy(tx, ownerActor, id)))).toEqual(["reason"]);
    expect(await refusal(inAgency((tx) => deleteHolidayPolicy(tx, actor, id, "No")))).toEqual(["not_allowed"]);
    await inAgency((tx) => saveHolidayPolicy(tx, ownerActor, id, { ...shutdown, notWorkedMinutes: 240 }, "Half day per contract"));
    const [audited] = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "holiday_policy"), eq(auditEvents.entityId, id), eq(auditEvents.action, "update"))));
    expect(audited).toMatchObject({ reason: "Half day per contract", before: { notWorkedMinutes: 480, dates: ["2026-10-09", "2026-12-24"] }, after: { notWorkedMinutes: 240, dates: ["2026-10-09", "2026-12-24"] } });
  });

  it("refuses to add, change or delete a holiday on a date in a period whose files exist", async () => {
    const id = await inAgency((tx) => saveHolidayPolicy(tx, ownerActor, null, shutdown));
    await owner.db.insert(payRuns).values({ agencyId: actor.agencyId, payPeriodId: period, version: 1, status: "exported", rulesVersion: "test", skipped: [] });
    // October 9 is in the exported week: changing what it pays, or removing it, is refused.
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, ownerActor, id, { ...shutdown, notWorkedMinutes: 240 }, "Half day")))).toEqual(["locked"]);
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, ownerActor, id, { ...shutdown, dates: ["2026-12-24"] }, "Drop October")))).toEqual(["locked"]);
    expect(await refusal(inAgency((tx) => deleteHolidayPolicy(tx, ownerActor, id, "Gone")))).toEqual(["locked"]);
    expect(await refusal(inAgency((tx) => saveHolidayPolicy(tx, ownerActor, null, { ...shutdown, clientId: null, dates: ["2026-10-07"] })))).toEqual(["locked"]);
    // A date outside the locked week can still be added.
    await inAgency((tx) => saveHolidayPolicy(tx, ownerActor, id, { ...shutdown, dates: ["2026-10-09", "2026-12-24", "2026-12-31"] }, "New Year's Eve too"));
  });
});
