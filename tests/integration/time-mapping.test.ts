/**
 * "Map this file" (SPEC §6): a time-clock file whose layout no profile knows fails with "unmapped";
 * a person maps it once from the file, the layout is saved as the agency's own profile, the file is
 * read again with it, and the next file of that layout is read without asking.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencies, auditEvents, mappingProfiles, sourceDocuments, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, periodId, seedDemoAgency } from "../../src/server/demo/seed";
import { MappingProblemError, mappingLines, mappingPreview, saveMapping, type MappingDraft } from "../../src/server/intake/mapping";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-mapping-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const period = periodId("w2");
const deps = { withAgency: app.withAgency, store, imageReader: noImages };

/** Another clock's export: two lines of titles, its own column names, hours only. */
const clock = (rows: string[]) => new TextEncoder().encode(["Northside Clock — hours by associate", "Printed 10/12/2026", "Badge,Associate,Work Date,Hrs", ...rows].join("\n"));
const FIRST = clock(["10413,\"Patel, Anita\",10/05/2026,8.00", "10416,\"Ruiz, Daniel\",10/05/2026,7.50"]);
const SECOND = clock(["10413,\"Patel, Anita\",10/06/2026,8.25"]);

const draft: MappingDraft = { name: "Northside clock", headerRow: 3, dateFormat: "MM/DD/YYYY", columns: { externalId: "Badge", name: "Associate", date: "Work Date", totalHours: "Hrs" } };

beforeAll(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await app.withAgency(DEMO_AGENCY.id, async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

const upload = (filename: string, bytes: Uint8Array) => app.withAgency(actor.agencyId, (tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename, bytes }));
const docOf = (id: string) => app.withAgency(actor.agencyId, async (tx) => (await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, id)))[0]!);

describe("a time file in a layout no profile knows", () => {
  let documentId = "";

  it("fails to read, saying its columns are not mapped", async () => {
    documentId = (await upload("northside-week.csv", FIRST)).documentId;
    await expect(readStoredDocument(deps, actor, documentId)).rejects.toThrow(/do not match any saved mapping profile/);
    expect((await docOf(documentId)).status).toBe("failed");
  });

  it("shows its first lines, then the columns and rows read from the line a person picks", async () => {
    const { lines } = await app.withAgency(actor.agencyId, (tx) => mappingLines(tx, store, documentId));
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5]);
    const preview = await app.withAgency(actor.agencyId, (tx) => mappingPreview(tx, store, documentId, draft));
    expect(preview.header).toEqual(["Badge", "Associate", "Work Date", "Hrs"]);
    expect(preview.problems).toEqual([]);
    expect(preview.read.map((r) => [r.worker, r.date, r.minutes])).toEqual([
      ["Patel, Anita", "2026-10-05", 480],
      ["Ruiz, Daniel", "2026-10-05", 450],
    ]);
    const wrong = await app.withAgency(actor.agencyId, (tx) => mappingPreview(tx, store, documentId, { ...draft, headerRow: 1 }));
    expect(wrong.problems).toEqual(["not_in_header"]);
  });

  it("refuses an incomplete mapping", async () => {
    await expect(app.withAgency(actor.agencyId, (tx) => saveMapping(tx, actor, store, documentId, { ...draft, columns: { name: "Associate", date: "Work Date" } }))).rejects.toThrow(MappingProblemError);
  });

  it("saves the layout as the agency's profile, audited, and reads the file again with it", async () => {
    const { profileId } = await app.withAgency(actor.agencyId, (tx) => saveMapping(tx, actor, store, documentId, draft));
    expect((await docOf(documentId)).status).toBe("received");
    const result = await readStoredDocument(deps, actor, documentId);
    expect(result.entries).toBe(2);
    const doc = await docOf(documentId);
    expect([doc.status, doc.mappingProfileId]).toEqual(["read", profileId]);
    const entries = await app.withAgency(actor.agencyId, (tx) => tx.select().from(timeEntries).where(eq(timeEntries.sourceDocumentId, documentId)));
    expect(entries.map((e) => e.minutes).sort()).toEqual([450, 480]);
    expect(entries.every((e) => e.workerId !== null)).toBe(true);
    const logged = await app.withAgency(actor.agencyId, (tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "mapping_profile"), eq(auditEvents.entityId, profileId))));
    expect(logged).toHaveLength(1);
  });

  it("reads the next file of that layout without asking", async () => {
    const { documentId: next } = await upload("northside-next.csv", SECOND);
    expect((await readStoredDocument(deps, actor, next)).entries).toBe(1);
    const saved = await app.withAgency(actor.agencyId, (tx) => tx.select().from(mappingProfiles).where(like(mappingProfiles.source, "timeclock:%")));
    expect(saved.map((p) => p.name)).toEqual(["Northside clock"]);
  });
});
