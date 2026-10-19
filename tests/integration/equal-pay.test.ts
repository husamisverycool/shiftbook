/**
 * Slice (c) step 5 through the weekly run: the Illinois equal-pay counter (820 ILCS 175/42) reads the
 * hours worked in earlier periods, records the 720-hour crossing as an obligation due before the next
 * pay period, keeps it in step when the run's hours change, and never records it twice.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { EQUAL_PAY_KINDS } from "../../src/server/compliance/kinds";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@shiftbook/rules";
import { agencies, assignments, auditEvents, equalPayRates, obligations, payLines, payPeriods, timeEntries, type ObligationEvidence } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { removeEqualPayRate, setEqualPayRate, weeksToTrueUp } from "../../src/server/compliance/equal-pay-rates";
import { addOpeningBalance } from "../../src/server/compliance/counter-balances";
import { addObligationNote, closeObligation } from "../../src/server/compliance/service";
import { createRunFiles } from "../../src/server/files/service";
import { LocalDocumentStore } from "../../src/server/storage";
import { addEntry } from "../../src/server/review/service";
import { computeRun } from "../../src/server/run/service";
import { backfillKeys } from "../../src/server/compliance/sync";
import type { Actor } from "../../src/server/session";
import { explanationsSayTheMessage } from "./explain-parity";
import { approveAsOwner, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const period = periodId("w2"); // Monday 2026-10-05 to Sunday 2026-10-11
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const marcus = workerId("marcus-bell");
const TODAY = "2026-10-16";
const theOwner: Actor = { ...actor, userId: "00000000-0000-4000-a000-000000000002", label: "Test owner", role: "owner" };
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-equal-pay-")));

// Every equal-pay duty the run recorded says, in keys, what its English sentence says (decision 0028).
afterEach(async () => {
  await inAgency((tx) => explanationsSayTheMessage(tx));
});
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
    const rows = await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])));
    expect(rows).toHaveLength(1);
    // Due before the next pay period begins: by the last day of this one.
    expect(rows[0]).toMatchObject({ kind: "il_equal_pay_720h", jurisdiction: "IL", workerId: marcus, clientId: clientId("il"), payRunId: run.runId, crossedOn: "2026-10-07", dueOn: "2026-10-11", status: "open" });
    expect(rows[0]!.facts).toMatchObject({ crossedAtMinute: 660, windowStart: "2025-10-08", thresholdMinutes: 43_200, minutesAfter: 1200, entryIds: ids.slice(2).sort() });
    expect(rows[0]!.message).toContain("Prairie Line");
    // A duty recorded before explanations were kept gets them on the next sync — only because they say the same thing (decision 0028).
    expect(rows[0]!.explain).not.toBeNull();
    await inAgency((tx) => tx.update(obligations).set({ explain: null }).where(eq(obligations.id, rows[0]!.id)));
    await inAgency((tx) => backfillKeys(tx));
    expect((await inAgency((tx) => tx.select().from(obligations).where(eq(obligations.id, rows[0]!.id))))[0]!.explain).toEqual(rows[0]!.explain);

    // Computing again changes nothing and logs nothing new.
    await inAgency((tx) => computeRun(tx, actor, period));
    expect(await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])))).toHaveLength(1);
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
    const rows = await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])));
    expect(rows.map((r) => [r.crossedOn, (r.facts as ObligationEvidence).crossedAtMinute, (r.facts as ObligationEvidence).minutesAfter])).toEqual([["2026-10-08", 660, 720]]);
    const actions = (await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "obligation"), gte(auditEvents.occurredAt, since))))).map((e) => e.action).sort();
    expect(actions).toEqual(["create", "create", "delete"]);
  });

  it("a late timesheet that crosses earlier moves the obligation on file to the earlier crossing, logged", async () => {
    const since = new Date();
    await earlierHours();
    const [later] = await inAgency((tx) => tx.insert(payPeriods).values({ agencyId: actor.agencyId, startsOn: "2026-10-12", endsOn: "2026-10-18" }).returning());
    for (const day of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]) {
      const added = await inAgency((tx) => addEntry(tx, actor, later!.id, { workerId: marcus, workDate: day, inMinute: 420, outMinute: 900, breakMinutes: 0 }, ["other"], "later week"));
      if (!added.ok) throw new Error(added.error);
    }
    await inAgency((tx) => computeRun(tx, actor, later!.id));
    expect((await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])))).map((r) => r.crossedOn)).toEqual(["2026-10-14"]);
    // The earlier week's timesheet arrives late: the hours cross on October 7 at 11:00.
    await weekOfWork();
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    const rows = await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])));
    expect(rows.map((r) => [r.crossedOn, r.payRunId, (r.facts as ObligationEvidence).crossedAtMinute, (r.facts as ObligationEvidence).minutesAfter])).toEqual([["2026-10-07", run.runId, 660, 1200]]);
    const moved = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "obligation"), eq(auditEvents.action, "update"), gte(auditEvents.occurredAt, since))));
    expect(moved.map((e) => [e.before, e.after])).toEqual([[{ crossedOn: "2026-10-14" }, { crossedOn: "2026-10-07" }]]);
    // The later week, computed again, keeps the earlier crossing and flags all its hours.
    const again = await inAgency((tx) => computeRun(tx, actor, later!.id));
    expect(await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])))).toHaveLength(1);
    expect(again.warnings.filter((w) => w.code === "equal_pay_rate_missing").map((w) => w.message).join(" ")).toContain("40h 00m");
  });

  it("does not count earlier hours on clerical work, or warn without earlier hours", async () => {
    await earlierHours();
    const [assignment] = await inAgency((tx) => tx.select().from(assignments).where(eq(assignments.workerId, marcus)));
    await owner.db.execute(`update job_orders set day_and_temporary_labor = false where id = '${assignment!.jobOrderId}'`);
    await weekOfWork();
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.warnings.filter((w) => w.workerId === marcus && w.code.includes("equal_pay"))).toEqual([]);
    expect(await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])))).toEqual([]);
  });

  it("a crossing that goes away: deleted while untouched; with a note it is set aside, kept, and opens again when the hours cross again", async () => {
    await earlierHours();
    const ids = await weekOfWork();
    await inAgency((tx) => computeRun(tx, actor, period));
    const [row] = await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])));
    const theOwner: Actor = { ...actor, userId: "00000000-0000-4000-a000-000000000002", label: "Test owner", role: "owner" };
    expect(await inAgency((tx) => addObligationNote(tx, theOwner, row!.id, "Asked the client for its rate."))).toEqual({ ok: true });
    await inAgency((tx) => tx.update(timeEntries).set({ status: "rejected" }).where(inArray(timeEntries.id, ids)));
    await inAgency((tx) => computeRun(tx, actor, period));
    const [aside] = await inAgency((tx) => tx.select().from(obligations).where(eq(obligations.id, row!.id)));
    expect([aside!.status, aside!.closedBySystem, aside!.statusNote]).toEqual(["not_applicable", true, "No longer applies: the hours that crossed the threshold changed."]);
    await inAgency((tx) => tx.update(timeEntries).set({ status: "reviewed" }).where(inArray(timeEntries.id, ids)));
    await inAgency((tx) => computeRun(tx, actor, period));
    const rows = await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])));
    expect(rows.map((r) => [r.id, r.status, r.closedBySystem, r.crossedOn])).toEqual([[row!.id, "open", false, "2026-10-07"]]);
  });

  it("the equal-pay rate (J6): from the next pay period the run needs the rate or a record that the client was asked; then it pays it", async () => {
    await earlierHours();
    await weekOfWork();
    await inAgency((tx) => computeRun(tx, actor, period));
    const duty = await theDuty();
    expect(duty.crossedOn).toBe("2026-10-07");
    const later = await nextWeek();
    let run = await inAgency((tx) => computeRun(tx, actor, later));
    const needed = run.blockers.filter((b) => b.code === "equal_pay_rate_needed");
    expect(needed.map((b) => [b.workerId, b.date])).toEqual([[marcus, "2026-10-12"]]);
    expect(needed[0]!.message).toContain("passed 720 hours at Prairie Line Manufacturing (demo) on 2026-10-07, before this pay period began (2026-10-12), so the client's equal-pay figures are due now");
    // Only the Owner records it; a request is never in the future; a request made today clears the hold and the rate card is paid.
    const asked = { effectiveFrom: TODAY, kind: "asked" as const, rateCents: null, benefitsCents: null, method: null, comparator: null, note: null };
    expect(await inAgency((tx) => setEqualPayRate(tx, actor, duty.id, asked, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, { ...asked, effectiveFrom: "2026-10-17" }, TODAY))).toEqual({ ok: false, error: "invalid", field: "effectiveFrom" });
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, asked, TODAY))).toEqual({ ok: true });
    run = await inAgency((tx) => computeRun(tx, actor, later));
    expect(run.blockers.filter((b) => b.code === "equal_pay_rate_needed")).toEqual([]);
    expect(run.warnings.find((w) => w.code === "equal_pay_rate_missing" && w.workerId === marcus)!.message).toContain("the client was asked for its figures on 2026-10-16");
    // The client's figures: $19.00 + $1.00 benefits from 2026-10-12. Regular 40 h × $20.00 = $800.00; overtime 5 h × $30.00 = $150.00.
    const rate = { effectiveFrom: "2026-10-12", kind: "rate" as const, rateCents: 1900, benefitsCents: 100, method: "comparator" as const, comparator: "Machine operator II, 2 years", note: null };
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, { ...rate, comparator: " " }, TODAY))).toEqual({ ok: false, error: "invalid", field: "comparator" });
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, rate, TODAY))).toEqual({ ok: true });
    const done = await theDuty();
    expect([done.status, done.statusNote, done.doneByLabel]).toEqual(["done", "Equal-pay rate entered from 2026-10-12.", "Test owner"]);
    run = await inAgency((tx) => computeRun(tx, actor, later));
    expect(run.blockers.filter((b) => b.workerId === marcus)).toEqual([]);
    expect(await marcusLines(run.runId)).toEqual([
      ["OT", 300, 15_000],
      ["REG", 2400, 80_000],
    ]);
    const lines = await inAgency((tx) => tx.select().from(payLines).where(eq(payLines.payRunId, run.runId)));
    expect(lines.find((l) => l.workerId === marcus && l.type === "REG")!.explain).toContain("Illinois equal pay from 2026-10-12 (820 ILCS 175/42(a), (b)): the comparable direct hire's rate $19.00 + the benefits' hourly cash value $1.00 = $20.00, above the rate card's $18.25.");
    // A rate from the same date replaces the one before, kept as replaced; a request never replaces a rate.
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, { ...rate, rateCents: 1950 }, TODAY))).toEqual({ ok: true });
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, { ...asked, effectiveFrom: "2026-10-12" }, TODAY))).toEqual({ ok: false, error: "invalid", field: "askedOverRate" });
    const rows = await inAgency((tx) => tx.select().from(equalPayRates).where(eq(equalPayRates.effectiveFrom, "2026-10-12")));
    expect(rows.map((r) => [r.kind, r.rateCents, r.removedAt !== null]).sort()).toEqual([
      ["rate", 1900, true],
      ["rate", 1950, false],
    ]);
  });

  it("a wrong rate is removed with a reason by the Owner, stays on file, and with no rate left the duty is open again", async () => {
    await earlierHours();
    await weekOfWork();
    await inAgency((tx) => computeRun(tx, actor, period));
    const duty = await theDuty();
    const later = await nextWeek();
    await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, { effectiveFrom: "2026-10-09", kind: "asked", rateCents: null, benefitsCents: null, method: null, comparator: null, note: null }, TODAY));
    await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, { effectiveFrom: "2026-10-12", kind: "rate", rateCents: 9500, benefitsCents: 0, method: "comparator", comparator: "Typed $95.00 for $19.50", note: null }, TODAY));
    const [wrong] = await inAgency((tx) => tx.select().from(equalPayRates).where(eq(equalPayRates.kind, "rate")));
    expect(await inAgency((tx) => removeEqualPayRate(tx, actor, duty.id, wrong!.id, "typo"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => removeEqualPayRate(tx, theOwner, duty.id, wrong!.id, "  "))).toEqual({ ok: false, error: "invalid", field: "reason" });
    expect(await inAgency((tx) => removeEqualPayRate(tx, theOwner, duty.id, wrong!.id, "Typed $95.00 for $19.50"))).toEqual({ ok: true });
    expect(await inAgency((tx) => removeEqualPayRate(tx, theOwner, duty.id, wrong!.id, "again"))).toEqual({ ok: false, error: "not_open" });
    const [kept] = await inAgency((tx) => tx.select().from(equalPayRates).where(eq(equalPayRates.id, wrong!.id)));
    expect([kept!.removedReason, kept!.removedByLabel, kept!.removedAt !== null]).toEqual(["Typed $95.00 for $19.50", "Test owner", true]);
    expect((await theDuty()).status).toBe("open");
    const logged = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, duty.id), eq(auditEvents.reason, "the equal-pay rate on file was removed"))));
    expect(logged).toHaveLength(1);
    // The request is still on file: the rate card is paid. 40 h × $18.25 = $730.00; 5 h × $27.375 = $136.875 → $136.88.
    const run = await inAgency((tx) => computeRun(tx, actor, later));
    expect(run.blockers.filter((b) => b.workerId === marcus)).toEqual([]);
    expect(await marcusLines(run.runId)).toEqual([
      ["OT", 300, 13_688],
      ["REG", 2400, 73_000],
    ]);
  });

  it("a crossing set aside as not applicable holds nothing", async () => {
    await earlierHours();
    await weekOfWork();
    await inAgency((tx) => computeRun(tx, actor, period));
    const duty = await theDuty();
    expect(await inAgency((tx) => closeObligation(tx, theOwner, duty.id, "not_applicable", "Covered by a collective bargaining agreement (820 ILCS 175/43)"))).toEqual({ ok: true });
    const later = await nextWeek();
    const run = await inAgency((tx) => computeRun(tx, actor, later));
    expect(run.blockers.filter((b) => b.code === "equal_pay_rate_needed")).toEqual([]);
  });

  it("after 4,160 hours a wage-survey median entered before then holds the run until the 75th percentile is entered or asked for", async () => {
    // 4,200 hours at Prairie Line before Tabulado, through Sunday 2026-10-04: both counters crossed before this pay period.
    await inAgency((tx) => tx.update(timeEntries).set({ status: "rejected" }).where(and(eq(timeEntries.workerId, marcus), lt(timeEntries.workDate, "2026-10-05"))));
    expect(await inAgency((tx) => addOpeningBalance(tx, theOwner, { workerId: marcus, clientId: clientId("il"), minutes: 252_000, throughOn: "2026-10-04", note: "Hours from the old payroll system" }, TODAY))).toEqual({ ok: true });
    await weekOfWork();
    let run = await inAgency((tx) => computeRun(tx, actor, period));
    const kinds = await inAgency((tx) => tx.select().from(obligations).where(inArray(obligations.kind, [...EQUAL_PAY_KINDS])));
    expect(kinds.map((o) => [o.kind, o.crossedOn]).sort()).toEqual([
      ["il_equal_pay_4160h", "2026-10-04"],
      ["il_equal_pay_720h", "2026-10-04"],
    ]);
    expect(run.blockers.filter((b) => b.code === "equal_pay_rate_needed").map((b) => b.message.slice(0, 81))).toEqual(["Marcus Bell passed 720 hours at Prairie Line Manufacturing (demo) on 2026-10-04, "]);
    const duty = kinds.find((o) => o.kind === "il_equal_pay_720h")!;
    const median = { effectiveFrom: "2026-10-01", kind: "rate" as const, rateCents: 1950, benefitsCents: 0, method: "survey_median" as const, comparator: "OEWS 51-9111, Chicago metro", note: null };
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, median, TODAY))).toEqual({ ok: true });
    run = await inAgency((tx) => computeRun(tx, actor, period));
    const tier = run.blockers.filter((b) => b.code === "equal_pay_rate_needed");
    expect(tier.map((b) => b.message)).toEqual([
      "Marcus Bell passed 4,160 hours at Prairie Line Manufacturing (demo) on 2026-10-04. The rate on file from 2026-10-01 is the wage survey's median; from then on the survey method asks for at least the 75th percentile (820 ILCS 175/42(a)(2)(B)). On the 4,160-hour duty in Compliance, enter the new rate, or record that the client was asked.",
    ]);
    // The 75th percentile from Monday clears it.
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, { ...median, effectiveFrom: "2026-10-05", rateCents: 2150, method: "survey_75th" }, TODAY))).toEqual({ ok: true });
    run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.filter((b) => b.code === "equal_pay_rate_needed")).toEqual([]);
  });

  it("weeks already paid from a rate's date without it are listed, each to be trued up by a correction", async () => {
    await earlierHours();
    await weekOfWork();
    await inAgency((tx) => approveAsOwner(tx, theOwner, period));
    await inAgency((tx) => createRunFiles(tx, theOwner, store, period, { today: "2026-10-13" }));
    const duty = await theDuty();
    expect(await inAgency((tx) => weeksToTrueUp(tx, marcus, clientId("il")))).toEqual([]);
    // The client's figures arrive late, from the crossing day.
    expect(await inAgency((tx) => setEqualPayRate(tx, theOwner, duty.id, { effectiveFrom: "2026-10-07", kind: "rate", rateCents: 2000, benefitsCents: 0, method: "comparator", comparator: "Machine operator II", note: null }, TODAY))).toEqual({ ok: true });
    expect(await inAgency((tx) => weeksToTrueUp(tx, marcus, clientId("il")))).toEqual([{ periodId: period, startsOn: "2026-10-05", endsOn: "2026-10-11" }]);
    // At another client, nothing.
    expect(await inAgency((tx) => weeksToTrueUp(tx, marcus, clientId("ma")))).toEqual([]);
  });
});

async function theDuty() {
  const rows = await inAgency((tx) => tx.select().from(obligations).where(eq(obligations.kind, "il_equal_pay_720h")));
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** The next week: Monday 2026-10-12 to Friday, 9 h a day (45 h) at the card's $18.25. */
async function nextWeek() {
  const [later] = await inAgency((tx) => tx.insert(payPeriods).values({ agencyId: actor.agencyId, startsOn: "2026-10-12", endsOn: "2026-10-18" }).returning());
  for (const day of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]) {
    const added = await inAgency((tx) => addEntry(tx, actor, later!.id, { workerId: marcus, workDate: day, inMinute: 420, outMinute: 960, breakMinutes: 0 }, ["other"], "next week"));
    if (!added.ok) throw new Error(added.error);
  }
  return later!.id;
}

async function marcusLines(runId: string) {
  const lines = await inAgency((tx) => tx.select().from(payLines).where(eq(payLines.payRunId, runId)));
  return lines.filter((l) => l.workerId === marcus).map((l) => [l.type, l.minutes, l.amountCents]).sort();
}
