/**
 * Decision 0043: an agency renames a VMS profile's columns to match its buyer's report (Settings ›
 * Connections › Edit columns); files are then read with its names, each read recording the version
 * that read it; the Owner and Coordinator may change them, nobody else; one agency never sees
 * another's. The invented Beeline sample (scripts/generate-vms-samples.ts) holds 14 days, 6,750 min.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VMS_SAMPLES } from "../../scripts/generate-vms-samples";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, periodId, seedDemoAgency } from "../../src/server/demo/seed";
import { agencyProfiles, saveProfileColumns } from "../../src/server/intake/agency-profiles";
import { BUILT_IN_PROFILES } from "../../src/server/intake/profiles";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-vms-")));
const coordinator: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const KEY = "beeline-timesheet-export";
const beeline = BUILT_IN_PROFILES.find((p) => p.key === KEY)!;
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);

beforeAll(async () => {
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

describe("an agency's own column names for a VMS profile", () => {
  it("is saved as the next version, read files record it, and the usual names come back on Restore", async () => {
    // The buyer's report calls the hours "Total Hrs" and the worker id "Worker Code".
    const columns = { ...beeline.columns, hours: "Total Hrs", externalId: "Worker Code" };
    const saved = await inAgency((tx) => saveProfileColumns(tx, coordinator, KEY, { columns, includeStatuses: ["Approved"], dateFormat: "MM/DD/YYYY" }));
    expect(saved).toMatchObject({ ok: true });
    const mine = await inAgency((tx) => agencyProfiles(tx));
    expect(mine.profiles.find((p) => p.key === KEY)!.columns).toMatchObject({ hours: "Total Hrs", externalId: "Worker Code" });

    const bytes = new TextEncoder().encode(VMS_SAMPLES.beeline.build().replace("Beeline ID", "Worker Code").replace(",Hours\r\n", ",Total Hrs\r\n"));
    const { documentId } = await inAgency((tx) => receiveDocument(tx, coordinator, store, { payPeriodId: periodId("w2"), filename: "buyer-beeline.csv", bytes }));
    const read = await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, coordinator, documentId);
    expect(read.entries).toBe(14);
    const [doc] = await inAgency((tx) => tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, documentId)));
    expect(doc!.mappingProfileId).toBe(mine.rowIds.get(KEY));
    const entries = await inAgency((tx) => tx.select({ minutes: s.timeEntries.minutes }).from(s.timeEntries).where(eq(s.timeEntries.sourceDocumentId, documentId)));
    expect(entries.reduce((n, e) => n + (e.minutes ?? 0), 0)).toBe(6750);

    const restored = await inAgency((tx) => saveProfileColumns(tx, coordinator, KEY, null, true));
    expect(restored.ok && restored.version).toBe((saved.ok ? saved.version : 0) + 1);
    expect((await inAgency((tx) => agencyProfiles(tx))).profiles.find((p) => p.key === KEY)!.columns).toEqual(beeline.columns);
    const audits = await inAgency((tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityType, "mapping_profile")));
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses roles that do not read timesheets, an unknown profile and columns that do not check out", async () => {
    for (const role of ["recruiter", "billing", "accountant"] as const) {
      expect(await inAgency((tx) => saveProfileColumns(tx, { ...coordinator, role }, KEY, { columns: beeline.columns }))).toEqual({ ok: false, error: "forbidden" });
    }
    expect(await inAgency((tx) => saveProfileColumns(tx, coordinator, "nonesuch", { columns: {} }))).toEqual({ ok: false, error: "not_found" });
    expect(await inAgency((tx) => saveProfileColumns(tx, coordinator, KEY, { columns: { ...beeline.columns, hours: "Work Date" } }))).toEqual({ ok: false, error: "invalid", problems: [{ field: "hours", rule: "duplicate" }] });
  });

  it("one agency never reads another's saved columns", async () => {
    const [other] = await owner.db.select({ id: s.agencies.id }).from(s.agencies).where(eq(s.agencies.isDemo, false)).limit(1);
    const otherId = other?.id ?? (await owner.db.insert(s.agencies).values({ id: "00000000-0000-4000-a000-0000000000f1", name: "Other agency (test)", addressLines: [], isDemo: false }).returning({ id: s.agencies.id }))[0]!.id;
    const seen = await app.withAgency(otherId, (tx) => tx.select().from(s.mappingProfiles).where(eq(s.mappingProfiles.agencyId, DEMO_AGENCY.id)));
    expect(seen).toEqual([]);
  });
});
