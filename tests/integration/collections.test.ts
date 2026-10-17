/**
 * Slice r (SPEC §27 item 3; plan `.claude/plans/slice-r-notifications.md`): credit notes issued by
 * hand, invoices emailed with their PDF, promises to pay, scheduled collection reminders, and
 * notifications (the sweep, the inbox, email per kind) — and that no agency sees another's.
 *
 * The week (as receivables.test.ts): Prairie Line (PLM) invoice PLM-20261005 for $1,425.00
 * (Marcus 30 h × $26.50 = $795.00, Anita 16 h × $26.50 = $424.00, Trevor 8 h × $25.75 = $206.00),
 * issued 2026-10-13, due 2026-11-12.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setBillingSettings } from "../../src/server/catalog/billing";
import { issueCreditNote, recordPromise, saveSchedule, sendInvoice, setClientReminders, sweepReminders, type CollectionsDeps } from "../../src/server/collections/service";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY, DEMO_OWNER, demoUuid, RECRUITERS } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { createRunFiles } from "../../src/server/files/service";
import type { MailTransport, OutgoingMail } from "../../src/server/mail/transport";
import { deleteRead, emailNotices, inboxOf, markAllRead, markRead, setEmailSetting, syncNotifications, unreadCount } from "../../src/server/notifications/service";
import { invoiceBalances } from "../../src/server/receivables/balances";
import { recordPayment, writeOff } from "../../src/server/receivables/service";
import type { Actor } from "../../src/server/session";
import { LocalDocumentStore } from "../../src/server/storage";
import { approveAsOwner, databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-collections-")));
// The demo agency's own people (notices and settings belong to real rows).
const theOwner: Actor = { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "Test owner", role: "owner" };
const coordinator: Actor = { ...theOwner, userId: demoUuid(`user:${RECRUITERS[0].key}`), label: "Test coordinator", role: "coordinator" };
const billing: Actor = { ...theOwner, userId: demoUuid("user:billing"), label: "Test billing", role: "billing" };
const w2 = periodId("w2");
const PLM = clientId("il");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(theOwner.agencyId, fn);

/** Every email sent, as the transport received it. */
const outbox: OutgoingMail[] = [];
const transport: MailTransport = { send: async (mail) => (outbox.push(mail), { providerId: `p-${outbox.length}` }) };
const deps = (now: string): CollectionsDeps => ({ withAgency: app.withAgency, store, mailTransport: () => transport, now: () => new Date(`${now}T15:00:00Z`) });

async function addShift(worker: string, date: string, inMinute: number, outMinute: number) {
  await owner.db.insert(s.timeEntries).values({ agencyId: theOwner.agencyId, payPeriodId: w2, workerNameRaw: worker, workerId: workerId(worker), assignmentId: assignmentId(worker), workDate: date, inMinute, outMinute, breakMinutes: 0, minutes: outMinute - inMinute, confidence: "high", status: "reviewed" });
}

let invoice: typeof s.invoices.$inferSelect;

async function invoicedWeek() {
  outbox.length = 0;
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  // The demo's own notices and promises are not this test's.
  await owner.db.delete(s.notifications).where(eq(s.notifications.agencyId, DEMO_AGENCY.id));
  await owner.db.update(s.clientBillingProfiles).set({ backupDetail: false, backupImages: false }).where(eq(s.clientBillingProfiles.clientId, PLM));
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await addShift("marcus-bell", d, 420, 1020);
  for (const d of ["2026-10-05", "2026-10-06"]) await addShift("anita-patel", d, 420, 900);
  await addShift("trevor-lindqvist", "2026-10-05", 420, 900);
  await inAgency((tx) => approveAsOwner(tx, theOwner, w2));
  await inAgency((tx) => createRunFiles(tx, theOwner, store, w2, { today: "2026-10-13" }));
  invoice = (await inAgency((tx) => tx.select().from(s.invoices).where(and(eq(s.invoices.clientId, PLM), eq(s.invoices.kind, "invoice")))))[0]!;
}

const balanceOf = async (id = invoice.id) => (await inAgency((tx) => invoiceBalances(tx, { invoiceIds: [id] })))[0]!;
const credit = (amountCents: number, who: Actor = theOwner, reason = "discount", memo: string | null = "Agreed 10/16") => inAgency((tx) => issueCreditNote(tx, store, who, invoice.id, { reason, amountCents, memo }));

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("credit notes issued by hand (Stripe credit notes)", () => {
  beforeEach(invoicedWeek);

  it("lowers what the invoice asks for, numbered in its series, with a PDF; never more than the invoice's total", async () => {
    expect(invoice).toMatchObject({ number: "PLM-20261005", totalCents: 142_500 });
    expect(await credit(42_500)).toMatchObject({ ok: true, number: "PLM-20261005-CN-01" });
    expect(await balanceOf()).toMatchObject({ creditedCents: 42_500, balanceCents: 100_000 });
    const [note] = await inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.number, "PLM-20261005-CN-01")));
    expect(note).toMatchObject({ kind: "credit_note", totalCents: -42_500, originalInvoiceId: invoice.id, creditReason: "discount", memo: "Agreed 10/16", status: "issued" });
    const pdf = await store.get(note!.pdfStorageKey!);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    // $1,000.00 left to credit: $1,000.01 is refused, $1,000.00 credits the rest and the invoice is paid.
    expect(await credit(100_001)).toEqual({ ok: false, error: "amount", roomCents: 100_000 });
    expect(await credit(100_000)).toMatchObject({ ok: true, number: "PLM-20261005-CN-02" });
    expect(await balanceOf()).toMatchObject({ balanceCents: 0 });
    expect((await inAgency((tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, invoice.id))))[0]!.status).toBe("paid");
    expect(await credit(1)).toEqual({ ok: false, error: "amount", roomCents: 0 });
  });

  it("on a paid invoice the credit is the client's (a negative balance), as Stripe credits the balance", async () => {
    expect(await inAgency((tx) => recordPayment(tx, theOwner, { clientId: PLM, receivedOn: "2026-10-14", amountCents: 142_500, method: "check", reference: "1042", memo: null, applications: [{ invoiceId: invoice.id, amountCents: 142_500 }] }))).toMatchObject({ ok: true });
    expect(await credit(10_000)).toMatchObject({ ok: true });
    expect(await balanceOf()).toMatchObject({ paidCents: 142_500, creditedCents: 10_000, balanceCents: -10_000 });
  });

  it("never credits what was written off: the client's credit is at most what it actually paid", async () => {
    expect(await inAgency((tx) => recordPayment(tx, theOwner, { clientId: PLM, receivedOn: "2026-10-14", amountCents: 130_000, method: "check", reference: "1043", memo: null, applications: [{ invoiceId: invoice.id, amountCents: 130_000 }] }))).toMatchObject({ ok: true });
    expect(await inAgency((tx) => writeOff(tx, theOwner, invoice.id, { amountCents: 12_500, reason: "small_balance", note: null }))).toEqual({ ok: true });
    expect(await balanceOf()).toMatchObject({ balanceCents: 0 });
    // $1,425.00 less the $125.00 written off: $1,300.00 is all that can be credited.
    expect(await credit(142_500)).toEqual({ ok: false, error: "amount", roomCents: 130_000 });
    expect(await credit(130_000)).toMatchObject({ ok: true });
    expect(await balanceOf()).toMatchObject({ balanceCents: -130_000 });
  });

  it("refuses a role that cannot, a reason not on the list, a memo too long, a credit note credited", async () => {
    expect(await credit(1000, coordinator)).toEqual({ ok: false, error: "forbidden" });
    expect(await credit(1000, theOwner, "fraud")).toEqual({ ok: false, error: "reason" });
    expect(await credit(1000, theOwner, "other", "x".repeat(501))).toEqual({ ok: false, error: "memo" });
    expect(await credit(0)).toMatchObject({ ok: false, error: "amount" });
    expect(await credit(10.5)).toMatchObject({ ok: false, error: "amount" });
    const made = await credit(1000, billing);
    expect(made.ok).toBe(true);
    const id = made.ok ? made.creditNoteId : "";
    expect(await inAgency((tx) => issueCreditNote(tx, store, theOwner, id, { reason: "other", amountCents: 1, memo: null }))).toEqual({ ok: false, error: "not_invoice" });
  });
});

describe("sending an invoice (Stripe: the email carries the PDF)", () => {
  beforeEach(invoicedWeek);

  it("emails the client's billing contact with the PDF attached, and records it", async () => {
    const r = await sendInvoice(deps("2026-10-14"), theOwner, invoice.id, "Thanks for the week.");
    expect(r).toEqual({ ok: true, to: expect.stringContaining("@") });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.subject).toBe("Invoice PLM-20261005 from Cedar Row Staffing (demo)");
    expect(outbox[0]!.text).toContain("$1,425.00");
    expect(outbox[0]!.text).toContain("Thanks for the week.");
    expect(outbox[0]!.attachments!.map((a) => a.filename)).toEqual(["invoice-PLM-20261005.pdf"]);
    expect(Buffer.from(outbox[0]!.attachments![0]!.content.subarray(0, 5)).toString()).toBe("%PDF-");
    const [mail] = await inAgency((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.invoiceId, invoice.id)));
    expect(mail).toMatchObject({ kind: "invoice", status: "sent", providerId: "p-1" });
  });

  it("refuses a client with no billing email, and a role that cannot", async () => {
    expect(await sendInvoice(deps("2026-10-14"), coordinator, invoice.id, null)).toEqual({ ok: false, error: "forbidden" });
    await owner.db.update(s.clients).set({ billingEmail: null }).where(eq(s.clients.id, PLM));
    expect(await sendInvoice(deps("2026-10-14"), theOwner, invoice.id, null)).toEqual({ ok: false, error: "no_email" });
    expect(outbox).toHaveLength(0);
  });
});

describe("scheduled collection reminders (Stripe: before, when or after the due date)", () => {
  beforeEach(invoicedWeek);

  it("off by default; once on, each stage goes once on its day with the PDF; a client can be left out", async () => {
    // The demo agency switches reminders on; this test starts from an agency that never did.
    await owner.db.delete(s.agencySettings).where(and(eq(s.agencySettings.agencyId, DEMO_AGENCY.id), eq(s.agencySettings.key, "collection_reminders")));
    expect(await sweepReminders(deps("2026-11-19"), theOwner.agencyId)).toEqual({ sent: 0, failed: 0 });
    expect(await inAgency((tx) => saveSchedule(tx, coordinator, { enabled: true, beforeDueDays: 3, overdueDays: 7, finalDays: 30 }))).toEqual({ ok: false, error: "forbidden" });
    expect(await inAgency((tx) => saveSchedule(tx, theOwner, { enabled: true, beforeDueDays: 3, overdueDays: 5, finalDays: 30 }))).toEqual({ ok: false, error: "invalid" });
    expect(await inAgency((tx) => saveSchedule(tx, theOwner, { enabled: true, beforeDueDays: 3, overdueDays: 7, finalDays: 30 }))).toEqual({ ok: true });
    // Due 2026-11-12: before-due on 11-09, overdue on 11-19.
    expect(await sweepReminders(deps("2026-11-08"), theOwner.agencyId)).toEqual({ sent: 0, failed: 0 });
    expect(await sweepReminders(deps("2026-11-09"), theOwner.agencyId)).toEqual({ sent: 1, failed: 0 });
    expect(await sweepReminders(deps("2026-11-10"), theOwner.agencyId)).toEqual({ sent: 0, failed: 0 });
    expect(await sweepReminders(deps("2026-11-19"), theOwner.agencyId)).toEqual({ sent: 1, failed: 0 });
    expect(await sweepReminders(deps("2026-11-19"), theOwner.agencyId)).toEqual({ sent: 0, failed: 0 });
    expect(outbox.map((m) => m.attachments!.map((a) => a.filename))).toEqual([["invoice-PLM-20261005.pdf"], ["invoice-PLM-20261005.pdf"]]);
    const rows = await inAgency((tx) => tx.select().from(s.reminders).where(eq(s.reminders.invoiceId, invoice.id)));
    expect(rows.map((r) => [r.stage, r.how])).toEqual([
      ["before_due", "emailed"],
      ["overdue", "emailed"],
    ]);
    // A second row for the same stage is refused by the database itself.
    expect(await databaseError(inAgency((tx) => tx.insert(s.reminders).values({ agencyId: theOwner.agencyId, invoiceId: invoice.id, stage: "overdue", locale: "en", how: "emailed", createdByLabel: "x" })))).toMatch(/reminders_emailed_once/);
    expect(await inAgency((tx) => setClientReminders(tx, theOwner, PLM, false))).toEqual({ ok: true });
    expect(await sweepReminders(deps("2026-12-12"), theOwner.agencyId)).toEqual({ sent: 0, failed: 0 });
  });
});

describe("a reminder whose email failed is tried again (money review A4)", () => {
  beforeEach(invoicedWeek);

  it("the next sweep resends the same stage's email; once sent, never again", async () => {
    expect(await inAgency((tx) => saveSchedule(tx, theOwner, { enabled: true, beforeDueDays: 3, overdueDays: 7, finalDays: 30 }))).toEqual({ ok: true });
    const broken: MailTransport = { send: async () => Promise.reject(new Error("provider down")) };
    expect(await sweepReminders({ ...deps("2026-11-09"), mailTransport: () => broken }, theOwner.agencyId)).toEqual({ sent: 0, failed: 1 });
    expect(await sweepReminders(deps("2026-11-10"), theOwner.agencyId)).toEqual({ sent: 1, failed: 0 });
    expect(await sweepReminders(deps("2026-11-10"), theOwner.agencyId)).toEqual({ sent: 0, failed: 0 });
    const rows = await inAgency((tx) => tx.select().from(s.reminders).where(eq(s.reminders.invoiceId, invoice.id)));
    expect(rows.map((r) => r.stage)).toEqual(["before_due"]);
    expect(outbox).toHaveLength(1);
  });
});

describe("a client left out of reminders stays out (money review A3)", () => {
  beforeEach(invoicedWeek);

  it("switching off reaches the versions set to start later, and a new version carries it", async () => {
    const versions = () => inAgency((tx) => tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, PLM)).orderBy(asc(s.clientBillingProfiles.effectiveFrom)));
    const [today] = await versions();
    expect(await inAgency((tx) => setBillingSettings(tx, theOwner, PLM, today, "2026-12-01"))).toMatchObject({ ok: true });
    expect(await inAgency((tx) => setClientReminders(tx, theOwner, PLM, false))).toEqual({ ok: true });
    expect((await versions()).map((v) => [v.effectiveFrom, v.remindersOff])).toEqual([
      [today!.effectiveFrom, true],
      ["2026-12-01", true],
    ]);
    const [, later] = await versions();
    expect(await inAgency((tx) => setBillingSettings(tx, theOwner, PLM, later, "2027-01-01"))).toMatchObject({ ok: true });
    expect((await versions()).map((v) => v.remindersOff)).toEqual([true, true, true]);
  });
});

describe("notifications (Linear's Inbox)", () => {
  beforeEach(invoicedWeek);

  it("an overdue invoice and a broken promise reach who collects, once however often the sweep runs", async () => {
    expect(await inAgency((tx) => recordPromise(tx, billing, invoice.id, { promisedOn: "2020-01-01", amountCents: null, note: null }))).toEqual({ ok: false, error: "date" });
    // A promise made earlier (written as it was then), for 2026-11-15.
    await owner.db.insert(s.promisesToPay).values({ agencyId: theOwner.agencyId, invoiceId: invoice.id, promisedOn: "2026-11-15", amountCents: 142_500, createdByLabel: "Test billing" });
    const made = await inAgency((tx) => syncNotifications(tx, theOwner.agencyId, new Date("2026-11-20T15:00:00Z")));
    const mine = (who: Actor) => made.filter((n) => n.userId === who.userId).map((n) => n.kind).sort();
    expect(mine(theOwner)).toEqual(expect.arrayContaining(["invoice_overdue", "promise_broken"]));
    expect(mine(billing)).toEqual(expect.arrayContaining(["invoice_overdue", "promise_broken"]));
    expect(mine(coordinator)).not.toContain("invoice_overdue");
    expect(await inAgency((tx) => syncNotifications(tx, theOwner.agencyId, new Date("2026-11-21T15:00:00Z")))).toEqual([]);

    const inbox = await inAgency((tx) => inboxOf(tx, billing.userId));
    const overdue = inbox.find((n) => n.kind === "invoice_overdue" && n.href === `/invoices/${invoice.id}`)!;
    expect(overdue.params).toMatchObject({ number: "PLM-20261005", balanceCents: 142_500 });
    const before = await inAgency((tx) => unreadCount(tx, billing.userId));
    await inAgency((tx) => markRead(tx, billing.userId, [overdue.id], true));
    expect(await inAgency((tx) => unreadCount(tx, billing.userId))).toBe(before - 1);
    // Another person's notice is never theirs to change.
    await inAgency((tx) => markRead(tx, theOwner.userId, [overdue.id], false));
    expect((await inAgency((tx) => inboxOf(tx, billing.userId))).find((n) => n.id === overdue.id)!.read).toBe(true);
    await inAgency((tx) => markAllRead(tx, billing.userId));
    expect(await inAgency((tx) => unreadCount(tx, billing.userId))).toBe(0);
    await inAgency((tx) => deleteRead(tx, billing.userId));
    expect(await inAgency((tx) => inboxOf(tx, billing.userId))).toEqual([]);
    // Deleted stays deleted: the next sweep does not bring the same events back.
    expect(await inAgency((tx) => syncNotifications(tx, theOwner.agencyId, new Date("2026-11-22T15:00:00Z")))).toEqual([]);
  });

  it("email goes to who keeps it on for that kind (on unless switched off)", async () => {
    expect(await inAgency((tx) => setEmailSetting(tx, theOwner.agencyId, billing.userId, "billing", "invoice_overdue", false))).toEqual({ ok: true });
    expect(await inAgency((tx) => setEmailSetting(tx, theOwner.agencyId, billing.userId, "billing", "run_blocked", false))).toEqual({ ok: false, error: "invalid" });
    const made = await inAgency((tx) => syncNotifications(tx, theOwner.agencyId, new Date("2026-11-20T15:00:00Z")));
    const overdue = made.filter((n) => n.kind === "invoice_overdue");
    await emailNotices({ mailTransport: () => transport, baseUrl: "https://granite.example" }, app.withAgency, theOwner.agencyId, overdue);
    const people = await owner.db.select({ id: s.users.id, email: s.users.email }).from(s.users).where(eq(s.users.agencyId, theOwner.agencyId));
    const emailed = outbox.map((m) => people.find((p) => p.email === m.to.email)?.id);
    expect(emailed).toContain(theOwner.userId);
    expect(emailed).not.toContain(billing.userId);
    expect(outbox.find((m) => m.subject === "Invoice overdue")!.text).toContain(`https://granite.example/en/invoices/${invoice.id}`);
  });
});

describe("tenant isolation of slice r's tables", () => {
  beforeEach(invoicedWeek);

  it("another agency sees none of this agency's notices, settings or promises", async () => {
    await inAgency((tx) => syncNotifications(tx, theOwner.agencyId, new Date("2026-11-20T15:00:00Z")));
    await inAgency((tx) => setEmailSetting(tx, theOwner.agencyId, theOwner.userId, "owner", "invoice_overdue", false));
    await owner.db.insert(s.promisesToPay).values({ agencyId: theOwner.agencyId, invoiceId: invoice.id, promisedOn: "2026-11-15", createdByLabel: "x" });
    const [other] = await owner.db.insert(s.agencies).values({ name: "Other agency (test r)" }).returning();
    await app.withAgency(other!.id, async (tx) => {
      expect(await tx.select().from(s.notifications)).toEqual([]);
      expect(await tx.select().from(s.notificationSettings)).toEqual([]);
      expect(await tx.select().from(s.promisesToPay)).toEqual([]);
    });
    expect(await databaseError(app.withAgency(other!.id, (tx) => tx.insert(s.promisesToPay).values({ agencyId: theOwner.agencyId, invoiceId: invoice.id, promisedOn: "2026-11-15", createdByLabel: "x" })))).toMatch(/row-level security/);
  });
});
