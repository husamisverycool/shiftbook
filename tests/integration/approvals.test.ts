/**
 * Client approval (slice d; plan `.claude/plans/slice-d-client-approval.md`; decisions 0012, 0013):
 * sending, the link, the client's page, approving and disputing, settling, withdrawing, reminders.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  approvalDetail,
  listApprovals,
  loadPortal,
  removeDraftDispute,
  requestNewLink,
  saveDraftDispute,
  sendApprovalRequest,
  sendReminder,
  settleDispute,
  submitDecision,
  sweepReminders,
  withdrawApproval,
  type ApprovalDeps,
} from "../../src/server/approvals/service";
import * as s from "../../src/server/db/schema";
import { DEMO_AGENCY } from "../../src/server/demo/dataset";
import { assignmentId, clearDemoAgency, clientId, periodId, seedDemoAgency, workerId } from "../../src/server/demo/seed";
import { DemoMailboxTransport, type MailTransport } from "../../src/server/mail/transport";
import { editEntry } from "../../src/server/review/service";
import { computeRun } from "../../src/server/run/service";
import type { Actor } from "../../src/server/session";
import { databaseError, openAppDb, openOwnerDb } from "./helpers";

const app = openAppDb();
const owner = openOwnerDb();
const actor: Actor = { agencyId: DEMO_AGENCY.id, userId: "00000000-0000-4000-a000-000000000001", label: "Test coordinator", role: "coordinator" };
const period = periodId("w2");
const IL = clientId("il");
const CA = clientId("ca");
const inAgency = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(actor.agencyId, fn);
const TOKEN = /sbap_[A-Za-z0-9_-]{43}/;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

let clock = new Date("2026-10-12T15:00:00Z");
let transport: (agencyId: string) => MailTransport = (agencyId) => new DemoMailboxTransport(app.withAgency, agencyId);
const deps: ApprovalDeps = { db: app.db, withAgency: app.withAgency, mailTransport: (id) => transport(id), baseUrl: "https://shiftbook.test", now: () => clock };
const later = (hours: number) => new Date(clock.getTime() + hours * 3_600_000);

async function addShift(worker: string, date: string, inMinute: number, outMinute: number, breakMinutes: number, status: "reviewed" | "needs_review" | "extracted" = "reviewed") {
  const [row] = await owner.db
    .insert(s.timeEntries)
    .values({
      agencyId: actor.agencyId,
      payPeriodId: period,
      workerNameRaw: worker,
      workerId: workerId(worker),
      assignmentId: assignmentId(worker),
      workDate: date,
      inMinute,
      outMinute,
      breakMinutes,
      minutes: outMinute - inMinute - breakMinutes,
      confidence: "high",
      status,
    })
    .returning();
  return row!;
}

/** Marcus 3 shifts and Anita 2 at Prairie Line (Illinois); Luis 1 at Pacific Crest (California), still needing review. */
async function fresh() {
  clock = new Date("2026-10-12T15:00:00Z");
  transport = (agencyId) => new DemoMailboxTransport(app.withAgency, agencyId);
  const existing = await owner.db.select().from(s.agencies).where(eq(s.agencies.id, DEMO_AGENCY.id));
  if (existing.length === 0) await owner.db.insert(s.agencies).values({ ...DEMO_AGENCY, isDemo: true });
  await inAgency(async (tx) => {
    await clearDemoAgency(tx);
    await seedDemoAgency(tx);
  });
  const shifts = {
    marcusMon: await addShift("marcus-bell", "2026-10-05", 420, 1020, 0),
    marcusTue: await addShift("marcus-bell", "2026-10-06", 420, 1020, 0),
    marcusWed: await addShift("marcus-bell", "2026-10-07", 420, 1020, 0),
    anitaMon: await addShift("anita-patel", "2026-10-05", 420, 900, 0),
    anitaTue: await addShift("anita-patel", "2026-10-06", 420, 900, 0, "extracted"),
    luisMon: await addShift("luis-hernandez", "2026-10-05", 420, 930, 30, "needs_review"),
  };
  return shifts;
}

const send = (over: Partial<Parameters<typeof sendApprovalRequest>[2]> = {}) =>
  sendApprovalRequest(deps, actor, { clientId: IL, payPeriodId: period, approverName: "Dana Approver", approverEmail: "dana@prairie.example", locale: "en", agencyLocale: "en", ...over });

/** The working link in the newest email delivered to the demo mailbox (what the approver clicks). */
async function latestToken(to = "dana@prairie.example"): Promise<string> {
  const [mail] = await inAgency((tx) => tx.select().from(s.demoMailbox).where(eq(s.demoMailbox.toEmail, to)).orderBy(desc(s.demoMailbox.createdAt)).limit(1));
  const token = TOKEN.exec(mail!.textBody)?.[0];
  if (!token) throw new Error("no link in the latest email");
  return token;
}

const statusOf = async (id: string) => (await inAgency((tx) => tx.select({ status: s.timeEntries.status }).from(s.timeEntries).where(eq(s.timeEntries.id, id))))[0]!.status;
const decide = async (token: string, over: Partial<Parameters<typeof submitDecision>[2]> = {}) => {
  const view = await loadPortal(deps, token);
  if (view.state !== "active") throw new Error(`page is ${view.state}`);
  return submitDecision(deps, token, { typedName: "Dana Approver", confirmed: true, snapshot: view.snapshot, locale: "en", ipAddress: "203.0.113.7", userAgent: "TestBrowser/1.0", ...over });
};

afterAll(async () => {
  await app.close();
  await owner.close();
});

describe("sending a client's hours for approval", () => {
  beforeEach(fresh);

  it("is refused while any of the client's shifts still needs review, saying how many", async () => {
    expect(await send({ clientId: CA })).toEqual({ ok: false, error: "needs_review", count: 1 });
  });

  it("checks the approver's name, email and language", async () => {
    expect(await send({ approverName: " " })).toEqual({ ok: false, error: "name_required" });
    expect(await send({ approverEmail: "dana" })).toEqual({ ok: false, error: "invalid_email" });
    expect(await send({ locale: "fr" })).toEqual({ ok: false, error: "invalid_locale" });
  });

  it("emails a link whose token is stored only as its SHA-256; the email log hides it; it is audited", async () => {
    const sent = await send();
    if (!sent.ok) throw new Error(sent.error);
    const token = await latestToken();
    const [mail] = await inAgency((tx) => tx.select().from(s.demoMailbox));
    expect(mail!.textBody).toContain(`https://shiftbook.test/en/approve/${token}`);
    // Marcus 3 × 10 h, Anita 2 × 8 h.
    expect(mail!.textBody).toContain("2 workers, 5 shifts, 46:00 hours");

    const links = await inAgency((tx) => tx.select().from(s.approvalLinks));
    expect(links).toHaveLength(1);
    expect(links[0]!.tokenHash).toBe(sha256(token));
    expect(links[0]!.expiresAt.toISOString()).toBe("2026-10-26T15:00:00.000Z");

    const [log] = await inAgency((tx) => tx.select().from(s.emailMessages));
    expect(log!).toMatchObject({ kind: "approval_request", toEmail: "dana@prairie.example", status: "sent" });
    expect(log!.textBody).not.toContain(token);
    expect(log!.textBody).toContain("[approval link hidden]");

    // The token appears nowhere in the database but the demo's stand-in inbox.
    const everywhere = await owner.db.execute<{ hit: number }>(sql`
      select count(*)::int as hit from (
        select text_body as t from email_messages union all select after::text from audit_events
        union all select token_hash from approval_links union all select before::text from audit_events) x
      where t like ${`%${token}%`}`);
    expect(everywhere[0]!.hit).toBe(0);

    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "approval_request"), eq(s.auditEvents.entityId, sent.requestId))));
    expect(events.map((e) => (e.after as { event: string }).event)).toEqual(["sent"]);
  });

  it("refuses an email that cannot be sent, and the link it carried stops working", async () => {
    transport = () => ({ send: () => Promise.reject(new Error("service down")) });
    const sent = await send();
    expect(sent).toMatchObject({ ok: false, error: "send_failed" });
    const [log] = await inAgency((tx) => tx.select().from(s.emailMessages));
    expect(log).toMatchObject({ status: "failed", error: "service down" });
    const [link] = await inAgency((tx) => tx.select().from(s.approvalLinks));
    expect(link!.revokedAt).not.toBeNull();
  });

  it("lists each client with shifts: what waits, what needs review, and the state", async () => {
    await send();
    const rows = await inAgency((tx) => listApprovals(tx, period, clock));
    expect(rows.map((r) => [r.clientName, r.state, r.counts])).toEqual([
      ["Pacific Crest Distribution (demo)", "not_sent", { waiting: 0, approved: 0, disputed: 0, needsReview: 1 }],
      ["Prairie Line Manufacturing (demo)", "waiting", { waiting: 5, approved: 0, disputed: 0, needsReview: 0 }],
    ]);
    expect(rows[1]!.lastActivity?.kind).toBe("approval_request");
  });
});

describe("the link", () => {
  beforeEach(fresh);

  it("is found across agencies only through the narrow lookup, which gives nothing but its id and agency", async () => {
    await send();
    const token = await latestToken();
    expect(await app.db.select().from(s.approvalLinks)).toHaveLength(0);
    expect(await app.db.select().from(s.approvalRequests)).toHaveLength(0);
    const rows = await app.db.execute(sql`select * from approval_link_lookup(${sha256(token)})`);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(["agency_id", "link_id"]);
    expect(rows[0]!.agency_id).toBe(actor.agencyId);
    expect(await app.db.execute(sql`select * from approval_link_lookup(${sha256("sbap_" + "x".repeat(43))})`)).toHaveLength(0);
  });

  it("a malformed or unknown token is just an invalid link", async () => {
    expect(await loadPortal(deps, "not-a-token")).toEqual({ state: "invalid" });
    expect(await loadPortal(deps, "sbap_" + "A".repeat(43))).toEqual({ state: "invalid" });
    expect(await submitDecision(deps, "sbap_" + "A".repeat(43), { typedName: "Dana", confirmed: true, snapshot: "x", locale: "en", ipAddress: null, userAgent: null })).toEqual({ ok: false, error: "link_invalid" });
  });

  it("shows the client hours only — no rates, amounts, other clients or identifiers — and opening it changes nothing", async () => {
    await send();
    const view = await loadPortal(deps, await latestToken());
    expect(view.state).toBe("active");
    if (view.state !== "active") return;
    expect(view.clientName).toBe("Prairie Line Manufacturing (demo)");
    expect(view.shifts).toHaveLength(5);
    expect(Object.keys(view.shifts[0]!).sort()).toEqual(["breakMinutes", "dispute", "draft", "entryId", "inMinute", "keptReply", "minutes", "outMinute", "state", "workDate", "workerId", "workerName"]);
    // No field anywhere in what the page receives is about money or identity numbers.
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object" && !(v instanceof Date)) {
        for (const [k, inner] of Object.entries(v)) {
          keys.add(k);
          walk(inner);
        }
      }
    };
    walk(view);
    expect([...keys].filter((k) => /rate|cents|amount|ssn|social|pay|bill|birth|address|phoneOf/i.test(k))).toEqual([]);
    // Nothing of another client's (Luis works at Pacific Crest).
    expect(JSON.stringify(view)).not.toContain("Hernández");
    expect(view.shifts.every((x) => x.state === "waiting")).toBe(true);
    const [link] = await inAgency((tx) => tx.select().from(s.approvalLinks));
    expect(link!.firstOpenedAt).not.toBeNull();
    expect(await inAgency((tx) => tx.select().from(s.approvalDecisions))).toHaveLength(0);
  });

  it("expires after the agency's setting; an expired link can email a new one to the same address, once per five minutes", async () => {
    await send();
    const token = await latestToken();
    clock = later(14 * 24 + 1);
    expect(await loadPortal(deps, token)).toMatchObject({ state: "expired", canRenew: true });
    expect(await decide(token).catch((e: Error) => e.message)).toBe("page is expired");
    expect(await requestNewLink(deps, token)).toEqual({ ok: true });
    expect(await requestNewLink(deps, token)).toEqual({ ok: false, error: "too_soon" });
    const fresh2 = await latestToken();
    expect(fresh2).not.toBe(token);
    expect((await loadPortal(deps, fresh2)).state).toBe("active");
    clock = new Date(clock.getTime() + 5 * 60_000);
    expect(await requestNewLink(deps, token)).toEqual({ ok: true });
    const mails = await inAgency((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "approval_renewal")));
    expect(mails.map((m) => m.toEmail)).toEqual(["dana@prairie.example", "dana@prairie.example"]);
  });

  it("stops working when another approver is asked instead", async () => {
    await send();
    const old = await latestToken();
    await send({ approverName: "Lee Supervisor", approverEmail: "lee@prairie.example" });
    expect(await loadPortal(deps, old)).toMatchObject({ state: "replaced" });
    expect(await requestNewLink(deps, old)).toEqual({ ok: false, error: "link_replaced" });
    expect((await loadPortal(deps, await latestToken("lee@prairie.example"))).state).toBe("active");
  });
});

describe("the approver's decision", () => {
  beforeEach(fresh);

  it("needs a typed name and the confirmation", async () => {
    await send();
    const token = await latestToken();
    expect(await decide(token, { typedName: " D " })).toEqual({ ok: false, error: "name_required" });
    expect(await decide(token, { confirmed: false })).toEqual({ ok: false, error: "confirm_required" });
  });

  it("is refused when the shifts changed after the page was shown", async () => {
    const shifts = await fresh();
    await send();
    const token = await latestToken();
    const view = await loadPortal(deps, token);
    if (view.state !== "active") throw new Error("inactive");
    expect(await inAgency((tx) => editEntry(tx, actor, shifts.anitaMon.id, { outMinute: 930 }, ["confirmed_client"], "phone call"))).toEqual({ ok: true });
    expect(await submitDecision(deps, token, { typedName: "Dana Approver", confirmed: true, snapshot: view.snapshot, locale: "en", ipAddress: null, userAgent: null })).toEqual({ ok: false, error: "changed" });
  });

  it("drafts disputes on waiting shifts only, with a reason and valid corrected times, and can remove them", async () => {
    const x = await fresh();
    await send();
    const token = await latestToken();
    expect(await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: " ", proposed: null })).toEqual({ ok: false, error: "reason_required" });
    expect(await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left early", proposed: { inMinute: 420, outMinute: 400, breakMinutes: 0 } })).toEqual({ ok: false, error: "invalid_times" });
    expect(await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left early", proposed: { inMinute: 420, outMinute: 1500, breakMinutes: 0 } })).toEqual({ ok: false, error: "invalid_times" });
    expect(await saveDraftDispute(deps, token, { entryId: x.luisMon.id, reason: "Not ours", proposed: null })).toEqual({ ok: false, error: "not_waiting" });
    expect(await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left at 3 pm", proposed: { inMinute: 420, outMinute: 900, breakMinutes: 0 } })).toEqual({ ok: true });
    expect(await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left at 3 pm, not 5 pm", proposed: { inMinute: 420, outMinute: 900, breakMinutes: 0 } })).toEqual({ ok: true });
    let view = await loadPortal(deps, token);
    if (view.state !== "active") throw new Error("inactive");
    expect(view.shifts.find((s2) => s2.entryId === x.marcusWed.id)!.draft).toEqual({ reason: "Left at 3 pm, not 5 pm", proposed: { inMinute: 420, outMinute: 900, breakMinutes: 0 } });
    expect(await removeDraftDispute(deps, token, x.marcusWed.id)).toEqual({ ok: true });
    view = await loadPortal(deps, token);
    if (view.state !== "active") throw new Error("inactive");
    expect(view.shifts.every((s2) => s2.draft === null)).toBe(true);
  });

  it("approves every waiting shift but the disputed ones, keeps the evidence, holds the disputed shift from the run, and emails both sides", async () => {
    const x = await fresh();
    const sent = await send();
    if (!sent.ok) throw new Error(sent.error);
    const token = await latestToken();
    await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left at 3 pm, not 5 pm", proposed: { inMinute: 420, outMinute: 900, breakMinutes: 0 } });
    expect(await decide(token)).toEqual({ ok: true, approved: 4, disputed: 1 });

    for (const e of [x.marcusMon, x.marcusTue, x.anitaMon, x.anitaTue]) expect(await statusOf(e.id)).toBe("client_approved");
    expect(await statusOf(x.marcusWed.id)).toBe("disputed");
    expect(await statusOf(x.luisMon.id)).toBe("needs_review");

    const [decision] = await inAgency((tx) => tx.select().from(s.approvalDecisions));
    expect(decision).toMatchObject({ typedName: "Dana Approver", approverEmail: "dana@prairie.example", ipAddress: "203.0.113.7", userAgent: "TestBrowser/1.0", attestationVersion: "2026-10-16", locale: "en" });
    expect(decision!.attestation).toContain("Prairie Line Manufacturing (demo)");
    expect(decision!.approved.map((a) => a.entryId).sort()).toEqual([x.marcusMon.id, x.marcusTue.id, x.anitaMon.id, x.anitaTue.id].sort());
    expect(decision!.approved.find((a) => a.entryId === x.marcusMon.id)).toEqual({ entryId: x.marcusMon.id, workerId: workerId("marcus-bell"), workerName: "Marcus Bell", workDate: "2026-10-05", inMinute: 420, outMinute: 1020, breakMinutes: 0, minutes: 600 });
    expect(decision!.disputed).toEqual([{ entryId: x.marcusWed.id, disputeId: expect.any(String), reason: "Left at 3 pm, not 5 pm" }]);

    const [event] = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "approval_request"), eq(s.auditEvents.entityId, sent.requestId), eq(s.auditEvents.action, "approve"))));
    expect(event!.actorLabel).toBe("Dana Approver <dana@prairie.example> (client, by link)");
    expect(event!.actorUserId).toBeNull();
    expect(event!.after).toMatchObject({ event: "decided", approved: 4, disputed: 1, ipAddress: "203.0.113.7", snapshotSha256: decision!.snapshotSha256 });

    const mails = await inAgency((tx) => tx.select().from(s.emailMessages).where(sql`${s.emailMessages.kind} in ('approval_confirmation', 'approval_notice')`));
    expect(mails.map((m) => [m.kind, m.toEmail, m.status]).sort()).toEqual([
      ["approval_confirmation", "dana@prairie.example", "sent"],
      ["approval_notice", DEMO_AGENCY.email, "sent"],
    ]);
    expect(mails.find((m) => m.kind === "approval_confirmation")!.textBody).toContain("Left at 3 pm, not 5 pm");

    const run = await inAgency((tx) => computeRun(tx, actor, period));
    const held = run.blockers.filter((b) => b.code === "client_dispute_open");
    expect(held).toHaveLength(1);
    expect(held[0]!.message).toBe('Marcus Bell on 2026-10-07: the client disputed this shift ("Left at 3 pm, not 5 pm"); settle it in Client approvals.');
  });

  it("is final: the page has nothing left to approve, and the record cannot be changed", async () => {
    await send();
    const token = await latestToken();
    expect((await decide(token)).ok).toBe(true);
    const view = await loadPortal(deps, token);
    if (view.state !== "active") throw new Error("inactive");
    expect(view.shifts.every((x) => x.state === "approved")).toBe(true);
    expect(view.decisions).toEqual([{ typedName: "Dana Approver", decidedAt: clock, approved: 5, disputed: 0 }]);
    expect(await submitDecision(deps, token, { typedName: "Dana Approver", confirmed: true, snapshot: view.snapshot, locale: "en", ipAddress: null, userAgent: null })).toEqual({ ok: false, error: "nothing_to_approve" });
    expect(await databaseError(inAgency((tx) => tx.update(s.approvalDecisions).set({ typedName: "Someone else" })))).toMatch(/permission denied|append-only/);
    expect((await inAgency((tx) => listApprovals(tx, period, clock))).find((r) => r.clientId === IL)!.state).toBe("approved");
  });

  it("cannot be removed for a real (non-demo) agency, even by the schema owner", async () => {
    const [agency] = await owner.db.insert(s.agencies).values({ name: "Real agency (test)" }).returning();
    const [client] = await owner.db.insert(s.clients).values({ agencyId: agency!.id, name: "C", code: "C" }).returning();
    const [p] = await owner.db.insert(s.payPeriods).values({ agencyId: agency!.id, startsOn: "2026-10-05", endsOn: "2026-10-11" }).returning();
    const [r] = await owner.db.insert(s.approvalRequests).values({ agencyId: agency!.id, clientId: client!.id, payPeriodId: p!.id, approverName: "A B", approverEmail: "a@b.example", locale: "en", agencyLocale: "en", cycleStartedAt: clock, createdByLabel: "t" }).returning();
    const [l] = await owner.db.insert(s.approvalLinks).values({ agencyId: agency!.id, requestId: r!.id, tokenHash: sha256("t1"), purpose: "request", expiresAt: clock }).returning();
    await owner.db.insert(s.approvalDecisions).values({ agencyId: agency!.id, requestId: r!.id, linkId: l!.id, approverEmail: "a@b.example", typedName: "A B", attestation: "x", attestationVersion: "v", locale: "en", snapshotSha256: sha256("s"), approved: [], disputed: [] });
    expect(await databaseError(owner.db.delete(s.approvalDecisions).where(eq(s.approvalDecisions.agencyId, agency!.id)))).toMatch(/append-only/);
  });

  it("is refused once the period's files exist; the page says the period is closed", async () => {
    await send();
    const token = await latestToken();
    await owner.db.insert(s.payRuns).values({ agencyId: actor.agencyId, payPeriodId: period, version: 1, status: "exported", rulesVersion: "test", skipped: [] });
    expect((await loadPortal(deps, token)).state).toBe("closed");
    expect(await submitDecision(deps, token, { typedName: "Dana Approver", confirmed: true, snapshot: "x", locale: "en", ipAddress: null, userAgent: null })).toEqual({ ok: false, error: "period_locked" });
    await owner.db.delete(s.payRuns).where(eq(s.payRuns.payPeriodId, period));
  });
});

describe("a week whose files exist", () => {
  beforeEach(async () => {
    await fresh();
  });

  it("still shows what the client approved: locked shifts paid as approved count as approved; one changed after the approval does not", async () => {
    const x = await fresh();
    await send();
    expect((await decide(await latestToken())).ok).toBe(true);
    // After the approval the agency changes Anita's Monday; the files are then made and every shift locks.
    await owner.db.update(s.timeEntries).set({ outMinute: 930, minutes: 510 }).where(eq(s.timeEntries.id, x.anitaMon.id));
    await owner.db.update(s.timeEntries).set({ status: "locked" }).where(inArray(s.timeEntries.id, [x.marcusMon.id, x.marcusTue.id, x.marcusWed.id, x.anitaMon.id, x.anitaTue.id]));
    await owner.db.insert(s.payRuns).values({ agencyId: actor.agencyId, payPeriodId: period, version: 1, status: "exported", rulesVersion: "test", skipped: [] });

    const row = (await inAgency((tx) => listApprovals(tx, period, clock))).find((r) => r.clientId === IL)!;
    expect(row.state).toBe("approved");
    expect(row.counts).toEqual({ waiting: 0, approved: 4, disputed: 0, needsReview: 0 });
    // The changed shift was paid all the same: it counts in the week's shifts and hours.
    expect(row.shifts).toBe(5);
    expect(row.workers).toBe(2);
    expect(row.minutes).toBe(3 * 600 + 480 + 510);

    const [request] = await inAgency((tx) => tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.clientId, IL)));
    const detail = (await inAgency((tx) => approvalDetail(tx, request!.id, { demoCopies: false, now: clock })))!;
    expect(detail.state).toBe("approved");
    expect(detail.periodOpen).toBe(false);
    expect(detail.shifts.map((v) => [v.entryId, v.state]).sort()).toEqual(
      [
        [x.marcusMon.id, "approved"],
        [x.marcusTue.id, "approved"],
        [x.marcusWed.id, "approved"],
        [x.anitaTue.id, "approved"],
      ].sort(),
    );
    await owner.db.delete(s.payRuns).where(eq(s.payRuns.payPeriodId, period));
  });

  it("a locked shift is not taken as approved after the approval was withdrawn", async () => {
    const x = await fresh();
    await send();
    expect((await decide(await latestToken())).ok).toBe(true);
    expect((await withdrawApproval(deps, actor, (await inAgency((tx) => tx.select().from(s.approvalRequests)))[0]!.id, "Rate was wrong")).ok).toBe(true);
    await owner.db.update(s.timeEntries).set({ status: "locked" }).where(inArray(s.timeEntries.id, [x.marcusMon.id, x.marcusTue.id, x.marcusWed.id, x.anitaMon.id, x.anitaTue.id]));
    const row = (await inAgency((tx) => listApprovals(tx, period, clock))).find((r) => r.clientId === IL)!;
    expect(row.counts.approved).toBe(0);
    expect(row.state).not.toBe("approved");
  });
});

describe("settling a dispute", () => {
  let x: Awaited<ReturnType<typeof fresh>>;
  let disputeId = "";
  beforeEach(async () => {
    x = await fresh();
    await send();
    const token = await latestToken();
    await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left at 3 pm, not 5 pm", proposed: { inMinute: 420, outMinute: 900, breakMinutes: 0 } });
    await saveDraftDispute(deps, token, { entryId: x.anitaMon.id, reason: "Not sure she was here", proposed: null });
    await decide(token);
    const disputes = await inAgency((tx) => tx.select().from(s.clientDisputes));
    disputeId = disputes.find((d) => d.timeEntryId === x.marcusWed.id)!.id;
  });

  const edit = (tx: Parameters<Parameters<typeof app.withAgency>[1]>[0], entryId: string, change: { inMinute: number; outMinute: number; breakMinutes: number }, note: string) =>
    editEntry(tx, actor, entryId, change, ["confirmed_client"], note, { clientTimesAccepted: true });

  it("accepting applies the client's times through the usual edit checks and counts as the client's approval", async () => {
    expect(await settleDispute(deps, actor, disputeId, "accept", "", edit)).toEqual({ ok: true });
    const [entry] = await inAgency((tx) => tx.select().from(s.timeEntries).where(eq(s.timeEntries.id, x.marcusWed.id)));
    expect(entry).toMatchObject({ outMinute: 900, minutes: 480, status: "client_approved" });
    const [d] = await inAgency((tx) => tx.select().from(s.clientDisputes).where(eq(s.clientDisputes.id, disputeId)));
    expect(d).toMatchObject({ status: "accepted", resolvedByLabel: "Test coordinator" });
    const reasons = (await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityId, x.marcusWed.id), eq(s.auditEvents.action, "update"))).orderBy(s.auditEvents.id))).map((e) => e.reason);
    expect(reasons).toEqual(["disputed by the client: Left at 3 pm, not 5 pm", "confirmed_client: client dispute: Left at 3 pm, not 5 pm", "the client's own times, accepted"]);
    expect(await settleDispute(deps, actor, disputeId, "accept", "", edit)).toEqual({ ok: false, error: "dispute_not_open" });
    // The other dispute still holds its shift.
    const run = await inAgency((tx) => computeRun(tx, actor, period));
    expect(run.blockers.filter((b) => b.code === "client_dispute_open").map((b) => b.workerName)).toEqual(["Anita Patel"]);
  });

  it("a dispute without corrected times cannot be accepted as is", async () => {
    const other = (await inAgency((tx) => tx.select().from(s.clientDisputes))).find((d) => d.timeEntryId === x.anitaMon.id)!;
    expect(await settleDispute(deps, actor, other.id, "accept", "", edit)).toEqual({ ok: false, error: "no_proposal" });
  });

  it("keeping the hours needs a reply; the shift waits for approval again and the next link shows the reply", async () => {
    expect(await settleDispute(deps, actor, disputeId, "keep", " ", edit)).toEqual({ ok: false, error: "reply_required" });
    expect(await settleDispute(deps, actor, disputeId, "keep", "The time clock shows 5:00 pm.", edit)).toEqual({ ok: true });
    expect(await statusOf(x.marcusWed.id)).toBe("reviewed");
    expect((await send()).ok).toBe(true);
    const view = await loadPortal(deps, await latestToken());
    if (view.state !== "active") throw new Error("inactive");
    const shift = view.shifts.find((s2) => s2.entryId === x.marcusWed.id)!;
    expect(shift).toMatchObject({ state: "waiting", keptReply: "The time clock shows 5:00 pm.", dispute: null });
  });

  it("changing a disputed shift in Review hours settles it; the shift then needs approval again", async () => {
    expect(await inAgency((tx) => editEntry(tx, actor, x.marcusWed.id, { outMinute: 930 }, ["confirmed_client"], "agreed 3:30 pm"))).toEqual({ ok: true });
    expect(await statusOf(x.marcusWed.id)).toBe("reviewed");
    const [d] = await inAgency((tx) => tx.select().from(s.clientDisputes).where(eq(s.clientDisputes.id, disputeId)));
    expect(d!.status).toBe("edited");
    const detail = await inAgency((tx) => approvalDetail(tx, d!.requestId, { demoCopies: false, now: clock }));
    expect(detail!.history.map((h) => h.event)).toContain("dispute_edited");
  });
});

describe("withdrawing an approval", () => {
  beforeEach(fresh);

  it("needs a reason; the approved shifts can be changed again and earlier links stop working", async () => {
    const sent = await send();
    const token = await latestToken();
    await decide(token);
    if (!sent.ok) throw new Error("not sent");
    expect(await withdrawApproval(deps, actor, sent.requestId, " ")).toEqual({ ok: false, error: "reason_required" });
    expect(await withdrawApproval(deps, actor, sent.requestId, "Wrong week approved")).toEqual({ ok: true, count: 5 });
    const rows = await inAgency((tx) => listApprovals(tx, period, clock));
    expect(rows.find((r) => r.clientId === IL)).toMatchObject({ state: "send_again", counts: { waiting: 5, approved: 0 } });
    expect(await loadPortal(deps, token)).toMatchObject({ state: "replaced" });
  });
});

describe("reminders", () => {
  beforeEach(fresh);

  it("go out 24 and 48 hours after the request while shifts wait, each once even when two sweeps run together", async () => {
    await send();
    clock = later(23);
    expect(await sweepReminders(deps, actor.agencyId)).toEqual({ sent: 0, failed: 0 });
    clock = later(1);
    const [a, b] = await Promise.all([sweepReminders(deps, actor.agencyId), sweepReminders(deps, actor.agencyId)]);
    expect(a.sent + b.sent).toBe(1);
    expect(await sweepReminders(deps, actor.agencyId)).toEqual({ sent: 0, failed: 0 });
    clock = later(24);
    expect((await sweepReminders(deps, actor.agencyId)).sent).toBe(1);
    clock = later(240);
    expect((await sweepReminders(deps, actor.agencyId)).sent).toBe(0);
    const reminders = await inAgency((tx) => tx.select().from(s.emailMessages).where(eq(s.emailMessages.kind, "approval_reminder")));
    expect(reminders).toHaveLength(2);
    // Each reminder carries its own new link; the first still works until it expires.
    expect((await loadPortal(deps, await latestToken())).state).toBe("active");
  });

  it("stop once the client has acted, and a manual reminder is refused when nothing waits", async () => {
    const sent = await send();
    await decide(await latestToken());
    clock = later(30);
    expect(await sweepReminders(deps, actor.agencyId)).toEqual({ sent: 0, failed: 0 });
    if (!sent.ok) throw new Error("not sent");
    expect(await sendReminder(deps, actor, sent.requestId)).toEqual({ ok: false, error: "nothing_to_approve" });
  });

  it("count again from a new send to the same approver", async () => {
    await send();
    clock = later(25);
    expect((await sweepReminders(deps, actor.agencyId)).sent).toBe(1);
    await send();
    clock = later(2);
    expect((await sweepReminders(deps, actor.agencyId)).sent).toBe(0);
    clock = later(23);
    expect((await sweepReminders(deps, actor.agencyId)).sent).toBe(1);
  });
});

describe("the agency's view of a request", () => {
  beforeEach(fresh);

  it("shows the shifts, the history and every email (the demo copy with its working link only when asked)", async () => {
    const sent = await send();
    if (!sent.ok) throw new Error("not sent");
    await decide(await latestToken());
    const detail = await inAgency((tx) => approvalDetail(tx, sent.requestId, { demoCopies: true, now: clock }));
    expect(detail!.state).toBe("approved");
    expect(detail!.history.map((h) => h.event)).toEqual(expect.arrayContaining(["sent", "decided", "link_opened"]));
    expect(detail!.emails.map((e) => e.kind).sort()).toEqual(["approval_confirmation", "approval_notice", "approval_request"]);
    const request = detail!.emails.find((e) => e.kind === "approval_request")!;
    expect(request.textBody).not.toMatch(TOKEN);
    expect(request.demoCopy!.textBody).toMatch(TOKEN);
    const plain = await inAgency((tx) => approvalDetail(tx, sent.requestId, { demoCopies: false, now: clock }));
    expect(plain!.emails.every((e) => e.demoCopy === null)).toBe(true);
  });
});

describe("another agency", () => {
  beforeEach(fresh);

  it("cannot see or act on this agency's requests, disputes or emails, even by id", async () => {
    const x = await fresh();
    const sent = await send();
    if (!sent.ok) throw new Error("not sent");
    const token = await latestToken();
    await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left early", proposed: { inMinute: 420, outMinute: 900, breakMinutes: 0 } });
    await decide(token);
    const [dispute] = await inAgency((tx) => tx.select().from(s.clientDisputes));

    const [other] = await owner.db.insert(s.agencies).values({ name: "Other agency (test)" }).returning();
    const intruder: Actor = { agencyId: other!.id, userId: "00000000-0000-4000-a000-000000000002", label: "Other agency user", role: "owner" };
    const inOther = <T>(fn: Parameters<typeof app.withAgency<T>>[1]) => app.withAgency(other!.id, fn);
    expect(await inOther((tx) => approvalDetail(tx, sent.requestId, { demoCopies: true, now: clock }))).toBeNull();
    expect(await inOther((tx) => listApprovals(tx, period, clock))).toEqual([]);
    expect(await inOther((tx) => tx.select().from(s.emailMessages))).toEqual([]);
    expect(await inOther((tx) => tx.select().from(s.demoMailbox))).toEqual([]);
    expect(await sendReminder(deps, intruder, sent.requestId)).toEqual({ ok: false, error: "not_found" });
    expect(await withdrawApproval(deps, intruder, sent.requestId, "nope")).toEqual({ ok: false, error: "not_found" });
    expect(await settleDispute(deps, intruder, dispute!.id, "keep", "nope", async () => ({ ok: true }))).toEqual({ ok: false, error: "not_found" });
    expect(await sendApprovalRequest(deps, intruder, { clientId: IL, payPeriodId: period, approverName: "X Y", approverEmail: "x@y.example", locale: "en", agencyLocale: "en" })).toEqual({ ok: false, error: "not_found" });
    // Nothing changed for the agency that owns them.
    expect(await statusOf(x.marcusWed.id)).toBe("disputed");
    const [still] = await inAgency((tx) => tx.select().from(s.clientDisputes).where(eq(s.clientDisputes.id, dispute!.id)));
    expect(still!.status).toBe("open");
  });
});

describe("second opinion on slice (d)", () => {
  let x: Awaited<ReturnType<typeof fresh>>;
  beforeEach(async () => {
    x = await fresh();
  });
  const disputeAndDecide = async (reason = "Left at 3 pm") => {
    const token = await latestToken();
    await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason, proposed: { inMinute: 420, outMinute: 900, breakMinutes: 0 } });
    await decide(token);
    return token;
  };
  const rowState = async () => (await inAgency((tx) => listApprovals(tx, period, clock))).find((r) => r.clientId === IL)!.state;

  it("an open dispute stays on the request page after the approver is changed, and can be settled there", async () => {
    const first = await send();
    if (!first.ok) throw new Error(first.error);
    await disputeAndDecide();
    // The wrong person approved: the agency withdraws and asks someone else.
    await withdrawApproval(deps, actor, first.requestId, "Wrong person approved");
    const sent = await send({ approverName: "Lee Supervisor", approverEmail: "lee@prairie.example" });
    if (!sent.ok) throw new Error(sent.error);
    const detail = await inAgency((tx) => approvalDetail(tx, sent.requestId, { demoCopies: false, now: clock }));
    expect(detail!.disputes.filter((d) => d.status === "open").map((d) => d.timeEntryId)).toEqual([x.marcusWed.id]);
    const disputeId = detail!.disputes[0]!.id;
    expect(await settleDispute(deps, actor, disputeId, "keep", "The clock shows 5 pm.", async () => ({ ok: true }))).toEqual({ ok: true });
    const after = await inAgency((tx) => approvalDetail(tx, sent.requestId, { demoCopies: false, now: clock }));
    expect(after!.history.map((h) => h.event)).toContain("dispute_kept");
  });

  it("withdrawing an approval stops the automatic reminders until the agency sends again", async () => {
    const sent = await send();
    if (!sent.ok) throw new Error(sent.error);
    await decide(await latestToken());
    clock = later(2);
    await withdrawApproval(deps, actor, sent.requestId, "Fixing hours first");
    expect(await rowState()).toBe("send_again");
    clock = later(30);
    expect(await sweepReminders(deps, actor.agencyId)).toEqual({ sent: 0, failed: 0 });
    expect((await send()).ok).toBe(true);
    expect(await rowState()).toBe("waiting");
    clock = later(25);
    expect((await sweepReminders(deps, actor.agencyId)).sent).toBe(1);
  });

  it("after the agency keeps the hours, the request is to send again (the client has not been told)", async () => {
    await send();
    clock = later(60);
    await sweepReminders(deps, actor.agencyId);
    await disputeAndDecide();
    const [d] = await inAgency((tx) => tx.select().from(s.clientDisputes));
    await settleDispute(deps, actor, d!.id, "keep", "The clock shows 5 pm.", async () => ({ ok: true }));
    expect(await rowState()).toBe("send_again");
    expect((await send()).ok).toBe(true);
    expect(await rowState()).toBe("waiting");
  });

  it("a new link is sent only for an expired link, at most three a day, not for a long-expired link, and only when shifts wait", async () => {
    await send();
    const token = await latestToken();
    expect(await requestNewLink(deps, token)).toEqual({ ok: false, error: "link_active" });
    clock = later(14 * 24 + 1);
    for (let i = 0; i < 3; i++) {
      expect(await requestNewLink(deps, token)).toEqual({ ok: true });
      clock = new Date(clock.getTime() + 6 * 60_000);
    }
    expect(await requestNewLink(deps, token)).toEqual({ ok: false, error: "too_soon" });
    clock = later(31 * 24);
    expect(await requestNewLink(deps, token)).toEqual({ ok: false, error: "link_too_old" });
  });

  it("no new link when nothing waits any more", async () => {
    await send();
    const token = await latestToken();
    await decide(token);
    clock = later(14 * 24 + 1);
    expect(await requestNewLink(deps, token)).toEqual({ ok: false, error: "nothing_to_approve" });
  });

  it("the app's role cannot mark an agency as the demo, nor change or remove a sent dispute of a real agency", async () => {
    expect(await databaseError(inAgency((tx) => tx.update(s.agencies).set({ isDemo: false }).where(eq(s.agencies.id, actor.agencyId))))).toMatch(/permission denied/);
    // Its name and contact details can still be kept up to date.
    await inAgency((tx) => tx.update(s.agencies).set({ phone: "(630) 555-0142" }).where(eq(s.agencies.id, actor.agencyId)));
    await send();
    await disputeAndDecide();
    const [d] = await inAgency((tx) => tx.select().from(s.clientDisputes));
    expect(await databaseError(inAgency((tx) => tx.update(s.clientDisputes).set({ reason: "rewritten" }).where(eq(s.clientDisputes.id, d!.id))))).toMatch(/permission denied/);
    const [real] = await owner.db.insert(s.agencies).values({ name: "Real agency (disputes)" }).returning();
    const [c] = await owner.db.insert(s.clients).values({ agencyId: real!.id, name: "C", code: "C" }).returning();
    const [p] = await owner.db.insert(s.payPeriods).values({ agencyId: real!.id, startsOn: "2026-10-05", endsOn: "2026-10-11" }).returning();
    const [e] = await owner.db.insert(s.timeEntries).values({ agencyId: real!.id, payPeriodId: p!.id, workerNameRaw: "W", minutes: 60, status: "disputed" }).returning();
    const [r] = await owner.db.insert(s.approvalRequests).values({ agencyId: real!.id, clientId: c!.id, payPeriodId: p!.id, approverName: "A B", approverEmail: "a@b.example", locale: "en", agencyLocale: "en", cycleStartedAt: clock, createdByLabel: "t" }).returning();
    const [l] = await owner.db.insert(s.approvalLinks).values({ agencyId: real!.id, requestId: r!.id, tokenHash: sha256("t2"), purpose: "request", expiresAt: clock }).returning();
    const [dec] = await owner.db.insert(s.approvalDecisions).values({ agencyId: real!.id, requestId: r!.id, linkId: l!.id, approverEmail: "a@b.example", typedName: "A B", attestation: "x", attestationVersion: "v", locale: "en", snapshotSha256: sha256("s2"), approved: [], disputed: [] }).returning();
    const shift = { entryId: e!.id, workerId: e!.id, workerName: "W", workDate: "2026-10-05", inMinute: null, outMinute: null, breakMinutes: null, minutes: 60 };
    await owner.db.insert(s.clientDisputes).values({ agencyId: real!.id, requestId: r!.id, decisionId: dec!.id, timeEntryId: e!.id, shift, reason: "r", status: "open" });
    expect(await databaseError(app.withAgency(real!.id, (tx) => tx.delete(s.clientDisputes)))).toMatch(/append-only|sent dispute/);
  });

  it("a late sweep sends one reminder for the steps it missed", async () => {
    await send();
    clock = later(60);
    expect((await sweepReminders(deps, actor.agencyId)).sent).toBe(1);
    expect((await sweepReminders(deps, actor.agencyId)).sent).toBe(0);
    const [r] = await inAgency((tx) => tx.select().from(s.approvalRequests));
    expect(r!.remindersSent).toBe(2);
  });

  it("the approval covers what each dispute says: a draft changed after the page was shown refuses it", async () => {
    await send();
    const token = await latestToken();
    await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left at 3 pm", proposed: { inMinute: 420, outMinute: 900, breakMinutes: 0 } });
    const view = await loadPortal(deps, token);
    if (view.state !== "active") throw new Error("inactive");
    await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: "Left at 1 pm", proposed: { inMinute: 420, outMinute: 780, breakMinutes: 0 } });
    expect(await submitDecision(deps, token, { typedName: "Dana Approver", confirmed: true, snapshot: view.snapshot, locale: "en", ipAddress: null, userAgent: null })).toEqual({ ok: false, error: "changed" });
  });

  it("each link's first opening is in the request's history, marked as possibly automatic", async () => {
    const sent = await send();
    if (!sent.ok) throw new Error(sent.error);
    const token = await latestToken();
    await loadPortal(deps, token);
    await loadPortal(deps, token);
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "approval_request"), eq(s.auditEvents.entityId, sent.requestId))));
    expect(events.filter((e) => (e.after as { event: string }).event === "link_opened")).toHaveLength(1);
  });

  it("a link pasted into free text is never stored", async () => {
    await send();
    const token = await latestToken();
    await saveDraftDispute(deps, token, { entryId: x.marcusWed.id, reason: `see https://shiftbook.test/en/approve/${token}`, proposed: null });
    await decide(token, { typedName: `Dana ${token}` });
    const [d] = await inAgency((tx) => tx.select().from(s.clientDisputes));
    expect(d!.reason).not.toContain(token);
    const [dec] = await inAgency((tx) => tx.select().from(s.approvalDecisions));
    expect(dec!.typedName).not.toContain(token);
    const hits = await owner.db.execute<{ hit: number }>(sql`select count(*)::int as hit from audit_events where coalesce(after::text, '') || coalesce(reason, '') like ${`%${token}%`}`);
    expect(hits[0]!.hit).toBe(0);
  });

  it("a failed send is in the request's history", async () => {
    await send();
    transport = () => ({ send: () => Promise.reject(new Error("service down")) });
    const sent = await send({ approverName: "Lee Supervisor", approverEmail: "lee@prairie.example" });
    expect(sent).toMatchObject({ ok: false, error: "send_failed" });
    const events = await inAgency((tx) => tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "approval_request"), eq(s.auditEvents.entityId, sent.requestId!))));
    expect(events.map((e) => (e.after as { event: string }).event)).toContain("send_failed");
  });
});
