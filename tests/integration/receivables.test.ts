/**
 * Receivables and cash application (slice h; plan `.claude/plans/slice-h-receivables.md`, decisions
 * H1–H9): payments applied to invoices, credit, voids, write-offs, short pays, reminders, the bank
 * file and its suggested matches, aging and days to pay.
 *
 * The week: Prairie Line (PLM) billed Marcus 30 h × $26.50 = $795.00, Anita 16 h × $26.50 = $424.00
 * and Trevor 8 h × $25.75 = $206.00 — invoice PLM-20261005 for $1,425.00, issued 2026-10-13, due
 * 2026-11-12 (30 days).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles } from "../../src/server/files/service";
import { invoiceBalances } from "../../src/server/receivables/balances";
import { bankRows, guessMapping } from "../../src/server/receivables/bank-csv";
import { bankView, clientReceivables, invoiceReceivables, paymentsList, receivablesView } from "../../src/server/receivables/queries";
import { applyCredit, excludeLine, importBankFile, includeLine, recordPayment, recordReminder, setShortPay, undoLine, voidPayment, writeOff } from "../../src/server/receivables/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-receivables-")));
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test owner", role: "owner" };
const billing: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000004", label: "Test billing", role: "billing" };
const coordinator: Actor = { ...theOwner, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const w2 = periodId("w2");
const PLM = clientId("il");
const HEH = clientId("ma");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);

async function addShift(worker: string, date: string, inMinute: number, outMinute: number) {
  await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed" });
}

let invoice: typeof s.invoices.$inferSelect;

async function invoicedWeek() {
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  await owner.db.update(s.clientBillingProfiles).set({ backupDetail: false, backupImages: false }).where(eq(s.clientBillingProfiles.clientId, PLM));
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await addShift("marcus-bell", d, 420, 1020);
  for (const d of ["2026-10-05", "2026-10-06"]) await addShift("anita-patel", d, 420, 900);
  await addShift("trevor-lindqvist", "2026-10-05", 420, 900);
  await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
  await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
  invoice = (await inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.clientId, PLM))))[0]!;
}

const pay = (amountCents: number, applications: { invoiceId: string; amountCents: number }[], over: Record<string, unknown> = {}, who: Actor = theOwner) =>
  inAgency((tx) => recordPayment(tx, who, { clientId: PLM, receivedOn: "2026-10-14", amountCents, method: "check", reference: "1042", memo: null, applications, ...over }));
const balanceOf = async (id = invoice.id) => (await inAgency((tx) => invoiceBalances(tx, { invoiceIds: [id] })))[0]!;

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("payments applied to invoices (H2, H3)", () => {
  beforeEach(invoicedWeek);

  it("a partial payment leaves a balance and a short pay; a second pays it off, its extra left as credit", async () => {
    expect(invoice).toMatchObject({ number: "PLM-20261005", totalCents: 142_500, status: "issued", dueOn: "2026-11-12" });
    expect(await pay(100_000, [{ invoiceId: invoice.id, amountCents: 100_000 }])).toMatchObject({ ok: true });
    expect(await balanceOf()).toMatchObject({ paidCents: 100_000, balanceCents: 42_500, shortPaid: true, paidOffOn: null });
    // $500.00 received: $425.00 pays it off, $75.00 is the client's credit.
    expect(await pay(50_000, [{ invoiceId: invoice.id, amountCents: 42_500 }], { receivedOn: "2026-10-15", reference: "1057" })).toMatchObject({ ok: true });
    expect(await balanceOf()).toMatchObject({ balanceCents: 0, shortPaid: false, paidOffOn: "2026-10-15" });
    const [row] = await inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, invoice.id)));
    expect(row!.status).toBe("paid");
    const list = await inAgency((tx) => paymentsList(tx));
    expect(list.map((p) => [p.amountCents, p.appliedCents, p.unusedCents, p.status])).toEqual([
      [50_000, 42_500, 7500, "credit"],
      [100_000, 100_000, 0, "applied"],
    ]);
    expect(await inAgency((tx) => clientReceivables(tx, PLM, "2026-10-16"))).toMatchObject({ owedCents: -7500, overdueCents: 0, notDueCents: 0, creditCents: 7500 });
  });

  it("refuses what cannot be: more than owed, more than received, another client's invoice, a future date, a role that cannot", async () => {
    const problems = async (r: Promise<unknown>) => ((await r) as { problems?: { rule: string }[] }).problems?.map((p) => p.rule);
    expect(await problems(pay(200_000, [{ invoiceId: invoice.id, amountCents: 150_000 }]))).toEqual(["more_than_owed"]);
    expect(await problems(pay(10_000, [{ invoiceId: invoice.id, amountCents: 20_000 }]))).toEqual(["more_than_received"]);
    expect(await problems(pay(10_000, [{ invoiceId: invoice.id, amountCents: 10_000 }], { clientId: HEH }))).toEqual(["not_this_clients"]);
    expect(await problems(pay(10_000, [], { receivedOn: "2099-01-01" }))).toEqual(["future"]);
    expect(await problems(pay(0, []))).toEqual(["amount"]);
    expect(await pay(10_000, [], {}, coordinator)).toEqual({ ok: false, error: "not_allowed" });
    expect(await pay(10_000, [{ invoiceId: invoice.id, amountCents: 10_000 }], {}, billing)).toMatchObject({ ok: true });
  });

  it("credit is applied later; a voided payment opens its invoices again and cannot be voided twice", async () => {
    const r = (await pay(100_000, [])) as { ok: true; paymentId: string };
    expect(await balanceOf()).toMatchObject({ balanceCents: 142_500 });
    expect(await inAgency((tx) => applyCredit(tx, theOwner, r.paymentId, [{ invoiceId: invoice.id, amountCents: 100_000 }]))).toEqual({ ok: true });
    expect(await inAgency((tx) => applyCredit(tx, theOwner, r.paymentId, [{ invoiceId: invoice.id, amountCents: 1 }]))).toMatchObject({ ok: false, problems: [{ rule: "more_than_received" }] });
    expect(await balanceOf()).toMatchObject({ balanceCents: 42_500 });
    expect(await inAgency((tx) => voidPayment(tx, theOwner, r.paymentId, ""))).toMatchObject({ ok: false, error: "invalid" });
    expect(await inAgency((tx) => voidPayment(tx, theOwner, r.paymentId, "Check returned"))).toEqual({ ok: true });
    expect(await balanceOf()).toMatchObject({ paidCents: 0, balanceCents: 142_500 });
    expect(await inAgency((tx) => voidPayment(tx, theOwner, r.paymentId, "again"))).toEqual({ ok: false, error: "voided" });
    const [event] = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "payment"), eq(s.auditEvents.entityId, r.paymentId), eq(s.auditEvents.reason, "Check returned"))));
    expect(event).toMatchObject({ actorLabel: "Test owner", after: { voided: true } });
  });

  it("a credit note lowers what the invoice it names asks for; covering all of it marks the invoice paid", async () => {
    await owner.db.insert(s.invoices).values({ agencyId: theOwner.agencyId, clientId: PLM, payRunId: invoice.payRunId, number: "PLM-20261005-CN-01", issuedOn: "2026-10-20", dueOn: "2026-10-20", status: "issued", subtotalCents: -5300, totalCents: -5300, kind: "credit_note", originalInvoiceId: invoice.id, splitKey: "cn" });
    expect(await balanceOf()).toMatchObject({ creditedCents: 5300, balanceCents: 137_200 });
    await pay(137_200, [{ invoiceId: invoice.id, amountCents: 137_200 }]);
    expect(await balanceOf()).toMatchObject({ balanceCents: 0, paidOffOn: "2026-10-14" });
  });
});

describe("short pays and write-offs (H4)", () => {
  beforeEach(invoicedWeek);

  it("records why it was short, lets go of the rest with a reason, and the invoice is paid; days to pay leaves it out", async () => {
    await pay(140_000, [{ invoiceId: invoice.id, amountCents: 140_000 }]);
    expect(await inAgency((tx) => setShortPay(tx, theOwner, invoice.id, "bank_fee", "Wire fee"))).toEqual({ ok: true });
    expect(await inAgency((tx) => setShortPay(tx, theOwner, invoice.id, "client_deduction", null))).toEqual({ ok: true });
    const view = await inAgency((tx) => receivablesView(tx, "2026-10-16"));
    expect(view.shortPaid).toEqual([expect.objectContaining({ number: "PLM-20261005", paidCents: 140_000, balanceCents: 2500, reason: "client_deduction" })]);
    expect(await inAgency((tx) => writeOff(tx, theOwner, invoice.id, { amountCents: 2501, reason: "small_balance" }))).toMatchObject({ ok: false, problems: [{ rule: "more_than_owed" }] });
    expect(await inAgency((tx) => writeOff(tx, theOwner, invoice.id, { amountCents: 2500, reason: "nope" }))).toMatchObject({ ok: false, problems: [{ rule: "choose_reason" }] });
    expect(await inAgency((tx) => writeOff(tx, coordinator, invoice.id, { amountCents: 2500, reason: "small_balance" }))).toEqual({ ok: false, error: "not_allowed" });
    expect(await inAgency((tx) => writeOff(tx, theOwner, invoice.id, { amountCents: 2500, reason: "small_balance", note: "Not worth chasing" }))).toEqual({ ok: true });
    expect(await balanceOf()).toMatchObject({ balanceCents: 0, writtenOffCents: 2500, paidOffOn: null, shortPaid: false });
    expect((await inAgency((tx) => receivablesView(tx, "2026-10-16"))).shortPaid).toEqual([]);
    expect((await inAgency((tx) => clientReceivables(tx, PLM, "2026-10-16"))).daysToPay.invoices).toBe(0);
  });

  it("a write-off is kept: a real agency cannot remove it, nor a payment", async () => {
    await pay(140_000, [{ invoiceId: invoice.id, amountCents: 140_000 }]);
    await inAgency((tx) => writeOff(tx, theOwner, invoice.id, { amountCents: 2500, reason: "small_balance" }));
    await owner.db.update(s.agencies).set({ isDemo: false }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    try {
      expect(await databaseError(inAgency((tx) => tx.delete(s.writeOffs)))).toMatch(/kept/);
      expect(await databaseError(inAgency((tx) => tx.delete(s.payments)))).toMatch(/kept|violates/);
    } finally {
      await owner.db.update(s.agencies).set({ isDemo: true }).where(eq(s.agencies.id, DEMO_AGENCY.id));
    }
  });
});

describe("aging and days to pay (H1, H7)", () => {
  beforeEach(invoicedWeek);

  it("ages what is open by days past due as of a date; payments after that date do not count yet", async () => {
    await pay(100_000, [{ invoiceId: invoice.id, amountCents: 100_000 }], { receivedOn: "2026-10-15" });
    // As of the day before the payment: all of it, not yet due.
    const before = await inAgency((tx) => receivablesView(tx, "2026-10-14"));
    expect(before.clients.map((c) => [c.clientName, c.buckets.current, c.totalCents])).toEqual([["Prairie Line Manufacturing (demo)", 142_500, 142_500]]);
    // As of 2026-12-20 (38 days past 2026-11-12): $425.00 in 31–60.
    const later = await inAgency((tx) => receivablesView(tx, "2026-12-20"));
    expect(later.clients[0]).toMatchObject({ buckets: { current: 0, d1_30: 0, d31_60: 42_500, d61_90: 0, d91_plus: 0 }, overdueCents: 42_500, totalCents: 42_500 });
    expect(later.clients[0]!.invoices.d31_60).toEqual([expect.objectContaining({ number: "PLM-20261005", daysLate: 38, balanceCents: 42_500 })]);
  });

  it("days to pay: from issue to the payment that paid it off, with its count", async () => {
    await pay(142_500, [{ invoiceId: invoice.id, amountCents: 142_500 }], { receivedOn: "2026-10-15" });
    // Issued 2026-10-13, paid 2026-10-15: 2 days, none late.
    expect((await inAgency((tx) => clientReceivables(tx, PLM, "2026-10-16"))).daysToPay).toMatchObject({ invoices: 1, averageDays: 2, averageDaysLate: 0 });
  });
});

describe("reminders (H8)", () => {
  beforeEach(invoicedWeek);

  it("drafts the stage's message in English and Spanish with the balance, and records that one was prepared", async () => {
    await pay(100_000, [{ invoiceId: invoice.id, amountCents: 100_000 }]);
    const r = await inAgency((tx) => invoiceReceivables(tx, invoice.id, "2026-11-20"));
    expect(r!.reminder).toMatchObject({ stage: "overdue", daysLate: 8, to: "payables@prairieline.example.com" });
    expect(r!.reminder.drafts.en.overdue.subject).toBe("Reminder: invoice PLM-20261005 is 8 days past due");
    expect(r!.reminder.drafts.en.overdue.body).toContain("Our records show $425.00 still open on invoice PLM-20261005, which was due on November 12, 2026 (8 days ago).");
    expect(r!.reminder.drafts.es.overdue.subject).toBe("Recordatorio: la factura PLM-20261005 lleva 8 días vencida");
    expect((await inAgency((tx) => invoiceReceivables(tx, invoice.id, "2026-12-20")))!.reminder.stage).toBe("final");
    expect((await inAgency((tx) => invoiceReceivables(tx, invoice.id, "2026-11-01")))!.reminder.stage).toBe("before_due");
    expect(await inAgency((tx) => recordReminder(tx, theOwner, invoice.id, "overdue", "en", "copied"))).toEqual({ ok: true });
    expect((await inAgency((tx) => invoiceReceivables(tx, invoice.id, "2026-11-20")))!.reminders).toEqual([expect.objectContaining({ stage: "overdue", locale: "en", how: "copied", by: "Test owner" })]);
  });
});

describe("the bank file and its suggested matches (H5, H6)", () => {
  beforeEach(invoicedWeek);

  const FILE = [
    "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #",
    "CREDIT,10/14/2026,ACH DEPOSIT PRAIRIE LINE INV PLM-20261005,1425.00,ACH_CREDIT,9000.00,",
    "CREDIT,10/15/2026,TRANSFER FROM SAVINGS,2500.00,ACCT_XFER,11500.00,",
    "DEBIT,10/15/2026,OFFICE RENT,-1200.00,ACH_DEBIT,10300.00,",
  ].join("\n");
  const mapping = () => guessMapping(bankRows(FILE))!;
  const importFile = (rows = [2, 3, 4]) => inAgency((tx) => importBankFile(tx, theOwner, { filename: "chase.csv", text: FILE }, mapping(), rows));

  it("imports the chosen lines once; a withdrawal is kept excluded; a deposit naming its invoice is suggested with High confidence and why", async () => {
    expect(await importFile()).toMatchObject({ ok: true, imported: 3, skipped: 0 });
    expect(await importFile()).toMatchObject({ ok: true, imported: 0, skipped: 3 });
    const view = await inAgency((tx) => bankView(tx, "2026-10-16"));
    expect(view.review.map((l) => [l.description, l.amountCents, l.suggestion?.confidence ?? null])).toEqual([
      ["TRANSFER FROM SAVINGS", 250_000, null],
      ["ACH DEPOSIT PRAIRIE LINE INV PLM-20261005", 142_500, "high"],
    ]);
    expect(view.review[1]!.suggestion).toMatchObject({ clientName: "Prairie Line Manufacturing (demo)", applications: [{ number: "PLM-20261005", amountCents: 142_500 }], explain: "invoice number PLM-20261005 on the deposit; $1,425.00 equals what it owes." });
    expect(view.excluded).toEqual([expect.objectContaining({ description: "OFFICE RENT", reason: "withdrawal" })]);
  });

  it("posting the suggestion records the payment from the line; Undo voids it and the line is back for review; exclude and include", async () => {
    await importFile();
    const view = await inAgency((tx) => bankView(tx, "2026-10-16"));
    const line = view.review.find((l) => l.suggestion)!;
    const post = (amountCents: number) => inAgency((tx) => recordPayment(tx, theOwner, { clientId: PLM, receivedOn: line.postedOn, amountCents, method: "bank_deposit", reference: line.description, memo: null, applications: line.suggestion!.applications.map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amountCents })) }, { bankLineId: line.id }));
    expect(await post(100)).toMatchObject({ ok: false, problems: [{ rule: "not_the_deposit" }] });
    expect(await post(142_500)).toMatchObject({ ok: true });
    expect(await post(142_500)).toEqual({ ok: false, error: "line_not_open" });
    expect(await balanceOf()).toMatchObject({ balanceCents: 0 });
    const after = await inAgency((tx) => bankView(tx, "2026-10-16"));
    expect(after.posted).toEqual([expect.objectContaining({ id: line.id, payment: expect.objectContaining({ clientName: "Prairie Line Manufacturing (demo)", invoices: [{ number: "PLM-20261005", amountCents: 142_500 }], creditCents: 0 }) })]);
    expect(await inAgency((tx) => undoLine(tx, theOwner, line.id))).toEqual({ ok: true });
    expect(await balanceOf()).toMatchObject({ balanceCents: 142_500 });
    expect((await inAgency((tx) => bankView(tx, "2026-10-16"))).review.map((l) => l.id)).toContain(line.id);
    const savings = after.review.find((l) => !l.suggestion)!;
    expect(await inAgency((tx) => excludeLine(tx, theOwner, savings.id, "transfer"))).toEqual({ ok: true });
    expect((await inAgency((tx) => bankView(tx, "2026-10-16"))).excluded.map((l) => [l.description, l.reason])).toEqual([
      ["TRANSFER FROM SAVINGS", "transfer"],
      ["OFFICE RENT", "withdrawal"],
    ]);
    expect(await inAgency((tx) => includeLine(tx, theOwner, savings.id))).toEqual({ ok: true });
    const withdrawal = (await inAgency((tx) => tx.select().from(s.bankLines).where(eq(s.bankLines.description, "OFFICE RENT"))))[0]!;
    expect(await inAgency((tx) => includeLine(tx, theOwner, withdrawal.id))).toEqual({ ok: false, error: "line_not_open" });
  });

  it("refuses a file whose chosen lines cannot be read, and an empty choice", async () => {
    const bad = FILE + "\nCREDIT,10/16/2026,ODD,12.345,ACH_CREDIT,1,";
    const m = guessMapping(bankRows(bad))!;
    expect(await inAgency((tx) => importBankFile(tx, theOwner, { filename: "x.csv", text: bad }, m, [2, 5]))).toEqual({ ok: false, error: "file", reason: "unreadable", rows: [5] });
    expect(await importFile([])).toEqual({ ok: false, error: "file", reason: "empty" });
    expect(await inAgency((tx) => importBankFile(tx, coordinator, { filename: "chase.csv", text: FILE }, mapping(), [2]))).toEqual({ ok: false, error: "not_allowed" });
  });
});

describe("payment applications stay within one client (database check)", () => {
  beforeEach(invoicedWeek);

  it("a payment cannot be applied to another client's invoice even by a direct write", async () => {
    const r = (await inAgency((tx) => recordPayment(tx, theOwner, { clientId: HEH, receivedOn: "2026-10-14", amountCents: 100, method: "check", reference: null, memo: null, applications: [] }))) as { ok: true; paymentId: string };
    expect(await databaseError(inAgency((tx) => tx.insert(s.paymentMatches).values({ agencyId: theOwner.agencyId, paymentId: r.paymentId, invoiceId: invoice.id, amountCents: 100, createdByLabel: "t" })))).toMatch(/own client/);
    const all = await inAgency((tx) => tx.select().from(s.payments).orderBy(asc(s.payments.createdAt)));
    expect(all).toHaveLength(1);
  });
});
