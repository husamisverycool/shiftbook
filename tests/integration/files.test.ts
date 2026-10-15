import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseGustoHoursCsv } from "../../src/exports/gusto-hours";
import { agencies, auditEvents, exports, invoices, payLines, payRuns, billLines, timeEntries } from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { pdfText } from "../../src/server/files/pdf-text";
import { createRunFiles, RunNotReadyError } from "../../src/server/files/service";
import { readStoredDocument, receiveDocument, type ImageReader } from "../../src/server/intake/service";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-files-")));
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const noImages: ImageReader = { read: () => Promise.reject(new Error("no images in this test")) };
const period = periodId("w2");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const TODAY = "2026-10-15";

beforeAll(async () => {
  const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  const file = "IL-prairie-line-timeclock-2026-10-05.csv";
  const { documentId } = await inAgency((tx) =>
    receiveDocument(tx, actor, store, { payPeriodId: period, filename: file, bytes: readFileSync(`demo/samples/2026-10-05/${file}`) }),
  );
  await readStoredDocument({ withAgency: app.withAgency, store, imageReader: noImages }, actor, documentId);
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("creating the run's files", () => {
  it("refuses while the run is blocked", async () => {
    const [entry] = await inAgency((tx) => tx.select().from(timeEntries).where(eq(timeEntries.workerId, workerId("anita-patel"))).limit(1));
    const before = entry!.status;
    await inAgency((tx) => tx.update(timeEntries).set({ status: "needs_review" }).where(eq(timeEntries.payPeriodId, period)));
    await inAgency((tx) => computeRun(tx, actor, period));
    await expect(inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY }))).rejects.toBeInstanceOf(RunNotReadyError);
    await inAgency((tx) => tx.update(timeEntries).set({ status: "extracted" }).where(eq(timeEntries.payPeriodId, period)));
    expect(before).toBeDefined();
  });

  it("writes the Gusto hours file, stores its fingerprint and control totals, and they match the run", async () => {
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.status).toBe("ready");
    const files = await inAgency((tx) => createRunFiles(tx, actor, store, period, { today: TODAY }));

    const bytes = await store.get(files.payroll.storageKey);
    const [row] = await inAgency((tx) => tx.select().from(exports).where(eq(exports.id, files.payroll.exportId)));
    expect(row!.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(row!.format).toBe("gusto_hours_csv");

    const pay = await inAgency((tx) => tx.select().from(payLines).where(eq(payLines.payRunId, run.runId)));
    expect(row!.controlTotals.grossCents).toBe(pay.reduce((sum, l) => sum + l.amountCents, 0));
    expect(row!.controlTotals.workers).toBe(new Set(pay.map((l) => l.workerId)).size);
    const parsed = parseGustoHoursCsv(new TextDecoder().decode(bytes));
    expect(parsed.workers).toBe(row!.controlTotals.workers);
  });

  it("writes one invoice per client billed, whose total is the client's bill lines, as a PDF", async () => {
    const [inv] = await inAgency((tx) => tx.select().from(invoices));
    expect(inv).toBeDefined();
    expect(inv!.clientId).toBe(clientId("il"));
    const bill = await inAgency((tx) => tx.select().from(billLines).where(eq(billLines.payRunId, inv!.payRunId)));
    expect(inv!.totalCents).toBe(bill.filter((l) => l.clientId === inv!.clientId).reduce((sum, l) => sum + l.amountCents, 0));
    expect(inv!.issuedOn).toBe(TODAY);
    expect(inv!.dueOn).toBe("2026-11-14"); // net 30

    const text = await pdfText(await store.get(inv!.pdfStorageKey!));
    expect(text).toContain("Invoice");
    expect(text).toContain(inv!.number);
    expect(text).toContain("PO-48213");
    expect(text).toContain("Jerome Washington");
    expect(text).toMatch(/\$[\d,]+\.\d{2} due November 14, 2026/);
  });

  it("locks the run once its files exist; computing again starts a new version", async () => {
    const [run] = await inAgency((tx) => tx.select().from(payRuns).where(eq(payRuns.payPeriodId, period)));
    expect(run!.status).toBe("exported");
    const next = await inAgency((tx) => computeRun(tx, actor, period));
    expect(next.version).toBe(2);
    const events = await inAgency((tx) => tx.select().from(auditEvents).where(eq(auditEvents.action, "export")));
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});
