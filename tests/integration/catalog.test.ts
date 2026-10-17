/**
 * Slice (b): job orders, assignments and rate cards (SPEC §4, §8). Rate versions follow Bullhorn's
 * model; a version used by a paid week is never changed (Stripe); a worker's own rates apply on the
 * dates they cover; paid hours never fall outside their assignment.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelAssignment, createAssignment, setAssignmentDates } from "../../src/server/catalog/assignments";
import { createJobOrder, updateJobOrder, type JobOrderInput } from "../../src/server/catalog/job-orders";
import { addRateVersion, deleteRateVersion, editRateVersion } from "../../src/server/catalog/rate-cards";
import type { RateInput } from "../../src/server/catalog/versions";
import { agencies, assignments, auditEvents, billLines, clients, payLines, rateCards, sourceDocuments, timeEntries, workers } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, jobOrderId, periodId, seedDemoAgency, workerId, worksiteId } from "../../src/server/demo/seed";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import { lockCatalog, PeriodBusyError, periodLock } from "../../src/server/run/period-lock";
import { hoursStep } from "../../src/server/convert/queries";
import { editEntry } from "../../src/server/review/service";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-catalog-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const week = periodId("w2"); // 2026-10-05 to 2026-10-11; w1 before it was paid before Granite
const SAMPLE = "IL-prairie-line-timeclock-2026-10-05.csv";
const OPERATOR = jobOrderId("il-operator");

const rate = (over: Partial<RateInput> = {}): RateInput => ({
  effectiveFrom: "2026-10-08",
  payRateCents: 2000,
  bill: { rateCents: 2900 },
  otMultiplier: { num: 3, den: 2 },
  dtMultiplier: { num: 2, den: 1 },
  wcClassCode: "3632",
  ...over,
});
const jobCard = () => inAgency((tx) => tx.select().from(rateCards).where(and(eq(rateCards.jobOrderId, OPERATOR), isNull(rateCards.assignmentId))));
const payRatesOf = async (who: string) => {
  const run = await inAgency((tx) => computeRun(tx, actor, week));
  const lines = await inAgency((tx) => tx.select().from(payLines).where(and(eq(payLines.payRunId, run.runId), eq(payLines.workerId, workerId(who)))));
  return [...new Set(lines.filter((l) => l.type === "REG").map((l) => l.rateNum / l.rateDen))].sort();
};

beforeEach(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  const { documentId } = await inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: week, filename: SAMPLE, bytes: readFileSync(`demo/samples/2026-10-05/${SAMPLE}`) }));
  await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, documentId);
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("rate card versions", () => {
  it("a new version ends the one in force the day before, and the run pays it from its date", async () => {
    expect(await payRatesOf("anita-patel")).toEqual([1825]);
    const r = await inAgency((tx) => addRateVersion(tx, actor, { jobOrderId: OPERATOR }, rate()));
    expect(r.ok).toBe(true);
    const card = await jobCard();
    expect(card.map((v) => [v.effectiveFrom, v.effectiveTo]).sort()).toEqual([
      [card.find((v) => v.effectiveFrom < "2026-10-08")!.effectiveFrom, "2026-10-07"],
      ["2026-10-08", null],
    ]);
    expect(await payRatesOf("anita-patel")).toEqual([1825, 2000]);
    expect((await inAgency((tx) => addRateVersion(tx, actor, { jobOrderId: OPERATOR }, rate()))).ok).toBe(false); // same start
  });

  it("never changes a version a paid week used; a new one must start after the last paid day", async () => {
    const [used] = await jobCard();
    expect(await inAgency((tx) => editRateVersion(tx, actor, used!.id, rate({ effectiveFrom: used!.effectiveFrom }), ["data_entry"], ""))).toMatchObject({ ok: false, error: "paid" });
    expect(await inAgency((tx) => deleteRateVersion(tx, actor, used!.id))).toMatchObject({ ok: false, error: "paid" });
    const inPaidWeek = await inAgency((tx) => addRateVersion(tx, actor, { jobOrderId: OPERATOR }, rate({ effectiveFrom: "2026-10-01" })));
    expect(inPaidWeek).toMatchObject({ ok: false, error: "paid", paidThrough: "2026-10-04" });
  });

  it("edits an unused version only with a reason, and deletes it by extending the one before", async () => {
    const added = await inAgency((tx) => addRateVersion(tx, actor, { jobOrderId: OPERATOR }, rate({ effectiveFrom: "2026-11-02" })));
    if (!added.ok) throw new Error(added.error);
    expect(await inAgency((tx) => editRateVersion(tx, actor, added.id, rate({ effectiveFrom: "2026-11-02", payRateCents: 2100 }), [], ""))).toEqual({ ok: false, error: "reason_required" });
    expect(await inAgency((tx) => editRateVersion(tx, actor, added.id, rate({ effectiveFrom: "2026-11-02", payRateCents: 2100 }), ["other"], " "))).toEqual({ ok: false, error: "note_required" });
    expect((await inAgency((tx) => editRateVersion(tx, actor, added.id, rate({ effectiveFrom: "2026-11-09", payRateCents: 2100 }), ["client_agreed"], "new contract"))).ok).toBe(true);
    let card = await jobCard();
    expect(card.map((v) => [v.effectiveTo, v.payRateCents]).sort()).toEqual([
      ["2026-11-08", 1825],
      [null, 2100],
    ].sort());
    const [event] = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, added.id), eq(auditEvents.action, "update"))));
    expect(event!.reason).toBe("client_agreed: new contract");

    expect((await inAgency((tx) => deleteRateVersion(tx, actor, added.id))).ok).toBe(true);
    card = await jobCard();
    expect(card.map((v) => v.effectiveTo)).toEqual([null]);
  });

  it("keeps the earliest version while later ones exist", async () => {
    const added = await inAgency((tx) => addRateVersion(tx, actor, { assignmentId: assignmentId("anita-patel") }, rate({ effectiveFrom: "2026-10-12" })));
    const later = await inAgency((tx) => addRateVersion(tx, actor, { assignmentId: assignmentId("anita-patel") }, rate({ effectiveFrom: "2026-11-02" })));
    if (!added.ok || !later.ok) throw new Error("setup");
    expect(await inAgency((tx) => deleteRateVersion(tx, actor, added.id))).toEqual({ ok: false, error: "earliest" });
    expect(await inAgency((tx) => editRateVersion(tx, actor, added.id, rate({ effectiveFrom: "2026-11-09" }), ["data_entry"], ""))).toEqual({ ok: false, error: "earliest" });
  });

  it("a worker's own rates apply on the dates they cover; others keep the job order's", async () => {
    expect((await inAgency((tx) => addRateVersion(tx, actor, { assignmentId: assignmentId("anita-patel") }, rate({ payRateCents: 2200, bill: { rateCents: 3100 } })))).ok).toBe(true);
    expect(await payRatesOf("anita-patel")).toEqual([1825, 2200]);
    const others = (await inAgency((tx) => tx.select().from(workers))).filter((w) => w.id !== workerId("anita-patel"));
    const run = await inAgency((tx) => computeRun(tx, actor, week));
    const lines = await inAgency((tx) => tx.select().from(payLines).where(eq(payLines.payRunId, run.runId)));
    expect(lines.filter((l) => others.some((w) => w.id === l.workerId)).every((l) => l.rateNum / l.rateDen !== 2200)).toBe(true);
  });

  it("a bill rate entered as a markup is rounded once, and the working is kept and shown on the bill line", async () => {
    const r = await inAgency((tx) => addRateVersion(tx, actor, { jobOrderId: OPERATOR }, rate({ payRateCents: 1825, bill: { markupBp: 4500 } })));
    if (!r.ok) throw new Error(r.error);
    const [v] = await inAgency((tx) => tx.select().from(rateCards).where(eq(rateCards.id, r.id)));
    expect([v!.billRateCents, v!.markupBp]).toEqual([2646, 4500]);
    const working = "$18.25 × (100% + 45.00%) = 2646.25¢, rounded half up to $26.46";
    const [event] = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, r.id), eq(auditEvents.action, "create"))));
    expect(event!.reason).toBe(working);
    const run = await inAgency((tx) => computeRun(tx, actor, week));
    const bill = await inAgency((tx) => tx.select().from(billLines).where(and(eq(billLines.payRunId, run.runId), eq(billLines.workerId, workerId("anita-patel")))));
    expect(bill.filter((l) => l.rateNum === 2646).every((l) => l.explain.includes(`(${working})`))).toBe(true);
    expect(bill.some((l) => l.rateNum === 2646)).toBe(true);
  });

  it("refuses rates that are not sound", async () => {
    expect(await inAgency((tx) => addRateVersion(tx, actor, { jobOrderId: OPERATOR }, rate({ payRateCents: 0, otMultiplier: { num: 1, den: 2 } })))).toEqual({
      ok: false,
      error: "invalid",
      problems: ["pay_rate", "ot_multiplier"],
    });
    expect(await inAgency((tx) => addRateVersion(tx, actor, { jobOrderId: "00000000-0000-4000-a000-0000000000ee" }, rate()))).toEqual({ ok: false, error: "not_found" });
  });

  it("waits for files being created: a rate cannot change while a week is paid with it", async () => {
    const usual = periodLock.timeoutMs;
    periodLock.timeoutMs = 200;
    let release!: () => void;
    let held!: () => void;
    const isHeld = new Promise<void>((r) => (held = r));
    const released = new Promise<void>((r) => (release = r));
    const exporting = inAgency(async (tx) => {
      await lockCatalog(tx, actor.agencyId, "shared");
      held();
      await released;
    });
    try {
      await isHeld;
      await expect(inAgency((tx) => addRateVersion(tx, actor, { jobOrderId: OPERATOR }, rate()))).rejects.toBeInstanceOf(PeriodBusyError);
    } finally {
      release();
      await exporting;
      periodLock.timeoutMs = usual;
    }
  });
});

describe("job orders", () => {
  const input = (over: Partial<JobOrderInput> = {}): JobOrderInput => ({
    clientId: clientId("il"),
    worksiteId: worksiteId("il"),
    position: "Forklift Operator",
    socCode: "53-7051",
    shift: "Night",
    headcount: 3,
    payMinCents: 1900,
    payMaxCents: 2300,
    prevailingWage: false,
    ...over,
  });

  it("creates one at the client's own worksite, and names every problem", async () => {
    expect((await inAgency((tx) => createJobOrder(tx, actor, input()))).ok).toBe(true);
    expect(await inAgency((tx) => createJobOrder(tx, actor, input({ worksiteId: worksiteId("ma"), position: " ", socCode: "5307", headcount: 0, payMinCents: 2400 })))).toEqual({
      ok: false,
      error: "invalid",
      fields: ["worksite", "position", "soc_code", "headcount", "pay_range"],
    });
  });

  it("keeps a job order's client once workers are assigned to it", async () => {
    expect(await inAgency((tx) => updateJobOrder(tx, actor, OPERATOR, input({ clientId: clientId("ma"), worksiteId: worksiteId("ma") })))).toEqual({ ok: false, error: "client_has_assignments" });
    expect((await inAgency((tx) => updateJobOrder(tx, actor, OPERATOR, input({ position: "Machine Operator II" })))).ok).toBe(true);
  });
});

describe("assignments", () => {
  it("refuses overlapping assignments of one worker on one job order, and dates in the wrong order", async () => {
    expect(await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: OPERATOR, startDate: "2026-10-20", endDate: null }))).toEqual({ ok: false, error: "overlaps" });
    expect(await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("il-assembler-day"), startDate: "2026-10-20", endDate: "2026-10-19" }))).toEqual({
      ok: false,
      error: "end_before_start",
    });
    expect((await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("il-assembler-day"), startDate: "2026-10-20", endDate: null }))).ok).toBe(true);
  });

  it("an ended assignment still takes the timesheets dated inside it (late timesheets are normal)", async () => {
    expect((await inAgency((tx) => setAssignmentDates(tx, actor, assignmentId("anita-patel"), { startDate: "2026-01-01", endDate: "2026-10-09" }))).ok).toBe(true);
    const [a] = await inAgency((tx) => tx.select().from(assignments).where(eq(assignments.id, assignmentId("anita-patel"))));
    expect(a!.status).toBe("active"); // "ended" is worked out from the dates, never stored
    const [doc] = await inAgency((tx) => tx.select().from(sourceDocuments).where(eq(sourceDocuments.filename, SAMPLE)));
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "received" }).where(eq(sourceDocuments.id, doc!.id)));
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, doc!.id);
    const hers = await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, workerId("anita-patel")), eq(timeEntries.payPeriodId, week))));
    expect(hers.length).toBeGreaterThan(0);
    expect(hers.filter((e) => e.workDate! <= "2026-10-09").every((e) => e.assignmentId === assignmentId("anita-patel"))).toBe(true);
  });

  it("a worker who moved to another client: the old client's timesheet days after the move go to review, never to the new client's bill", async () => {
    expect((await inAgency((tx) => setAssignmentDates(tx, actor, assignmentId("anita-patel"), { startDate: "2026-01-01", endDate: "2026-10-07" }))).ok).toBe(true);
    expect((await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("ma-server"), startDate: "2026-10-08", endDate: null }))).ok).toBe(true);
    const [doc] = await inAgency((tx) => tx.select().from(sourceDocuments).where(eq(sourceDocuments.filename, SAMPLE)));
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "received" }).where(eq(sourceDocuments.id, doc!.id)));
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, doc!.id);
    const late = (await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, workerId("anita-patel")), eq(timeEntries.payPeriodId, week))))).filter(
      (e) => e.workDate! >= "2026-10-08",
    );
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((e) => e.status === "needs_review" && e.assignmentId === null && e.reviewReasons.includes("assignment_at_other_client"))).toBe(true);
    // Held entries never show as high confidence: bulk approval could never take them.
    expect(late.every((e) => e.confidence !== "high")).toBe(true);
    const run = await inAgency((tx) => computeRun(tx, actor, week));
    const bill = await inAgency((tx) => tx.select().from(billLines).where(eq(billLines.payRunId, run.runId)));
    expect(bill.some((l) => l.clientId === clientId("ma"))).toBe(false);

    // Review names where the assignment is, and the grid shows it on the held row.
    const [ma] = await inAgency((tx) => tx.select().from(clients).where(eq(clients.id, clientId("ma"))));
    const [il] = await inAgency((tx) => tx.select().from(clients).where(eq(clients.id, clientId("il"))));
    const entry = late[0]!;
    const grid = await inAgency((tx) => hoursStep(tx, week));
    expect(grid.rows.find((r) => r.id === entry.id)!.otherClient).toEqual({ id: clientId("ma"), name: ma!.name });
    const named = { ok: false, error: "assignment_at_other_client", clients: [{ id: clientId("ma"), name: ma!.name }] };
    expect(await inAgency((tx) => editEntry(tx, actor, entry.id, { workerId: workerId("anita-patel") }, ["confirmed_worker"], ""))).toEqual(named);
    // The everyday reason "Confirmed with the client" never moves hours to another client by itself.
    expect(await inAgency((tx) => editEntry(tx, actor, entry.id, { workerId: workerId("anita-patel") }, ["misread_corrected", "confirmed_client"], "supervisor email"))).toEqual(named);
    // Attaching them elsewhere is its own choice, naming the client; another client is refused.
    expect(await inAgency((tx) => editEntry(tx, actor, entry.id, {}, ["confirmed_client"], "", { attachToClientId: clientId("il") }))).toEqual(named);
    expect(await inAgency((tx) => editEntry(tx, actor, entry.id, {}, ["confirmed_client"], "Hours are for the Boston site", { attachToClientId: clientId("ma") }))).toEqual({ ok: true });
    const [moved] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, entry.id)));
    const [maAssignment] = await inAgency((tx) => tx.select().from(assignments).where(and(eq(assignments.workerId, workerId("anita-patel")), eq(assignments.jobOrderId, jobOrderId("ma-server")))));
    expect(moved!.assignmentId).toBe(maAssignment!.id);
    const [logged] = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, entry.id), eq(auditEvents.action, "update"))));
    // The reason stays the person's own; the move is data the history shows in the reader's language.
    expect(logged!.reason).toBe("confirmed_client: Hours are for the Boston site");
    expect(logged!.after).toMatchObject({ attachedToClient: ma!.name, timesheetClient: il!.name });
    // Once attached, a later fix to the same entry keeps it there without attaching again.
    expect(await inAgency((tx) => editEntry(tx, actor, entry.id, { outMinute: (moved!.outMinute ?? 900) - 15 }, ["confirmed_worker"], "left early"))).toEqual({ ok: true });
    // Another worker on the line follows the usual rules: the earlier attach was for Anita's hours, not theirs.
    expect(await inAgency((tx) => editEntry(tx, actor, entry.id, { workerId: workerId("conor-byrne") }, ["matched_worker"], ""))).toEqual(named);
    const [still] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, entry.id)));
    expect([still!.workerId, still!.assignmentId]).toEqual([workerId("anita-patel"), maAssignment!.id]);
  });

  it("a line attached to another client stays there when the timesheet's client later has an assignment that day too", async () => {
    expect((await inAgency((tx) => setAssignmentDates(tx, actor, assignmentId("anita-patel"), { startDate: "2026-01-01", endDate: "2026-10-07" }))).ok).toBe(true);
    expect((await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("ma-server"), startDate: "2026-10-08", endDate: null }))).ok).toBe(true);
    const [doc] = await inAgency((tx) => tx.select().from(sourceDocuments).where(eq(sourceDocuments.filename, SAMPLE)));
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "received" }).where(eq(sourceDocuments.id, doc!.id)));
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, doc!.id);
    const [entry] = (await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, workerId("anita-patel")), eq(timeEntries.payPeriodId, week))))).filter((e) => e.workDate! >= "2026-10-08");
    expect(await inAgency((tx) => editEntry(tx, actor, entry!.id, {}, ["confirmed_client"], "", { attachToClientId: clientId("ma") }))).toEqual({ ok: true });
    const [attached] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, entry!.id)));
    // Later she is also assigned at the timesheet's client from that day.
    expect((await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("il-assembler-day"), startDate: "2026-10-08", endDate: null }))).ok).toBe(true);
    expect(await inAgency((tx) => editEntry(tx, actor, entry!.id, { outMinute: (attached!.outMinute ?? 900) - 15 }, ["confirmed_worker"], "left early"))).toEqual({ ok: true });
    const [after] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, entry!.id)));
    expect(after!.assignmentId).toBe(attached!.assignmentId);
  });

  it("a worker at two other clients that day: both are named, in name order, and the hours attach to the one chosen", async () => {
    expect((await inAgency((tx) => setAssignmentDates(tx, actor, assignmentId("anita-patel"), { startDate: "2026-01-01", endDate: "2026-10-07" }))).ok).toBe(true);
    expect((await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("ma-server"), startDate: "2026-10-08", endDate: null }))).ok).toBe(true);
    expect((await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("ca-warehouse"), startDate: "2026-10-08", endDate: null }))).ok).toBe(true);
    const [doc] = await inAgency((tx) => tx.select().from(sourceDocuments).where(eq(sourceDocuments.filename, SAMPLE)));
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "received" }).where(eq(sourceDocuments.id, doc!.id)));
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, doc!.id);
    const [entry] = (await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, workerId("anita-patel")), eq(timeEntries.payPeriodId, week))))).filter((e) => e.workDate! >= "2026-10-08");
    const names = await inAgency((tx) => tx.select({ id: clients.id, name: clients.name }).from(clients));
    const [ca, ma] = [names.find((c) => c.id === clientId("ca"))!, names.find((c) => c.id === clientId("ma"))!];
    expect(ma.name < ca.name).toBe(true);
    expect(await inAgency((tx) => editEntry(tx, actor, entry!.id, {}, ["confirmed_client"], ""))).toEqual({ ok: false, error: "assignment_at_other_client", clients: [ma, ca] });
    expect(await inAgency((tx) => editEntry(tx, actor, entry!.id, {}, ["confirmed_client"], "", { attachToClientId: clientId("ca") }))).toEqual({ ok: true });
    const [moved] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, entry!.id)));
    const [caAssignment] = await inAgency((tx) => tx.select().from(assignments).where(and(eq(assignments.workerId, workerId("anita-patel")), eq(assignments.jobOrderId, jobOrderId("ca-warehouse")))));
    expect(moved!.assignmentId).toBe(caAssignment!.id);
  });

  it("an attach with the worker cleared is refused, never dropped", async () => {
    const [entry] = (await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, workerId("anita-patel")), eq(timeEntries.payPeriodId, week))))).filter((e) => e.assignmentId !== null);
    expect(await inAgency((tx) => editEntry(tx, actor, entry!.id, { workerId: null }, ["matched_worker"], "", { attachToClientId: clientId("ma") }))).toEqual({ ok: false, error: "worker_required" });
  });

  it("attaching to a client where the worker has no assignment that day is refused, never sent to another client", async () => {
    const [entry] = (await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.workerId, workerId("anita-patel")), eq(timeEntries.payPeriodId, week))))).filter((e) => e.assignmentId !== null);
    const before = entry!.assignmentId;
    expect(await inAgency((tx) => editEntry(tx, actor, entry!.id, {}, ["confirmed_client"], "", { attachToClientId: clientId("ma") }))).toEqual({ ok: false, error: "attach_client_unavailable" });
    const [after] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.id, entry!.id)));
    expect(after!.assignmentId).toBe(before);
  });

  it("a timesheet whose client is unclear never sends its hours to a client nobody named", async () => {
    expect((await inAgency((tx) => setAssignmentDates(tx, actor, assignmentId("anita-patel"), { startDate: "2026-01-01", endDate: "2026-10-07" }))).ok).toBe(true);
    expect((await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("ma-server"), startDate: "2026-10-08", endDate: null }))).ok).toBe(true);
    const csv = [
      "Employee ID,Employee Name,Department,Date,Clock In,Clock Out,Break (min),Total Hours",
      '10413,"Patel, Anita",Molding,10/08/2026,7:00 AM,3:30 PM,30,8.00',
      '10416,"Ruiz, Daniel",Molding,10/08/2026,7:00 AM,3:30 PM,30,8.00',
    ].join("\n");
    const { documentId } = await inAgency((tx) => receiveDocument(tx, actor, store, { payPeriodId: week, filename: "two-clients.csv", bytes: new TextEncoder().encode(csv) }));
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, documentId);
    const [doc] = await inAgency((tx) => tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, documentId)));
    expect(doc!.clientId).toBeNull();
    const [anita] = await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.sourceDocumentId, documentId), eq(timeEntries.workerId, workerId("anita-patel")))));
    expect(anita!.reviewReasons).toContain("timesheet_client_unclear");
    const [ma] = await inAgency((tx) => tx.select().from(clients).where(eq(clients.id, clientId("ma"))));
    const grid = await inAgency((tx) => hoursStep(tx, week));
    expect(grid.rows.find((r) => r.id === anita!.id)!.otherClient).toEqual({ id: clientId("ma"), name: ma!.name });
    // Its own wording: the timesheet has no client to be "not" at.
    expect(await inAgency((tx) => editEntry(tx, actor, anita!.id, {}, ["misread_corrected"], ""))).toEqual({ ok: false, error: "timesheet_client_unclear", clients: [{ id: clientId("ma"), name: ma!.name }] });
    expect(await inAgency((tx) => editEntry(tx, actor, anita!.id, {}, ["misread_corrected"], "", { attachToClientId: clientId("ma") }))).toEqual({ ok: true });
    const [logged] = await inAgency((tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, anita!.id), eq(auditEvents.action, "update"))));
    expect(logged!.after).toMatchObject({ attachedToClient: ma!.name, timesheetClient: null });
  });

  it("refuses a worker picked from the roster who works at another client, naming that client", async () => {
    const [doc] = await inAgency((tx) => tx.select().from(sourceDocuments).where(eq(sourceDocuments.filename, SAMPLE)));
    await inAgency((tx) => tx.update(sourceDocuments).set({ status: "received" }).where(eq(sourceDocuments.id, doc!.id)));
    await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, doc!.id);
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(and(eq(timeEntries.sourceDocumentId, doc!.id), eq(timeEntries.workerId, workerId("anita-patel")))));
    const r = await inAgency((tx) => editEntry(tx, actor, entry!.id, { workerId: workerId("conor-byrne") }, ["misread_corrected", "confirmed_client"], ""));
    expect(r).toMatchObject({ ok: false, error: "assignment_at_other_client", clients: [{ id: clientId("ma") }] });
  });

  it("never moves an assignment's dates so that paid hours fall outside them", async () => {
    const r = await inAgency((tx) => setAssignmentDates(tx, actor, assignmentId("anita-patel"), { startDate: "2026-10-05", endDate: null }));
    expect(r).toMatchObject({ ok: false, error: "paid_outside" });
    expect((await inAgency((tx) => setAssignmentDates(tx, actor, assignmentId("anita-patel"), { startDate: "2026-01-01", endDate: "2026-10-06" }))).ok).toBe(true);
    const run = await inAgency((tx) => computeRun(tx, actor, week));
    expect(run.blockers.some((b) => b.code === "outside_assignment" && b.workerId === workerId("anita-patel"))).toBe(true);
  });

  it("cancels only an assignment with no paid hours, with a reason; its hours are then never paid", async () => {
    expect(await inAgency((tx) => cancelAssignment(tx, actor, assignmentId("anita-patel"), "Placed by mistake"))).toMatchObject({ ok: false, error: "has_paid_hours" });
    const fresh = await inAgency((tx) => createAssignment(tx, actor, { workerId: workerId("anita-patel"), jobOrderId: jobOrderId("il-assembler-day"), startDate: "2026-10-20", endDate: null }));
    if (!fresh.ok) throw new Error(fresh.error);
    expect(await inAgency((tx) => cancelAssignment(tx, actor, fresh.id, " "))).toEqual({ ok: false, error: "reason_required" });
    expect((await inAgency((tx) => cancelAssignment(tx, actor, fresh.id, "Client cancelled the order"))).ok).toBe(true);
  });
});
