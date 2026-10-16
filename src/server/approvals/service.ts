/**
 * Client approval (SPEC §10; plan `.claude/plans/slice-d-client-approval.md`; decisions 0012, 0013).
 *
 * The agency sends a client's approver a link to the client's shifts in a pay period; the approver
 * approves them, or disputes some with a reason; the agency settles each dispute. Every step is
 * audited. Links are bearer secrets: only their SHA-256 is stored and every action checks the link
 * again. Emails are delivered after the transaction that records them commits.
 */
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { auditBy, audit, type AuditInput } from "../audit";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import type { MailTransport, OutgoingMail } from "../mail/transport";
import { lockPeriod, openPeriod, PeriodLockedError, PeriodNotFoundError, periodState } from "../run/period-lock";
import type { Actor } from "../session";
import { settingOn } from "../settings";
import { renderDecisionEmail, renderLinkEmail, type EmailAgency } from "./emails";
import { approvedShift, clientShifts, snapshotSha256, summarize, unmatchedOnClientTimesheets, type ClientShift } from "./scope";
import { hashApprovalToken, newApprovalToken, redactApprovalLinks } from "./token";

export type ApprovalError =
  | "not_found"
  | "period_locked"
  | "settings_missing"
  | "needs_review"
  | "nothing_to_approve"
  | "name_required"
  | "invalid_email"
  | "invalid_locale"
  | "send_failed"
  | "not_open"
  | "dispute_not_open"
  | "no_proposal"
  | "reply_required"
  | "reason_required"
  | "edit_refused"
  | "link_invalid"
  | "link_expired"
  | "link_replaced"
  | "link_active"
  | "link_too_old"
  | "too_soon"
  | "reason_too_long"
  | "not_waiting"
  | "invalid_times"
  | "confirm_required"
  | "changed";

export type ApprovalFailure = { ok: false; error: ApprovalError; count?: number; detail?: string };

export interface ApprovalDeps {
  /** The plain connection: used only for the one cross-agency link lookup (decision 0013). */
  db: Db;
  withAgency: <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  /** Where the agency's mail goes (the demo mailbox in demo mode and tests). */
  mailTransport: (agencyId: string) => MailTransport;
  /** The app's address for links in emails, e.g. "https://app.example" (no trailing slash). */
  baseUrl: string;
  now?: () => Date;
}

/** The version of the confirmation text the approver ticks (kept with each decision). */
export const ATTESTATION_VERSION = "2026-10-16";
/** "Email me a new link" from the same link: at most once per this many minutes (decision 0013). */
export const RENEWAL_WAIT_MINUTES = 5;
/** …and at most this many new links per request in 24 hours, so a leaked link cannot flood the approver. */
export const RENEWALS_PER_DAY = 3;
/** A link that expired longer ago than this cannot ask for a new one (contact the agency instead). */
export const RENEWAL_MAX_DAYS_AFTER_EXPIRY = 30;
/** The longest free text kept from a client (a dispute's reason). */
const REASON_MAX = 2000;

const MESSAGES = { en, es } as const;
const LOCALES = ["en", "es"] as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const isLocale = (v: unknown): v is s.ApprovalLocale => (LOCALES as readonly unknown[]).includes(v);
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const nowOf = (deps: ApprovalDeps) => (deps.now ? deps.now() : new Date());

interface Settings {
  linkDays: number;
  reminderHours: number[];
  timeZone: string;
}

/** The agency's approval settings in force today (effective-dated data, never literals). */
async function settingsOf(tx: Tx, now: Date): Promise<Settings | null> {
  const today = now.toISOString().slice(0, 10);
  const linkDays = await settingOn<unknown>(tx, "approval_link_days", today);
  const reminderHours = await settingOn<unknown>(tx, "approval_reminder_hours", today);
  const timeZone = await settingOn<unknown>(tx, "time_zone", today);
  if (typeof linkDays !== "number" || !Number.isInteger(linkDays) || linkDays < 1 || linkDays > 90) return null;
  if (!Array.isArray(reminderHours) || !reminderHours.every((h, i) => typeof h === "number" && Number.isInteger(h) && h > 0 && (i === 0 || h > (reminderHours[i - 1] as number)))) return null;
  return { linkDays, reminderHours: reminderHours as number[], timeZone: typeof timeZone === "string" ? timeZone : "UTC" };
}

async function agencyOf(tx: Tx, settings: Pick<Settings, "timeZone">): Promise<EmailAgency & { id: string }> {
  const [a] = await tx.select().from(s.agencies);
  if (!a) throw new Error("agency not visible");
  return { id: a.id, name: a.name, phone: a.phone, email: a.email, timeZone: settings.timeZone };
}

const approvalUrl = (baseUrl: string, locale: s.ApprovalLocale, token: string) => `${baseUrl}/${locale}/approve/${token}`;

async function issueLink(tx: Tx, request: s.ApprovalRequestRow, purpose: "request" | "reminder" | "renewal", now: Date, linkDays: number) {
  const { token, hash } = newApprovalToken();
  const expiresAt = new Date(now.getTime() + linkDays * DAY_MS);
  const [link] = await tx.insert(s.approvalLinks).values({ agencyId: request.agencyId, requestId: request.id, tokenHash: hash, purpose, expiresAt, createdAt: now }).returning({ id: s.approvalLinks.id });
  return { token, linkId: link!.id, expiresAt };
}

interface Pending {
  agencyId: string;
  mail: OutgoingMail;
  /** A link that only this email carries: revoked if the email cannot be sent. */
  linkId: string | null;
}

async function queueEmail(
  tx: Tx,
  agency: EmailAgency & { id: string },
  requestId: string,
  kind: s.EmailKind,
  to: { email: string; name: string | null },
  rendered: { subject: string; text: string; html: string },
  now: Date,
): Promise<OutgoingMail> {
  const [row] = await tx
    .insert(s.emailMessages)
    .values({ agencyId: agency.id, requestId, kind, toEmail: to.email, toName: to.name, subject: rendered.subject, textBody: redactApprovalLinks(rendered.text), status: "sending", createdAt: now })
    .returning({ id: s.emailMessages.id });
  return { id: row!.id, fromName: agency.name, replyTo: agency.email, to, subject: rendered.subject, text: rendered.text, html: rendered.html };
}

/** Sends after commit; records each outcome. Returns the ids of the emails that failed. */
async function deliver(deps: ApprovalDeps, pending: Pending[]): Promise<string[]> {
  const failed: string[] = [];
  for (const p of pending) {
    try {
      const { providerId } = await deps.mailTransport(p.agencyId).send(p.mail);
      await deps.withAgency(p.agencyId, (tx) => tx.update(s.emailMessages).set({ status: "sent", providerId, sentAt: nowOf(deps) }).where(eq(s.emailMessages.id, p.mail.id)));
    } catch (error) {
      failed.push(p.mail.id);
      const message = redactApprovalLinks(error instanceof Error ? error.message : String(error));
      await deps.withAgency(p.agencyId, async (tx) => {
        await tx.update(s.emailMessages).set({ status: "failed", error: message }).where(eq(s.emailMessages.id, p.mail.id));
        if (p.linkId) await tx.update(s.approvalLinks).set({ revokedAt: nowOf(deps) }).where(eq(s.approvalLinks.id, p.linkId));
      });
    }
  }
  return failed;
}

async function periodOf(tx: Tx, payPeriodId: string) {
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  return period ?? null;
}

async function clientOf(tx: Tx, clientId: string) {
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, clientId));
  return client ?? null;
}

/** Locks the period and checks it is still open; maps the period errors to refusals. */
async function openOr(tx: Tx, payPeriodId: string): Promise<ApprovalFailure | s.PayPeriodRow> {
  try {
    return await openPeriod(tx, payPeriodId);
  } catch (error) {
    if (error instanceof PeriodLockedError) return { ok: false, error: "period_locked" };
    if (error instanceof PeriodNotFoundError) return { ok: false, error: "not_found" };
    throw error;
  }
}
const failed = (v: unknown): v is ApprovalFailure => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

const requestEvent = (requestId: string, event: string, details: Record<string, unknown> = {}, action: AuditInput["action"] = "update", reason?: string): AuditInput => ({
  action,
  entityType: "approval_request",
  entityId: requestId,
  after: { event, ...details },
  reason: reason ?? null,
});

/** Free text kept from anyone: a pasted approval link is never stored (decision 0013). */
const clean = (text: string) => redactApprovalLinks(text.trim());

/** The open request for a client and period (where the agency now works on it), if any. */
async function openRequestFor(tx: Tx, clientId: string, payPeriodId: string) {
  const [open] = await tx.select().from(s.approvalRequests).where(and(eq(s.approvalRequests.clientId, clientId), eq(s.approvalRequests.payPeriodId, payPeriodId), eq(s.approvalRequests.status, "open")));
  return open ?? null;
}

/**
 * Shifts need the client's approval again and the client has not been asked: the request is to send
 * again, and automatic reminders wait until the agency sends it (second opinion on slice d).
 */
async function markNeedsSending(tx: Tx, clientId: string, payPeriodId: string) {
  await tx.update(s.approvalRequests).set({ needsSending: true }).where(and(eq(s.approvalRequests.clientId, clientId), eq(s.approvalRequests.payPeriodId, payPeriodId), eq(s.approvalRequests.status, "open")));
}

// ---------------------------------------------------------------------------------------------
// The agency's side
// ---------------------------------------------------------------------------------------------

export interface SendInput {
  clientId: string;
  payPeriodId: string;
  approverName: string;
  approverEmail: string;
  locale: string;
  /** The sender's own language (for the notices the agency receives). */
  agencyLocale: string;
}

/**
 * Sends (or sends again) a client's shifts for approval. Refused while any of the client's shifts
 * in the period still needs review. The same approver keeps the request (a new link, reminders
 * counted again); a different approver replaces it and every earlier link stops working.
 */
export async function sendApprovalRequest(deps: ApprovalDeps, actor: Actor, input: SendInput): Promise<{ ok: true; requestId: string } | (ApprovalFailure & { requestId?: string })> {
  const name = input.approverName.trim();
  const email = input.approverEmail.trim();
  if (name.length < 2) return { ok: false, error: "name_required" };
  if (!EMAIL.test(email)) return { ok: false, error: "invalid_email" };
  if (!isLocale(input.locale) || !isLocale(input.agencyLocale)) return { ok: false, error: "invalid_locale" };
  const locale = input.locale;
  const agencyLocale = input.agencyLocale;
  const now = nowOf(deps);

  const result = await deps.withAgency(actor.agencyId, async (tx) => {
    const period = await openOr(tx, input.payPeriodId);
    if (failed(period)) return period;
    const client = await clientOf(tx, input.clientId);
    if (!client) return { ok: false as const, error: "not_found" as const };
    const settings = await settingsOf(tx, now);
    if (!settings) return { ok: false as const, error: "settings_missing" as const };

    const shifts = await clientShifts(tx, client.id, period.id);
    const needsReview = shifts.filter((x) => x.state === "needs_review").length + (await unmatchedOnClientTimesheets(tx, client.id, period.id));
    if (needsReview > 0) return { ok: false as const, error: "needs_review" as const, count: needsReview };
    const waiting = shifts.filter((x) => x.state === "waiting");
    if (waiting.length === 0) return { ok: false as const, error: "nothing_to_approve" as const };

    const events: AuditInput[] = [];
    const [existing] = await tx.select().from(s.approvalRequests).where(and(eq(s.approvalRequests.clientId, client.id), eq(s.approvalRequests.payPeriodId, period.id), eq(s.approvalRequests.status, "open"))).for("update");
    let request: s.ApprovalRequestRow;
    if (existing && existing.approverEmail.toLowerCase() === email.toLowerCase()) {
      [request] = (await tx
        .update(s.approvalRequests)
        .set({ approverName: name, approverEmail: email, locale, agencyLocale, cycleStartedAt: now, remindersSent: 0, needsSending: false })
        .where(eq(s.approvalRequests.id, existing.id))
        .returning()) as [s.ApprovalRequestRow];
      events.push(requestEvent(request.id, "sent_again", { approverName: name, approverEmail: email, locale }));
    } else {
      if (existing) {
        await tx.update(s.approvalRequests).set({ status: "replaced" }).where(eq(s.approvalRequests.id, existing.id));
        await tx.update(s.approvalLinks).set({ revokedAt: now }).where(and(eq(s.approvalLinks.requestId, existing.id), isNull(s.approvalLinks.revokedAt)));
        events.push(requestEvent(existing.id, "approver_replaced", { approverEmail: existing.approverEmail, newApproverEmail: email }));
      }
      [request] = (await tx
        .insert(s.approvalRequests)
        .values({ agencyId: actor.agencyId, clientId: client.id, payPeriodId: period.id, approverName: name, approverEmail: email, locale, agencyLocale, cycleStartedAt: now, createdAt: now, createdBy: actor.userId, createdByLabel: actor.label })
        .returning()) as [s.ApprovalRequestRow];
      events.push(requestEvent(request.id, "sent", { clientId: client.id, payPeriodId: period.id, approverName: name, approverEmail: email, locale }, "create"));
    }

    const agency = await agencyOf(tx, settings);
    const link = await issueLink(tx, request, "request", now, settings.linkDays);
    const rendered = renderLinkEmail({
      kind: "approval_request",
      locale,
      agency,
      clientName: client.name,
      period,
      approverName: name,
      summary: summarize(waiting),
      link: approvalUrl(deps.baseUrl, locale, link.token),
      expiresAt: link.expiresAt,
    });
    const mail = await queueEmail(tx, agency, request.id, "approval_request", { email, name }, rendered, now);
    await audit(tx, actor, events);
    return { ok: true as const, requestId: request.id, pending: [{ agencyId: actor.agencyId, mail, linkId: link.linkId }] };
  });
  if (!result.ok) return result;
  const failures = await deliver(deps, result.pending);
  if (failures.length > 0) {
    await deps.withAgency(actor.agencyId, (tx) => audit(tx, actor, [requestEvent(result.requestId, "send_failed", { approverEmail: email, emailId: failures[0] })]));
    return { ok: false, error: "send_failed", requestId: result.requestId };
  }
  return { ok: true, requestId: result.requestId };
}

/** A reminder now (Harvest, Bullhorn One: only to a client that still has shifts waiting). */
export async function sendReminder(deps: ApprovalDeps, actor: Actor, requestId: string): Promise<{ ok: true } | ApprovalFailure> {
  const now = nowOf(deps);
  const result = await deps.withAgency(actor.agencyId, async (tx) => {
    const [request] = await tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, requestId));
    if (!request) return { ok: false as const, error: "not_found" as const };
    if (request.status !== "open") return { ok: false as const, error: "not_open" as const };
    const period = await openOr(tx, request.payPeriodId);
    if (failed(period)) return period;
    const settings = await settingsOf(tx, now);
    if (!settings) return { ok: false as const, error: "settings_missing" as const };
    const pending = await remind(tx, deps, request, period, settings, now, { automatic: false, actor });
    if (!pending) return { ok: false as const, error: "nothing_to_approve" as const };
    return { ok: true as const, pending: [pending] };
  });
  if (!result.ok) return result;
  const failures = await deliver(deps, result.pending);
  return failures.length > 0 ? { ok: false, error: "send_failed" } : { ok: true };
}

/** One reminder for a request (a new link and an email); null when no shift is waiting. */
async function remind(
  tx: Tx,
  deps: ApprovalDeps,
  request: s.ApprovalRequestRow,
  period: s.PayPeriodRow,
  settings: Settings,
  now: Date,
  how: { automatic: true; number: number } | { automatic: false; actor: Actor },
): Promise<Pending | null> {
  const client = await clientOf(tx, request.clientId);
  if (!client) return null;
  const waiting = (await clientShifts(tx, client.id, period.id)).filter((x) => x.state === "waiting");
  if (waiting.length === 0) return null;
  const agency = await agencyOf(tx, settings);
  const link = await issueLink(tx, request, "reminder", now, settings.linkDays);
  const rendered = renderLinkEmail({
    kind: "approval_reminder",
    locale: request.locale,
    agency,
    clientName: client.name,
    period,
    approverName: request.approverName,
    summary: summarize(waiting),
    link: approvalUrl(deps.baseUrl, request.locale, link.token),
    expiresAt: link.expiresAt,
  });
  const mail = await queueEmail(tx, agency, request.id, "approval_reminder", { email: request.approverEmail, name: request.approverName }, rendered, now);
  const event = requestEvent(request.id, "reminder_sent", { automatic: how.automatic, number: how.automatic ? how.number : null });
  if (how.automatic) await auditBy(tx, { agencyId: request.agencyId, userId: null, label: "Shiftbook (automatic reminder)" }, [event]);
  else await audit(tx, how.actor, [event]);
  return { agencyId: request.agencyId, mail, linkId: link.linkId };
}

/**
 * Sends the automatic reminders that are due (the agency's `approval_reminder_hours` after the
 * latest send), each once: rows are claimed with SKIP LOCKED and the count moves in the same
 * transaction, so two sweeps at once never send one reminder twice.
 */
export async function sweepReminders(deps: ApprovalDeps, agencyId: string): Promise<{ sent: number; failed: number }> {
  const now = nowOf(deps);
  const pending = await deps.withAgency(agencyId, async (tx) => {
    const settings = await settingsOf(tx, now);
    if (!settings) return [];
    // NO KEY UPDATE: enough to claim the row, without blocking a client's action that refers to it.
    const open = await tx
      .select()
      .from(s.approvalRequests)
      .where(and(eq(s.approvalRequests.status, "open"), eq(s.approvalRequests.needsSending, false)))
      .for("no key update", { skipLocked: true });
    const out: Pending[] = [];
    for (const request of open) {
      // Every step whose time has come; a late sweep sends one reminder for all it missed.
      const due = settings.reminderHours.filter((h) => now.getTime() >= request.cycleStartedAt.getTime() + h * HOUR_MS).length;
      if (due <= request.remindersSent) continue;
      if ((await periodState(tx, request.payPeriodId)) !== "open") continue;
      const period = await periodOf(tx, request.payPeriodId);
      if (!period) continue;
      // Counted even when nothing waits, so a finished request is not looked at again for these steps.
      await tx.update(s.approvalRequests).set({ remindersSent: due }).where(eq(s.approvalRequests.id, request.id));
      const p = await remind(tx, deps, request, period, settings, now, { automatic: true, number: due });
      if (p) out.push(p);
    }
    return out;
  });
  const failures = await deliver(deps, pending);
  return { sent: pending.length - failures.length, failed: failures.length };
}

/** Every agency with open requests (ids only), for the scheduled sweep. */
export async function agenciesWithOpenRequests(db: Db): Promise<string[]> {
  const rows = await db.execute<{ agency_id: string }>(sql`select agency_id from approval_agencies_with_open_requests()`);
  return rows.map((r) => r.agency_id);
}

/**
 * Withdraws the client's approval of the period (Harvest "withdraw approval"): the approved shifts
 * can be changed again and need approval again; every earlier link stops working.
 */
export async function withdrawApproval(deps: ApprovalDeps, actor: Actor, requestId: string, rawReason: string): Promise<{ ok: true; count: number } | ApprovalFailure> {
  const reason = clean(rawReason);
  if (reason === "") return { ok: false, error: "reason_required" };
  const now = nowOf(deps);
  return deps.withAgency(actor.agencyId, async (tx) => {
    const [request] = await tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, requestId));
    if (!request) return { ok: false as const, error: "not_found" as const };
    const period = await openOr(tx, request.payPeriodId);
    if (failed(period)) return period;
    const approved = (await clientShifts(tx, request.clientId, period.id)).filter((x) => x.state === "approved");
    const ids = approved.map((x) => x.entryId);
    if (ids.length > 0) await tx.update(s.timeEntries).set({ status: "reviewed", updatedAt: now }).where(and(inArray(s.timeEntries.id, ids), eq(s.timeEntries.status, "client_approved")));
    const requests = await tx.select({ id: s.approvalRequests.id }).from(s.approvalRequests).where(and(eq(s.approvalRequests.clientId, request.clientId), eq(s.approvalRequests.payPeriodId, request.payPeriodId)));
    await tx
      .update(s.approvalLinks)
      .set({ revokedAt: now })
      .where(and(inArray(s.approvalLinks.requestId, requests.map((r) => r.id)), isNull(s.approvalLinks.revokedAt)));
    // The agency asks again when its fix is done: no automatic reminder before.
    await markNeedsSending(tx, request.clientId, request.payPeriodId);
    const current = (await openRequestFor(tx, request.clientId, request.payPeriodId)) ?? request;
    await audit(tx, actor, [
      requestEvent(current.id, "approval_withdrawn", { shifts: ids.length }, "update", reason),
      ...ids.map((id) => ({ action: "update" as const, entityType: "time_entry", entityId: id, before: { status: "client_approved" }, after: { status: "reviewed" }, reason: `client approval withdrawn: ${reason}` })),
    ]);
    return { ok: true as const, count: ids.length };
  });
}

/**
 * Settles a dispute: "accept" applies the client's own times (through the same checks as any edit,
 * with the client's reason) and counts as the client's approval of the shift; "keep" leaves the hours
 * with a reply the client sees, and the shift needs approval again.
 */
export async function settleDispute(
  deps: ApprovalDeps,
  actor: Actor,
  disputeId: string,
  action: "accept" | "keep",
  reply: string,
  edit: (tx: Tx, entryId: string, change: { inMinute: number; outMinute: number; breakMinutes: number }, note: string) => Promise<{ ok: true } | { ok: false; error: string }>,
): Promise<{ ok: true } | ApprovalFailure> {
  const now = nowOf(deps);
  return deps.withAgency(actor.agencyId, async (tx) => {
    const [dispute] = await tx.select().from(s.clientDisputes).where(eq(s.clientDisputes.id, disputeId));
    if (!dispute) return { ok: false as const, error: "not_found" as const };
    const [request] = await tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, dispute.requestId));
    const period = await openOr(tx, request!.payPeriodId);
    if (failed(period)) return period;
    const [current] = await tx.select().from(s.clientDisputes).where(eq(s.clientDisputes.id, disputeId));
    if (current!.status !== "open") return { ok: false as const, error: "dispute_not_open" as const };
    // Recorded on the request the agency works on now (the approver may have changed since the dispute).
    const onRequest = (await openRequestFor(tx, request!.clientId, request!.payPeriodId))?.id ?? dispute.requestId;

    if (action === "accept") {
      if (dispute.proposedInMinute === null || dispute.proposedOutMinute === null || dispute.proposedBreakMinutes === null) return { ok: false as const, error: "no_proposal" as const };
      const result = await edit(tx, dispute.timeEntryId, { inMinute: dispute.proposedInMinute, outMinute: dispute.proposedOutMinute, breakMinutes: dispute.proposedBreakMinutes }, `client dispute: ${dispute.reason}`);
      if (!result.ok) return { ok: false as const, error: "edit_refused" as const, detail: result.error };
      // The client proposed these times, so the shift counts as approved by the client.
      await tx.update(s.clientDisputes).set({ status: "accepted", resolvedAt: now, resolvedBy: actor.userId, resolvedByLabel: actor.label }).where(eq(s.clientDisputes.id, disputeId));
      await tx.update(s.timeEntries).set({ status: "client_approved", updatedAt: now }).where(eq(s.timeEntries.id, dispute.timeEntryId));
      await audit(tx, actor, [
        requestEvent(onRequest, "dispute_accepted", { disputeId, entryId: dispute.timeEntryId }),
        { action: "update", entityType: "time_entry", entityId: dispute.timeEntryId, before: { status: "reviewed" }, after: { status: "client_approved" }, reason: "the client's own times, accepted" },
      ]);
      return { ok: true as const };
    }

    const text = clean(reply);
    if (text === "") return { ok: false as const, error: "reply_required" as const };
    await tx.update(s.clientDisputes).set({ status: "kept", reply: text, resolvedAt: now, resolvedBy: actor.userId, resolvedByLabel: actor.label }).where(eq(s.clientDisputes.id, disputeId));
    await tx.update(s.timeEntries).set({ status: "reviewed", updatedAt: now }).where(and(eq(s.timeEntries.id, dispute.timeEntryId), eq(s.timeEntries.status, "disputed")));
    await markNeedsSending(tx, request!.clientId, request!.payPeriodId);
    await audit(tx, actor, [
      requestEvent(onRequest, "dispute_kept", { disputeId, entryId: dispute.timeEntryId }, "update", text),
      { action: "update", entityType: "time_entry", entityId: dispute.timeEntryId, before: { status: "disputed" }, after: { status: "reviewed" }, reason: `hours kept after a client dispute: ${text}` },
    ]);
    return { ok: true as const };
  });
}

/**
 * Called by Review hours when a person changes or sets aside a disputed shift: the change settles the
 * dispute ("edited"), and the shift needs the client's approval again.
 */
export async function settleDisputesByEdit(tx: Tx, actor: Actor, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  const settled = await tx
    .update(s.clientDisputes)
    .set({ status: "edited", resolvedAt: new Date(), resolvedBy: actor.userId, resolvedByLabel: actor.label })
    .where(and(inArray(s.clientDisputes.timeEntryId, entryIds), eq(s.clientDisputes.status, "open")))
    .returning({ id: s.clientDisputes.id, requestId: s.clientDisputes.requestId, entryId: s.clientDisputes.timeEntryId });
  const events: AuditInput[] = [];
  for (const d of settled) {
    const [request] = await tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, d.requestId));
    await markNeedsSending(tx, request!.clientId, request!.payPeriodId);
    const onRequest = (await openRequestFor(tx, request!.clientId, request!.payPeriodId))?.id ?? d.requestId;
    events.push(requestEvent(onRequest, "dispute_edited", { disputeId: d.id, entryId: d.entryId }));
  }
  await audit(tx, actor, events);
}

// ---------------------------------------------------------------------------------------------
// The client's side (by link)
// ---------------------------------------------------------------------------------------------

export interface PortalShift extends s.ApprovedShift {
  state: "waiting" | "approved" | "disputed";
  /** The client's open dispute on this shift. */
  dispute: { reason: string; proposed: { inMinute: number; outMinute: number; breakMinutes: number } | null } | null;
  /** The agency kept these hours after an earlier dispute, with this reply. */
  keptReply: string | null;
  /** The approver's unsent dispute (saved on the page). */
  draft: { reason: string; proposed: { inMinute: number; outMinute: number; breakMinutes: number } | null } | null;
}

export interface PortalAgency {
  name: string;
  phone: string | null;
  email: string | null;
}

export type PortalView =
  | { state: "invalid" }
  | { state: "expired"; agency: PortalAgency; canRenew: boolean }
  | { state: "replaced"; agency: PortalAgency }
  | {
      state: "active" | "closed";
      agency: PortalAgency;
      clientName: string;
      period: { startsOn: string; endsOn: string };
      approver: { name: string; email: string };
      locale: s.ApprovalLocale;
      expiresAt: Date;
      shifts: PortalShift[];
      snapshot: string;
      decisions: { typedName: string; decidedAt: Date; approved: number; disputed: number }[];
    };

type LinkContext = { agencyId: string; link: s.ApprovalLinkRow; request: s.ApprovalRequestRow };

/** Hash → (link, agency) through the one cross-agency function, then the rest inside the agency's fence. */
async function resolveLink(deps: ApprovalDeps, token: string): Promise<{ linkId: string; agencyId: string } | null> {
  const hash = hashApprovalToken(token);
  if (!hash) return null;
  const rows = await deps.db.execute<{ link_id: string; agency_id: string }>(sql`select link_id, agency_id from approval_link_lookup(${hash})`);
  const row = rows[0];
  return row ? { linkId: row.link_id, agencyId: row.agency_id } : null;
}

async function linkContext(tx: Tx, agencyId: string, linkId: string): Promise<LinkContext | null> {
  const [link] = await tx.select().from(s.approvalLinks).where(eq(s.approvalLinks.id, linkId));
  if (!link) return null;
  const [request] = await tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, link.requestId));
  return request ? { agencyId, link, request } : null;
}

type LinkState = "active" | "expired" | "replaced";
const linkState = (c: LinkContext, now: Date): LinkState =>
  c.link.revokedAt !== null || c.request.status !== "open" ? "replaced" : c.link.expiresAt.getTime() <= now.getTime() ? "expired" : "active";

const portalAgency = (a: { name: string; phone: string | null; email: string | null }): PortalAgency => ({ name: a.name, phone: a.phone, email: a.email });

const proposalOf = (d: { proposedInMinute: number | null; proposedOutMinute: number | null; proposedBreakMinutes: number | null }) =>
  d.proposedInMinute !== null && d.proposedOutMinute !== null && d.proposedBreakMinutes !== null ? { inMinute: d.proposedInMinute, outMinute: d.proposedOutMinute, breakMinutes: d.proposedBreakMinutes } : null;

/** The shifts as the client's page shows them, with disputes, replies and drafts, and the snapshot hash. */
async function portalShifts(tx: Tx, request: s.ApprovalRequestRow) {
  const shifts = (await clientShifts(tx, request.clientId, request.payPeriodId)).filter((x): x is ClientShift & { state: PortalShift["state"] } => x.state === "waiting" || x.state === "approved" || x.state === "disputed");
  const ids = shifts.map((x) => x.entryId);
  const disputes = ids.length > 0 ? await tx.select().from(s.clientDisputes).where(and(inArray(s.clientDisputes.timeEntryId, ids), inArray(s.clientDisputes.status, ["open", "kept"]))).orderBy(desc(s.clientDisputes.createdAt)) : [];
  const drafts = await tx.select().from(s.clientDisputes).where(and(eq(s.clientDisputes.requestId, request.id), eq(s.clientDisputes.status, "draft")));
  const waitingIds = new Set(shifts.filter((x) => x.state === "waiting").map((x) => x.entryId));
  const validDrafts = drafts.filter((d) => waitingIds.has(d.timeEntryId));
  const view: PortalShift[] = shifts.map((x) => {
    const open = disputes.find((d) => d.timeEntryId === x.entryId && d.status === "open");
    const kept = x.state === "waiting" ? disputes.find((d) => d.timeEntryId === x.entryId && d.status === "kept") : undefined;
    const draft = validDrafts.find((d) => d.timeEntryId === x.entryId);
    return {
      ...approvedShift(x),
      state: x.state,
      dispute: open ? { reason: open.reason, proposed: proposalOf(open) } : null,
      keptReply: kept?.reply ?? null,
      draft: draft ? { reason: draft.reason, proposed: proposalOf(draft) } : null,
    };
  });
  const waiting = shifts.filter((x) => x.state === "waiting");
  return { view, waiting, drafts: validDrafts, snapshot: snapshotSha256(waiting, validDrafts.map((d) => ({ entryId: d.timeEntryId, reason: d.reason, proposed: proposalOf(d) }))) };
}

/** What the page shows for a link. Opening only reads (and notes the first opening of the link). */
export async function loadPortal(deps: ApprovalDeps, token: string): Promise<PortalView> {
  const found = await resolveLink(deps, token);
  if (!found) return { state: "invalid" };
  const now = nowOf(deps);
  return deps.withAgency(found.agencyId, async (tx) => {
    const c = await linkContext(tx, found.agencyId, found.linkId);
    if (!c) return { state: "invalid" as const };
    const [agency] = await tx.select().from(s.agencies);
    const who = portalAgency(agency!);
    const state = linkState(c, now);
    if (state === "replaced") return { state: "replaced" as const, agency: who };
    const closed = (await periodState(tx, c.request.payPeriodId)) !== "open";
    if (state === "expired") return { state: "expired" as const, agency: who, canRenew: !closed };
    if (c.link.firstOpenedAt === null) {
      const first = await tx.update(s.approvalLinks).set({ firstOpenedAt: now }).where(and(eq(s.approvalLinks.id, c.link.id), isNull(s.approvalLinks.firstOpenedAt))).returning({ id: s.approvalLinks.id });
      // Mail systems open links on their own, so an opening is never taken as the approver's (decision 0013).
      if (first.length > 0) await auditBy(tx, { agencyId: c.agencyId, userId: null, label: "Link opened (may be an automatic link check)" }, [requestEvent(c.request.id, "link_opened", { linkId: c.link.id, purpose: c.link.purpose })]);
    }
    const client = await clientOf(tx, c.request.clientId);
    const period = await periodOf(tx, c.request.payPeriodId);
    const { view, snapshot } = await portalShifts(tx, c.request);
    const decisions = await tx.select().from(s.approvalDecisions).where(eq(s.approvalDecisions.requestId, c.request.id)).orderBy(desc(s.approvalDecisions.decidedAt));
    return {
      state: closed ? ("closed" as const) : ("active" as const),
      agency: who,
      clientName: client!.name,
      period: { startsOn: period!.startsOn, endsOn: period!.endsOn },
      approver: { name: c.request.approverName, email: c.request.approverEmail },
      locale: c.request.locale,
      expiresAt: c.link.expiresAt,
      shifts: view,
      snapshot,
      decisions: decisions.map((d) => ({ typedName: d.typedName, decidedAt: d.decidedAt, approved: d.approved.length, disputed: d.disputed.length })),
    };
  });
}

/** Runs a client action on an active link, under the period's lock. */
async function withActiveLink<T>(deps: ApprovalDeps, token: string, fn: (tx: Tx, c: LinkContext, now: Date) => Promise<T | ApprovalFailure>): Promise<T | ApprovalFailure> {
  const found = await resolveLink(deps, token);
  if (!found) return { ok: false, error: "link_invalid" };
  const now = nowOf(deps);
  return deps.withAgency(found.agencyId, async (tx) => {
    const first = await linkContext(tx, found.agencyId, found.linkId);
    if (!first) return { ok: false as const, error: "link_invalid" as const };
    await lockPeriod(tx, first.request.payPeriodId);
    // Read again under the lock.
    const c = (await linkContext(tx, found.agencyId, found.linkId))!;
    const state = linkState(c, now);
    if (state === "replaced") return { ok: false as const, error: "link_replaced" as const };
    if (state === "expired") return { ok: false as const, error: "link_expired" as const };
    if ((await periodState(tx, c.request.payPeriodId)) !== "open") return { ok: false as const, error: "period_locked" as const };
    return fn(tx, c, now);
  });
}

const clientLabel = (name: string, email: string) => `${name} <${email}> (client, by link)`;

export interface ProposedTimes {
  inMinute: number;
  outMinute: number;
  breakMinutes: number;
}

/** The same rules as an edit in Review hours: a start, a later end the same day, a shorter break. */
export function validProposal(p: ProposedTimes): boolean {
  const whole = (n: number) => Number.isInteger(n) && n >= 0;
  return whole(p.inMinute) && whole(p.outMinute) && whole(p.breakMinutes) && p.inMinute < 1440 && p.outMinute > p.inMinute && p.outMinute <= 1440 && p.breakMinutes < p.outMinute - p.inMinute;
}

/** Saves (or replaces) the approver's unsent dispute of one waiting shift. */
export async function saveDraftDispute(deps: ApprovalDeps, token: string, input: { entryId: string; reason: string; proposed: ProposedTimes | null }): Promise<{ ok: true } | ApprovalFailure> {
  const reason = clean(input.reason);
  if (reason === "") return { ok: false, error: "reason_required" };
  if (reason.length > REASON_MAX) return { ok: false, error: "reason_too_long" };
  if (input.proposed && !validProposal(input.proposed)) return { ok: false, error: "invalid_times" };
  return withActiveLink(deps, token, async (tx, c, now) => {
    const shift = (await clientShifts(tx, c.request.clientId, c.request.payPeriodId)).find((x) => x.entryId === input.entryId);
    if (!shift || shift.state !== "waiting") return { ok: false as const, error: "not_waiting" as const };
    await tx.delete(s.clientDisputes).where(and(eq(s.clientDisputes.requestId, c.request.id), eq(s.clientDisputes.timeEntryId, shift.entryId), eq(s.clientDisputes.status, "draft")));
    await tx.insert(s.clientDisputes).values({
      agencyId: c.agencyId,
      requestId: c.request.id,
      timeEntryId: shift.entryId,
      shift: approvedShift(shift),
      proposedInMinute: input.proposed?.inMinute ?? null,
      proposedOutMinute: input.proposed?.outMinute ?? null,
      proposedBreakMinutes: input.proposed?.breakMinutes ?? null,
      reason,
      status: "draft",
      createdAt: now,
    });
    return { ok: true as const };
  });
}

export async function removeDraftDispute(deps: ApprovalDeps, token: string, entryId: string): Promise<{ ok: true } | ApprovalFailure> {
  return withActiveLink(deps, token, async (tx, c) => {
    await tx.delete(s.clientDisputes).where(and(eq(s.clientDisputes.requestId, c.request.id), eq(s.clientDisputes.timeEntryId, entryId), eq(s.clientDisputes.status, "draft")));
    return { ok: true as const };
  });
}

export interface DecisionInput {
  typedName: string;
  confirmed: boolean;
  /** The snapshot the page showed (refused when the shifts changed since). */
  snapshot: string;
  locale: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * The approver's decision: every waiting shift without a dispute is approved, every drafted dispute is
 * sent — at once, and only if the shifts are exactly as shown. Final on the page (Bullhorn, Beeline).
 */
export async function submitDecision(deps: ApprovalDeps, token: string, input: DecisionInput): Promise<{ ok: true; approved: number; disputed: number } | ApprovalFailure> {
  const typedName = clean(input.typedName);
  if (typedName.length < 2 || typedName.length > 200) return { ok: false, error: "name_required" };
  if (!input.confirmed) return { ok: false, error: "confirm_required" };
  const locale = isLocale(input.locale) ? input.locale : "en";
  const result = await withActiveLink(deps, token, async (tx, c, now) => {
    const { waiting, drafts, snapshot } = await portalShifts(tx, c.request);
    if (waiting.length === 0) return { ok: false as const, error: "nothing_to_approve" as const };
    if (snapshot !== input.snapshot) return { ok: false as const, error: "changed" as const };
    const settings = await settingsOf(tx, now);
    if (!settings) return { ok: false as const, error: "settings_missing" as const };
    const client = (await clientOf(tx, c.request.clientId))!;
    const period = (await periodOf(tx, c.request.payPeriodId))!;

    const disputedIds = new Set(drafts.map((d) => d.timeEntryId));
    const approved = waiting.filter((x) => !disputedIds.has(x.entryId));
    const attestation = createTranslator({ locale, messages: MESSAGES[locale], namespace: "portal" })("attestation", { client: client.name });
    const [decision] = await tx
      .insert(s.approvalDecisions)
      .values({
        agencyId: c.agencyId,
        requestId: c.request.id,
        linkId: c.link.id,
        approverEmail: c.request.approverEmail,
        typedName,
        attestation,
        attestationVersion: ATTESTATION_VERSION,
        locale,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        snapshotSha256: snapshot,
        approved: approved.map(approvedShift),
        disputed: drafts.map((d) => ({ entryId: d.timeEntryId, disputeId: d.id, reason: d.reason })),
        decidedAt: now,
      })
      .returning({ id: s.approvalDecisions.id });

    const approvedIds = approved.map((x) => x.entryId);
    const disputed = [...disputedIds];
    if (approvedIds.length > 0) {
      const done = await tx.update(s.timeEntries).set({ status: "client_approved", updatedAt: now }).where(and(inArray(s.timeEntries.id, approvedIds), inArray(s.timeEntries.status, ["extracted", "reviewed"]))).returning({ id: s.timeEntries.id });
      if (done.length !== approvedIds.length) throw new Error("a shift changed while it was being approved");
    }
    if (disputed.length > 0) {
      const done = await tx.update(s.timeEntries).set({ status: "disputed", updatedAt: now }).where(and(inArray(s.timeEntries.id, disputed), inArray(s.timeEntries.status, ["extracted", "reviewed"]))).returning({ id: s.timeEntries.id });
      if (done.length !== disputed.length) throw new Error("a shift changed while it was being disputed");
      await tx.update(s.clientDisputes).set({ status: "open", decisionId: decision!.id }).where(inArray(s.clientDisputes.id, drafts.map((d) => d.id)));
    }
    const statusOf = new Map(waiting.map((x) => [x.entryId, x]));
    await auditBy(tx, { agencyId: c.agencyId, userId: null, label: clientLabel(typedName, c.request.approverEmail) }, [
      requestEvent(
        c.request.id,
        "decided",
        { decisionId: decision!.id, typedName, approverEmail: c.request.approverEmail, approved: approvedIds.length, disputed: disputed.length, snapshotSha256: snapshot, ipAddress: input.ipAddress, userAgent: input.userAgent?.slice(0, 500) ?? null, attestationVersion: ATTESTATION_VERSION },
        "approve",
      ),
      ...approvedIds.map((id) => ({ action: "approve" as const, entityType: "time_entry", entityId: id, before: { status: statusOf.get(id) ? "waiting" : null }, after: { status: "client_approved" }, reason: "approved by the client" })),
      ...drafts.map((d) => ({ action: "update" as const, entityType: "time_entry", entityId: d.timeEntryId, before: { status: "waiting" }, after: { status: "disputed" }, reason: `disputed by the client: ${d.reason}` })),
    ]);

    const agency = await agencyOf(tx, settings);
    const decided = { typedName, approverEmail: c.request.approverEmail, decidedAt: now, approved: { shifts: approved.length, minutes: approved.reduce((sum, x) => sum + x.minutes, 0) }, disputed: drafts.map((d) => ({ workerName: d.shift.workerName, workDate: d.shift.workDate, reason: d.reason })) };
    const confirmation = renderDecisionEmail({ kind: "approval_confirmation", locale, agency, clientName: client.name, period, ...decided });
    const pending: Pending[] = [{ agencyId: c.agencyId, linkId: null, mail: await queueEmail(tx, agency, c.request.id, "approval_confirmation", { email: c.request.approverEmail, name: typedName }, confirmation, now) }];
    if (agency.email) {
      const notice = renderDecisionEmail({ kind: "approval_notice", locale: c.request.agencyLocale, agency, clientName: client.name, period, ...decided, agencyLink: `${deps.baseUrl}/${c.request.agencyLocale}/approvals/${c.request.id}` });
      pending.push({ agencyId: c.agencyId, linkId: null, mail: await queueEmail(tx, agency, c.request.id, "approval_notice", { email: agency.email, name: agency.name }, notice, now) });
    }
    return { ok: true as const, approved: approved.length, disputed: disputed.length, pending };
  });
  if (!result.ok) return result;
  // The decision stands even if an email cannot go out (the history shows it).
  await deliver(deps, result.pending);
  return { ok: true, approved: result.approved, disputed: result.disputed };
}

/**
 * "Email me a new link" from an expired link: sent only to the address the request was made to,
 * at most once per five minutes per link (decision 0013).
 */
export async function requestNewLink(deps: ApprovalDeps, token: string): Promise<{ ok: true } | ApprovalFailure> {
  const found = await resolveLink(deps, token);
  if (!found) return { ok: false, error: "link_invalid" };
  const now = nowOf(deps);
  const result = await deps.withAgency(found.agencyId, async (tx) => {
    const c = await linkContext(tx, found.agencyId, found.linkId);
    if (!c) return { ok: false as const, error: "link_invalid" as const };
    const state = linkState(c, now);
    if (state === "replaced") return { ok: false as const, error: "link_replaced" as const };
    // Only an expired link asks for a new one, and not one long expired (second opinion on slice d).
    if (state === "active") return { ok: false as const, error: "link_active" as const };
    if (now.getTime() - c.link.expiresAt.getTime() > RENEWAL_MAX_DAYS_AFTER_EXPIRY * DAY_MS) return { ok: false as const, error: "link_too_old" as const };
    if ((await periodState(tx, c.request.payPeriodId)) !== "open") return { ok: false as const, error: "period_locked" as const };
    // Serializes renewals of one request: the count below sees every earlier one.
    await tx.select({ id: s.approvalRequests.id }).from(s.approvalRequests).where(eq(s.approvalRequests.id, c.request.id)).for("no key update");
    const waitingNow = (await clientShifts(tx, c.request.clientId, c.request.payPeriodId)).filter((x) => x.state === "waiting");
    if (waitingNow.length === 0) return { ok: false as const, error: "nothing_to_approve" as const };
    const recent = await tx
      .select({ id: s.emailMessages.id })
      .from(s.emailMessages)
      .where(and(eq(s.emailMessages.requestId, c.request.id), eq(s.emailMessages.kind, "approval_renewal"), gt(s.emailMessages.createdAt, new Date(now.getTime() - DAY_MS))));
    if (recent.length >= RENEWALS_PER_DAY) return { ok: false as const, error: "too_soon" as const };
    const claimed = await tx
      .update(s.approvalLinks)
      .set({ renewalRequestedAt: now })
      .where(and(eq(s.approvalLinks.id, c.link.id), or(isNull(s.approvalLinks.renewalRequestedAt), lte(s.approvalLinks.renewalRequestedAt, new Date(now.getTime() - RENEWAL_WAIT_MINUTES * 60_000)))))
      .returning({ id: s.approvalLinks.id });
    if (claimed.length === 0) return { ok: false as const, error: "too_soon" as const };
    const settings = await settingsOf(tx, now);
    if (!settings) return { ok: false as const, error: "settings_missing" as const };
    const client = (await clientOf(tx, c.request.clientId))!;
    const period = (await periodOf(tx, c.request.payPeriodId))!;
    const waiting = (await clientShifts(tx, client.id, period.id)).filter((x) => x.state === "waiting");
    const agency = await agencyOf(tx, settings);
    const link = await issueLink(tx, c.request, "renewal", now, settings.linkDays);
    const rendered = renderLinkEmail({
      kind: "approval_renewal",
      locale: c.request.locale,
      agency,
      clientName: client.name,
      period,
      approverName: c.request.approverName,
      summary: summarize(waiting),
      link: approvalUrl(deps.baseUrl, c.request.locale, link.token),
      expiresAt: link.expiresAt,
    });
    const mail = await queueEmail(tx, agency, c.request.id, "approval_renewal", { email: c.request.approverEmail, name: c.request.approverName }, rendered, now);
    await auditBy(tx, { agencyId: c.agencyId, userId: null, label: clientLabel(c.request.approverName, c.request.approverEmail) }, [requestEvent(c.request.id, "link_renewed", { fromLinkId: c.link.id })]);
    return { ok: true as const, pending: [{ agencyId: c.agencyId, mail, linkId: link.linkId }] };
  });
  if (!result.ok) return result;
  const failures = await deliver(deps, result.pending);
  return failures.length > 0 ? { ok: false, error: "send_failed" } : { ok: true };
}

// ---------------------------------------------------------------------------------------------
// What the agency's screens show
// ---------------------------------------------------------------------------------------------

export type ClientApprovalState = "disputed" | "not_sent" | "send_again" | "waiting" | "approved";

export interface ClientApprovalRow {
  clientId: string;
  clientName: string;
  /** The client must approve its shifts before the run can be approved (slice e). */
  approvalRequired: boolean;
  state: ClientApprovalState;
  request: { id: string; approverName: string; approverEmail: string; locale: s.ApprovalLocale } | null;
  /** Prefill for the send dialog: this request's approver, or the client's latest approver. */
  lastApprover: { name: string; email: string; locale: s.ApprovalLocale } | null;
  counts: { waiting: number; approved: number; disputed: number; needsReview: number };
  workers: number;
  minutes: number;
  /** What a send would ask the client to approve now. */
  waitingMinutes: number;
  lastActivity: { kind: s.EmailKind | "decided"; at: Date } | null;
}

async function validLinkExists(tx: Tx, requestId: string, now: Date) {
  const [link] = await tx
    .select({ id: s.approvalLinks.id })
    .from(s.approvalLinks)
    .where(and(eq(s.approvalLinks.requestId, requestId), isNull(s.approvalLinks.revokedAt), gt(s.approvalLinks.expiresAt, now)))
    .limit(1);
  return Boolean(link);
}

function stateOf(counts: ClientApprovalRow["counts"], request: { id: string; needsSending: boolean } | null, linkValid: boolean): ClientApprovalState {
  if (counts.disputed > 0) return "disputed";
  if (counts.waiting === 0 && counts.needsReview === 0 && counts.approved > 0) return "approved";
  if (!request) return "not_sent";
  // After a withdrawal or a settled dispute the client has not been asked about those shifts yet.
  return linkValid && counts.waiting > 0 && !request.needsSending ? "waiting" : "send_again";
}

/** Every client with shifts in the period (or a request for it), with its approval state. */
export async function listApprovals(tx: Tx, payPeriodId: string, now: Date = new Date()): Promise<ClientApprovalRow[]> {
  const withShifts = await tx
    .selectDistinct({ clientId: s.jobOrders.clientId })
    .from(s.timeEntries)
    .innerJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .where(and(eq(s.timeEntries.payPeriodId, payPeriodId), sql`${s.timeEntries.status} <> 'rejected'`));
  const onTimesheets = await tx
    .selectDistinct({ clientId: s.sourceDocuments.clientId })
    .from(s.timeEntries)
    .innerJoin(s.sourceDocuments, eq(s.sourceDocuments.id, s.timeEntries.sourceDocumentId))
    .where(and(eq(s.timeEntries.payPeriodId, payPeriodId), isNull(s.timeEntries.assignmentId), inArray(s.timeEntries.status, ["extracted", "needs_review", "reviewed"])));
  const withRequests = await tx.selectDistinct({ clientId: s.approvalRequests.clientId }).from(s.approvalRequests).where(and(eq(s.approvalRequests.payPeriodId, payPeriodId), eq(s.approvalRequests.status, "open")));
  const ids = [...new Set([...withShifts, ...onTimesheets, ...withRequests].map((r) => r.clientId).filter((id): id is string => id !== null))];
  if (ids.length === 0) return [];
  const clients = await tx.select().from(s.clients).where(inArray(s.clients.id, ids));
  const rows: ClientApprovalRow[] = [];
  for (const client of clients) {
    const shifts = await clientShifts(tx, client.id, payPeriodId);
    const counts = {
      waiting: shifts.filter((x) => x.state === "waiting").length,
      approved: shifts.filter((x) => x.state === "approved").length,
      disputed: shifts.filter((x) => x.state === "disputed").length,
      needsReview: shifts.filter((x) => x.state === "needs_review").length + (await unmatchedOnClientTimesheets(tx, client.id, payPeriodId)),
    };
    const [request] = await tx.select().from(s.approvalRequests).where(and(eq(s.approvalRequests.clientId, client.id), eq(s.approvalRequests.payPeriodId, payPeriodId), eq(s.approvalRequests.status, "open")));
    const [latest] = request ? [request] : await tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.clientId, client.id)).orderBy(desc(s.approvalRequests.createdAt)).limit(1);
    const linkValid = request ? await validLinkExists(tx, request.id, now) : false;
    let lastActivity: ClientApprovalRow["lastActivity"] = null;
    if (request) {
      const [mail] = await tx
        .select({ kind: s.emailMessages.kind, at: s.emailMessages.createdAt })
        .from(s.emailMessages)
        .where(and(eq(s.emailMessages.requestId, request.id), inArray(s.emailMessages.kind, ["approval_request", "approval_reminder", "approval_renewal"])))
        .orderBy(desc(s.emailMessages.createdAt))
        .limit(1);
      const [decision] = await tx.select({ at: s.approvalDecisions.decidedAt }).from(s.approvalDecisions).where(eq(s.approvalDecisions.requestId, request.id)).orderBy(desc(s.approvalDecisions.decidedAt)).limit(1);
      lastActivity = decision && (!mail || decision.at >= mail.at) ? { kind: "decided", at: decision.at } : mail ? { kind: mail.kind, at: mail.at } : null;
    }
    const visible = shifts.filter((x) => x.state !== "needs_review" && x.state !== "locked");
    rows.push({
      clientId: client.id,
      clientName: client.name,
      approvalRequired: client.approvalRequired,
      state: stateOf(counts, request ?? null, linkValid),
      request: request ? { id: request.id, approverName: request.approverName, approverEmail: request.approverEmail, locale: request.locale } : null,
      lastApprover: latest ? { name: latest.approverName, email: latest.approverEmail, locale: latest.locale } : null,
      counts,
      workers: new Set(visible.map((x) => x.workerId)).size,
      minutes: visible.reduce((sum, x) => sum + x.minutes, 0),
      waitingMinutes: shifts.filter((x) => x.state === "waiting").reduce((sum, x) => sum + x.minutes, 0),
      lastActivity,
    });
  }
  const ORDER: ClientApprovalState[] = ["disputed", "not_sent", "send_again", "waiting", "approved"];
  return rows.sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.clientName.localeCompare(b.clientName));
}

export interface ApprovalDetail {
  request: s.ApprovalRequestRow;
  clientName: string;
  period: { id: string; startsOn: string; endsOn: string };
  state: ClientApprovalState;
  needsSending: boolean;
  periodOpen: boolean;
  shifts: PortalShift[];
  needsReview: number;
  disputes: (s.ClientDisputeRow & { workerName: string })[];
  history: { at: Date; actor: string; event: string; reason: string | null; details: Record<string, unknown> }[];
  emails: (Pick<s.EmailMessageRow, "id" | "kind" | "toEmail" | "toName" | "subject" | "textBody" | "status" | "error" | "createdAt" | "sentAt"> & { demoCopy: { textBody: string; htmlBody: string } | null })[];
}

/** One request for the agency: its shifts, disputes, history and emails (with the demo copies when asked). */
export async function approvalDetail(tx: Tx, requestId: string, opts: { demoCopies: boolean; now?: Date }): Promise<ApprovalDetail | null> {
  const now = opts.now ?? new Date();
  const [request] = await tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, requestId));
  if (!request) return null;
  const client = (await clientOf(tx, request.clientId))!;
  const period = (await periodOf(tx, request.payPeriodId))!;
  const all = await clientShifts(tx, request.clientId, request.payPeriodId);
  const { view } = await portalShifts(tx, request);
  const counts = {
    waiting: all.filter((x) => x.state === "waiting").length,
    approved: all.filter((x) => x.state === "approved").length,
    disputed: all.filter((x) => x.state === "disputed").length,
    needsReview: all.filter((x) => x.state === "needs_review").length + (await unmatchedOnClientTimesheets(tx, request.clientId, request.payPeriodId)),
  };
  const linkValid = request.status === "open" && (await validLinkExists(tx, request.id, now));
  // The client's period as a whole: disputes, history and emails of every request for it (the
  // approver may have changed since a dispute was filed).
  const siblings = (await tx.select({ id: s.approvalRequests.id }).from(s.approvalRequests).where(and(eq(s.approvalRequests.clientId, request.clientId), eq(s.approvalRequests.payPeriodId, request.payPeriodId)))).map((r) => r.id);
  const disputes = await tx.select().from(s.clientDisputes).where(and(inArray(s.clientDisputes.requestId, siblings), sql`${s.clientDisputes.status} <> 'draft'`)).orderBy(desc(s.clientDisputes.createdAt));
  const events = await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityType, "approval_request"), inArray(s.auditEvents.entityId, siblings))).orderBy(desc(s.auditEvents.occurredAt), desc(s.auditEvents.id));
  const emails = await tx.select().from(s.emailMessages).where(inArray(s.emailMessages.requestId, siblings)).orderBy(desc(s.emailMessages.createdAt));
  const copies = opts.demoCopies && emails.length > 0 ? await tx.select().from(s.demoMailbox).where(inArray(s.demoMailbox.emailMessageId, emails.map((e) => e.id))) : [];
  const history = events.map((e) => {
    const after = (e.after ?? {}) as Record<string, unknown>;
    const { event, ...details } = after;
    return { at: e.occurredAt, actor: e.actorLabel, event: String(event ?? e.action), reason: e.reason, details };
  });

  return {
    request,
    clientName: client.name,
    period: { id: period.id, startsOn: period.startsOn, endsOn: period.endsOn },
    state: request.status === "open" ? stateOf(counts, request, linkValid) : "send_again",
    needsSending: request.needsSending,
    periodOpen: (await periodState(tx, request.payPeriodId)) === "open",
    shifts: view,
    needsReview: counts.needsReview,
    disputes: disputes.map((d) => ({ ...d, workerName: d.shift.workerName })),
    history,
    emails: emails.map((e) => {
      const copy = copies.find((c) => c.emailMessageId === e.id);
      return {
        id: e.id,
        kind: e.kind,
        toEmail: e.toEmail,
        toName: e.toName,
        subject: e.subject,
        textBody: e.textBody,
        status: e.status,
        error: e.error,
        createdAt: e.createdAt,
        sentAt: e.sentAt,
        demoCopy: copy ? { textBody: copy.textBody, htmlBody: copy.htmlBody } : null,
      };
    }),
  };
}
