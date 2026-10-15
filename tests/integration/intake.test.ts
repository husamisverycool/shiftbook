import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencies, auditEvents, jobs, sourceDocuments, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, periodId, seedDemoAgency } from "../../src/server/demo/seed";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import { RecordingMissingError } from "../../src/server/extraction/transport";
import { runPendingJobs } from "../../src/server/jobs";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-intake-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const SAMPLES = "demo/samples/2026-10-05";
const period = periodId("w2");

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

async function upload(file: string) {
  return app.withAgency(actor.agencyId, (tx) =>
    receiveDocument(tx, actor, store, { payPeriodId: period, filename: file, bytes: readFileSync(`${SAMPLES}/${file}`) }),
  );
}

describe("intake of structured files (time clock, Fieldglass)", () => {
  it("records an upload once and queues it for reading", async () => {
    const first = await upload("IL-prairie-line-timeclock-2026-10-05.csv");
    const again = await upload("IL-prairie-line-timeclock-2026-10-05.csv");
    expect(first.duplicate).toBe(false);
    expect(again).toEqual({ documentId: first.documentId, duplicate: true });
    const queued = await app.withAgency(actor.agencyId, (tx) => tx.select().from(jobs));
    expect(queued.filter((j) => j.status === "queued")).toHaveLength(1);
  });

  it("refuses file types that are not accepted", async () => {
    await expect(
      app.withAgency(actor.agencyId, (tx) => receiveDocument(tx, actor, store, { payPeriodId: period, filename: "notes.docx", bytes: new Uint8Array([1]) })),
    ).rejects.toThrow(/only JPG, PNG, HEIC, PDF, CSV and XLSX/);
  });

  it("reads the time-clock file into clean, matched entries", async () => {
    const { documentId } = await upload("IL-prairie-line-timeclock-2026-10-05.csv");
    const result = await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, documentId);
    const truth = JSON.parse(readFileSync("demo/truth/2026-10-05/IL-prairie-line-timeclock-2026-10-05.csv.json", "utf8"));
    expect(result).toEqual({ entries: truth.rows.length, needsReview: 0 });
    const rows = await app.withAgency(actor.agencyId, (tx) => tx.select().from(timeEntries).where(eq(timeEntries.sourceDocumentId, documentId)));
    expect(rows.every((r) => r.workerId && r.assignmentId && r.status === "extracted" && r.confidence === "high")).toBe(true);
    expect(rows.reduce((sum, r) => sum + (r.minutes ?? 0), 0)).toBe(truth.rows.reduce((s: number, r: { minutes: number }) => s + r.minutes, 0));
    const [doc] = await app.withAgency(actor.agencyId, (tx) => tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, documentId)));
    expect(doc!.status).toBe("read");
  });

  it("reads the Fieldglass export, ignores the revoked sheet, and matches every worker at that client", async () => {
    const { documentId } = await upload("CA-pacific-crest-fieldglass-approved-time-sheets.csv");
    const result = await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, documentId);
    const truth = JSON.parse(readFileSync("demo/truth/2026-10-05/CA-pacific-crest-fieldglass-approved-time-sheets.csv.json", "utf8"));
    expect(result).toEqual({ entries: truth.rows.length, needsReview: 0 });
    const [doc] = await app.withAgency(actor.agencyId, (tx) => tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, documentId)));
    expect(doc!.kind).toBe("vms_export");
    expect(doc!.error).toContain("Revoked");
  });

  it("audits every entry it creates", async () => {
    const events = await app.withAgency(actor.agencyId, (tx) => tx.select().from(auditEvents).where(eq(auditEvents.entityType, "time_entry")));
    const entries = await app.withAgency(actor.agencyId, (tx) => tx.select().from(timeEntries).where(eq(timeEntries.payPeriodId, period)));
    const created = new Set(events.filter((e) => e.action === "create").map((e) => e.entityId));
    expect(entries.every((e) => created.has(e.id))).toBe(true);
  });

  it("runs queued jobs through the queue until none are left", async () => {
    let handled = 0;
    const ran = await runPendingJobs(app.withAgency, actor.agencyId, async () => {
      handled += 1;
    });
    expect(ran).toBe(handled);
    const left = await app.withAgency(actor.agencyId, (tx) => tx.select().from(jobs).where(eq(jobs.status, "queued")));
    expect(left).toHaveLength(0);
  });

  it("picks up a job left running by a crashed server, but not one still running", async () => {
    const [stale] = await app.withAgency(actor.agencyId, (tx) =>
      tx.insert(jobs).values({ agencyId: actor.agencyId, kind: "read_document", payload: {}, status: "running", attempts: 1, updatedAt: new Date(Date.now() - 11 * 60_000) }).returning(),
    );
    const [fresh] = await app.withAgency(actor.agencyId, (tx) =>
      tx.insert(jobs).values({ agencyId: actor.agencyId, kind: "read_document", payload: {}, status: "running", attempts: 1 }).returning(),
    );
    const seen: string[] = [];
    await runPendingJobs(app.withAgency, actor.agencyId, async (job) => {
      seen.push(job.id);
    });
    expect(seen).toEqual([stale!.id]);
    await app.withAgency(actor.agencyId, (tx) => tx.delete(jobs).where(eq(jobs.id, fresh!.id)));
  });

  it("fails a job at once when retrying cannot help (e.g. no recorded reading in demo mode)", async () => {
    const [job] = await app.withAgency(actor.agencyId, (tx) => tx.insert(jobs).values({ agencyId: actor.agencyId, kind: "read_document", payload: {} }).returning());
    let calls = 0;
    await runPendingJobs(app.withAgency, actor.agencyId, async () => {
      calls += 1;
      throw new RecordingMissingError("0123456789abcdef");
    });
    expect(calls).toBe(1);
    const [after] = await app.withAgency(actor.agencyId, (tx) => tx.select().from(jobs).where(eq(jobs.id, job!.id)));
    expect(after!.status).toBe("failed");
    expect(after!.lastError).toMatch(/no recorded reading/);
  });
});
