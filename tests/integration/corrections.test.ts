/**
 * Corrections (slice e, part 2; plan `.claude/plans/slice-e-weekly-run.md`, decisions E8–E13): a later
 * version of a paid period recomputes the whole period and pays and bills only the differences
 * against the latest paid version. The original files never change.
 *
 * The week: Marcus 10 h Monday to Wednesday and 8 h Thursday and Friday (46 h: 40 h × $18.25 = $730.00
 * and 6 h × $27.375 = $164.25); Anita 8 h Monday to Wednesday (24 h × $18.25 = $438.00). Both work at
 * Prairie Line (code PLM, bill $26.50/h, overtime billed at 1.5×: $39.75/h).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, jobOrderId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { totalsStep } from "../../src/server/convert/queries";
import { planCorrectionInvoices } from "../../src/server/files/invoice-plan";
import { pdfText } from "../../src/server/files/pdf-text";
import { createRunFiles } from "../../src/server/files/service";
import { editEntry } from "../../src/server/review/service";
import { discardCorrection, recordCorrectionDecision, removeCorrectionDecision, startCorrection } from "../../src/server/run/corrections";
import { periodState } from "../../src/server/run/period-lock";
import { computeRun, setSkipped } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-corrections-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const w2 = periodId("w2");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const marcus = workerId("marcus-bell");
const anita = workerId("anita-patel");

async function addShift(worker: string, date: string, inMinute: number, outMinute: number) {
  const [row] = await owner.db
    .insert(s.timeEntries)
    .values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed" })
    .returning();
  return row!;
}

let shifts: (typeof s.timeEntries.$inferSelect)[] = [];

/** The week above, paid: version 1 approved and its files created. */
async function paidWeek() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  shifts = [];
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) shifts.push(await addShift("marcus-bell", d, 420, 1020));
  for (const d of ["2026-10-08", "2026-10-09"]) shifts.push(await addShift("marcus-bell", d, 420, 900));
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) shifts.push(await addShift("anita-patel", d, 420, 900));
  // Anita's Monday was approved by the client before it was paid.
  await owner.db.update(s.timeEntries).set({ status: "client_approved" }).where(eq(s.timeEntries.id, shifts[5]!.id));
  await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
  return inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
}

const start = (reason = "Anita's Thursday was missing", who: Actor = theOwner) => inAgency((tx) => startCorrection(tx, who, w2, reason));
const compute = () => inAgency((tx) => computeRun(tx, theOwner, w2));
const files = () => inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-20" }));
const runs = () => inAgency((tx) => tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, w2)).orderBy(asc(s.payRuns.version)));
const invoicesNow = () => inAgency((tx) => tx.select().from(s.invoices).orderBy(asc(s.invoices.createdAt), asc(s.invoices.number)));
const text = async (key: string) => new TextDecoder().decode(await store.get(key));
const record = (worker: string, decision: s.CorrectionDecisionKind, note: string) => inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, worker, decision, note));
const approveAndFile = async () => {
  await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
  return files();
};

async function edit(entryId: string, change: { inMinute?: number; outMinute?: number }) {
  const r = await inAgency((tx) => editEntry(tx, theOwner, entryId, { ...change, breakMinutes: 0 }, ["misread_corrected"], "correction test"));
  if (!r.ok) throw new Error(`the edit was refused: ${r.error}`);
}

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("starting a correction", () => {
  beforeEach(paidWeek);

  it("is the Owner's, needs a reason, and only opens a paid period", async () => {
    expect(await start("x", coordinator)).toEqual({ ok: false, error: "not_allowed" });
    expect(await start("   ")).toEqual({ ok: false, error: "reason_required" });
    // Paid before Tabulado: there is no version here to correct.
    expect(await inAgency((tx) => startCorrection(tx, theOwner, periodId("w1"), "paid elsewhere"))).toEqual({ ok: false, error: "not_paid" });
    const r = await start();
    expect(r).toMatchObject({ ok: true, version: 2 });
    // Only one correction at a time: the period is open again until its files exist.
    expect(await start()).toEqual({ ok: false, error: "not_paid" });
  });

  it("is the next version of the period: a draft with its reason, the skipped workers carried over, audited", async () => {
    const r = await start();
    if (!r.ok) throw new Error(r.error);
    const [v1, v2] = await runs();
    expect(v1).toMatchObject({ version: 1, status: "exported", kind: "regular" });
    expect(v2).toMatchObject({ id: r.runId, version: 2, status: "draft", kind: "correction", reason: "Anita's Thursday was missing", skipped: v1!.skipped });
    const [event] = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityId, r.runId), eq(s.auditEvents.action, "create"))));
    expect(event).toMatchObject({ actorLabel: "Test owner", reason: "correction: Anita's Thursday was missing" });
    expect(await inAgency((tx) => periodState(tx, w2))).toBe("open");
  });

  it("opens the paid hours again as they were: a client-approved shift stays client-approved (decision E13)", async () => {
    await start();
    const rows = await inAgency((tx) => tx.select().from(s.timeEntries).where(inArray(s.timeEntries.id, shifts.map((x) => x.id))));
    const statusOf = new Map(rows.map((e) => [e.id, e.status]));
    expect(statusOf.get(shifts[5]!.id)).toBe("client_approved");
    expect(shifts.filter((x, i) => i !== 5).map((x) => statusOf.get(x.id))).toEqual(Array(7).fill("reviewed"));
  });

  it("with nothing changed, has nothing to correct: it can be discarded and the hours lock again (decision E12)", async () => {
    await start();
    const run = await compute();
    expect(run.blockers.map((b) => b.code)).toEqual(["correction_no_differences"]);
    expect(await inAgency((tx) => discardCorrection(tx, coordinator, w2))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => discardCorrection(tx, theOwner, w2))).toEqual({ ok: true });
    expect((await runs()).map((r) => [r.version, r.status])).toEqual([[1, "exported"]]);
    expect(await inAgency((tx) => periodState(tx, w2))).toBe("exported");
    const rows = await inAgency((tx) => tx.select().from(s.timeEntries).where(inArray(s.timeEntries.id, shifts.map((x) => x.id))));
    expect(rows.every((e) => e.status === "locked")).toBe(true);
  });

  it("cannot be discarded once something differs", async () => {
    await start();
    await edit(shifts[6]!.id, { outMinute: 960 });
    expect(await inAgency((tx) => discardCorrection(tx, theOwner, w2))).toEqual({ ok: false, error: "has_differences" });
  });

  it("cannot skip a worker paid in the version it corrects (that would take all their pay back; decision E10)", async () => {
    await start();
    await expect(inAgency((tx) => setSkipped(tx, theOwner, w2, anita, { skipped: true, reason: "paid by hand" }))).rejects.toThrow(/paid in version 1/);
  });
});

describe("a correction that adds hours", () => {
  let original: Awaited<ReturnType<typeof paidWeek>>;
  beforeEach(async () => {
    original = await paidWeek();
  });

  it("pays and bills only the differences: a payroll file with the added hours and a supplemental invoice", async () => {
    await start();
    // Anita 2 more hours on Wednesday: 8 h → 10 h (still under 40 h).
    await edit(shifts[7]!.id, { outMinute: 1020 });
    const run = await compute();
    expect(run.blockers).toEqual([]);
    // More pay is due: a warning, never a blocker. (The approval below records the differences approved.)
    expect(run.warnings.filter((w) => w.code === "correction_pay_due")).toEqual([expect.objectContaining({ workerId: anita, grossCents: 3650 })]);
    expect(run.warnings.find((w) => w.code === "correction_pay_due")!.message).toContain("29 C.F.R. § 778.106");
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    expect((await runs())[1]!.approval?.differences).toEqual({ baseVersion: 1, payCents: 3650, billCents: 5300, workers: 1 });
    const out = await files();

    // The payroll file: only Anita's 2 hours ($36.50), named for the correction.
    expect(out.payroll!.controlTotals).toMatchObject({ workers: 1, minutesByType: { REG: 120 }, grossCents: 3650 });
    expect(out.payroll!.filename).toBe("gusto-hours-2026-10-05-to-2026-10-11-correction-2.csv");
    expect((await text(out.payroll!.storageKey)).trim().split("\n")[1]).toMatch(/^Patel,Anita,.*,2\.00,0\.00,0\.00$/);
    expect(out.payroll!.notes[0]).toContain("only the differences against version 1");

    // A supplemental invoice numbered from the original: 2 h × $26.50 = $53.00.
    expect(out.invoices).toEqual([expect.objectContaining({ number: "PLM-20261005-S1", kind: "supplemental", totalCents: 5300, originalNumber: "PLM-20261005" })]);
    const [inv] = await inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.number, "PLM-20261005-S1")));
    expect(inv!.originalInvoiceId).toBe(original.invoices[0]!.invoiceId);

    // The original files never change.
    const v1 = original.invoices[0]!;
    expect((await invoicesNow()).find((i) => i.id === v1.invoiceId)).toMatchObject({ number: "PLM-20261005", totalCents: v1.totalCents, pdfStorageKey: v1.storageKey });
    expect(await text(original.payroll!.storageKey)).toContain("Patel,Anita");

    // The version is exported, its hours locked, and the period is paid again.
    expect((await runs()).map((r) => [r.version, r.status])).toEqual([
      [1, "exported"],
      [2, "exported"],
    ]);
    expect(await inAgency((tx) => periodState(tx, w2))).toBe("exported");
    const [wednesday] = await inAgency((tx) => tx.select().from(s.timeEntries).where(eq(s.timeEntries.id, shifts[7]!.id)));
    expect(wednesday).toMatchObject({ status: "locked", paidStatus: "reviewed" });
  });

  it("a second correction is against the latest paid version and numbered after the first", async () => {
    await start();
    await edit(shifts[7]!.id, { outMinute: 1020 });
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    await files();
    expect(await start("One more hour on Tuesday")).toMatchObject({ ok: true, version: 3 });
    // Anita's Tuesday 8 h → 9 h. (Her Monday stays as the client approved it: not editable.)
    await edit(shifts[6]!.id, { outMinute: 960 });
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    const out = await files();
    expect(out.payroll!.controlTotals).toMatchObject({ minutesByType: { REG: 60 }, grossCents: 1825 });
    expect(out.payroll!.notes[0]).toContain("only the differences against version 2");
    expect(out.invoices).toEqual([expect.objectContaining({ number: "PLM-20261005-S2", totalCents: 2650 })]);
  });

  it("overtime added alone goes in the file, checked against the worker's regular rate", async () => {
    await start("Marcus stayed 2 hours late on Friday");
    // Marcus Friday 8 h → 10 h: 2 more hours, all overtime (48 h): 2 h × $27.375 = $54.75.
    await edit(shifts[4]!.id, { outMinute: 1020 });
    // Review totals: was and now are his whole pay for the period in each version ($894.25 → $949.00).
    const totals = await inAgency((tx) => totalsStep(tx, theOwner, w2));
    expect(totals.correction?.workers).toEqual([expect.objectContaining({ workerId: marcus, wasCents: 89_425, nowCents: 94_900, diffCents: 5475, overtime: 120 })]);
    expect(totals.correction?.clients).toEqual([expect.objectContaining({ wasCents: 129_850 + 63_600, nowCents: 129_850 + 63_600 + 7950, diffCents: 7950 })]);
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    const out = await files();
    expect(out.payroll!.controlTotals).toMatchObject({ workers: 1, minutesByType: { OT: 120 }, grossCents: 5475 });
    expect((await text(out.payroll!.storageKey)).trim().split("\n")[1]).toMatch(/^Bell,Marcus,.*,0\.00,2\.00,0\.00$/);
    // Billed: 2 h × $39.75 = $79.50.
    expect(out.invoices).toEqual([expect.objectContaining({ number: "PLM-20261005-S1", totalCents: 7950 })]);
  });
});

describe("a correction that lowers pay", () => {
  beforeEach(paidWeek);

  it("needs a recorded decision for the overpayment, never a negative line; the client gets a credit note", async () => {
    await start("Marcus left at 3 pm on Wednesday");
    // Marcus Wednesday 10 h → 8 h: 44 h, so 2 fewer overtime hours: −2 h × $27.375 = −$54.75.
    await edit(shifts[2]!.id, { outMinute: 900 });
    const run = await compute();
    expect(run.blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: -5475 })]);
    expect(run.blockers[0]!.message).toContain("$54.75 less");

    // Only the Owner decides, with a note, and the choice must fit: less pay is not "paid by hand".
    expect(await inAgency((tx) => recordCorrectionDecision(tx, coordinator, w2, marcus, "repaid_outside_payroll", "Repaid by check"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, marcus, "repaid_outside_payroll", " "))).toEqual({ ok: false, error: "note_required" });
    expect(await inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, marcus, "paid_by_hand", "x"))).toEqual({ ok: false, error: "wrong_kind" });
    expect(await inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, anita, "written_off", "x"))).toEqual({ ok: false, error: "not_needed" });
    expect(await inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, marcus, "repaid_outside_payroll", "Repaid by check 1042"))).toEqual({ ok: true });
    expect((await compute()).blockers).toEqual([]);

    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    const out = await files();
    // Nothing to add to anyone's pay: no payroll file. The decision is the record.
    expect(out.payroll).toBeNull();
    const [decision] = await inAgency((tx) => tx.select().from(s.correctionDecisions));
    expect(decision).toMatchObject({ workerId: marcus, decision: "repaid_outside_payroll", differenceCents: -5475, note: "Repaid by check 1042", decidedByLabel: "Test owner" });
    // Billed 2 fewer overtime hours: −2 h × $39.75 = −$79.50, a credit note against the original.
    expect(out.invoices).toEqual([expect.objectContaining({ number: "PLM-20261005-CN-01", kind: "credit_note", totalCents: -7950, originalNumber: "PLM-20261005" })]);
    // The credit note says what it credits, line by line, with the sign shown.
    const credit = await pdfText(await store.get(out.invoices[0]!.storageKey));
    expect(credit).toContain("Credit note");
    expect(credit).toContain("Credits invoice PLM-20261005");
    expect(credit).toContain("$79.50 credited to invoice PLM-20261005");
    expect(credit).toContain("-2:00");
    expect(credit).toContain("was 6:00 h, now 4:00 h");
    // A decision on paid files stays (outside the demo agency, whose reset may erase everything).
    await owner.db.update(s.agencies).set({ isDemo: false }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    try {
      expect(await databaseError(owner.db.delete(s.correctionDecisions).where(eq(s.correctionDecisions.id, decision!.id)))).toMatch(/cannot be removed/);
    } finally {
      await owner.db.update(s.agencies).set({ isDemo: true }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    }
  });

  it("asks only for what is left to settle when the overpayment grows", async () => {
    await start("Marcus left at 3 pm on Wednesday");
    await edit(shifts[2]!.id, { outMinute: 900 });
    await compute();
    await inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, marcus, "written_off", "Small amount, written off"));
    expect((await compute()).blockers).toEqual([]);
    // One more hour off: 3 h of overtime now, 3 h × $27.375 = $82.125 → $82.13, against $164.25 paid: −$82.12,
    // of which $54.75 is already written off: −$27.37 left to settle.
    await edit(shifts[2]!.id, { outMinute: 840 });
    const run = await compute();
    expect(run.blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: -2737 })]);
    expect(run.blockers[0]!.message).toContain("left to settle");
  });
});

describe("decisions are a record of what was settled (second opinion, findings 1 and 3)", () => {
  beforeEach(paidWeek);
  const decisionsOf = () => inAgency((tx) => tx.select().from(s.correctionDecisions).orderBy(asc(s.correctionDecisions.decidedAt)));

  it("money repaid stays on record: when the difference turns to more pay, the refund and the new pay are left to settle", async () => {
    await start("Marcus left at 3 pm on Wednesday");
    await edit(shifts[2]!.id, { outMinute: 900 });
    await compute();
    expect(await record(marcus, "repaid_outside_payroll", "Repaid by check 1042")).toEqual({ ok: true });
    // He stayed until 6 pm after all (11 h): 7 h of overtime, 420 min × $27.375/h = $191.625 → $191.63, against
    // $164.25 paid: +$27.38 owed, and the $54.75 he repaid is owed back: $82.13 left to settle.
    await edit(shifts[2]!.id, { outMinute: 1080 });
    const run = await compute();
    expect(run.blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: 8213 })]);
    expect(run.blockers[0]!.message).toContain("repaid outside payroll");
    expect(await record(marcus, "paid_by_hand", "Refund $54.75 and $27.38 more, check 1050")).toEqual({ ok: true });
    expect((await compute()).blockers).toEqual([]);
    expect((await decisionsOf()).map((d) => [d.decision, d.differenceCents])).toEqual([
      ["repaid_outside_payroll", -5475],
      ["paid_by_hand", 8213],
    ]);
  });

  it("a decision recorded by mistake is removed (Owner); then the file carries the additions", async () => {
    await start("Marcus left at 3 pm on Wednesday");
    await edit(shifts[2]!.id, { outMinute: 900 });
    await compute();
    await record(marcus, "repaid_outside_payroll", "Repaid by check 1042");
    await edit(shifts[2]!.id, { outMinute: 1080 });
    const [repaid] = await decisionsOf();
    expect(await inAgency((tx) => removeCorrectionDecision(tx, coordinator, w2, repaid!.id))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => removeCorrectionDecision(tx, theOwner, w2, repaid!.id))).toEqual({ ok: true });
    expect((await compute()).blockers).toEqual([]);
    const out = await approveAndFile();
    expect(out.payroll!.controlTotals).toMatchObject({ minutesByType: { OT: 60 }, grossCents: 2738 });
  });

  it("an agreement that no longer fits (a write-off of an overpayment that is gone) must be removed, and holds the correction from being discarded", async () => {
    await start("Marcus left at 3 pm on Wednesday");
    await edit(shifts[2]!.id, { outMinute: 900 });
    await compute();
    await record(marcus, "written_off", "Small amount, written off");
    await edit(shifts[2]!.id, { outMinute: 1020 });
    const run = await compute();
    expect(run.blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: 0 })]);
    expect(run.blockers[0]!.message).toContain("no longer fits");
    expect(await record(marcus, "paid_by_hand", "x")).toEqual({ ok: false, error: "wrong_kind" });
    expect(await inAgency((tx) => discardCorrection(tx, theOwner, w2))).toEqual({ ok: false, error: "has_decisions" });
    const [writeOff] = await decisionsOf();
    await inAgency((tx) => removeCorrectionDecision(tx, theOwner, w2, writeOff!.id));
    expect((await compute()).blockers.map((b) => b.code)).toEqual(["correction_no_differences"]);
    expect(await inAgency((tx) => discardCorrection(tx, theOwner, w2))).toEqual({ ok: true });
  });

  it("money repaid for an overpayment that is gone is owed back", async () => {
    await start("Marcus left at 3 pm on Wednesday");
    await edit(shifts[2]!.id, { outMinute: 900 });
    await compute();
    await record(marcus, "repaid_outside_payroll", "Repaid by check 1042");
    await edit(shifts[2]!.id, { outMinute: 1020 });
    const run = await compute();
    expect(run.blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: 5475 })]);
    // The refund is pay due (29 C.F.R. § 778.106 warning), though the hours now match what was paid.
    expect(run.warnings.filter((w) => w.code === "correction_pay_due")).toEqual([expect.objectContaining({ workerId: marcus, grossCents: 5475 })]);
    expect(await record(marcus, "paid_by_hand", "Refunded by check 1051")).toEqual({ ok: true });
    expect((await compute()).blockers).toEqual([]);
  });

  it("pay written off in an earlier correction is not paid again when the hours come back", async () => {
    await start("Marcus left at 3 pm on Wednesday");
    await edit(shifts[2]!.id, { outMinute: 900 });
    await compute();
    await record(marcus, "written_off", "Small amount, written off");
    await approveAndFile();
    expect(await start("He did stay until 5 pm")).toMatchObject({ ok: true, version: 3 });
    await edit(shifts[2]!.id, { outMinute: 1020 });
    const run = await compute();
    // He still holds the $54.75 written off in version 2.
    expect(run.blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: 5475, heldCents: 5475 })]);
    expect(run.blockers[0]!.message).toContain("written off");
    expect(await record(marcus, "offset_earlier_overpayment", "Covered by the $54.75 he kept in version 2")).toEqual({ ok: true });
    expect((await compute()).blockers).toEqual([]);
    const out = await approveAndFile();
    expect(out.payroll).toBeNull();
  });

  it("more pay than the worker kept: the offset covers what was kept, the rest is paid by hand, and what was kept is used up", async () => {
    await start("Marcus left at 3 pm on Wednesday");
    await edit(shifts[2]!.id, { outMinute: 900 });
    await compute();
    await record(marcus, "written_off", "Small amount, written off");
    await approveAndFile();
    await start("He stayed until 6 pm");
    // 11 h now: +$82.13 against version 2 ($191.63 − $109.50), of which $54.75 was kept.
    await edit(shifts[2]!.id, { outMinute: 1080 });
    expect((await compute()).blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: 8213, heldCents: 5475 })]);
    expect(await record(marcus, "offset_earlier_overpayment", "Covered by the $54.75 he kept")).toEqual({ ok: true });
    expect((await compute()).blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: 2738 })]);
    expect(await record(marcus, "offset_earlier_overpayment", "x")).toEqual({ ok: false, error: "wrong_kind" });
    expect(await record(marcus, "paid_by_hand", "Paid $27.38 by hand")).toEqual({ ok: true });
    expect((await compute()).blockers).toEqual([]);
    expect((await decisionsOf()).filter((d) => d.decision !== "written_off").map((d) => [d.decision, d.differenceCents])).toEqual([
      ["offset_earlier_overpayment", 5475],
      ["paid_by_hand", 2738],
    ]);
    await approveAndFile();
    // Version 4 takes the extra hour off again: −$27.37. Nothing is kept any more, so it is an ordinary overpayment.
    await start("He left at 5 pm after all");
    await edit(shifts[2]!.id, { outMinute: 1020 });
    expect((await compute()).blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: marcus, grossCents: -2738 })]);
  });
});

describe("a correction the payroll file cannot carry as additions", () => {
  beforeEach(paidWeek);

  it("a rate fixed for the whole week moves pay between rates: the Owner records that the difference is paid by hand", async () => {
    await start("Anita's rate should have been $19.00");
    await owner.db.insert(s.rateCards).values({
      agencyId: theOwner.agencyId,
      jobOrderId: jobOrderId("il-operator"),
      assignmentId: assignmentId("anita-patel"),
      effectiveFrom: "2026-10-05",
      payRateCents: 1900,
      billRateCents: 2650,
      otMultiplierNum: 3,
      otMultiplierDen: 2,
      dtMultiplierNum: 2,
      dtMultiplierDen: 1,
    });
    // 24 h × ($19.00 − $18.25) = $18.00 more; the bill rate is unchanged, so nothing is billed.
    const run = await compute();
    expect(run.blockers).toEqual([expect.objectContaining({ code: "correction_decision_needed", workerId: anita, grossCents: 1800 })]);
    expect(await inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, anita, "written_off", "x"))).toEqual({ ok: false, error: "wrong_kind" });
    expect(await inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, anita, "paid_by_hand", "Paid $18.00 in Gusto as a separate amount"))).toEqual({ ok: true });
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    const out = await files();
    expect(out.payroll).toBeNull();
    expect(out.invoices).toEqual([]);
  });

  it("hours added at a rate Gusto does not pay are paid by hand (Gusto pays its stored rate; second opinion, finding 2)", async () => {
    await start("Anita's Thursday was missing, at her new rate");
    await owner.db.insert(s.rateCards).values({
      agencyId: theOwner.agencyId,
      jobOrderId: jobOrderId("il-operator"),
      assignmentId: assignmentId("anita-patel"),
      effectiveFrom: "2026-10-08",
      payRateCents: 1900,
      billRateCents: 2650,
      otMultiplierNum: 3,
      otMultiplierDen: 2,
      dtMultiplierNum: 2,
      dtMultiplierDen: 1,
    });
    await addShift("anita-patel", "2026-10-08", 420, 900);
    // 8 h × $19.00 = $152.00 more, at a rate other than her $18.25 earlier in the week.
    const run = await compute();
    expect(run.blockers).toEqual([expect.objectContaining({ code: "export_refused", workerId: anita, grossCents: 15_200 })]);
    expect(await record(anita, "paid_by_hand", "Paid $152.00 in Gusto at $19.00/h")).toEqual({ ok: true });
    const out = await approveAndFile();
    expect(out.payroll).toBeNull();
    // Billed: 8 h × $26.50 = $212.00.
    expect(out.invoices).toEqual([expect.objectContaining({ number: "PLM-20261005-S1", totalCents: 21_200 })]);
  });

  it("a worker the correction does not change is not held for the payroll file (no dead end; finding 8)", async () => {
    await start("Marcus stayed 2 hours late on Friday");
    await owner.db.update(s.workers).set({ payrollIds: {} }).where(eq(s.workers.id, anita));
    await edit(shifts[4]!.id, { outMinute: 1020 });
    expect((await compute()).blockers).toEqual([]);
  });
});

describe("workers skipped in the version a correction corrects (finding 4)", () => {
  beforeEach(async () => {
    const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
    if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
    await inAgency(async (tx) => {
      await clearDemoAgency(tx);
      await seedDemoAgency(tx);
    });
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await addShift("marcus-bell", d, 420, 1020);
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await addShift("anita-patel", d, 420, 900);
    await inAgency((tx) => setSkipped(tx, theOwner, w2, anita, { skipped: true, reason: "paid by hand" }));
    await approveAndFile();
  });

  it("stay skipped: bringing them back would pay again what was paid separately", async () => {
    await start();
    await expect(inAgency((tx) => setSkipped(tx, theOwner, w2, anita, { skipped: false, reason: "pay through the file" }))).rejects.toThrow(/skipped in version 1/);
  });
});

describe("a correction's documents (decision E11)", () => {
  beforeEach(paidWeek);

  it("none for a client whose differences net to zero; a supplemental invoice or a credit note otherwise, numbered from the original", async () => {
    const [period] = await inAgency((tx) => tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, w2)));
    // One hour at $26.50 more (or less) for Marcus Bell's week.
    const diff = (amountCents: number) => ({ clientId: clientId("il"), workerId: marcus, assignmentId: assignmentId("marcus-bell"), workweekStart: "2026-10-05", type: "REG" as const, minutes: amountCents > 0 ? 60 : -60, rate: { num: 2650, den: 1 }, amountCents, wasLines: 1, nowLines: 1 });
    const plan = (diffs: number[]) => inAgency((tx) => planCorrectionInvoices(tx, period!, diffs.map(diff)));
    expect(await plan([2650, -2650])).toEqual({ plans: [], problems: [], quiet: [] });
    // A cent rounding left over when hours moved at one rate is not billed (second opinion, finding 6).
    const leftover = { ...diff(1), minutes: 0 };
    expect(await inAgency((tx) => planCorrectionInvoices(tx, period!, [leftover]))).toEqual({ plans: [], problems: [], quiet: [] });
    expect((await plan([2650])).plans.map((p) => [p.number, p.kind, p.totalCents, p.original?.number])).toEqual([["PLM-20261005-S1", "supplemental", 2650, "PLM-20261005"]]);
    expect((await plan([-2650])).plans.map((p) => [p.number, p.kind, p.totalCents, p.original?.number])).toEqual([["PLM-20261005-CN-01", "credit_note", -2650, "PLM-20261005"]]);
  });
});

describe("the latest paid version is what later weeks compare with", () => {
  beforeEach(paidWeek);

  it("the overtime warning for the next week compares with the paid version while a correction is open", async () => {
    await start();
    const [w3] = await owner.db.insert(s.payPeriods).values({ agencyId: theOwner.agencyId, startsOn: "2026-10-12", endsOn: "2026-10-18" }).returning();
    for (const d of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]) {
      await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: w3!.id, workerNameRaw: "marcus-bell", workerId: marcus, assignmentId: assignmentId("marcus-bell"), workDate: d, inMinute: 360, outMinute: 1080, breakMinutes: 0, minutes: 720, confidence: "high", status: "reviewed" });
    }
    const run = await inAgency((tx) => computeRun(tx, theOwner, w3!.id));
    expect(run.warnings.filter((w) => w.code === "overtime_spike").map((w) => w.message)).toEqual(["Marcus Bell: 20:00 of overtime this period against 6:00 in the period before."]);
  });
});
