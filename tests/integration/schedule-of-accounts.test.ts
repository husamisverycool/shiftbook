/**
 * A factor's schedule of accounts (decision 0040), against the database: the demo week's invoices are
 * made, then scheduled; the zip holds the CSV, the PDF to sign and each invoice's PDF as issued, the
 * CSV's rows equal the invoices to the cent, each invoice's activity names the schedule, a paid
 * invoice is refused, and another agency cannot reach these invoices.
 */
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { pdfText } from "../../src/server/files/pdf-text";
import { createRunFiles } from "../../src/server/files/service";
import { issueCreditNote } from "../../src/server/collections/service";
import { scheduleOfAccounts } from "../../src/server/invoices/schedule";
import { recordPayment } from "../../src/server/receivables/service";
import { agencyToday } from "../../src/server/settings";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-schedule-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const w2 = periodId("w2");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);

let issued: (typeof s.invoices.$inferSelect)[] = [];
let today = "";
let scheduled = "";

beforeAll(async () => {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  for (const [worker, date] of [
    ["marcus-bell", "2026-10-05"],
    ["anita-patel", "2026-10-06"],
  ] as const) {
    await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute: 420, outMinute: 900, breakMinutes: 0, minutes: 480, confidence: "high", status: "reviewed" });
  }
  await inAgency((tx) => computeRun(tx, theOwner, w2));
  await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
  await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
  issued = await inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.status, "issued")));
});

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("schedule of accounts", () => {
  it("states what is still owed: a partly paid, partly credited invoice goes on at its balance, beside its total (review finding 1)", async () => {
    expect(issued.length).toBeGreaterThan(0);
    const first = issued[0]!;
    // By hand: $100.00 paid and a $50.00 credit note leave total − $150.00 owed.
    await inAgency(async (tx) => {
      const paid = await recordPayment(tx, theOwner, { clientId: first.clientId, receivedOn: first.issuedOn, amountCents: 10_000, method: "check", reference: "1001", memo: null, applications: [{ invoiceId: first.id, amountCents: 10_000 }] });
      if (!paid.ok) throw new Error(JSON.stringify(paid));
      const credit = await issueCreditNote(tx, store, theOwner, first.id, { reason: s.CREDIT_NOTE_REASONS[0], amountCents: 5_000, memo: null });
      if (!credit.ok) throw new Error(JSON.stringify(credit));
    });
    today = await inAgency((tx) => agencyToday(tx));
    const r = await inAgency((tx) => scheduleOfAccounts(tx, theOwner, store, issued.map((i) => i.id), today));
    if (!r.ok) throw new Error(JSON.stringify(r));
    scheduled = r.number;
    const files = unzipSync(r.bytes);
    const names = Object.keys(files).sort();
    expect(names).toEqual([...issued.map((i) => `invoices/invoice-${i.number}-${i.id.slice(0, 8)}.pdf`), `schedule-of-accounts-${r.number}.csv`, `schedule-of-accounts-${r.number}.pdf`].sort());
    const owed = issued.reduce((sum, i) => sum + i.totalCents, 0) - 15_000;
    expect(r).toMatchObject({ count: issued.length, totalCents: owed });
    const csv = new TextDecoder().decode(files[`schedule-of-accounts-${r.number}.csv`]!);
    const row = csv.split("\r\n").find((l) => l.includes(`,${first.number},`))!;
    const cents = (n: number) => (n / 100).toFixed(2);
    expect(row).toContain(`,${cents(first.totalCents)},${cents(first.totalCents - 15_000)},`);
    expect(csv.trim().split("\r\n").at(-1)).toContain(`${issued.length} invoices`);
    expect(csv.trim().split("\r\n").at(-1)).toContain(`,${cents(owed)},`);
    // Each invoice's PDF is the stored one, byte for byte.
    for (const i of issued) expect(files[`invoices/invoice-${i.number}-${i.id.slice(0, 8)}.pdf`]).toEqual(await store.get(i.pdfStorageKey!));
    const pdf = await pdfText(files[`schedule-of-accounts-${r.number}.pdf`]!);
    expect(pdf).toContain("Schedule of accounts");
    expect(pdf).toContain("Amount owed");
    expect(pdf).toContain("certifies that each invoice listed above");
    // The activity log names the schedule on each invoice, with the CSV's fingerprint.
    const sha = createHash("sha256").update(files[`schedule-of-accounts-${r.number}.csv`]!).digest("hex");
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.action, "export")));
    for (const i of issued) expect(events.some((e) => e.entityId === i.id && (e.after as { scheduleOfAccounts?: string; sha256?: string } | null)?.scheduleOfAccounts === r.number && (e.after as { sha256?: string }).sha256 === sha)).toBe(true);
  });

  it("assigns a receivable once: the same schedule can be made again, another one with the same invoice is refused", async () => {
    const again = await inAgency((tx) => scheduleOfAccounts(tx, theOwner, store, issued.map((i) => i.id), today));
    expect(again).toMatchObject({ ok: true, number: scheduled });
    const later = await inAgency((tx) => scheduleOfAccounts(tx, theOwner, store, [issued[0]!.id], "2099-01-01"));
    expect(later).toMatchObject({ ok: false, error: "refused" });
    if (!later.ok) expect(later.message).toContain(`already on schedule ${scheduled}`);
  });

  it("refuses a paid invoice, and another agency cannot reach these invoices", async () => {
    const first = issued[0]!;
    await owner.db.update(s.invoices).set({ status: "paid" }).where(eq(s.invoices.id, first.id));
    const refused = await inAgency((tx) => scheduleOfAccounts(tx, theOwner, store, [first.id], "2026-10-17"));
    expect(refused).toMatchObject({ ok: false, error: "refused" });
    await owner.db.update(s.invoices).set({ status: "issued" }).where(eq(s.invoices.id, first.id));
    const other: Actor = { ...theOwner, agencyId: "00000000-0000-4000-a000-0000000000ff" };
    const blind = await app.withAgency(other.agencyId, (tx) => scheduleOfAccounts(tx, other, store, [first.id], "2026-10-17"));
    expect(blind).toEqual({ ok: false, error: "not_found" });
  });
});
