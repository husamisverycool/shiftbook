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
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addObligationFile, addObligationNote, addRegistration, closeObligation, recordI9, recordReverification, reopenObligation, setObligationOwner, unlinkObligationFile } from "../../src/server/compliance/service";
import { complianceItems, filterItems, obligationDetail, urgentCount } from "../../src/server/compliance/queries";
import { syncObligations } from "../../src/server/compliance/sync";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
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

afterAll(async () => {
  await app.close();
  await owner.close();
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
    expect(await inAgency((tx) => urgentCount(tx, TODAY))).toBe(4);
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
      ["Shiftbook", "open"],
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
    expect([d.item.status, d.statusNote, d.doneByLabel, d.closedBySystem]).toEqual(["done", "Renewed: IL-DTLSA-0001-DEMO, expires 2027-12-31.", "Shiftbook", true]);
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
