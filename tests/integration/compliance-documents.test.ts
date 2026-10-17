/**
 * The documents compliance makes (slice j step 2): the Illinois proof of registration, the
 * Massachusetts job order and the workers' comp packet, each kept as the duty's evidence.
 * Demo: Harborview's event servers earn $17.00 an hour (time and a half: $25.50), 4:00 PM to 11:00 PM;
 * the workweek starts Monday, so it ends Sunday and pay day 5 days later is a Friday.
 * The week for the packet: Marcus Bell 30 h ($547.50), Anita Patel 16 h ($292.00), Trevor Lindqvist
 * 8 h ($140.00), all Illinois class 3632, paid 2026-10-16 (inside the 2026 policy).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createJobOrderNotice, createNjAssignmentNotice, createPacketDocument, createProofPage, packetCsv, saveNoticeDetails, wcPacketView } from "../../src/server/compliance/documents";
import { addRegistration } from "../../src/server/compliance/service";
import { PAY_DAY_KEY } from "../../src/server/payroll/paid-lines";
import { editEntry } from "../../src/server/review/service";
import { recordCorrectionDecision, startCorrection } from "../../src/server/run/corrections";
import { computeRun } from "../../src/server/run/service";
import { complianceItems, obligationDetail } from "../../src/server/compliance/queries";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, jobOrderId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles } from "../../src/server/files/service";
import { pdfText } from "../../src/server/files/pdf-text";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-compliance-docs-")));
const TODAY = "2026-10-16";
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const billing: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000004", label: "Test billing", role: "billing" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const w2 = periodId("w2");

async function freshAgency() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
}
const duty = async (kind: string, where: (i: Awaited<ReturnType<typeof complianceItems>>["items"][number]) => boolean = () => true) => (await inAgency((tx) => complianceItems(tx, theOwner, TODAY))).items.find((i) => i.kind === kind && where(i))!;
const evidence = async (id: string) => (await inAgency((tx) => obligationDetail(tx, theOwner, id, TODAY)))!.files;
const text = async (documentId: string) => {
  const [d] = await owner.db.select().from(s.complianceDocuments).where(eq(s.complianceDocuments.id, documentId));
  return (await pdfText(await store.get(d!.storageKey))).replace(/\s+/g, " ");
};

async function addShift(worker: string, date: string, inMinute: number, outMinute: number) {
  const [row] = await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed" }).returning({ id: s.timeEntries.id });
  return row!.id;
}

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("documents (slice j step 2)", () => {
  beforeEach(freshAgency);

  it("the Illinois proof page: the registration in force on the duty's date, the insurer and how the client checks; billing may make it", async () => {
    const proof = await duty("il_client_proof", (i) => i.status === "upcoming");
    expect(await inAgency((tx) => createProofPage(tx, coordinator, store, proof.id, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    // The client checks on 2027-03-01; the registration on file ends 2026-12-31, so there is nothing to show yet.
    expect(await inAgency((tx) => createProofPage(tx, billing, store, proof.id, TODAY))).toEqual({ ok: false, error: "invalid", field: "registration" });
    await inAgency((tx) => addRegistration(tx, theOwner, { jurisdiction: "IL", branchId: null, number: "IL-DTLSA-0001-DEMO", issuedOn: "2026-10-15", expiresOn: "2027-12-31", documentId: null }, TODAY));
    expect(await inAgency((tx) => createProofPage(tx, billing, store, proof.id, TODAY))).toEqual({ ok: true });
    const [file] = await evidence(proof.id);
    expect(file).toMatchObject({ filename: "il-proof-of-registration-PLM-2026-10-16.pdf", source: "generated", effectiveOn: TODAY });
    const t = await text(file!.id);
    for (const part of ["Proof of registration", "Illinois Day and Temporary Labor Services Act", "Prairie Line Manufacturing (demo)", "IL-DTLSA-0001-DEMO", "December 31, 2027", "https://labor.illinois.gov/employers/approveddtlsa.html", "March 1 and September 1"]) expect(t).toContain(part);
    expect(t).not.toContain("IL-DTLSA-0000-DEMO");
    // The workers' comp policy ends 2026-12-31: none in force on 2027-03-01, and the page says so.
    expect(t).not.toContain("WC-0000-DEMO");
    expect(t).toContain("No policy on file for March 1, 2027.");
    // A duty already due is made with what is in force today: the newest registration, and the policy.
    const contract = await duty("il_client_proof_contract");
    expect(await inAgency((tx) => createProofPage(tx, billing, store, contract.id, TODAY))).toEqual({ ok: true });
    const c = await text((await evidence(contract.id))[0]!.id);
    for (const part of ["IL-DTLSA-0001-DEMO", "October 15, 2026", "Example Mutual Insurance (demo)", "WC-0000-DEMO", "January 1, 2026 – December 31, 2026"]) expect(c).toContain(part);
    // No registration in force: it cannot be made.
    await owner.db.update(s.agencyRegistrations).set({ expiresOn: "2026-10-01", issuedOn: "2025-10-02" }).where(eq(s.agencyRegistrations.jurisdiction, "IL"));
    expect(await inAgency((tx) => createProofPage(tx, theOwner, store, contract.id, TODAY))).toEqual({ ok: false, error: "invalid", field: "registration" });
  });

  it("the Massachusetts job order: what the law lists, from the placement, the rate card, the job order's details and the Department's contact", async () => {
    const job = await duty("ma_job_order", (i) => i.status === "overdue");
    expect(await inAgency((tx) => createJobOrderNotice(tx, coordinator, store, job.id, TODAY))).toEqual({ ok: true });
    const files = await evidence(job.id);
    expect(files.map((f) => [f.filename, f.source])).toEqual([["ma-job-order-boateng-kwame-2026-08-03.pdf", "generated"]]);
    const t = await text(files[0]!.id);
    for (const part of [
      "Job order",
      "Kwame Boateng",
      "August 3, 2026",
      "Cedar Row Staffing (demo)",
      "Example Mutual Insurance (demo)",
      "Harborview Events & Hospitality (demo)",
      "(617) 555-0123",
      "100 Example Plaza, Springfield, IL 62701",
      "(217) 555-0188",
      "Massachusetts Department of Labor Standards",
      "Event Server",
      "35-3031",
      "$17.00 an hour",
      "Every week, on the Friday after the workweek ends (5 days after)",
      "Overtime may occur, paid at $25.50 an hour",
      "4:00 PM – 11:00 PM",
      "Not set: open-ended",
      "One staff meal each shift, no charge",
      "must be given with this job order",
    ])
      expect(t).toContain(part);
    // The details are checked and kept on the job order, audited.
    const details = { employerPhone: "(617) 555-0199", startTime: "07:00", endTime: "15:30", overtime: "yes", requirements: "None", meals: "Not provided", transport: "Shuttle from the T station, no fee", strike: false };
    expect(await inAgency((tx) => saveNoticeDetails(tx, coordinator, job.id, { ...details, startTime: "7am" }))).toEqual({ ok: false, error: "invalid", field: "startTime" });
    expect(await inAgency((tx) => saveNoticeDetails(tx, coordinator, job.id, { ...details, employerPhone: " " }))).toEqual({ ok: false, error: "invalid", field: "employerPhone" });
    expect(await inAgency((tx) => saveNoticeDetails(tx, coordinator, job.id, details))).toEqual({ ok: true });
    const [jo] = await owner.db.select().from(s.jobOrders).where(eq(s.jobOrders.id, jobOrderId("ma-server")));
    expect(jo!.noticeDetails).toMatchObject({ employerPhone: "(617) 555-0199", startTime: "07:00", overtime: "yes", transport: "Shuttle from the T station, no fee" });
    // The overtime rate is Massachusetts' overtime rule (1.5), whatever the rate card bills overtime at;
    // a pay day the same day the workweek ends says so.
    await owner.db.update(s.rateCards).set({ otMultiplierNum: 2, otMultiplierDen: 1 }).where(eq(s.rateCards.jobOrderId, jobOrderId("ma-server")));
    await owner.db.update(s.agencySettings).set({ value: 0 }).where(eq(s.agencySettings.key, PAY_DAY_KEY));
    expect(await inAgency((tx) => createJobOrderNotice(tx, coordinator, store, job.id, TODAY))).toEqual({ ok: true });
    const again = await text((await evidence(job.id)).find((f) => f.source === "generated" && f.id !== files[0]!.id)!.id);
    for (const part of ["Overtime will occur, paid at $25.50 an hour", "Every week, on the last day of the workweek (Sunday)", "(617) 555-0199"]) expect(again).toContain(part);
    // No agency phone: the job order must give one.
    await owner.db.update(s.agencies).set({ phone: null }).where(eq(s.agencies.id, theOwner.agencyId));
    expect(await inAgency((tx) => createJobOrderNotice(tx, theOwner, store, job.id, TODAY))).toEqual({ ok: false, error: "invalid", field: "agency_phone" });
    await owner.db.update(s.agencies).set({ phone: DEMO_AGENCY.phone }).where(eq(s.agencies.id, theOwner.agencyId));
    // No details or no Department contact: it cannot be made.
    await owner.db.update(s.jobOrders).set({ noticeDetails: null }).where(eq(s.jobOrders.id, jobOrderId("ma-server")));
    expect(await inAgency((tx) => createJobOrderNotice(tx, theOwner, store, job.id, TODAY))).toEqual({ ok: false, error: "invalid", field: "details" });
  });

  it("the New Jersey assignment notice: form MW-23's fields in English and Spanish, from the placement, the rate card and the job order's details", async () => {
    // Demo: Prairie Line's Newark packers earn $17.00 an hour; New Jersey's overtime is 1.5 × = $25.50.
    const notice = await duty("nj_assignment_notice");
    expect(await inAgency((tx) => createNjAssignmentNotice(tx, coordinator, store, notice.id, TODAY))).toEqual({ ok: true });
    const files = await evidence(notice.id);
    expect(files).toHaveLength(1);
    expect(files[0]!.filename).toMatch(/^nj-assignment-notice-[a-z-]+-\d{4}-\d{2}-\d{2}\.pdf$/);
    const t = await text(files[0]!.id);
    for (const part of [
      "Temporary Laborer Assignment Notification",
      "Notificación de Asignación de Trabajadores Temporales",
      "under N.J.S.A. 34:8D-3",
      "Cedar Row Staffing (demo)",
      "Prairie Line Manufacturing (demo)",
      "(973) 555-0140",
      "Example Mutual Insurance (demo)",
      "Policy WC-0000-DEMO",
      "Newark Packing Center",
      "410 Example Port Street",
      "Packer (SOC 53-7064)",
      "Pack finished parts into cartons",
      "$17.00 an hour; overtime, when worked, $25.50 an hour",
      "7:00 AM – 3:30 PM",
      "A one-hour safety orientation",
      "Safety glasses and cut-resistant gloves",
      "Earned Sick Leave is the law in New Jersey",
      "Licencia Pagada Por Enfermedad",
    ])
      expect(t).toContain(part);
    // The questions left empty answer No; meals and transport typed "No" are No too.
    expect(t).toContain("No | No");
    // The details are checked: the description is required; an empty question is the form's No.
    const details = { employerPhone: "(973) 555-0199", startTime: "06:00", endTime: "14:30", overtime: "possible", requirements: "", meals: "No", transport: "A van from Newark Penn Station, no charge", strike: false };
    const nj = { description: "Pack and label cartons", training: "", equipment: "", clothing: "", protective: "Gloves, from the client", licenses: "" };
    expect(await inAgency((tx) => saveNoticeDetails(tx, coordinator, notice.id, { ...details, nj: { ...nj, description: " " } }))).toEqual({ ok: false, error: "invalid", field: "description" });
    expect(await inAgency((tx) => saveNoticeDetails(tx, coordinator, notice.id, { ...details, nj }))).toEqual({ ok: true });
    expect(await inAgency((tx) => createNjAssignmentNotice(tx, coordinator, store, notice.id, TODAY))).toEqual({ ok: true });
    const again = await text((await evidence(notice.id)).find((f) => f.id !== files[0]!.id)!.id);
    for (const part of ["(973) 555-0199", "6:00 AM – 2:30 PM", "A van from Newark Penn Station", "Pack and label cartons"]) expect(again).toContain(part);
    // Details without the form's questions (saved for a Massachusetts job order only) cannot make it.
    const [a] = await owner.db.select({ jobOrderId: s.assignments.jobOrderId }).from(s.assignments).where(eq(s.assignments.id, notice.links.assignmentId!));
    await owner.db.update(s.jobOrders).set({ noticeDetails: { ...details, overtime: "possible" as const } }).where(eq(s.jobOrders.id, a!.jobOrderId));
    expect(await inAgency((tx) => createNjAssignmentNotice(tx, coordinator, store, notice.id, TODAY))).toEqual({ ok: false, error: "invalid", field: "details" });
  });

  it("the workers' comp packet: by state, class and worker, tied to the payroll files; the audit duty keeps it", async () => {
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await addShift("marcus-bell", d, 420, 1020);
    for (const d of ["2026-10-05", "2026-10-06"]) await addShift("anita-patel", d, 420, 900);
    await addShift("trevor-lindqvist", "2026-10-05", 420, 900);
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
    const v = await inAgency((tx) => wcPacketView(tx, { from: "2026-01-01", to: "2026-12-31", order: "state" }));
    expect(v.rows.map((r) => [r.state, r.classCode, r.workerName, r.minutes, r.straightCents, r.otPremiumCents, r.totalCents])).toEqual([
      ["IL", "3632", "Anita Patel", 960, 29_200, 0, 29_200],
      ["IL", "3632", "Marcus Bell", 1800, 54_750, 0, 54_750],
      ["IL", "3632", "Trevor Lindqvist", 480, 14_000, 0, 14_000],
    ]);
    expect(v.classes).toEqual([expect.objectContaining({ state: "IL", classCode: "3632", description: "Machine shop (example rate)", totalCents: 97_950 })]);
    expect([v.files, v.filesGrossCents, v.allPayCents, v.differenceCents]).toEqual([1, 97_950, 97_950, 0]);
    expect(packetCsv(v).split("\r\n").slice(0, 2)).toEqual(["State,Class,Worker,Hours,Straight time,Overtime premium,Double-time premium,Other pay,Total pay", "IL,3632,Anita Patel,16:00,292.00,0.00,0.00,0.00,292.00"]);
    // Pay dates outside the range: nothing.
    expect((await inAgency((tx) => wcPacketView(tx, { from: "2026-10-17", to: "2026-12-31", order: "state" }))).rows).toEqual([]);
    const audit = await duty("wc_audit");
    expect(await inAgency((tx) => createPacketDocument(tx, coordinator, store, audit.id, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => createPacketDocument(tx, theOwner, store, audit.id, TODAY))).toEqual({ ok: true });
    const [file] = await evidence(audit.id);
    const t = await text(file!.id);
    for (const part of ["Workers' compensation payroll", "Example Mutual Insurance (demo) · WC-0000-DEMO", "3632 Machine shop (example rate)", "Marcus Bell", "$979.50", "They agree"]) expect(t).toContain(part);
    // Generated files are audited like uploads.
    const events = await owner.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "compliance_document"), eq(s.auditEvents.actorLabel, "Test owner")));
    expect(events.length).toBeGreaterThan(0);
  });

  it("the tie-out counts what a correction settled outside the files", async () => {
    const marcus: string[] = [];
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) marcus.push(await addShift("marcus-bell", d, 420, 1020));
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
    // Marcus left at 3 pm on Wednesday: 2 hours ($36.50) overpaid, written off.
    await inAgency((tx) => startCorrection(tx, theOwner, w2, "Marcus left at 3 pm on Wednesday"));
    const edited = await inAgency((tx) => editEntry(tx, theOwner, marcus[2]!, { outMinute: 900, breakMinutes: 0 }, ["misread_corrected"], "left early"));
    expect(edited.ok).toBe(true);
    await inAgency((tx) => computeRun(tx, theOwner, w2));
    expect(await inAgency((tx) => recordCorrectionDecision(tx, theOwner, w2, workerId("marcus-bell"), "written_off", "Small amount, written off"))).toEqual({ ok: true });
    await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
    await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-20" }));
    const v = await inAgency((tx) => wcPacketView(tx, { from: "2026-01-01", to: "2026-12-31", order: "state" }));
    // The latest version pays 28 hours ($511.00); the files paid 30 ($547.50); −$36.50 was settled outside them.
    expect([v.allPayCents, v.filesGrossCents, v.settledCents, v.decisions, v.differenceCents]).toEqual([51_100, 54_750, -3650, 1, 0]);
  });
});
