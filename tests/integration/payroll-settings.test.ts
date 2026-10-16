/**
 * Payroll file settings (slice f, plan `.claude/plans/slice-f-payroll-formats.md`, decisions F1–F8):
 * the payroll system in use, its codes and each worker's id there; the run checks against them and
 * the files come out in that system's format.
 *
 * The week: Marcus 10 h Monday to Wednesday and 8 h Thursday and Friday (46 h: 40 h × $18.25 = $730.00
 * and 6 h × $27.375 = $164.25); Anita 8 h Monday to Wednesday (24 h × $18.25 = $438.00).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { StaleRequestError } from "../../src/server/errors";
import { createRunFiles, RunNotApprovedError } from "../../src/server/files/service";
import { payrollSettingsView } from "../../src/server/payroll/queries";
import { currentSetting, payrollCodes, payrollTarget, setPayrollCodes, setPayrollTarget, setWorkerPayrollId, TARGET_KEY } from "../../src/server/payroll/settings";
import { startCorrection } from "../../src/server/run/corrections";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-payroll-settings-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const w2 = periodId("w2");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const anita = workerId("anita-patel");
const ADP = { format: "adp_wfn_paydata", companyCode: "XYZ" } as const;

async function addShift(worker: string, date: string, inMinute: number, outMinute: number) {
  await owner.db
    .insert(s.timeEntries)
    .values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed" });
}

beforeEach(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await addShift("marcus-bell", d, 420, 1020);
  for (const d of ["2026-10-08", "2026-10-09"]) await addShift("marcus-bell", d, 420, 900);
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await addShift("anita-patel", d, 420, 900);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

const target = () => inAgency((tx) => payrollTarget(tx));
const history = () => inAgency((tx) => tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, TARGET_KEY)).orderBy(asc(s.agencySettings.effectiveFrom)));
const switchTo = (t: unknown, today = "2026-10-16", who: Actor = theOwner) =>
  inAgency(async (tx) => setPayrollTarget(tx, who, t, today, (await currentSetting(tx, TARGET_KEY))?.id ?? null));
const compute = () => inAgency((tx) => computeRun(tx, theOwner, w2));
const text = async (key: string) => new TextDecoder().decode(await store.get(key));

describe("the payroll system in use", () => {
  it("starts as Gusto in the demo, and a change keeps the old one as history ending yesterday", async () => {
    expect(await target()).toEqual({ format: "gusto_hours_csv" });
    expect(await switchTo(ADP)).toEqual({ ok: true });
    expect(await target()).toEqual(ADP);
    const rows = await history();
    expect(rows.map((r) => [r.value, r.effectiveFrom, r.effectiveTo])).toEqual([
      [{ format: "gusto_hours_csv" }, rows[0]!.effectiveFrom, "2026-10-15"],
      [ADP, "2026-10-16", null],
    ]);
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "agency_setting"), eq(s.auditEvents.entityId, rows[1]!.id))));
    expect(events.map((e) => [e.action, e.actorLabel])).toEqual([["update", "Test owner"]]);
  });

  it("replaces the day's row when changed again the same day, and keeps only the fields the system uses", async () => {
    await switchTo(ADP);
    const seen = (await history())[1]!.id;
    expect(await switchTo({ format: "adp_run_csv", companyCode: "ABC1234", stray: "kept?" })).toEqual({ ok: true });
    expect(await target()).toEqual({ format: "adp_run_csv", companyCode: "ABC1234" });
    expect((await history()).length).toBe(2);
    // A page drawn before the second save is stale, even though both saves were today.
    await expect(inAgency((tx) => setPayrollTarget(tx, theOwner, ADP, "2026-10-16", seen))).rejects.toBeInstanceOf(StaleRequestError);
  });

  it("leaves a stored code today's rules refuse out of the file, and shows it on the settings page", async () => {
    await owner.db
      .update(s.agencySettings)
      .set({ value: { REG: { code: "Reg Hours", as: "hours" }, OT: { code: "O/T Hours", as: "hours", factor: { num: 3, den: 2 } }, DT: { code: "D2", as: "hours", factor: { num: 2, den: 1 } } } })
      .where(eq(s.agencySettings.key, "earning_code_map.adp_wfn_paydata"));
    const c = await inAgency((tx) => payrollCodes(tx, "adp_wfn_paydata"));
    expect(c.codes.DT).toBeUndefined();
    expect(c.stored.DT).toMatchObject({ code: "D2" });
    expect(c.problems).toEqual([expect.objectContaining({ field: "codes.DT", rule: "code_form_adp_wfn_paydata" })]);
    await switchTo(ADP);
    const view = await inAgency((tx) => payrollSettingsView(tx, theOwner));
    expect(view.codes!.problems.map((p) => p.field)).toEqual(["codes.DT"]);
    expect((await compute()).blockers.map((b) => b.code)).toEqual(["missing_payroll_id"]);
  });

  it("refuses codes that are not text instead of storing them", async () => {
    const r = await inAgency(async (tx) => setPayrollCodes(tx, theOwner, "adp_wfn_paydata", { BONUS: { code: 12, as: "dollars" } }, "2026-10-16", (await payrollCodes(tx, "adp_wfn_paydata")).id));
    expect(r).toMatchObject({ ok: false, error: "invalid", problems: [{ field: "codes.BONUS", rule: "code_text" }] });
  });

  it("refuses anyone but the Owner, an invalid choice, and a change made from a stale page", async () => {
    expect(await switchTo(ADP, "2026-10-16", coordinator)).toEqual({ ok: false, error: "not_allowed" });
    expect(await switchTo({ format: "adp_wfn_paydata", companyCode: "toolong" })).toEqual({ ok: false, error: "invalid", problems: [{ field: "companyCode", rule: "adp_company_code", message: "ADP's company code: 2 or 3 capital letters or digits." }] });
    await expect(inAgency((tx) => setPayrollTarget(tx, theOwner, ADP, "2026-10-16", null))).rejects.toBeInstanceOf(StaleRequestError);
    expect(await target()).toEqual({ format: "gusto_hours_csv" });
  });
});

describe("codes and worker ids", () => {
  it("saves a system's codes after checking them, and reads its defaults when none were saved", async () => {
    const codes = async () => (await inAgency((tx) => payrollCodes(tx, "adp_wfn_paydata"))).codes;
    const save = (map: unknown) => inAgency(async (tx) => setPayrollCodes(tx, theOwner, "adp_wfn_paydata", map, "2026-10-16", (await payrollCodes(tx, "adp_wfn_paydata")).id));
    expect(await save({ ...(await codes()), DT: { code: "dt", as: "hours", factor: { num: 2, den: 1 } } })).toMatchObject({ ok: false, error: "invalid", problems: [{ field: "codes.DT" }] });
    expect(await save({ ...(await codes()), DT: { code: "X", as: "hours", factor: { num: 2, den: 1 } }, BONUS: { code: "", as: "dollars" } })).toEqual({ ok: true });
    expect(await codes()).toMatchObject({ DT: { code: "X", as: "hours", factor: { num: 2, den: 1 } } });
    expect((await codes()).BONUS).toBeUndefined();
    // Gusto's map keeps its stored form: earning type → column.
    expect(await inAgency(async (tx) => setPayrollCodes(tx, theOwner, "gusto_hours_csv", { REG: { code: "regular_hours", as: "hours" }, OT: { code: "overtime_hours", as: "hours" }, DT: { code: "double_overtime_hours", as: "hours" } }, "2026-10-16", (await payrollCodes(tx, "gusto_hours_csv")).id))).toEqual({ ok: true });
  });

  it("sets, refuses and clears a worker's id, one person per id", async () => {
    const set = (worker: string, id: string, who: Actor = theOwner) => inAgency((tx) => setWorkerPayrollId(tx, who, worker, "adp_wfn", id));
    expect(await set(anita, "12")).toMatchObject({ ok: false, error: "invalid", problems: [{ field: "id" }] });
    expect(await set(anita, "100113")).toEqual({ ok: false, error: "taken", by: "Marcus Bell" });
    // ADP's file number is a number: leading zeros name the same person.
    expect(await set(workerId("olivia-hart"), "51")).toEqual({ ok: true });
    expect(await set(anita, "000051")).toEqual({ ok: false, error: "taken", by: "Olivia Hart" });
    expect(await set(anita, "100114", coordinator)).toEqual({ ok: false, error: "not_allowed" });
    expect(await set(anita, "100114")).toEqual({ ok: true });
    const ids = async () => (await inAgency((tx) => tx.select().from(s.workers).where(eq(s.workers.id, anita))))[0]!.payrollIds;
    expect((await ids()).adp_wfn).toEqual({ id: "100114" });
    expect(await set(anita, "")).toEqual({ ok: true });
    expect((await ids()).adp_wfn).toBeUndefined();
    expect((await ids()).gusto).toBeDefined();
  });
});

describe("the run and the files follow the system in use", () => {
  it("names the worker with no id in the new system, then makes ADP's file once the id is set", async () => {
    await switchTo(ADP);
    const blocked = await compute();
    expect(blocked.blockers).toEqual([
      expect.objectContaining({ code: "missing_payroll_id", workerId: anita, message: "Anita Patel has no ADP file number, so the ADP Workforce Now file could not match them." }),
    ]);
    await inAgency((tx) => setWorkerPayrollId(tx, theOwner, anita, "adp_wfn", "100114"));
    expect((await compute()).blockers).toEqual([]);
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    const files = await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-16" }));
    expect(files.payroll!.filename).toBe("PRXYZEPI.csv");
    expect(await text(files.payroll!.storageKey)).toBe(
      ["Co Code,Batch ID,File #,Temp Rate,Reg Hours,O/T Hours", "XYZ,26101101,100113,18.2500,40.00,6.00", "XYZ,26101101,100114,18.2500,24.00,", ""].join("\r\n"),
    );
    expect(files.payroll!.controlTotals).toEqual({ workers: 2, minutesByType: { REG: 3840, OT: 360 }, grossCents: 133_225, payrollSystemGrossCents: 133_225, payrollSystemDifferenceCents: 0 });
    const [row] = await inAgency((tx) => tx.select().from(s.exports));
    expect([row!.format, row!.mappingVersion]).toEqual(["adp_wfn_paydata", "adp-wfn-v1"]);
  });

  it("voids an approval when the payroll system changes after it", async () => {
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    expect((await compute()).status).toBe("approved");
    await switchTo({ format: "adp_run_csv", companyCode: "ABC1234" });
    expect((await compute()).status).toBe("ready");
    await expect(inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-16" }))).rejects.toBeInstanceOf(RunNotApprovedError);
  });

  it("blocks the run while no payroll system is chosen", async () => {
    await owner.db.delete(s.agencySettings).where(eq(s.agencySettings.key, TARGET_KEY));
    expect((await compute()).blockers).toEqual([expect.objectContaining({ code: "no_payroll_target" })]);
  });

  it("makes a correction's file for the system in use when it is made (F1), dated in the week worked", async () => {
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
    await switchTo({ format: "qbd_iif", version: "2022_or_later" });
    await inAgency((tx) => startCorrection(tx, theOwner, w2, "Anita's Thursday was missing"));
    await addShift("anita-patel", "2026-10-08", 420, 900);
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    const files = await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-20" }));
    expect(files.payroll!.filename).toBe("quickbooks-time-2026-10-05-to-2026-10-11-correction-2.iif");
    expect((await text(files.payroll!.storageKey)).split("\r\n").slice(1, 2)).toEqual(["TIMEACT\t10/11/26\t\tPatel, Anita\t\tHourly Rate\t8:00\t\t\tY\t0"]);
  });
});
