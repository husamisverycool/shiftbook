/**
 * The client portal (slice v; SPEC §27 item 8): giving access, the link (decision 0013's rules),
 * what a contact sees — only their own client's — requests for workers, and the agency's decisions.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadPortal, type ApprovalDeps } from "../../src/server/approvals/service";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { clearDemoAgency, clientId, periodId, seedDemoAgency, worksiteId } from "../../src/server/demo/seed";
import { DemoMailboxTransport, type MailTransport } from "../../src/server/mail/transport";
import {
  acceptStaffRequest,
  addPortalContact,
  declineStaffRequest,
  openPortal,
  pendingStaffRequests,
  portalAccess,
  portalFile,
  portalOverview,
  portalPayments,
  requestNewPortalLink,
  reviewHoursLink,
  revokePortalContact,
  sendPortalLink,
  submitStaffRequest,
  type StaffRequestInput,
} from "../../src/server/portal/service";
import type { Actor } from "../../src/server/session";
import { openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const billing: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000002", label: "Test billing", role: "billing" };
const coordinator: Actor = { ...billing, label: "Test coordinator", role: "coordinator" };
const accountant: Actor = { ...billing, label: "Test accountant", role: "accountant" };
const IL = clientId("il");
const CA = clientId("ca");
const TOKEN = /sbcp_[A-Za-z0-9_-]{43}/;
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(DEMO_AGENCY.id, fn);

let clock = new Date("2026-10-12T15:00:00Z");
const deps: ApprovalDeps = { db: app.db, withAgency: app.withAgency, mailTransport: (id): MailTransport => new DemoMailboxTransport(app.withAgency, id), baseUrl: "https://granite.test", now: () => clock };

async function lastToken(): Promise<string> {
  const rows = await inAgency((tx) => tx.select().from(s.demoMailbox).orderBy(sql`created_at desc`).limit(1));
  return TOKEN.exec(rows[0]!.textBody)![0];
}

async function giveAccess(client = IL, email = "pat.lee@prairie.example.com"): Promise<string> {
  const r = await addPortalContact(deps, billing, { clientId: client, name: "Pat Lee", email, locale: "en" });
  expect(r.ok).toBe(true);
  return lastToken();
}

const request = (over: Partial<StaffRequestInput> = {}): StaffRequestInput => ({
  position: "Forklift operator",
  worksiteId: worksiteId("il"),
  worksiteNote: "",
  startsOn: "2026-10-20",
  endsOn: null,
  shiftStartMinute: 420,
  shiftEndMinute: 930,
  headcount: 3,
  notes: "Steel-toe boots.",
  ...over,
});

beforeEach(async () => {
  clock = new Date("2026-10-12T15:00:00Z");
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

describe("giving access", () => {
  it("records the contact, emails one link whose token is never stored, and only Owner and Billing may", async () => {
    const token = await giveAccess();
    const emails = await inAgency((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "portal_link")));
    expect(emails).toHaveLength(1);
    expect(emails[0]!.textBody).not.toMatch(TOKEN);
    expect(emails[0]!.status).toBe("sent");
    const links = await inAgency((tx) => tx.select().from(s.portalLinks));
    expect(links[0]!.tokenHash).not.toContain(token);
    expect(await addPortalContact(deps, coordinator, { clientId: IL, name: "X", email: "x@example.com", locale: "en" })).toEqual({ ok: false, error: "not_allowed" });
    expect(await addPortalContact(deps, accountant, { clientId: IL, name: "X", email: "x@example.com", locale: "en" })).toEqual({ ok: false, error: "not_allowed" });
    expect(await addPortalContact(deps, billing, { clientId: IL, name: "Pat", email: "PAT.LEE@prairie.example.com", locale: "en" })).toEqual({ ok: false, error: "duplicate" });
    expect(await addPortalContact(deps, billing, { clientId: IL, name: "", email: "nope", locale: "fr" })).toMatchObject({ ok: false, error: "invalid", fields: ["name", "email", "locale"] });
  });

  it("a new link stops the earlier one; removing access stops every link at once", async () => {
    const first = await giveAccess();
    const [contact] = await inAgency((tx) => tx.select().from(s.portalContacts));
    expect(await sendPortalLink(deps, billing, contact!.id)).toEqual({ ok: false, error: "too_soon" });
    clock = new Date(clock.getTime() + 61_000);
    expect(await sendPortalLink(deps, billing, contact!.id)).toEqual({ ok: true });
    const second = await lastToken();
    expect(second).not.toBe(first);
    expect((await openPortal(deps, first)).state).toBe("revoked");
    expect((await openPortal(deps, second)).state).toBe("active");
    expect(await revokePortalContact(deps, billing, contact!.id)).toEqual({ ok: true });
    expect((await openPortal(deps, second)).state).toBe("revoked");
    expect(await inAgency((tx) => portalAccess(tx, IL, { demoCopies: true }))).toEqual([]);
  });

  it("the agency sees the contact's last visit, the link's end and, in the demo, the email as delivered", async () => {
    const token = await giveAccess();
    let [row] = await inAgency((tx) => portalAccess(tx, IL, { demoCopies: true }));
    expect(row!.lastVisitAt).toBeNull();
    expect(row!.demoCopy).toContain(token);
    await openPortal(deps, token);
    [row] = await inAgency((tx) => portalAccess(tx, IL, { demoCopies: false }));
    expect(row!.lastVisitAt).not.toBeNull();
    expect(row!.demoCopy).toBeNull();
    expect(row!.linkExpiresAt!.getTime()).toBeGreaterThan(clock.getTime());
  });
});

describe("the link", () => {
  it("an unknown or malformed token reads as invalid; an expired one may ask for a new link, rarely", async () => {
    expect((await openPortal(deps, `sbcp_${"A".repeat(43)}`)).state).toBe("invalid");
    expect((await openPortal(deps, "not-a-token")).state).toBe("invalid");
    const token = await giveAccess();
    expect(await requestNewPortalLink(deps, token)).toEqual({ ok: false, error: "link_active" });
    clock = new Date(clock.getTime() + 60 * 86_400_000);
    const expired = await openPortal(deps, token);
    expect(expired).toMatchObject({ state: "expired", canRenew: false });
    clock = new Date("2026-10-12T15:00:00Z");
    const [link] = await inAgency((tx) => tx.select().from(s.portalLinks));
    clock = new Date(link!.expiresAt.getTime() + 3_600_000);
    expect(await openPortal(deps, token)).toMatchObject({ state: "expired", canRenew: true });
    expect(await portalPayments(deps, token)).toEqual({ ok: false, error: "link_expired" });
    expect(await requestNewPortalLink(deps, token)).toEqual({ ok: true });
    expect(await requestNewPortalLink(deps, token)).toMatchObject({ ok: false, error: "link_revoked" });
    const renewed = await lastToken();
    expect((await openPortal(deps, renewed)).state).toBe("active");
  });
});

describe("what a contact sees", () => {
  it("only their own client's payments, overview and files", async () => {
    await owner.db.insert(s.payments).values([
      { agencyId: DEMO_AGENCY.id, clientId: IL, receivedOn: "2026-10-01", amountCents: 50_000, method: "check", reference: "1042", createdByLabel: "Test" },
      { agencyId: DEMO_AGENCY.id, clientId: CA, receivedOn: "2026-10-02", amountCents: 70_000, method: "ach", reference: "CA-1", createdByLabel: "Test" },
    ]);
    const token = await giveAccess();
    const payments = await portalPayments(deps, token);
    expect(Array.isArray(payments) && payments.map((p) => [p.reference, p.amountCents, p.appliedCents])).toEqual([["1042", 50_000, 0]]);
    const caPayment = await owner.db.select().from(s.payments).where(eq(s.payments.clientId, CA));
    expect(await portalFile(deps, token, { paymentId: caPayment[0]!.id })).toBeNull();
    const ilPayment = await owner.db.select().from(s.payments).where(eq(s.payments.clientId, IL));
    expect(await portalFile(deps, token, { paymentId: ilPayment[0]!.id })).toMatchObject({ kind: "payment" });
    const overview = await portalOverview(deps, token, "2026-10-12");
    expect(overview).toMatchObject({ owedCents: 0, overdueCents: 0, nextDue: null, pendingRequests: 0 });
    // A download is audited with the contact's identity.
    // Other tests in the same database record payments too: only this payment's events count.
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "payment"), eq(s.auditEvents.entityId, ilPayment[0]!.id))));
    expect(events.map((e) => e.actorLabel)).toEqual(["Pat Lee <pat.lee@prairie.example.com> (client portal)"]);
  });

  it("another agency's link never reads this agency's rows", async () => {
    const token = await giveAccess();
    const opened = await openPortal(deps, token);
    expect(opened).toMatchObject({ state: "active", agencyId: DEMO_AGENCY.id, clientId: IL });
    // The app role cannot read portal rows without an agency set.
    const visible = await app.db.execute<{ n: number }>(sql`select count(*)::int as n from portal_contacts`);
    expect(visible[0]!.n).toBe(0);
  });

  it("hours: only the approver the request was sent to may open it from the portal", async () => {
    const token = await giveAccess();
    expect(await reviewHoursLink(deps, token, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "not_found" });
  });

  // Security review M1: an approval link made from the portal lasts an hour, one at a time, and ends
  // with the portal access that made it.
  async function openRequest(email = "pat.lee@prairie.example.com"): Promise<string> {
    const [r] = await owner.db
      .insert(s.approvalRequests)
      .values({ agencyId: DEMO_AGENCY.id, clientId: IL, payPeriodId: periodId("w2"), approverName: "Pat Lee", approverEmail: email, locale: "en", agencyLocale: "en", cycleStartedAt: clock, createdByLabel: "Test" })
      .returning({ id: s.approvalRequests.id });
    return r!.id;
  }
  const approvalState = async (approvalToken: string) => (await loadPortal(deps, approvalToken)).state;

  it("hours: removing portal access ends the approval link the portal made; it lasts an hour and replaces the one before", async () => {
    const token = await giveAccess();
    const requestId = await openRequest();
    const first = await reviewHoursLink(deps, token, requestId);
    expect(first.ok).toBe(true);
    const firstToken = first.ok ? first.approvalToken : "";
    expect(await approvalState(firstToken)).not.toBe("replaced");
    const [link] = await inAgency((tx) => tx.select().from(s.approvalLinks).where(eq(s.approvalLinks.requestId, requestId)));
    expect(link!.expiresAt.getTime() - clock.getTime()).toBe(3_600_000);
    const second = await reviewHoursLink(deps, token, requestId);
    const secondToken = second.ok ? second.approvalToken : "";
    expect(await approvalState(firstToken)).toBe("replaced");
    expect(await approvalState(secondToken)).not.toBe("replaced");
    const [contact] = await inAgency((tx) => tx.select().from(s.portalContacts));
    expect(await revokePortalContact(deps, billing, contact!.id)).toEqual({ ok: true });
    expect(await approvalState(secondToken)).toBe("replaced");
  });

  it("hours: a new portal link ends the approval links the old one made, and a contact makes at most ten an hour", async () => {
    const token = await giveAccess();
    const requestId = await openRequest();
    const made = await reviewHoursLink(deps, token, requestId);
    const approvalToken = made.ok ? made.approvalToken : "";
    const [contact] = await inAgency((tx) => tx.select().from(s.portalContacts));
    clock = new Date(clock.getTime() + 61_000);
    expect(await sendPortalLink(deps, billing, contact!.id)).toEqual({ ok: true });
    expect(await approvalState(approvalToken)).toBe("replaced");
    const fresh = await lastToken();
    for (let i = 1; i < 10; i++) expect((await reviewHoursLink(deps, fresh, requestId)).ok).toBe(true);
    expect(await reviewHoursLink(deps, fresh, requestId)).toEqual({ ok: false, error: "review_limit" });
    clock = new Date(clock.getTime() + 3_601_000);
    expect((await reviewHoursLink(deps, fresh, requestId)).ok).toBe(true);
  });
});

describe("requests for workers", () => {
  it("a request is checked, stored for the agency, audited, and becomes a job order or is declined with a reason", async () => {
    const token = await giveAccess();
    expect(await submitStaffRequest(deps, token, request({ position: " ", headcount: 0, startsOn: "2020-01-01" }))).toMatchObject({ ok: false, error: "invalid", fields: expect.arrayContaining(["position", "headcount", "startsOn"]) });
    expect(await submitStaffRequest(deps, token, request({ worksiteId: worksiteId("ca") }))).toMatchObject({ ok: false, error: "invalid", fields: ["worksite"] });
    const sent = await submitStaffRequest(deps, token, request());
    expect(sent.ok).toBe(true);
    const second = await submitStaffRequest(deps, token, request({ position: "Packer", worksiteId: null, worksiteNote: "Dock 4, north gate" }));
    expect(second.ok).toBe(true);
    const pending = await inAgency((tx) => pendingStaffRequests(tx));
    expect(pending.map((r) => [r.position, r.contactName, r.headcount, r.worksiteNote])).toEqual([
      ["Forklift operator", "Pat Lee", 3, null],
      ["Packer", "Pat Lee", 3, "Dock 4, north gate"],
    ]);
    // Billing cannot decide (placements); a coordinator can.
    expect(await inAgency((tx) => acceptStaffRequest(tx, billing, pending[0]!.id, worksiteId("il")))).toEqual({ ok: false, error: "not_allowed" });
    const made = await inAgency((tx) => acceptStaffRequest(tx, coordinator, pending[0]!.id, worksiteId("il")));
    expect(made.ok).toBe(true);
    const [job] = await inAgency((tx) => tx.select().from(s.jobOrders).where(eq(s.jobOrders.id, (made as { jobOrderId: string }).jobOrderId)));
    expect([job!.position, job!.shift, job!.headcount, job!.clientId]).toEqual(["Forklift operator", "07:00–15:30", 3, IL]);
    expect(await inAgency((tx) => declineStaffRequest(tx, coordinator, pending[1]!.id, "  "))).toMatchObject({ ok: false, error: "invalid" });
    expect(await inAgency((tx) => declineStaffRequest(tx, coordinator, pending[1]!.id, "No forklift-certified packers that week."))).toEqual({ ok: true });
    expect(await inAgency((tx) => declineStaffRequest(tx, coordinator, pending[1]!.id, "again"))).toEqual({ ok: false, error: "not_found" });
    expect(await inAgency((tx) => pendingStaffRequests(tx))).toEqual([]);
    const received = await inAgency((tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityType, "staff_request")));
    expect(received.filter((e) => e.actorLabel.endsWith("(client portal)"))).toHaveLength(2);
  });

  it("one contact cannot flood the agency: at most 20 requests wait at a time", async () => {
    const token = await giveAccess();
    for (let i = 0; i < 20; i++) expect((await submitStaffRequest(deps, token, request({ position: `Role ${i}` }))).ok).toBe(true);
    expect(await submitStaffRequest(deps, token, request())).toEqual({ ok: false, error: "too_soon" });
  });
});
