/**
 * Invoices with backup and client templates (slice g; plan `.claude/plans/slice-g-invoices.md`,
 * decisions G2–G9): a client's dated invoice settings, invoices separated by PO and worksite, the PO
 * checks, the templates, the backup pages, the invoice CSV, the SAP Fieldglass upload, and
 * corrections that find the invoice they correct.
 *
 * The week (Prairie Line, code PLM; bill $26.50/h operators, $25.75/h assemblers; the client's PO
 * PO-48213): Marcus Bell 10 h Monday to Wednesday (30 h × $26.50 = $795.00), Anita Patel 8 h Monday
 * and Tuesday (16 h × $26.50 = $424.00), Trevor Lindqvist 8 h Monday (8 h × $25.75 = $206.00).
 * Marcus's placement carries PO-1001, Trevor's PO-2002; Anita's has none (the client's PO).
 */
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { billingProblems, earliestNewVersion, setAssignmentPo, setBillingSettings, type BillingSettings } from "../../src/server/catalog/billing";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, jobOrderId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { pdfPages, pdfText } from "../../src/server/files/pdf-text";
import { createRunFiles } from "../../src/server/files/service";
import { editEntry } from "../../src/server/review/service";
import { startCorrection } from "../../src/server/run/corrections";
import { computeRun, setSkipped } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-invoices-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const billing: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000004", label: "Test billing", role: "billing" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const w2 = periodId("w2");
const PLM = clientId("il");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const text = async (key: string) => new TextDecoder().decode(await store.get(key));

async function addShift(worker: string, date: string, inMinute: number, outMinute: number, extra: Partial<typeof s.timeEntries.$inferInsert> = {}) {
  const [row] = await owner.db
    .insert(s.timeEntries)
    .values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed", ...extra })
    .returning();
  return row!;
}

let shifts: Record<string, (typeof s.timeEntries.$inferSelect)[]> = {};

async function theWeek() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  shifts = { marcus: [], anita: [], trevor: [] };
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) shifts.marcus!.push(await addShift("marcus-bell", d, 420, 1020));
  for (const d of ["2026-10-05", "2026-10-06"]) shifts.anita!.push(await addShift("anita-patel", d, 420, 900));
  shifts.trevor!.push(await addShift("trevor-lindqvist", "2026-10-05", 420, 900));
  // Each test turns on the backup it is about (the demo's Prairie Line has all of it on).
  await owner.db.update(s.clientBillingProfiles).set({ backupDetail: false, backupImages: false }).where(eq(s.clientBillingProfiles.clientId, PLM));
  await owner.db.update(s.assignments).set({ poNumber: "PO-1001" }).where(eq(s.assignments.id, assignmentId("marcus-bell")));
  await owner.db.update(s.assignments).set({ poNumber: "PO-2002" }).where(eq(s.assignments.id, assignmentId("trevor-lindqvist")));
}

async function current(): Promise<BillingSettings> {
  const [p] = await inAgency((tx) => tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, PLM)).orderBy(asc(s.clientBillingProfiles.effectiveFrom)));
  return {
    invoiceTemplate: p!.invoiceTemplate as s.InvoiceTemplate,
    separateBy: p!.separateBy,
    poRequired: p!.poRequired,
    poNumber: p!.poNumber,
    backupDetail: p!.backupDetail,
    backupImages: p!.backupImages,
    vmsFormat: p!.vmsFormat,
    paymentTermsDays: p!.paymentTermsDays,
    overtimeBillingRule: p!.overtimeBillingRule,
    billPremiums: p!.billPremiums,
    billGuarantees: p!.billGuarantees,
  };
}

/** Prairie Line's settings from October 1 (before any of its invoices). */
async function settings(change: Partial<BillingSettings>) {
  const r = await inAgency(async (tx) => setBillingSettings(tx, theOwner, PLM, { ...(await current()), ...change }, "2026-10-01"));
  if (!r.ok) throw new Error(`the settings were refused: ${JSON.stringify(r)}`);
}

const compute = () => inAgency((tx) => computeRun(tx, theOwner, w2));
const files = async (today = "2026-10-13") => {
  await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
  return inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today }));
};
const invoices = () => inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.clientId, PLM)).orderBy(asc(s.invoices.number)));
const pdfOf = async (number: string) => {
  const [inv] = await inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.number, number)));
  return pdfPages(await store.get(inv!.pdfStorageKey!));
};

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("a client's invoice settings (dated versions)", () => {
  beforeEach(theWeek);

  it("refuses what cannot be saved, with the rule; only the Owner and Billing change them", async () => {
    const good = await current();
    expect(billingProblems(good)).toEqual([]);
    expect(billingProblems({ ...good, invoiceTemplate: "fancy", separateBy: ["po", "po"], poNumber: " PO-1", backupDetail: "yes", vmsFormat: "coupa", paymentTermsDays: 400, overtimeBillingRule: "x" })).toEqual([
      { field: "invoiceTemplate", rule: "choose_template" },
      { field: "separateBy", rule: "choose_separate" },
      { field: "backupDetail", rule: "yes_or_no" },
      { field: "poNumber", rule: "po_number" },
      { field: "vmsFormat", rule: "choose_vms" },
      { field: "paymentTermsDays", rule: "terms_days" },
      { field: "overtimeBillingRule", rule: "choose_ot_rule" },
    ]);
    expect(await inAgency((tx) => setBillingSettings(tx, coordinator, PLM, good, "2026-10-01"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setBillingSettings(tx, billing, PLM, { ...good, paymentTermsDays: -1 }, "2026-10-01"))).toEqual({ ok: false, error: "invalid", problems: [{ field: "paymentTermsDays", rule: "terms_days" }] });
    expect(await inAgency((tx) => setBillingSettings(tx, billing, PLM, good, "2026-13-01"))).toEqual({ ok: false, error: "invalid", problems: [{ field: "effectiveFrom", rule: "date" }] });
  });

  it("a new version ends the one before; the same day replaces it; the VMS name carries over; audited", async () => {
    const before = await inAgency((tx) => tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, PLM)));
    await settings({ separateBy: ["po"], backupDetail: true });
    await settings({ separateBy: ["worksite", "po"], backupDetail: true });
    const rows = await inAgency((tx) => tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, PLM)).orderBy(asc(s.clientBillingProfiles.effectiveFrom)));
    expect(rows).toHaveLength(before.length + 1);
    expect(rows.at(-2)).toMatchObject({ effectiveTo: "2026-09-30" });
    expect(rows.at(-1)).toMatchObject({ effectiveFrom: "2026-10-01", effectiveTo: null, separateBy: ["po", "worksite"], backupDetail: true, poNumber: "PO-48213", vmsName: before[0]!.vmsName });
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityType, "billing_profile")));
    expect(events.map((e) => e.action).sort()).toEqual(["create", "update", "update"]);
  });

  it("cannot start in a period already invoiced: the first day it may start is the day after", async () => {
    await files();
    const good = await current();
    expect(await inAgency((tx) => setBillingSettings(tx, theOwner, PLM, good, "2026-10-11"))).toEqual({ ok: false, error: "invoiced_through", through: "2026-10-11" });
    expect(await inAgency((tx) => earliestNewVersion(tx, PLM))).toBe("2026-10-12");
    expect(await inAgency((tx) => setBillingSettings(tx, theOwner, PLM, { ...good, separateBy: ["po"] }, "2026-10-12"))).toMatchObject({ ok: true });
  });

  it("a placement's PO: checked, audited, and empty means the client's", async () => {
    expect(await inAgency((tx) => setAssignmentPo(tx, theOwner, assignmentId("anita-patel"), "x".repeat(65)))).toEqual({ ok: false, error: "po_number" });
    expect(await inAgency((tx) => setAssignmentPo(tx, theOwner, assignmentId("anita-patel"), " PO-7"))).toEqual({ ok: false, error: "po_number" });
    expect(await inAgency((tx) => setAssignmentPo(tx, theOwner, assignmentId("anita-patel"), "PO-7"))).toEqual({ ok: true });
    expect(await inAgency((tx) => setAssignmentPo(tx, theOwner, assignmentId("marcus-bell"), "  "))).toEqual({ ok: true });
    const rows = await inAgency((tx) => tx.select().from(s.assignments).where(eq(s.assignments.jobOrderId, jobOrderId("il-operator"))));
    expect(rows.find((a) => a.id === assignmentId("anita-patel"))!.poNumber).toBe("PO-7");
    expect(rows.find((a) => a.id === assignmentId("marcus-bell"))!.poNumber).toBeNull();
    // Audit events are never deleted, and other test files use the same demo ids: this change's own event.
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "assignment"), eq(s.auditEvents.entityId, assignmentId("anita-patel")))));
    expect(events.filter((e) => (e.after as { poNumber?: string } | null)?.poNumber === "PO-7")).toEqual([expect.objectContaining({ before: { poNumber: null }, after: expect.objectContaining({ poNumber: "PO-7" }) })]);
  });
});

describe("separate invoices (decisions G3, G4)", () => {
  beforeEach(theWeek);

  it("by PO: one invoice per PO, numbered -1, -2, … in PO order; the client's PO for a placement without one", async () => {
    await settings({ separateBy: ["po"] });
    expect((await compute()).blockers).toEqual([]);
    const out = await files();
    expect(out.invoices.filter((i) => i.clientId === PLM).map((i) => [i.number, i.totalCents])).toEqual([
      ["PLM-20261005-1", 79_500],
      ["PLM-20261005-2", 20_600],
      ["PLM-20261005-3", 42_400],
    ]);
    const rows = await invoices();
    expect(rows.map((i) => [i.number, i.splitKey, i.poNumber, i.template])).toEqual([
      ["PLM-20261005-1", "po=PO-1001", "PO-1001", "standard"],
      ["PLM-20261005-2", "po=PO-2002", "PO-2002", "standard"],
      ["PLM-20261005-3", "po=PO-48213", "PO-48213", "standard"],
    ]);
    // Together they bill exactly the client's lines.
    const bill = await inAgency((tx) => tx.select().from(s.billLines).where(eq(s.billLines.clientId, PLM)));
    expect(rows.reduce((sum, i) => sum + i.totalCents, 0)).toBe(bill.reduce((sum, l) => sum + l.amountCents, 0));
    expect(rows[0]!.document!.lines).toEqual([expect.objectContaining({ workerName: "Marcus Bell", poNumber: "PO-1001", worksite: "Joliet Plant 2", type: "REG", minutes: 1800, amountCents: 79_500 })]);
    const [page] = await pdfOf("PLM-20261005-3");
    expect(page).toContain("PO number PO-48213");
    expect(page).toContain("Anita Patel — Machine Operator");
    expect(page).not.toContain("Marcus");
  });

  it("by worksite: one invoice per worksite in name order, each naming its worksite", async () => {
    const [plant3] = await owner.db
      .insert(s.worksites)
      .values({ agencyId: theOwner.agencyId, clientId: PLM, name: "Joliet Plant 3", addressLine: "80 Example Industrial Drive", city: "Joliet", county: "Will", state: "IL", postalCode: "60431", countyFips: "17197", placeFips: "1738570" })
      .returning();
    await owner.db.update(s.jobOrders).set({ worksiteId: plant3!.id }).where(eq(s.jobOrders.id, jobOrderId("il-assembler-day")));
    await settings({ separateBy: ["worksite"] });
    await files();
    const rows = await invoices();
    expect(rows.map((i) => [i.number, i.worksiteId, i.totalCents])).toEqual([
      ["PLM-20261005-1", expect.any(String), 121_900],
      ["PLM-20261005-2", plant3!.id, 20_600],
    ]);
    const [first] = await pdfOf("PLM-20261005-1");
    expect(first).toContain("Worksite Joliet Plant 2");
    const [second] = await pdfOf("PLM-20261005-2");
    expect(second).toContain("Worksite Joliet Plant 3");
  });

  it("not separated, several POs: one invoice, each line names its PO (and the CSV says it)", async () => {
    await files();
    const rows = await invoices();
    expect(rows.map((i) => [i.number, i.splitKey, i.poNumber, i.totalCents])).toEqual([["PLM-20261005", "", null, 142_500]]);
    const [page] = await pdfOf("PLM-20261005");
    expect(page).toContain("PO PO-1001");
    expect(page).toContain("PO PO-48213");
    expect(page).not.toContain("PO number");
    const csv = (await text(rows[0]!.csvStorageKey!)).split("\r\n");
    expect(csv[0]).toBe("Invoice Number,Invoice Date,Period Start,Period End,Worker,Worksite,PO Number,Week Ending,Earning Type,Hours,Minutes,Rate,Amount");
    expect(csv.slice(1, 4)).toEqual([
      "PLM-20261005,2026-10-13,2026-10-05,2026-10-11,Marcus Bell,Joliet Plant 2,PO-1001,2026-10-11,REG,30.00,1800,26.5000,795.00",
      "PLM-20261005,2026-10-13,2026-10-05,2026-10-11,Trevor Lindqvist,Joliet Plant 2,PO-2002,2026-10-11,REG,8.00,480,25.7500,206.00",
      "PLM-20261005,2026-10-13,2026-10-05,2026-10-11,Anita Patel,Joliet Plant 2,PO-48213,2026-10-11,REG,16.00,960,26.5000,424.00",
    ]);
  });
});

describe("a client that requires a PO (decision G5)", () => {
  beforeEach(theWeek);

  it("blocks the run for hours without one, naming the workers; a PO on the placement clears it", async () => {
    await settings({ poRequired: true, poNumber: null });
    const run = await compute();
    expect(run.status).toBe("blocked");
    expect(run.blockers).toEqual([expect.objectContaining({ code: "po_missing", clientId: PLM })]);
    expect(run.blockers[0]!.message).toContain("Anita Patel");
    expect(run.blockers[0]!.message).not.toContain("Marcus");
    await inAgency((tx) => setAssignmentPo(tx, theOwner, assignmentId("anita-patel"), "PO-3003"));
    expect((await compute()).blockers).toEqual([]);
  });
});

describe("templates (decision G2)", () => {
  beforeEach(theWeek);

  it("per-worker detail: a heading per worker, the worker's lines, a subtotal each", async () => {
    await settings({ invoiceTemplate: "per_worker_detail" });
    await files();
    const [page] = await pdfOf("PLM-20261005");
    expect(page).toMatch(/Marcus Bell Machine Operator Regular .* Subtotal \$795\.00/);
    expect(page).toMatch(/Trevor Lindqvist Assembler Regular .* Subtotal \$206\.00/);
    expect((await invoices())[0]!.template).toBe("per_worker_detail");
  });

  it("PO header: the PO at the top of every page", async () => {
    await settings({ invoiceTemplate: "po_header", separateBy: ["po"], backupDetail: true });
    await files();
    const pages = await pdfOf("PLM-20261005-1");
    expect(pages).toHaveLength(2);
    for (const p of pages) expect(p.startsWith("PO number PO-1001")).toBe(true);
  });
});

describe("backup pages (decisions G6, G7)", () => {
  beforeEach(theWeek);

  it("hours detail after the invoice: each day, the week's total, who approved", async () => {
    // Anita's Monday was approved by the client's approver on October 9 at 3:30 PM in Chicago.
    const monday = shifts.anita![0]!;
    await owner.db.update(s.timeEntries).set({ status: "client_approved" }).where(eq(s.timeEntries.id, monday.id));
    const at = new Date("2026-10-09T20:30:00Z");
    const [r] = await owner.db.insert(s.approvalRequests).values({ agencyId: theOwner.agencyId, clientId: PLM, payPeriodId: w2, approverName: "Dana Approver", approverEmail: "dana@prairieline.example.com", locale: "en", agencyLocale: "en", cycleStartedAt: at, createdByLabel: "t" }).returning();
    const [l] = await owner.db.insert(s.approvalLinks).values({ agencyId: theOwner.agencyId, requestId: r!.id, tokenHash: createHash("sha256").update("invoice-test").digest("hex"), purpose: "request", expiresAt: at }).returning();
    const shift = { entryId: monday.id, workerId: monday.workerId!, workerName: "Anita Patel", workDate: "2026-10-05", inMinute: 420, outMinute: 900, breakMinutes: 0, minutes: 480 };
    await owner.db.insert(s.approvalDecisions).values({ agencyId: theOwner.agencyId, requestId: r!.id, linkId: l!.id, approverEmail: "dana@prairieline.example.com", typedName: "Dana Approver", attestation: "x", attestationVersion: "v", locale: "en", snapshotSha256: createHash("sha256").update("snapshot").digest("hex"), approved: [shift], disputed: [], decidedAt: at });
    await settings({ backupDetail: true });
    await files();
    const pages = await pdfOf("PLM-20261005");
    expect(pages).toHaveLength(2);
    const detail = pages[1]!;
    expect(detail).toContain("Hours detail");
    expect(detail).toContain("Marcus Bell · week of October 5, 2026 Date In Out Break Hours Mon, Oct 5, 2026 7:00 AM 5:00 PM 0:00 10:00");
    expect(detail).toContain("Wed, Oct 7, 2026 7:00 AM 5:00 PM 0:00 10:00 Week total 30:00 Reviewed by Cedar Row Staffing (demo)");
    expect(detail).toContain("Anita Patel · week of October 5, 2026");
    expect(detail).toContain("Week total 16:00 Approved by Dana Approver (dana@prairieline.example.com) on October 9, 2026 at 3:30 PM CDT Reviewed by Cedar Row Staffing (demo)");
    // Last name order: Bell, Lindqvist, Patel.
    expect(detail.indexOf("Marcus Bell")).toBeLessThan(detail.indexOf("Trevor Lindqvist"));
    expect(detail.indexOf("Trevor Lindqvist")).toBeLessThan(detail.indexOf("Anita Patel"));
    expect(pages[0]).toContain("Page 1 of 2");
    expect((await invoices())[0]!.document!.backup).toEqual({ detail: true, images: [] });
  });

  it("timesheet pictures: each page the hours were read from, once, redacted; a page showing another client's workers is left out", async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 85, height: 110, channels: 3, background: "#ffffff" } }).jpeg().toBuffer());
    const prefix = `${theOwner.agencyId}/documents/invoice-test`;
    await store.put(`${prefix}/page-1-redacted.jpg`, jpeg);
    await store.put(`${prefix}/page-2-redacted.jpg`, jpeg);
    const [doc] = await owner.db
      .insert(s.sourceDocuments)
      .values({ agencyId: theOwner.agencyId, payPeriodId: w2, kind: "image", filename: "sign-in.jpg", mediaType: "image/jpeg", sha256: "a".repeat(64), byteSize: jpeg.length, storageKey: `${prefix}/original.jpg`, status: "read", pageCount: 2 })
      .returning();
    for (const n of [1, 2]) {
      await owner.db.insert(s.documentPages).values({ agencyId: theOwner.agencyId, documentId: doc!.id, pageNumber: n, storageKey: `${prefix}/page-${n}.jpg`, redactedStorageKey: `${prefix}/page-${n}-redacted.jpg`, width: 85, height: 110, redactions: 1 });
    }
    const read = (page: number): s.EntryFields => ({ worker: { value: "x", page, box: null, passA: null, passB: null, agree: true, handwritten: true, confidence: "high", checks: [] } });
    for (const e of shifts.marcus!) await owner.db.update(s.timeEntries).set({ sourceDocumentId: doc!.id, fields: read(1) }).where(eq(s.timeEntries.id, e.id));
    await owner.db.update(s.timeEntries).set({ sourceDocumentId: doc!.id, fields: read(2) }).where(eq(s.timeEntries.id, shifts.trevor![0]!.id));
    // Page 2 also shows a Harborview worker's line (set aside, but still on the picture).
    await addShift("elizabeth-sullivan", "2026-10-05", 600, 840, { status: "rejected", sourceDocumentId: doc!.id, fields: read(2) });
    await settings({ backupImages: true });
    expect((await compute()).blockers).toEqual([]);
    await files();
    const pages = await pdfOf("PLM-20261005");
    expect(pages).toHaveLength(2);
    expect(pages[1]).toBe("Hours are from the approved timesheets for the service period. Amounts are computed from whole minutes and rounded once per line. Page 2 of 2");
    expect((await invoices())[0]!.document!.backup).toEqual({ detail: false, images: [{ documentId: doc!.id, filename: "sign-in.jpg", pages: [1] }] });
  });
});

describe("the SAP Fieldglass upload (decision G9)", () => {
  beforeEach(theWeek);

  it("blocks the run when hours did not come from a Fieldglass time sheet, naming every such worker (who can be skipped)", async () => {
    await settings({ vmsFormat: "fieldglass_time_sheet_invoice" });
    await owner.db.update(s.timeEntries).set({ vmsRefs: { timeSheetIds: ["TS-1003"], workerId: "FG-0003" } }).where(eq(s.timeEntries.id, shifts.trevor![0]!.id));
    const run = await compute();
    expect(run.blockers.map((b) => [b.code, b.clientId, b.workerName])).toEqual([
      ["vms_refused", PLM, "Marcus Bell"],
      ["vms_refused", PLM, "Anita Patel"],
    ]);
    expect(run.blockers[0]!.message).toContain("Prairie Line");
    expect(run.blockers[0]!.message).toContain("did not come from a SAP Fieldglass time sheet");
    // Skipping both leaves an upload of Trevor's time sheet.
    await inAgency((tx) => setSkipped(tx, theOwner, w2, workerId("marcus-bell"), { skipped: true, reason: "paid by hand" }));
    await inAgency((tx) => setSkipped(tx, theOwner, w2, workerId("anita-patel"), { skipped: true, reason: "paid by hand" }));
    expect((await compute()).blockers).toEqual([]);
  });

  it("one row per time sheet, with the invoice's amounts; a line from two time sheets is refused", async () => {
    await settings({ vmsFormat: "fieldglass_time_sheet_invoice" });
    const refs = { marcus: { timeSheetIds: ["TS-1001"], workerId: "FG-0001" }, anita: { timeSheetIds: ["TS-1002"], workerId: "FG-0002" }, trevor: { timeSheetIds: ["TS-1003"], workerId: "FG-0003" } };
    for (const [who, list] of Object.entries(shifts)) for (const e of list) await owner.db.update(s.timeEntries).set({ vmsRefs: refs[who as keyof typeof refs] }).where(eq(s.timeEntries.id, e.id));
    await owner.db.update(s.timeEntries).set({ vmsRefs: { timeSheetIds: ["TS-1009"], workerId: "FG-0001" } }).where(eq(s.timeEntries.id, shifts.marcus![2]!.id));
    expect((await compute()).blockers).toEqual([expect.objectContaining({ code: "vms_refused", message: expect.stringContaining("two SAP Fieldglass time sheets (TS-1001, TS-1009)") })]);
    await owner.db.update(s.timeEntries).set({ vmsRefs: refs.marcus }).where(eq(s.timeEntries.id, shifts.marcus![2]!.id));
    await files();
    const [inv] = await invoices();
    expect(await text(inv!.vmsStorageKey!)).toBe(
      [
        "Type,Time Sheet Invoice Upload",
        "Transaction,True",
        "",
        "Invoice Code,TIMESHEET ID,Job Seeker ID,Paid Amount,Total Billing Amount",
        "PLM-20261005,TS-1001,FG-0001,0.00,795.00",
        "PLM-20261005,TS-1002,FG-0002,0.00,424.00",
        "PLM-20261005,TS-1003,FG-0003,0.00,206.00",
        "",
      ].join("\r\n"),
    );
  });
});

describe("corrections find the invoice they correct (decision E11 with G3)", () => {
  beforeEach(async () => {
    await theWeek();
    await settings({ separateBy: ["po"] });
    await files();
  });

  it("by the placement and week as invoiced, whatever the placement's PO says now; new hours under a new PO get the next number", async () => {
    // After the invoices: Marcus's placement moves to another PO, and Jerome starts under PO-3003.
    await owner.db.update(s.assignments).set({ poNumber: "PO-9999" }).where(eq(s.assignments.id, assignmentId("marcus-bell")));
    await owner.db.update(s.assignments).set({ poNumber: "PO-3003" }).where(eq(s.assignments.id, assignmentId("jerome-washington")));
    const r = await inAgency((tx) => startCorrection(tx, theOwner, w2, "Marcus stayed an hour; Jerome's Monday was missing; Anita's Wednesday too"));
    expect(r).toMatchObject({ ok: true });
    const edited = await inAgency((tx) => editEntry(tx, theOwner, shifts.marcus![0]!.id, { inMinute: 420, outMinute: 1080, breakMinutes: 0 }, ["misread_corrected"], "invoice test"));
    expect(edited).toMatchObject({ ok: true });
    await addShift("jerome-washington", "2026-10-05", 420, 900);
    await addShift("anita-patel", "2026-10-07", 420, 900);
    expect((await compute()).blockers).toEqual([]);
    const out = await files("2026-10-20");
    expect(out.invoices.map((i) => [i.number, i.kind, i.totalCents, i.originalNumber])).toEqual([
      ["PLM-20261005-1-S1", "supplemental", 2650, "PLM-20261005-1"],
      ["PLM-20261005-3-S1", "supplemental", 21_200, "PLM-20261005-3"],
      ["PLM-20261005-4", "invoice", 21_200, null],
    ]);
    const rows = await invoices();
    expect(rows.filter((i) => i.payRunId === out.runId).map((i) => [i.number, i.splitKey, i.poNumber])).toEqual([
      ["PLM-20261005-1-S1", "po=PO-1001", "PO-1001"],
      ["PLM-20261005-3-S1", "po=PO-48213", "PO-48213"],
      ["PLM-20261005-4", "po=PO-3003", "PO-3003"],
    ]);
    // A correction's document carries no VMS file and its PDF says what it adds to.
    expect(rows.every((i) => i.vmsStorageKey === null)).toBe(true);
    expect((await pdfOf("PLM-20261005-1-S1"))[0]).toContain("Adds to invoice PLM-20261005-1");
  });
});

describe("invoices made before slice g", () => {
  beforeEach(theWeek);

  it("a correction of a period invoiced without stored lines goes to the client's single invoice", async () => {
    await files();
    await owner.db.update(s.invoices).set({ document: null }).where(eq(s.invoices.clientId, PLM));
    await inAgency((tx) => startCorrection(tx, theOwner, w2, "Anita's Wednesday was missing"));
    await addShift("anita-patel", "2026-10-07", 420, 900);
    const out = await files("2026-10-20");
    expect(out.invoices.map((i) => [i.number, i.totalCents])).toEqual([["PLM-20261005-S1", 21_200]]);
    expect(await pdfText(await store.get(out.invoices[0]!.storageKey))).toContain("Adds to invoice PLM-20261005");
  });
});
