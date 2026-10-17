/**
 * Compliance duties (slice j step 1; plan `.claude/plans/slice-j-compliance.md`, decisions J1–J4, J9).
 * The demo agency, on 2026-10-16: its Illinois registration expires 2026-12-31 (renew by 2026-11-01,
 * reminded from 2026-10-02: due soon); its Massachusetts registration expires 2026-11-20 (renew by
 * 2026-10-21, reminded from 2026-10-06: due soon); every placement started 2026-08-03 (a Monday), so
 * the Massachusetts job orders were due by 2026-08-09, all sent but Kwame Boateng's (overdue);
 * Prairie Line (Illinois day and temporary labor) had proof before 2026-08-03 and on 2026-09-01
 * (done), and gets 2027-03-01 (upcoming); Kateryna Bondarenko's work authorization ends 2026-12-20
 * (reverify by then, reminded from 2026-09-21: due soon); the workers' comp policy ends 2026-12-31
 * (reminded from 2026-12-01) and its audit is 2027-02-15.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { addObligationFile, addObligationNote, addRegistration, closeObligation, recordI9, recordReverification, reopenObligation, setObligationOwner, setOpenWeekendDays, unlinkObligationFile } from "../../src/server/compliance/service";
import { complianceItems, filterItems, obligationDetail, urgentCount } from "../../src/server/compliance/queries";
import { backfillKeys, syncObligations } from "../../src/server/compliance/sync";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, jobOrderId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { explanationsSayTheMessage } from "./explain-parity";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-compliance-")));
const TODAY = "2026-10-16";
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const billing: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000004", label: "Test billing", role: "billing" };
const accountant: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000005", label: "Test accountant", role: "accountant" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);
const PDF = new TextEncoder().encode("%PDF-1.4\n% a demo certificate\n");

async function freshAgency() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
}
const items = () => inAgency((tx) => complianceItems(tx, theOwner, TODAY));
const one = async (kind: string, where: (i: Awaited<ReturnType<typeof items>>["items"][number]) => boolean = () => true) => (await items()).items.find((i) => i.kind === kind && where(i))!;

// Every duty on file says, in keys, what its English sentence says (decision 0028).
afterEach(async () => {
  await inAgency((tx) => explanationsSayTheMessage(tx));
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("each rule's citation in the reader's language (decision 0028)", () => {
  it("the English copy in the messages is exactly the rule table's text, for every rule in force; Spanish has each", async () => {
    const rules = await owner.db.select({ code: s.complianceRules.code, citation: s.complianceRules.citation, effectiveTo: s.complianceRules.effectiveTo }).from(s.complianceRules);
    const inForce = rules.filter((r) => r.effectiveTo === null);
    expect(inForce.length).toBeGreaterThan(0);
    for (const r of inForce) {
      expect((en.compliance.citations as Record<string, string>)[r.code], r.code).toBe(r.citation);
      expect((es.compliance.citations as Record<string, string>)[r.code], r.code).toBeTruthy();
    }
  });
});

describe("the demo's duties, most urgent first (J1, J3)", () => {
  beforeEach(freshAgency);

  it("overdue, then due soon by date, then upcoming; done ones only when asked for", async () => {
    const { items: all } = await items();
    const open = filterItems(all, { area: null, statuses: [], jurisdiction: null, owner: null, q: "" }, theOwner);
    expect(open.map((i) => [i.kind, i.status, i.dueOn, i.subject])).toEqual([
      ["ma_job_order", "overdue", "2026-08-09", "Kwame Boateng · Event Server · Harborview Events & Hospitality (demo)"],
      ["ma_registration_renewal", "due_soon", "2026-10-21", "Cedar Row Staffing (demo) · MA-PA-0000-DEMO"],
      ["il_registration_renewal", "due_soon", "2026-11-01", "Cedar Row Staffing (demo) · IL-DTLSA-0000-DEMO"],
      ["i9_reverify", "due_soon", "2026-12-20", "Kateryna Bondarenko"],
      // The Newark packers (SPEC §27.10): the assignment notice and day-one equal pay for each; Leticia,
      // who speaks Spanish, also the notice in her language (until the owner approves the change).
      ["nj_assignment_notice", "upcoming", "2026-11-07", "Andre Lewis · Packer · Prairie Line Manufacturing (demo)"],
      ["nj_equal_pay_check", "upcoming", "2026-11-07", "Andre Lewis · Packer · Prairie Line Manufacturing (demo)"],
      ["nj_assignment_notice", "upcoming", "2026-11-07", "Grace Mensah · Packer · Prairie Line Manufacturing (demo)"],
      ["nj_equal_pay_check", "upcoming", "2026-11-07", "Grace Mensah · Packer · Prairie Line Manufacturing (demo)"],
      ["nj_assignment_notice", "upcoming", "2026-11-07", "Leticia Ramos Vega · Packer · Prairie Line Manufacturing (demo)"],
      ["nj_equal_pay_check", "upcoming", "2026-11-07", "Leticia Ramos Vega · Packer · Prairie Line Manufacturing (demo)"],
      ["nj_language_notice", "upcoming", "2026-11-07", "Leticia Ramos Vega · Packer · Prairie Line Manufacturing (demo)"],
      ["wc_policy_renewal", "upcoming", "2026-12-31", "Example Mutual Insurance (demo) · WC-0000-DEMO"],
      ["wc_audit", "upcoming", "2027-02-15", "Example Mutual Insurance (demo) · WC-0000-DEMO"],
      ["il_client_proof", "upcoming", "2027-03-01", "Prairie Line Manufacturing (demo)"],
    ]);
    const done = filterItems(all, { area: "clients", statuses: ["done"], jurisdiction: null, owner: null, q: "" }, theOwner);
    expect(done.map((i) => [i.kind, i.dueOn])).toEqual([
      ["il_client_proof_contract", "2026-08-03"],
      ["il_client_proof", "2026-09-01"],
    ]);
    // Every worker's I-9 was recorded on time: closed by the data itself.
    expect(all.filter((i) => i.kind.startsWith("i9_section") && i.status === "done")).toHaveLength(80);
    expect(await inAgency((tx) => urgentCount(tx, theOwner.agencyId, TODAY))).toBe(4);
  });

  it("filters: area, state, search, owner", async () => {
    const { items: all } = await items();
    const f = (over: Partial<Parameters<typeof filterItems>[1]>) => filterItems(all, { area: null, statuses: [], jurisdiction: null, owner: null, q: "", ...over }, theOwner).map((i) => i.kind);
    expect(f({ jurisdiction: "MA" })).toEqual(["ma_job_order", "ma_registration_renewal"]);
    expect(f({ area: "workers" })).toEqual(["i9_reverify"]);
    expect(f({ q: "kateryna" })).toEqual(["i9_reverify"]);
    expect(f({ owner: "me" })).toEqual([]);
    const reverify = await one("i9_reverify");
    expect(await inAgency((tx) => setObligationOwner(tx, theOwner, reverify.id, theOwner.userId))).toEqual({ ok: true });
    expect(filterItems((await items()).items, { area: null, statuses: [], jurisdiction: null, owner: "me", q: "" }, theOwner).map((i) => [i.kind, i.ownerName])).toEqual([["i9_reverify", DEMO_OWNER.name]]);
  });
});

describe("acting on a duty (J9)", () => {
  beforeEach(freshAgency);

  it("who may: the Owner everything; a coordinator placements and workers; billing client proof; the accountant nothing", async () => {
    const renewal = await one("il_registration_renewal");
    const jobOrder = await one("ma_job_order", (i) => i.status === "overdue");
    const proof = await one("il_client_proof", (i) => i.status === "upcoming");
    expect(await inAgency((tx) => closeObligation(tx, coordinator, renewal.id, "done", null))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => closeObligation(tx, accountant, jobOrder.id, "done", null))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => closeObligation(tx, billing, jobOrder.id, "done", null))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => closeObligation(tx, coordinator, jobOrder.id, "done", "Sent by text in Portuguese and English."))).toEqual({ ok: true });
    expect(await inAgency((tx) => closeObligation(tx, billing, proof.id, "not_applicable", "  "))).toEqual({ ok: false, error: "invalid", field: "reason" });
    expect(await inAgency((tx) => closeObligation(tx, billing, proof.id, "not_applicable", "Contract ends February 2027."))).toEqual({ ok: true });
    expect(await inAgency((tx) => closeObligation(tx, billing, proof.id, "done", null))).toEqual({ ok: false, error: "not_open" });
    // Only the Owner reopens.
    expect(await inAgency((tx) => reopenObligation(tx, billing, proof.id))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => reopenObligation(tx, theOwner, proof.id))).toEqual({ ok: true });
    const d = (await inAgency((tx) => obligationDetail(tx, theOwner, jobOrder.id, TODAY)))!;
    expect(d).toMatchObject({ statusNote: "Sent by text in Portuguese and English.", doneByLabel: "Test coordinator", closedBySystem: false });
    expect(d.item.status).toBe("done");
    expect(d.history.map((h) => [h.by, h.after?.status])).toEqual([
      ["Test coordinator", "done"],
      ["Granite", "open"],
    ]);
    // Syncing again never undoes a person's decision.
    await inAgency((tx) => syncObligations(tx, theOwner.agencyId, TODAY));
    expect((await inAgency((tx) => obligationDetail(tx, theOwner, jobOrder.id, TODAY)))!.item.status).toBe("done");
  });

  it("notes and files: a file is kept when unlinked (Past files); only allowed types and sizes", async () => {
    const renewal = await one("il_registration_renewal");
    expect(await inAgency((tx) => addObligationNote(tx, theOwner, renewal.id, "Bond renewed with the surety; fee check cut."))).toEqual({ ok: true });
    expect(await inAgency((tx) => addObligationFile(tx, theOwner, store, renewal.id, { filename: "renewal.pdf", bytes: PDF, effectiveOn: "2026-10-15" }))).toEqual({ ok: true });
    expect(await inAgency((tx) => addObligationFile(tx, theOwner, store, renewal.id, { filename: "macro.exe", bytes: PDF, effectiveOn: "2026-10-15" }))).toEqual({ ok: false, error: "invalid", field: "file_type" });
    expect(await inAgency((tx) => addObligationFile(tx, accountant, store, renewal.id, { filename: "renewal.pdf", bytes: PDF, effectiveOn: "2026-10-15" }))).toEqual({ ok: false, error: "not_allowed" });
    let d = (await inAgency((tx) => obligationDetail(tx, theOwner, renewal.id, TODAY)))!;
    expect(d.notes.map((n) => [n.body, n.by])).toEqual([["Bond renewed with the surety; fee check cut.", "Test owner"]]);
    expect(d.files.map((f) => [f.filename, f.effectiveOn, f.source])).toEqual([["renewal.pdf", "2026-10-15", "upload"]]);
    const [doc] = d.files;
    expect(new TextDecoder().decode(await store.get((await owner.db.select().from(s.complianceDocuments).where(eq(s.complianceDocuments.id, doc!.id)))[0]!.storageKey))).toContain("demo certificate");
    expect(await inAgency((tx) => unlinkObligationFile(tx, theOwner, renewal.id, doc!.id))).toEqual({ ok: true });
    d = (await inAgency((tx) => obligationDetail(tx, theOwner, renewal.id, TODAY)))!;
    expect([d.files.length, d.pastFiles.map((f) => [f.filename, f.unlinkedBy])]).toEqual([0, [["renewal.pdf", "Test owner"]]]);
  });
});

describe("the data closes and reopens what it settles (J3)", () => {
  beforeEach(freshAgency);

  it("a new registration renews the old one, and starts its own renewal", async () => {
    const old = await one("il_registration_renewal");
    expect(await inAgency((tx) => addRegistration(tx, coordinator, { jurisdiction: "IL", branchId: null, number: "IL-DTLSA-0001-DEMO", issuedOn: "2027-01-01", expiresOn: "2027-12-31", documentId: null }, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => addRegistration(tx, theOwner, { jurisdiction: "IL", branchId: null, number: "IL-DTLSA-0001-DEMO", issuedOn: "2027-01-01", expiresOn: "2026-12-31", documentId: null }, TODAY))).toEqual({ ok: false, error: "invalid", field: "expiresOn" });
    expect(await inAgency((tx) => addRegistration(tx, theOwner, { jurisdiction: "IL", branchId: null, number: "IL-DTLSA-0001-DEMO", issuedOn: "2027-01-01", expiresOn: "2027-12-31", documentId: null }, TODAY))).toEqual({ ok: true });
    const d = (await inAgency((tx) => obligationDetail(tx, theOwner, old.id, TODAY)))!;
    expect([d.item.status, d.statusNote, d.doneByLabel, d.closedBySystem]).toEqual(["done", "Renewed: IL-DTLSA-0001-DEMO, expires 2027-12-31.", "Granite", true]);
    expect((await items()).items.filter((i) => i.kind === "il_registration_renewal").map((i) => [i.dueOn, i.status])).toEqual([
      ["2027-11-01", "upcoming"],
      ["2026-11-01", "done"],
    ]);
  });

  it("a cancelled placement's open job order no longer applies; started again, it opens again", async () => {
    const kwame = assignmentId("kwame-boateng");
    await owner.db.update(s.assignments).set({ status: "cancelled" }).where(eq(s.assignments.id, kwame));
    const o = await one("ma_job_order", (i) => i.links.assignmentId === kwame);
    expect([o.status]).toEqual(["not_applicable"]);
    await owner.db.update(s.assignments).set({ status: "active" }).where(eq(s.assignments.id, kwame));
    expect((await one("ma_job_order", (i) => i.links.assignmentId === kwame)).status).toBe("overdue");
  });

  it("I-9: a new hire's Section 2 is due three business days later; recording it closes the duty; no date in the future", async () => {
    const w = workerId("ashley-nguyen");
    expect(await inAgency((tx) => recordI9(tx, accountant, w, { hireDate: "2026-10-15", section1On: "2026-10-15", section2On: null, workAuthExpiresOn: null }, TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-15", section1On: "2026-10-15", section2On: "2026-10-19", workAuthExpiresOn: null }, TODAY))).toEqual({ ok: false, error: "invalid", field: "section2On" });
    expect(await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-15", section1On: "2026-10-15", section2On: null, workAuthExpiresOn: null }, TODAY))).toEqual({ ok: true });
    const s2 = await one("i9_section2", (i) => i.links.workerId === w);
    expect([s2.dueOn, s2.status]).toEqual(["2026-10-20", "upcoming"]);
    expect(await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-15", section1On: "2026-10-15", section2On: "2026-10-16", workAuthExpiresOn: null }, TODAY))).toEqual({ ok: true });
    const d = (await inAgency((tx) => obligationDetail(tx, theOwner, s2.id, TODAY)))!;
    expect([d.item.status, d.statusNote]).toEqual(["done", "Section 2 completed on 2026-10-16."]);
    // The worker's dates are audited.
    const [event] = await owner.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "worker"), eq(s.auditEvents.entityId, w)));
    expect(event).toMatchObject({ actorLabel: "Test coordinator", after: { hireDate: "2026-10-15", i9Section1On: "2026-10-15", i9Section2On: null } });
  });

  it("reverification: done when recorded; the new end date gives the next one", async () => {
    const o = await one("i9_reverify");
    expect(await inAgency((tx) => recordReverification(tx, coordinator, o.id, { reverifiedOn: "2026-10-17", nextExpiresOn: null }, TODAY))).toEqual({ ok: false, error: "invalid", field: "reverifiedOn" });
    expect(await inAgency((tx) => recordReverification(tx, coordinator, o.id, { reverifiedOn: "2026-10-14", nextExpiresOn: "2028-06-30" }, TODAY))).toEqual({ ok: true });
    // The note in keys; one written before keys were kept gets them on the next sync (decision 0028).
    const [reverified] = await inAgency((tx) => tx.select().from(s.obligations).where(eq(s.obligations.id, o.id)));
    expect(reverified!.noteKey).toEqual({ parts: [{ key: "noteReverified", values: { date: { date: "2026-10-14" } } }], citation: null });
    await inAgency((tx) => tx.update(s.obligations).set({ noteKey: null }).where(eq(s.obligations.id, o.id)));
    await inAgency((tx) => backfillKeys(tx));
    expect((await inAgency((tx) => tx.select().from(s.obligations).where(eq(s.obligations.id, o.id))))[0]!.noteKey).toEqual(reverified!.noteKey);
    expect((await items()).items.filter((i) => i.kind === "i9_reverify").map((i) => [i.occurrence, i.status])).toEqual([
      ["2028-06-30", "upcoming"],
      ["2026-12-20", "done"],
    ]);
  });

  it("the run's Illinois equal-pay crossings are listed with the rest (area equal pay)", async () => {
    await owner.db.insert(s.obligations).values({ agencyId: theOwner.agencyId, kind: "il_equal_pay_720h", jurisdiction: "IL", subjectKind: "worker_client", workerId: workerId("marcus-bell"), clientId: clientId("il"), crossedOn: "2026-10-08", dueOn: "2026-10-11", facts: {}, message: "crossed" });
    const o = await one("il_equal_pay_720h");
    expect([o.area, o.status, o.subject]).toEqual(["equal_pay", "overdue", "Marcus Bell · Prairie Line Manufacturing (demo)"]);
    // Syncing never touches it.
    await inAgency((tx) => syncObligations(tx, theOwner.agencyId, TODAY));
    expect((await one("il_equal_pay_720h")).status).toBe("overdue");
  });
});

describe("second opinion (slice j)", () => {
  beforeEach(freshAgency);

  it("age never closes a duty: an overdue one further back than its look-back stays open", async () => {
    // Kwame's job order was due 2026-08-09; on 2027-12-01 it is past the 365-day look-back, and still owed.
    const o = await one("ma_job_order", (i) => i.status === "overdue");
    await inAgency((tx) => syncObligations(tx, theOwner.agencyId, "2027-12-01"));
    expect((await inAgency((tx) => obligationDetail(tx, theOwner, o.id, "2027-12-01")))!.item.status).toBe("overdue");
  });

  it("syncing again changes nothing (the facts compare equal whatever order the database keeps their keys in)", async () => {
    await items();
    expect(await inAgency((tx) => syncObligations(tx, theOwner.agencyId, TODAY))).toEqual({ created: 0, changed: 0, closed: 0 });
  });

  it("what the data closed cannot be reopened by hand; what Granite set aside, the data may close as done", async () => {
    const old = await one("il_registration_renewal");
    await inAgency((tx) => addRegistration(tx, theOwner, { jurisdiction: "IL", branchId: null, number: "IL-DTLSA-0001-DEMO", issuedOn: "2027-01-01", expiresOn: "2027-12-31", documentId: null }, TODAY));
    expect(await inAgency((tx) => reopenObligation(tx, theOwner, old.id))).toEqual({ ok: false, error: "closed_by_data" });
    // A hire date moved and back: the first Section 2 duty was set aside, then the data says it was done.
    const w = workerId("ashley-nguyen");
    await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-15", section1On: "2026-10-15", section2On: null, workAuthExpiresOn: null }, TODAY));
    const s2 = await one("i9_section2", (i) => i.links.workerId === w && i.occurrence === "2026-10-15");
    await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-14", section1On: "2026-10-14", section2On: null, workAuthExpiresOn: null }, TODAY));
    expect((await inAgency((tx) => obligationDetail(tx, theOwner, s2.id, TODAY)))!.item.status).toBe("not_applicable");
    await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-15", section1On: "2026-10-15", section2On: "2026-10-16", workAuthExpiresOn: null }, TODAY));
    const d = (await inAgency((tx) => obligationDetail(tx, theOwner, s2.id, TODAY)))!;
    expect([d.item.status, d.statusNote, d.closedBySystem]).toEqual(["done", "Section 2 completed on 2026-10-16.", true]);
  });

  it("Form I-9: one set of duties per hire date; Section 2 may come before the first day but not before Section 1; no I-9 files kept", async () => {
    const w = workerId("ashley-nguyen");
    expect(await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-19", section1On: "2026-10-14", section2On: "2026-10-13", workAuthExpiresOn: null }, TODAY))).toEqual({ ok: false, error: "invalid", field: "section2On" });
    expect(await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-19", section1On: "2026-10-14", section2On: "2026-10-15", workAuthExpiresOn: null }, TODAY))).toEqual({ ok: true });
    const mine = (await items()).items.filter((i) => i.links.workerId === w && i.kind.startsWith("i9_section"));
    expect(mine.filter((i) => i.occurrence === "2026-10-19").map((i) => [i.kind, i.status])).toEqual([
      ["i9_section1", "done"],
      ["i9_section2", "done"],
    ]);
    // The first hire's (2026-08-03), done then, stay done.
    expect(mine.filter((i) => i.occurrence !== "2026-10-19").map((i) => [i.occurrence, i.status])).toEqual([
      ["2026-08-03", "done"],
      ["2026-08-03", "done"],
    ]);
    const s1 = mine.find((i) => i.kind === "i9_section1")!;
    expect(await inAgency((tx) => addObligationFile(tx, theOwner, store, s1.id, { filename: "i9.pdf", bytes: PDF, effectiveOn: TODAY }))).toEqual({ ok: false, error: "invalid", field: "i9_files" });
    expect((await inAgency((tx) => obligationDetail(tx, theOwner, s1.id, TODAY)))!.keepsNoFiles).toBe(true);
  });

  it("a changed end of the work authorization sets the old reverification aside, by whoever changed it, saying so", async () => {
    const o = await one("i9_reverify");
    const w = o.links.workerId!;
    const [worker] = await owner.db.select().from(s.workers).where(eq(s.workers.id, w));
    expect(await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: worker!.hireDate, section1On: worker!.i9Section1On, section2On: worker!.i9Section2On, workAuthExpiresOn: "2027-06-30" }, TODAY))).toEqual({ ok: true });
    const d = (await inAgency((tx) => obligationDetail(tx, theOwner, o.id, TODAY)))!;
    expect([d.item.status, d.doneByLabel, d.closedBySystem, d.statusNote]).toEqual(["not_applicable", "Test coordinator", false, "The work authorization's end was changed from 2026-12-20 to 2027-06-30."]);
    expect((await items()).items.filter((i) => i.kind === "i9_reverify" && i.links.workerId === w).map((i) => [i.occurrence, i.status])).toEqual([
      ["2027-06-30", "upcoming"],
      ["2026-12-20", "not_applicable"],
    ]);
  });

  it("Saturdays count as I-9 business days once the Owner says the agency is open then", async () => {
    const w = workerId("ashley-nguyen");
    await inAgency((tx) => recordI9(tx, coordinator, w, { hireDate: "2026-10-15", section1On: "2026-10-15", section2On: null, workAuthExpiresOn: null }, TODAY));
    expect(await inAgency((tx) => setOpenWeekendDays(tx, coordinator, [6], TODAY))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setOpenWeekendDays(tx, theOwner, [6, 3], TODAY))).toEqual({ ok: false, error: "invalid", field: "days" });
    // Weekdays only: Thursday the 15th + 3 = Tuesday the 20th. The setting in force on the hire date
    // counts; open on Saturdays from the 15th: Friday, Saturday, Monday — the 19th.
    expect((await one("i9_section2", (i) => i.links.workerId === w && i.occurrence === "2026-10-15")).dueOn).toBe("2026-10-20");
    expect(await inAgency((tx) => setOpenWeekendDays(tx, theOwner, [6], "2026-10-15"))).toEqual({ ok: true });
    expect((await one("i9_section2", (i) => i.links.workerId === w && i.occurrence === "2026-10-15")).dueOn).toBe("2026-10-19");
  });

  it("the sidebar's count works the duties out first: a new Massachusetts placement's overdue job order counts at once", async () => {
    expect(await inAgency((tx) => urgentCount(tx, theOwner.agencyId, TODAY))).toBe(4);
    await owner.db.insert(s.assignments).values({ agencyId: theOwner.agencyId, workerId: workerId("marcus-bell"), jobOrderId: jobOrderId("ma-server"), startDate: "2026-10-05", status: "active" });
    expect(await inAgency((tx) => urgentCount(tx, theOwner.agencyId, TODAY))).toBe(5);
  });

  it("an Illinois contract proof is one per contract: covered work after a gap longer than the window is a new contract", async () => {
    const before = (await items()).items.filter((i) => i.kind === "il_client_proof_contract").map((i) => i.occurrence);
    expect(before).toEqual(["contract:2026-08-03"]);
  });
});
