/**
 * Slice (k) step 2 (decision 0027) through the database: the roster, a worker's details, the SSN
 * sealed with its own key (only the last four in clear; a duplicate refused; the Owner's reveal with a
 * reason, every look recorded), payroll numbers, documents, the end of employment — and who may do
 * each.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appKey } from "../../src/server/auth/crypto";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER, demoSsnDigits } from "../../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { workerList, workerProfile } from "../../src/server/workers/queries";
import { addWorkerDocument, createWorker, endEmployment, isWorkerFile, openWorkerDocument, rehire, removeWorkerDocument, revealSsn, setSsn, SSN_ENTRIES_PER_HOUR, setWorkerPayrollNumber, updatePersonal } from "../../src/server/workers/service";
import { unsealSsn } from "../../src/server/workers/ssn";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Demo Owner (demo)", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const billing: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000004", label: "Test billing", role: "billing" };
const accountant: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000005", label: "Test accountant", role: "accountant" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);
const marcus = workerId("marcus-bell");
const anita = workerId("anita-patel");
const TODAY = "2026-10-16";
/** Numbers the SSA never issues, built from parts (the repository's guard refuses SSN-shaped text outside 9xx). */
const never = (area: string, group: string, serial: string) => [area, group, serial].join("-");

beforeEach(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});
afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("the worker roster", () => {
  it("lists active workers by last name with their placement and payroll number; ended ones only when asked", async () => {
    const rows = await inAgency((tx) => workerList(tx, { today: TODAY }));
    expect(rows).toHaveLength(40);
    expect(rows.map((r) => r.lastName)).toEqual([...rows.map((r) => r.lastName)].sort((a, b) => a.localeCompare(b, "en")));
    const m = rows.find((r) => r.id === marcus)!;
    expect(m).toMatchObject({ firstName: "Marcus", status: "active", hireDate: "2026-08-03", preferredLanguage: "en" });
    expect(m.placements).toEqual([{ position: "Machine Operator", clientName: expect.stringContaining("Prairie Line") }]);
    // The search finds a worker by any of their payroll numbers.
    expect(m.payrollNumbers.length).toBeGreaterThan(0);
    // Nothing of the SSN on the list (California's and New York's guidance: no SSNs on rosters).
    expect(JSON.stringify(rows)).not.toMatch(/ssn/i);
    expect(await inAgency((tx) => endEmployment(tx, theOwner, anita, "2026-10-10", TODAY))).toEqual({ ok: true });
    expect((await inAgency((tx) => workerList(tx, { today: TODAY }))).some((r) => r.id === anita)).toBe(false);
    expect((await inAgency((tx) => workerList(tx, { today: TODAY, includeEnded: true }))).find((r) => r.id === anita)).toMatchObject({ status: "ended", endedOn: "2026-10-10" });
  });

  it("adds a worker and changes their details: the Owner and coordinators only", async () => {
    expect(await inAgency((tx) => createWorker(tx, accountant, { firstName: "Ada", lastName: "Quinn", preferredLanguage: "en", hireDate: TODAY }))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => createWorker(tx, billing, { firstName: "Ada", lastName: "Quinn", preferredLanguage: "en", hireDate: TODAY }))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => createWorker(tx, coordinator, { firstName: " ", lastName: "Quinn", preferredLanguage: "en", hireDate: TODAY }))).toMatchObject({ ok: false, error: "invalid", field: "firstName" });
    const made = await inAgency((tx) => createWorker(tx, coordinator, { firstName: "Ada", lastName: "Quinn", preferredLanguage: "es", hireDate: TODAY }));
    if (!made.ok) throw new Error(made.error);
    expect(await inAgency((tx) => updatePersonal(tx, coordinator, made.id, { firstName: "Ada", lastName: "Quinn-Lopez", preferredLanguage: "en" }))).toEqual({ ok: true });
    const p = (await inAgency((tx) => workerProfile(tx, made.id, TODAY)))!;
    expect(p).toMatchObject({ firstName: "Ada", lastName: "Quinn-Lopez", preferredLanguage: "en", ssn: { last4: null }, status: "active" });
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "worker"), eq(s.auditEvents.entityId, made.id))));
    expect(events.map((e) => e.action)).toEqual(["create", "update"]);
  });

  it("an SSN is sealed with its own key: only the last four in clear, the number nowhere in the row or the log", async () => {
    expect(await inAgency((tx) => setSsn(tx, coordinator, anita, never("000", "12", "3456"), appKey()))).toMatchObject({ ok: false, error: "invalid", rule: "area" });
    expect(await inAgency((tx) => setSsn(tx, coordinator, anita, "900-00-3456", appKey()))).toMatchObject({ ok: false, error: "invalid", rule: "group" });
    expect(await inAgency((tx) => setSsn(tx, accountant, anita, "900-12-3456", appKey()))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setSsn(tx, coordinator, anita, "900 12 3456", appKey()))).toEqual({ ok: true });
    const [row] = await inAgency((tx) => tx.select().from(s.workers).where(eq(s.workers.id, anita)));
    expect(row!.ssnLast4).toBe("3456");
    expect(JSON.stringify(row)).not.toContain("900123456");
    expect(unsealSsn(row!.ssnSealed!, appKey(), anita)).toBe("900123456");
    const log = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "worker"), eq(s.auditEvents.entityId, anita))));
    expect(JSON.stringify(log)).not.toMatch(/900.?12.?3456/);
    expect(log.at(-1)).toMatchObject({ action: "update", after: { ssn: "changed", last4: "3456" } });
    // One SSN, one worker in the agency; the refused try shows on the worker whose number it is.
    expect(await inAgency((tx) => setSsn(tx, coordinator, marcus, "900-12-3456", appKey()))).toMatchObject({ ok: false, error: "duplicate", by: "Anita Patel" });
    expect((await inAgency((tx) => workerProfile(tx, anita, TODAY, { ssnActivity: true })))!.ssn.activity[0]).toMatchObject({ kind: "matched", by: "Test coordinator" });
  });

  it("two people entering the same SSN at once: one saves, the other hears it is taken", async () => {
    const results = await Promise.all([inAgency((tx) => setSsn(tx, coordinator, anita, "900-55-1212", appKey())), inAgency((tx) => setSsn(tx, theOwner, workerId("ashley-nguyen"), "900-55-1212", appKey()))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([expect.objectContaining({ ok: false, error: "duplicate" })]);
  });

  it("SSN entries are limited per person per hour (no guessing another worker's number)", async () => {
    // A coordinator of their own (the log is never cleared, so the other tests' entries would count).
    const guesser: Actor = { ...coordinator, userId: "00000000-0000-4000-a000-000000000006", label: "Guessing coordinator" };
    const made = await inAgency((tx) => createWorker(tx, guesser, { firstName: "Scratch", lastName: "Worker", preferredLanguage: "en", hireDate: TODAY }));
    if (!made.ok) throw new Error(made.error);
    for (let i = 0; i < SSN_ENTRIES_PER_HOUR; i++) {
      const guess = `900-50-${String(1001 + i)}`;
      expect((await inAgency((tx) => setSsn(tx, guesser, made.id, guess, appKey()))).ok, guess).toBe(true);
    }
    expect(await inAgency((tx) => setSsn(tx, guesser, made.id, "900-50-2001", appKey()))).toEqual({ ok: false, error: "too_many" });
    // Someone else is not held back by it.
    expect((await inAgency((tx) => setSsn(tx, theOwner, made.id, "900-50-2001", appKey()))).ok).toBe(true);
  });

  it("the Owner reveals one SSN with a reason; the look is recorded and listed; nobody else can", async () => {
    const digits = demoSsnDigits("marcus-bell")!;
    expect(await inAgency((tx) => revealSsn(tx, coordinator, marcus, "Payroll set-up", appKey()))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => revealSsn(tx, accountant, marcus, "Payroll set-up", appKey()))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => revealSsn(tx, theOwner, marcus, "  ", appKey()))).toEqual({ ok: false, error: "reason_required" });
    // The reason is kept for good and shown: never an SSN in it.
    expect(await inAgency((tx) => revealSsn(tx, theOwner, marcus, "check 900-12-3456 on the W-2", appKey()))).toMatchObject({ ok: false, error: "invalid", field: "reason", rule: "has_ssn" });
    const shown = await inAgency((tx) => revealSsn(tx, theOwner, marcus, "W-2 correction for the state", appKey()));
    expect(shown).toEqual({ ok: true, ssn: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` });
    const p = (await inAgency((tx) => workerProfile(tx, marcus, TODAY, { ssnActivity: true })))!;
    expect(p.ssn.last4).toBe(digits.slice(5));
    expect(p.ssn.activity[0]).toMatchObject({ kind: "viewed", by: "Demo Owner (demo)", reason: "W-2 correction for the state" });
    // Who looked is the Owner's to see: the other roles' pages carry none of it.
    expect((await inAgency((tx) => workerProfile(tx, marcus, TODAY)))!.ssn.activity).toEqual([]);
    // The reveal is in the log with its reason, never the number.
    const [event] = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.action, "reveal"), eq(s.auditEvents.entityId, marcus))));
    expect(event).toMatchObject({ entityType: "worker", reason: "W-2 correction for the state" });
    expect(JSON.stringify(event)).not.toContain(digits);
    // A worker with none on file has nothing to reveal.
    expect(await inAgency((tx) => revealSsn(tx, theOwner, workerId("ashley-nguyen"), "Check", appKey()))).toEqual({ ok: false, error: "none" });
  });

  it("payroll numbers, documents and the end of employment, from the profile", async () => {
    expect(await inAgency((tx) => setWorkerPayrollNumber(tx, coordinator, anita, "adp_wfn", "100155"))).toEqual({ ok: true });
    expect(await inAgency((tx) => setWorkerPayrollNumber(tx, accountant, anita, "adp_wfn", "100156"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => setWorkerPayrollNumber(tx, coordinator, anita, "spreadsheet", "900-12-3456"))).toMatchObject({ ok: false, error: "invalid", problems: [{ field: "id", rule: "no_ssn" }] });
    const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-worker-docs-")));
    const added = await inAgency((tx) => addWorkerDocument(tx, coordinator, store, anita, { filename: "w4-anita.pdf", bytes: new TextEncoder().encode("%PDF-1.4 test"), kind: "w4", effectiveOn: "2026-08-03" }));
    if (!added.ok) throw new Error(added.error);
    expect(await inAgency((tx) => addWorkerDocument(tx, coordinator, store, anita, { filename: "script.exe", bytes: new Uint8Array([1]), kind: "other", effectiveOn: TODAY }))).toMatchObject({ ok: false, error: "invalid", field: "file_type" });
    // No I-9 or identity-document copies (decision J4: the I-9 is dates only); no SSN in a file name.
    expect(await inAgency((tx) => addWorkerDocument(tx, coordinator, store, anita, { filename: "i9.pdf", bytes: new TextEncoder().encode("%PDF-1.4 test"), kind: "i9", effectiveOn: TODAY }))).toMatchObject({ ok: false, error: "invalid", field: "kind" });
    for (const filename of ["w4 900-12-3456.pdf", "w4_900123456.pdf", "900 12 3456 w4.pdf"]) expect(await inAgency((tx) => addWorkerDocument(tx, coordinator, store, anita, { filename, bytes: new TextEncoder().encode("%PDF-1.4 test"), kind: "w4", effectiveOn: TODAY }))).toMatchObject({ ok: false, error: "invalid", field: "file_name" });
    let p = (await inAgency((tx) => workerProfile(tx, anita, TODAY)))!;
    expect(p.payrollIds.adp_wfn).toEqual({ id: "100155" });
    expect(p.documents).toEqual([expect.objectContaining({ id: added.id, filename: "w4-anita.pdf", kind: "w4", effectiveOn: "2026-08-03", addedBy: "Test coordinator" })]);
    // A worker's file holds the SSN (a W-4) or bank details: the Owner opens it with a reason, recorded
    // like a look at the SSN; nobody gets it through the compliance files' route.
    const documentId = p.documents[0]!.documentId;
    expect(await inAgency((tx) => isWorkerFile(tx, documentId))).toBe(true);
    expect(await inAgency((tx) => openWorkerDocument(tx, coordinator, anita, added.id, "Check the form"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => openWorkerDocument(tx, accountant, anita, added.id, "Check the form"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => openWorkerDocument(tx, theOwner, anita, added.id, " "))).toEqual({ ok: false, error: "reason_required" });
    expect(await inAgency((tx) => openWorkerDocument(tx, theOwner, marcus, added.id, "Check the form"))).toEqual({ ok: false, error: "not_found" });
    expect(await inAgency((tx) => openWorkerDocument(tx, theOwner, anita, added.id, "Check the withholding"))).toEqual({ ok: true });
    const opened = (await inAgency((tx) => workerProfile(tx, anita, TODAY, { ssnActivity: true })))!.ssn.activity[0];
    expect(opened).toMatchObject({ kind: "opened", document: "w4-anita.pdf", by: "Demo Owner (demo)", reason: "Check the withholding" });
    expect(await inAgency((tx) => removeWorkerDocument(tx, coordinator, anita, added.id))).toEqual({ ok: true });
    p = (await inAgency((tx) => workerProfile(tx, anita, TODAY)))!;
    expect(p.documents).toEqual([]);
    // Ended, then hired again; never deleted.
    expect(await inAgency((tx) => endEmployment(tx, coordinator, anita, "2026-13-01", TODAY))).toMatchObject({ ok: false, error: "invalid" });
    expect(await inAgency((tx) => endEmployment(tx, coordinator, anita, "2026-10-10", TODAY))).toEqual({ ok: true });
    expect(await inAgency((tx) => endEmployment(tx, coordinator, anita, "2026-10-11", TODAY))).toEqual({ ok: false, error: "ended" });
    expect(await inAgency((tx) => rehire(tx, coordinator, anita))).toEqual({ ok: true });
    expect((await inAgency((tx) => workerProfile(tx, anita, TODAY)))!).toMatchObject({ status: "active", endedOn: null });
  });
});
