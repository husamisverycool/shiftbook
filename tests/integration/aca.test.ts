/**
 * Slice (j) step 3c (decision J8): the ACA look-back through the database — the Owner's measurement
 * settings checked against the dated limits, months imported from before Granite, the hours
 * Granite paid, and an "offer coverage by" duty for each worker measured full-time.
 */
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@shiftbook/rules";
import { acaInputs, paidCoverage, paidService } from "../../src/server/compliance/aca-data";
import { importAcaHours, setAcaSettings } from "../../src/server/compliance/aca-service";
import { NO_LONGER, syncObligations } from "../../src/server/compliance/sync";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { addEntry } from "../../src/server/review/service";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000002", label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const TODAY = "2026-10-16";
const marcus = workerId("marcus-bell");
const anita = workerId("anita-patel");
/** Twelve-month periods from October, 60 administrative days, a 12-month stability period. */
const SETTINGS = { measurementMonths: 12, firstMonth: 10, adminDays: 60, stabilityMonths: 12 };
const MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const csv = (rows: [string, string, string][]) => ["Worker,Month,Hours", ...rows.map((r) => r.join(","))].join("\n");
const offers = () => inAgency((tx) => tx.select().from(s.obligations).where(eq(s.obligations.kind, "aca_offer")));

beforeEach(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
    // Hired long before Granite: the start is the hire date.
    await tx.update(s.workers).set({ hireDate: "2024-05-06" }).where(inArray(s.workers.id, [marcus, anita]));
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("the ACA look-back through the database", () => {
  it("settings: only the Owner, checked against the limits in force, from today, logged; nothing is worked out before them", async () => {
    expect(await inAgency((tx) => acaInputs(tx, TODAY))).toMatchObject({ error: "no_settings", limits: { maxAdminDays: 90, fullTimeMinutesPerWeek: 1800, breakWeeks: 13 } });
    expect(await inAgency((tx) => setAcaSettings(tx, coordinator, SETTINGS, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setAcaSettings(tx, theOwner, { ...SETTINGS, measurementMonths: 13 }, TODAY))).toEqual({ ok: false, error: "invalid", field: "measurementMonths" });
    expect(await inAgency((tx) => setAcaSettings(tx, theOwner, { ...SETTINGS, adminDays: 91 }, TODAY))).toEqual({ ok: false, error: "invalid", field: "adminDays" });
    expect(await inAgency((tx) => setAcaSettings(tx, theOwner, { ...SETTINGS, stabilityMonths: 6 }, TODAY))).toEqual({ ok: false, error: "invalid", field: "stabilityMonths" });
    expect(await inAgency((tx) => setAcaSettings(tx, theOwner, SETTINGS, TODAY))).toEqual({ ok: true });
    expect(await inAgency((tx) => setAcaSettings(tx, theOwner, SETTINGS, TODAY))).toEqual({ ok: true });
    const rows = await inAgency((tx) => tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, "aca.lookback")));
    expect(rows.map((r) => [r.value, r.effectiveFrom, r.effectiveTo])).toEqual([[SETTINGS, TODAY, null]]);
    // The same settings again change nothing and log nothing.
    const logged = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "agency_setting"), eq(s.auditEvents.actorLabel, "Test owner"))));
    expect(logged.filter((e) => JSON.stringify(e.after).includes("aca.lookback"))).toHaveLength(1);
    const inputs = await inAgency((tx) => acaInputs(tx, TODAY));
    expect(inputs).toMatchObject({ error: null, settings: SETTINGS, settingsFrom: TODAY });
  });

  it("import: only the Owner; every row is checked and nothing is saved until all are good; a month imported again replaces it", async () => {
    const good = csv([
      ["Marcus Bell", "2025-10", "140"],
      ["anita  patel", "2025-10", "120:30"],
    ]);
    expect(await inAgency((tx) => importAcaHours(tx, coordinator, "old.csv", good, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "old.csv", "Name,Month\nMarcus Bell,2025-10", TODAY))).toEqual({ ok: false, error: "invalid", problems: [{ row: 1, reason: "columns" }] });
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "old.csv", "Worker,Month,Hours\n", TODAY))).toEqual({ ok: false, error: "invalid", problems: [{ row: 1, reason: "empty" }] });
    const bad = csv([
      ["Marcus Bell", "2025-10", "140"],
      ["Nobody Here", "2025-10", "10"],
      ["Marcus Bell", "2026-11", "10"],
      ["Marcus Bell", "2025-13", "10"],
      ["Anita Patel", "2025-11", "lots"],
      ["Anita Patel", "2025-12", "745"],
      ["Marcus Bell", "2025-10", "150"],
    ]);
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "old.csv", bad, TODAY))).toEqual({
      ok: false,
      error: "invalid",
      problems: [
        { row: 3, reason: "worker" },
        { row: 4, reason: "month" },
        { row: 5, reason: "month" },
        { row: 6, reason: "hours" },
        { row: 7, reason: "hours" },
        { row: 8, reason: "duplicate" },
      ],
    });
    expect(await inAgency((tx) => tx.select().from(s.acaMonthlyHours))).toEqual([]);
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "old.csv", good, TODAY))).toEqual({ ok: true, rows: 2 });
    // Again, with Marcus's October corrected: the old row is kept as replaced.
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "old-fixed.csv", csv([["Marcus Bell", "2025-10", "150:15"]]), TODAY))).toEqual({ ok: true, rows: 1 });
    const rows = await inAgency((tx) => tx.select().from(s.acaMonthlyHours).where(eq(s.acaMonthlyHours.workerId, marcus)));
    expect(rows.map((r) => [r.month, r.minutes, r.source, r.replacedAt !== null]).sort()).toEqual([
      ["2025-10-01", 8400, "old.csv", true],
      ["2025-10-01", 9015, "old-fixed.csv", false],
    ]);
    const [anitaRow] = await inAgency((tx) => tx.select().from(s.acaMonthlyHours).where(eq(s.acaMonthlyHours.workerId, anita)));
    expect(anitaRow!.minutes).toBe(120 * 60 + 30);
  });

  it("who is full-time from the months imported, and an offer duty for each, due the day before the stability period; it goes when the hours change", async () => {
    await inAgency((tx) => setAcaSettings(tx, theOwner, SETTINGS, TODAY));
    // Marcus 140 h a month (1,680 h; 100,800 × 7 ≥ 1,800 × 365): full-time. Anita 120 h (86,400 × 7 < 657,000): not.
    const file = csv([...MONTHS.map((m): [string, string, string] => ["Marcus Bell", m, "140"]), ...MONTHS.map((m): [string, string, string] => ["Anita Patel", m, "120"])]);
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "before-shiftbook.csv", file, TODAY))).toEqual({ ok: true, rows: 24 });
    const inputs = await inAgency((tx) => acaInputs(tx, TODAY));
    if (inputs.error !== null) throw new Error(inputs.error);
    const ended = (w: string) => inputs.rows.find((r) => r.workerId === w && r.measurementStart === "2025-10-01")!;
    expect([ended(marcus).result, ended(marcus).minutes, ended(marcus).averageMinutesPerWeek]).toEqual(["full_time", 100_800, 1933]);
    expect([ended(anita).result, ended(anita).minutes]).toEqual(["not_full_time", 86_400]);
    const [duty] = await offers();
    expect(duty).toMatchObject({ workerId: marcus, occurrence: "standard:2025-10-01", dueOn: "2026-11-29", remindOn: "2026-10-30", status: "open", jurisdiction: "US" });
    expect(duty!.message).toContain("Measured full-time in the standard measurement period 2025-10-01 to 2026-09-30: 1680h 00m of service over 365 days");
    expect(await offers()).toHaveLength(1);
    // Marcus's months corrected to 120 h: no longer full-time, so Granite sets the duty aside, saying why.
    await inAgency((tx) => importAcaHours(tx, theOwner, "corrected.csv", csv(MONTHS.map((m): [string, string, string] => ["Marcus Bell", m, "120"])), TODAY));
    expect((await offers()).map((o) => [o.status, o.closedBySystem, o.statusNote])).toEqual([["not_applicable", true, NO_LONGER]]);
  });

  it("counts the hours Granite paid: each worked entry on its day, and a holiday not worked on the holiday confirmed", async () => {
    const luis = workerId("luis-hernandez");
    const period = periodId("w2");
    const coordinatorActor: Actor = coordinator;
    const added = await inAgency((tx) => addEntry(tx, coordinatorActor, period, { workerId: luis, workDate: "2026-10-08", inMinute: 420, outMinute: 930, breakMinutes: 30 }, ["other"], "holiday shift"));
    if (!added.ok) throw new Error(added.error);
    const [entry] = await inAgency((tx) => tx.select().from(s.timeEntries).where(eq(s.timeEntries.id, added.entryId)));
    await inAgency(async (tx) => {
      await tx.insert(s.holidayPolicies).values({ agencyId: theOwner.agencyId, name: "Agency holidays", holidayDates: ["2026-10-08", "2026-10-09"], workedMultiplierNum: 3, workedMultiplierDen: 2, notWorkedMinutes: 480, billWorkedMultiplierNum: 3, billWorkedMultiplierDen: 2 });
      await tx.insert(s.premiumConfirmations).values({ agencyId: theOwner.agencyId, workerId: luis, assignmentId: entry!.assignmentId!, workDate: "2026-10-09", kind: "holiday_not_worked", confirmedBy: theOwner.userId });
    });
    expect(await inAgency((tx) => paidService(tx))).toEqual([]);
    // The demo pays through Gusto, whose file refuses holiday pay: the run is marked paid here as its files would.
    const run = await inAgency((tx) => computeRun(tx, theOwner, period));
    await owner.db.update(s.payRuns).set({ status: "exported" }).where(eq(s.payRuns.id, run.runId));
    const days = (await inAgency((tx) => paidService(tx))).filter((d) => d.workerId === luis);
    // 8 h worked on the holiday (its premium is pay, not hours); the holiday not worked, 8 h on 2026-10-09.
    expect(days).toEqual([
      { workerId: luis, date: "2026-10-08", minutes: 480 },
      { workerId: luis, date: "2026-10-09", minutes: 480 },
    ]);
    expect(await inAgency((tx) => paidCoverage(tx))).toEqual([{ start: "2026-10-05", end: "2026-10-11" }]);
  });

  it("second opinion: a month Granite paid in full is refused (it would count twice), unless the worker was skipped; a payroll ID tells two workers apart", async () => {
    // September 2026 paid week by week in Granite (Monday 2026-08-31 to Sunday 2026-10-04).
    const weeks = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
    for (const start of weeks) {
      // The demo's own week of 2026-09-28 is there already.
      const id = start === "2026-09-28" ? periodId("w1") : (await owner.db.insert(s.payPeriods).values({ agencyId: theOwner.agencyId, startsOn: start, endsOn: addDays(start, 6) }).returning())[0]!.id;
      await owner.db.insert(s.payRuns).values({ agencyId: theOwner.agencyId, payPeriodId: id, status: "exported", rulesVersion: "test", skipped: start === "2026-09-14" ? [{ workerId: anita, reason: "paid by hand", by: "Test owner", at: "2026-09-21T12:00:00Z" }] : [] });
    }
    const r = await inAgency((tx) => importAcaHours(tx, theOwner, "old.csv", csv([["Marcus Bell", "2026-09", "100"], ["Anita Patel", "Sep-26", "100"], ["Marcus Bell", "08/2026", "162.5"]]), TODAY));
    expect(r).toEqual({ ok: false, error: "invalid", problems: [{ row: 2, reason: "paid" }] });
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "old.csv", csv([["Anita Patel", "Sep-26", "100"], ["Marcus Bell", "08/2026", "162.5"]]), TODAY))).toEqual({ ok: true, rows: 2 });
    const rows = await inAgency((tx) => tx.select().from(s.acaMonthlyHours));
    expect(rows.map((x) => [x.workerId === marcus ? "Marcus" : "Anita", x.month, x.minutes]).sort()).toEqual([
      ["Anita", "2026-09-01", 6000],
      ["Marcus", "2026-08-01", 9750],
    ]);
    // By payroll ID: the name column may say anything.
    const [m] = await inAgency((tx) => tx.select({ ids: s.workers.payrollIds }).from(s.workers).where(eq(s.workers.id, marcus)));
    const payrollId = m!.ids.gusto!.id;
    const byId = ["Worker,Month,Hours,Payroll ID", `M. Bell,2026-07,120,${payrollId}`].join("\n");
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "by-id.csv", byId, TODAY))).toEqual({ ok: true, rows: 1 });
    expect(await inAgency((tx) => importAcaHours(tx, theOwner, "by-id.csv", ["Worker,Month,Hours,Payroll ID", "Marcus Bell,2026-06,120,NOT-AN-ID"].join("\n"), TODAY))).toEqual({ ok: false, error: "invalid", problems: [{ row: 2, reason: "worker" }] });
  });

  it("second opinion: an offer already due is not set aside by the data; one not yet due is", async () => {
    await inAgency((tx) => setAcaSettings(tx, theOwner, SETTINGS, TODAY));
    await inAgency((tx) => importAcaHours(tx, theOwner, "before-shiftbook.csv", csv(MONTHS.map((m): [string, string, string] => ["Marcus Bell", m, "140"])), TODAY));
    const [duty] = await offers();
    expect(duty).toMatchObject({ status: "open", dueOn: "2026-11-29" });
    // The hours fall to 100 h a month. On 2026-12-01 the offer was already due: it stays open for a person to decide.
    await owner.db.update(s.acaMonthlyHours).set({ minutes: 6000 }).where(eq(s.acaMonthlyHours.workerId, marcus));
    await inAgency((tx) => syncObligations(tx, theOwner.agencyId, "2026-12-01"));
    expect((await offers()).map((o) => o.status)).toEqual(["open"]);
    // Before it was due, the same change sets it aside.
    await inAgency((tx) => syncObligations(tx, theOwner.agencyId, TODAY));
    expect((await offers()).map((o) => o.status)).toEqual(["not_applicable"]);
  });
});
