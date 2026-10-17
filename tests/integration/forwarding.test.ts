/**
 * Timesheets by email (slice y; decision 0042): an email to the agency's forwarding address files its
 * timesheets into last week through the upload's own intake, once however often it is posted; the
 * accepted-senders list holds; a paid week holds the files for a person; one agency's address never
 * reaches another's data; a new address ends the old.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../../src/server/db/schema";
import { CURRENT_PERIOD, DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, periodId, seedDemoAgency } from "../../src/server/demo/seed";
import { addressOf } from "../../src/server/inbound/address";
import { agencyOfToken, ensureAddress, fileHeldEmail, forwardingView, receiveInboundEmail, rotateAddress, setAllowedSenders, type IncomingEmail, type IncomingFile, type InboundDeps } from "../../src/server/inbound/service";
import { syncNotifications } from "../../src/server/notifications/service";
import type { Actor } from "../../src/server/session";
import type { DocumentStore } from "../../src/server/storage";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const DOMAIN = "in.test.example";
const files = new Map<string, Uint8Array>();
const store: DocumentStore = {
  put: async (k, b) => void files.set(k, b),
  get: async (k) => files.get(k)!,
  removePrefix: async (p) => {
    for (const k of [...files.keys()]) if (k.startsWith(p)) files.delete(k);
  },
};
const deps: InboundDeps = { db: app.db, withAgency: app.withAgency, store, domain: DOMAIN };
const coordinator: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000003", label: "Test coordinator", role: "coordinator" };
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);

const sample = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "demo", "samples", CURRENT_PERIOD.startsOn, name)));
const file = (filename: string, bytes: Uint8Array, inline = false): IncomingFile => ({ filename, size: bytes.byteLength, inline, read: async (cap) => (bytes.byteLength > cap ? null : bytes) });
let n = 0;
function mail(to: string, over: Partial<IncomingEmail> = {}): IncomingEmail {
  n += 1;
  return {
    providerEmailId: `0000000${n}-0000-4000-8000-000000000000`.slice(-36),
    from: "Pat Lee <pat.lee@prairie.example.com>",
    to: [to],
    subject: "Last week's hours",
    text: "Hours attached. Badge 912-34-5678, born 4/2/1990.",
    receivedAt: new Date("2026-10-17T15:00:00Z"),
    authentication: { dmarc: "pass" },
    files: [file("IL-prairie-line-timeclock-2026-10-05.csv", sample("IL-prairie-line-timeclock-2026-10-05.csv")), file("notes.docx", new Uint8Array(10)), file("logo.png", new Uint8Array(900), true)],
    demo: false,
    ...over,
  };
}
const addressA = async () => addressOf((await inAgency((tx) => ensureAddress(tx, DEMO_AGENCY.id))).token, DOMAIN);

beforeEach(async () => {
  files.clear();
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

describe("an email to the forwarding address", () => {
  it("files its timesheets into last week as an upload would, lists what it passed over, and keeps the body without SSN- or date-shaped text", async () => {
    const r = await receiveInboundEmail(deps, mail(await addressA()));
    expect(r).toMatchObject({ status: "filed", filed: 1, held: 0, refused: 1, payPeriodId: periodId("w2") });
    const docs = await inAgency((tx) => tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.receivedVia, "email")));
    expect(docs.map((d) => [d.filename, d.payPeriodId, d.status])).toEqual([["IL-prairie-line-timeclock-2026-10-05.csv", periodId("w2"), "received"]]);
    const [email] = await inAgency((tx) => tx.select().from(s.inboundEmails));
    expect(email).toMatchObject({ fromAddress: "pat.lee@prairie.example.com", status: "filed", payPeriodId: periodId("w2") });
    expect(email!.bodyText).not.toContain("912-34-5678");
    expect(email!.bodyText).not.toContain("4/2/1990");
    const attachments = await inAgency((tx) => tx.select().from(s.inboundAttachments));
    // The signature logo is passed over without a row; the Word file is listed as not a timesheet.
    expect(attachments.map((a) => [a.filename, a.outcome]).sort()).toEqual([
      ["IL-prairie-line-timeclock-2026-10-05.csv", "filed"],
      ["notes.docx", "unsupported"],
    ]);
    // A read job waits, as for an upload; the audit names the sender.
    const jobs = await inAgency((tx) => tx.select().from(s.jobs).where(eq(s.jobs.kind, "read_document")));
    expect(jobs.length).toBe(1);
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityType, "inbound_email")));
    expect(events.map((e) => [e.actorLabel, e.actorUserId])).toEqual([["pat.lee@prairie.example.com (email)", null]]);
  });

  it("is taken once however often the provider posts it", async () => {
    const m = mail(await addressA());
    const first = await receiveInboundEmail(deps, m);
    const again = await receiveInboundEmail(deps, m);
    expect(again).toEqual({ status: "duplicate", emailId: (first as { emailId: string }).emailId });
    expect((await inAgency((tx) => tx.select().from(s.inboundEmails))).length).toBe(1);
    expect((await inAgency((tx) => tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.receivedVia, "email")))).length).toBe(1);
  });

  it("with an accepted-senders list, takes only listed senders whose email passed DMARC", async () => {
    const to = await addressA();
    expect(await inAgency((tx) => setAllowedSenders(tx, coordinator as Actor & { userId: string }, ["@prairie.example.com", "not a sender"]))).toEqual({ ok: false, error: "invalid", value: "not a sender" });
    await inAgency((tx) => setAllowedSenders(tx, coordinator, ["@Prairie.example.com"]));
    expect(await receiveInboundEmail(deps, mail(to, { from: "someone@elsewhere.example.com" }))).toMatchObject({ status: "refused" });
    expect(await receiveInboundEmail(deps, mail(to, { authentication: { dmarc: "fail" } }))).toMatchObject({ status: "refused" });
    expect(await receiveInboundEmail(deps, mail(to))).toMatchObject({ status: "filed" });
    const emails = await inAgency((tx) => tx.select().from(s.inboundEmails));
    expect(emails.map((e) => e.refusedReason ?? "taken").sort()).toEqual(["sender_not_allowed", "sender_not_allowed", "taken"]);
    // A refused email's files are never stored.
    expect([...files.keys()].filter((k) => k.includes("/inbound/"))).toEqual([]);
  });

  it("an email with no timesheet file is recorded as not taken", async () => {
    const r = await receiveInboundEmail(deps, mail(await addressA(), { files: [file("logo.png", new Uint8Array(900), true)] }));
    expect(r).toMatchObject({ status: "refused" });
    const [email] = await inAgency((tx) => tx.select().from(s.inboundEmails));
    expect(email!.refusedReason).toBe("no_files");
  });

  it("holds the files when last week is already paid, and a person files them into an open week", async () => {
    // Received on Tuesday October 6: last week is September 28, paid before Granite in the demo.
    const r = await receiveInboundEmail(deps, mail(await addressA(), { receivedAt: new Date("2026-10-06T15:00:00Z") }));
    expect(r).toMatchObject({ status: "held", filed: 0, held: 1 });
    const [held] = await inAgency((tx) => tx.select().from(s.inboundAttachments).where(eq(s.inboundAttachments.outcome, "held")));
    expect(files.has(held!.storageKey!)).toBe(true);
    const emailId = (r as { emailId: string }).emailId;
    const filed = await inAgency((tx) => fileHeldEmail(tx, coordinator, store, emailId, periodId("w2")));
    expect(filed).toEqual({ ok: true, filed: 1 });
    const [email] = await inAgency((tx) => tx.select().from(s.inboundEmails).where(eq(s.inboundEmails.id, emailId)));
    expect(email).toMatchObject({ status: "filed", payPeriodId: periodId("w2") });
    expect(await inAgency((tx) => fileHeldEmail(tx, coordinator, store, emailId, periodId("w2")))).toEqual({ ok: false, error: "not_held" });
    const docs = await inAgency((tx) => tx.select().from(s.sourceDocuments).where(and(eq(s.sourceDocuments.receivedVia, "email"), eq(s.sourceDocuments.payPeriodId, periodId("w2")))));
    expect(docs.length).toBe(1);
  });

  it("tells the coordinator by a notice", async () => {
    await receiveInboundEmail(deps, mail(await addressA()));
    const made = await inAgency((tx) => syncNotifications(tx, DEMO_AGENCY.id, new Date("2026-10-17T16:00:00Z")));
    expect(made.filter((m) => m.kind === "email_received").length).toBeGreaterThan(0);
    expect(made.find((m) => m.kind === "email_received")!.href).toBe(`/convert?period=${periodId("w2")}`);
  });
});

describe("the address", () => {
  it("names only its own agency: another agency's email lands in its own rows, and neither sees the other's", async () => {
    const [b] = await owner.db.insert(s.agencies).values({ name: "Agency B (forwarding test)" }).returning();
    try {
      const tokenB = (await app.withAgency(b!.id, (tx) => ensureAddress(tx, b!.id))).token;
      expect(await agencyOfToken(app.db, tokenB)).toBe(b!.id);
      const r = await receiveInboundEmail(deps, mail(addressOf(tokenB, DOMAIN), { receivedAt: new Date("2026-10-17T15:00:00Z") }));
      expect(r.status === "filed" || r.status === "held").toBe(true);
      expect((await app.withAgency(b!.id, (tx) => tx.select().from(s.inboundEmails))).length).toBe(1);
      expect((await inAgency((tx) => tx.select().from(s.inboundEmails))).length).toBe(0);
      expect((await inAgency((tx) => forwardingView(tx, DEMO_AGENCY.id, DOMAIN))).emails).toEqual([]);
    } finally {
      await owner.db.delete(s.inboundAttachments).where(eq(s.inboundAttachments.agencyId, b!.id));
      await owner.db.delete(s.inboundEmails).where(eq(s.inboundEmails.agencyId, b!.id));
      await owner.db.delete(s.jobs).where(eq(s.jobs.agencyId, b!.id));
      await owner.db.delete(s.auditEvents).where(eq(s.auditEvents.agencyId, b!.id)).catch(() => undefined);
    }
  });

  it("an unknown token, another domain or a malformed token finds no agency", async () => {
    const to = await addressA();
    expect(await receiveInboundEmail(deps, mail(to.replace(DOMAIN, "elsewhere.example")))).toEqual({ status: "no_address" });
    expect(await receiveInboundEmail(deps, mail("timesheets+aaaaaaaaaaaaaaaaaaaa@" + DOMAIN))).toEqual({ status: "no_address" });
    expect(await agencyOfToken(app.db, "x'; drop table agencies; --")).toBeNull();
  });

  it("a new address ends the old one at once", async () => {
    const old = await addressA();
    await inAgency((tx) => rotateAddress(tx, coordinator));
    expect(await receiveInboundEmail(deps, mail(old))).toEqual({ status: "no_address" });
    expect(await receiveInboundEmail(deps, mail(await addressA()))).toMatchObject({ status: "filed" });
  });
});
