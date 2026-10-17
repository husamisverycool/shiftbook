/**
 * The client portal (SPEC §27 item 8; plan .claude/plans/slice-v-client-portal.md; decision 0041).
 *
 * The agency gives a person at a client the portal by email; their link opens the client's invoices,
 * payments, hours to approve and documents, and lets them ask for workers. Links follow decision
 * 0013: bearer secrets of which only the SHA-256 is kept, looked up across agencies by one SECURITY
 * DEFINER function, after which everything runs inside the agency's fence and, within it, the one
 * client's rows. Opening a page only reads (mail systems open links on their own); every change is a
 * POST that checks the link again. Every action is audited with the contact's identity.
 */
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { auditBy, audit, type AuditInput } from "../audit";
import { approvedShift, clientShifts } from "../approvals/scope";
import type { ApprovalDeps } from "../approvals/service";
import { newApprovalToken, redactApprovalLinks } from "../approvals/token";
import { createJobOrder } from "../catalog/job-orders";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { OutgoingMail } from "../mail/transport";
import { can } from "../permissions";
import { invoiceBalances } from "../receivables/balances";
import { bucketOf } from "../receivables/aging";
import type { Actor } from "../session";
import { agencyToday, agencyZone, settingOn } from "../settings";
import { renderPortalEmail } from "./emails";
import { hashPortalToken, newPortalToken } from "./token";

export type PortalError =
  | "not_found"
  | "not_allowed"
  | "invalid"
  | "invalid_email"
  | "duplicate"
  | "settings_missing"
  | "send_failed"
  | "too_soon"
  | "link_invalid"
  | "link_expired"
  | "link_revoked"
  | "link_active"
  | "link_too_old"
  | "not_yours"
  | "nothing_waiting";

export type PortalResult<T = object> = ({ ok: true } & T) | { ok: false; error: PortalError; fields?: string[] };

/** "Email me a new link" from the same link: at most once per this many minutes (as approval links). */
export const PORTAL_RENEWAL_WAIT_MINUTES = 5;
/** …and at most this many in 24 hours per contact. */
export const PORTAL_RENEWALS_PER_DAY = 3;
/** A link that expired longer ago than this cannot ask for a new one. */
export const PORTAL_RENEWAL_MAX_DAYS_AFTER_EXPIRY = 30;
/** The agency sends a contact a new link at most once a minute (a double click sends one email). */
export const PORTAL_SEND_WAIT_SECONDS = 60;
/** Requests for workers from one contact still waiting on the agency, at most. */
export const PENDING_REQUESTS_MAX = 20;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LOCALES = ["en", "es"] as const;
const DAY_MS = 86_400_000;
const NOTES_MAX = 2000;
const nowOf = (deps: ApprovalDeps) => (deps.now ? deps.now() : new Date());
const isLocale = (v: unknown): v is s.ApprovalLocale => (LOCALES as readonly unknown[]).includes(v);
const clean = (text: string) => redactApprovalLinks(text.trim());

export const mayManagePortal = (actor: Actor) => can(actor, "clientBilling");
export const mayDecideRequests = (actor: Actor) => can(actor, "placements");

const contactEvent = (contactId: string, event: string, details: Record<string, unknown> = {}, action: AuditInput["action"] = "update"): AuditInput => ({
  action,
  entityType: "portal_contact",
  entityId: contactId,
  after: { event, ...details },
});

/** The agency's link lifetime, the same setting as approval links (effective-dated data). */
async function linkDays(tx: Tx, now: Date): Promise<number | null> {
  const days = await settingOn<unknown>(tx, "approval_link_days", now.toISOString().slice(0, 10));
  return typeof days === "number" && Number.isInteger(days) && days >= 1 && days <= 90 ? days : null;
}

async function agencyFor(tx: Tx, now: Date) {
  const [a] = await tx.select().from(s.agencies);
  if (!a) throw new Error("agency not visible");
  return { id: a.id, name: a.name, phone: a.phone, email: a.email, timeZone: await agencyZone(tx, now) };
}

const portalUrl = (baseUrl: string, locale: s.ApprovalLocale, token: string) => `${baseUrl}/${locale}/portal/${token}`;

interface Pending {
  agencyId: string;
  mail: OutgoingMail;
  linkId: string;
}

/** Makes a new link for a contact (earlier links stop working) and queues its email. */
async function issueAndQueue(tx: Tx, deps: ApprovalDeps, contact: s.PortalContactRow, now: Date): Promise<PortalResult<{ pending: Pending }>> {
  const days = await linkDays(tx, now);
  if (days === null) return { ok: false, error: "settings_missing" };
  await tx.update(s.portalLinks).set({ revokedAt: now }).where(and(eq(s.portalLinks.contactId, contact.id), isNull(s.portalLinks.revokedAt)));
  const { token, hash } = newPortalToken();
  const expiresAt = new Date(now.getTime() + days * DAY_MS);
  const [link] = await tx.insert(s.portalLinks).values({ agencyId: contact.agencyId, contactId: contact.id, tokenHash: hash, expiresAt, createdAt: now }).returning({ id: s.portalLinks.id });
  const agency = await agencyFor(tx, now);
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, contact.clientId));
  const rendered = renderPortalEmail({ locale: contact.locale, agency, clientName: client!.name, contactName: contact.name, link: portalUrl(deps.baseUrl, contact.locale, token), expiresAt });
  const [row] = await tx
    .insert(s.emailMessages)
    .values({ agencyId: contact.agencyId, kind: "portal_link", toEmail: contact.email, toName: contact.name, subject: rendered.subject, textBody: redactApprovalLinks(rendered.text), status: "sending", createdAt: now })
    .returning({ id: s.emailMessages.id });
  const mail: OutgoingMail = { id: row!.id, fromName: agency.name, replyTo: agency.email, to: { email: contact.email, name: contact.name }, subject: rendered.subject, text: rendered.text, html: rendered.html };
  return { ok: true, pending: { agencyId: contact.agencyId, mail, linkId: link!.id } };
}

/** Sends after commit; a link whose email could not go out is revoked. */
async function deliver(deps: ApprovalDeps, p: Pending): Promise<boolean> {
  try {
    const { providerId } = await deps.mailTransport(p.agencyId).send(p.mail);
    await deps.withAgency(p.agencyId, (tx) => tx.update(s.emailMessages).set({ status: "sent", providerId, sentAt: nowOf(deps) }).where(eq(s.emailMessages.id, p.mail.id)));
    return true;
  } catch (error) {
    const message = redactApprovalLinks(error instanceof Error ? error.message : String(error));
    await deps.withAgency(p.agencyId, async (tx) => {
      await tx.update(s.emailMessages).set({ status: "failed", error: message }).where(eq(s.emailMessages.id, p.mail.id));
      await tx.update(s.portalLinks).set({ revokedAt: nowOf(deps) }).where(eq(s.portalLinks.id, p.linkId));
    });
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// The agency's side: who has the portal (Settings-like section on the client page)
// ---------------------------------------------------------------------------------------------

export interface PortalAccessRow {
  id: string;
  name: string;
  email: string;
  locale: s.ApprovalLocale;
  lastVisitAt: Date | null;
  linkSentAt: Date | null;
  /** When the working link stops working; null when there is none (expired, revoked, never sent). */
  linkExpiresAt: Date | null;
  /** The latest email's state (sent, failed). */
  emailStatus: "sending" | "sent" | "failed" | null;
  /** Demo mode only: the delivered copy, with its working link. */
  demoCopy: string | null;
}

/** The client's portal contacts (revoked ones are not listed), newest first. */
export async function portalAccess(tx: Tx, clientId: string, opts: { demoCopies: boolean }): Promise<PortalAccessRow[]> {
  const contacts = await tx.select().from(s.portalContacts).where(and(eq(s.portalContacts.clientId, clientId), isNull(s.portalContacts.revokedAt))).orderBy(desc(s.portalContacts.createdAt));
  const rows: PortalAccessRow[] = [];
  for (const c of contacts) {
    const [link] = await tx.select().from(s.portalLinks).where(eq(s.portalLinks.contactId, c.id)).orderBy(desc(s.portalLinks.createdAt)).limit(1);
    const [email] = await tx
      .select()
      .from(s.emailMessages)
      .where(and(eq(s.emailMessages.kind, "portal_link"), sql`lower(${s.emailMessages.toEmail}) = lower(${c.email})`))
      .orderBy(desc(s.emailMessages.createdAt))
      .limit(1);
    const [copy] = opts.demoCopies && email ? await tx.select().from(s.demoMailbox).where(eq(s.demoMailbox.emailMessageId, email.id)) : [];
    rows.push({
      id: c.id,
      name: c.name,
      email: c.email,
      locale: c.locale,
      lastVisitAt: c.lastVisitAt,
      linkSentAt: link?.createdAt ?? null,
      linkExpiresAt: link && !link.revokedAt && link.expiresAt.getTime() > Date.now() ? link.expiresAt : null,
      emailStatus: email?.status ?? null,
      demoCopy: copy?.textBody ?? null,
    });
  }
  return rows;
}

export interface ContactInput {
  clientId: string;
  name: string;
  email: string;
  locale: string;
}

/** Gives a person at the client the portal: records them and emails their link. */
export async function addPortalContact(deps: ApprovalDeps, actor: Actor, input: ContactInput): Promise<PortalResult<{ contactId: string }>> {
  if (!mayManagePortal(actor)) return { ok: false, error: "not_allowed" };
  const name = input.name.trim();
  const email = input.email.trim();
  const fields: string[] = [];
  if (name.length < 1 || name.length > 200) fields.push("name");
  if (!EMAIL.test(email) || email.length > 254) fields.push("email");
  if (!isLocale(input.locale)) fields.push("locale");
  if (fields.length > 0) return { ok: false, error: "invalid", fields };
  const now = nowOf(deps);
  const out = await deps.withAgency(actor.agencyId, async (tx): Promise<PortalResult<{ contactId: string; pending: Pending }>> => {
    const [client] = await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.id, input.clientId));
    if (!client) return { ok: false, error: "not_found" };
    const [same] = await tx
      .select({ id: s.portalContacts.id })
      .from(s.portalContacts)
      .where(and(eq(s.portalContacts.clientId, input.clientId), isNull(s.portalContacts.revokedAt), sql`lower(${s.portalContacts.email}) = lower(${email})`));
    if (same) return { ok: false, error: "duplicate" };
    const [contact] = await tx
      .insert(s.portalContacts)
      .values({ agencyId: actor.agencyId, clientId: input.clientId, name, email, locale: input.locale as s.ApprovalLocale, createdAt: now, createdBy: actor.userId, createdByLabel: actor.label })
      .returning();
    const issued = await issueAndQueue(tx, deps, contact!, now);
    if (!issued.ok) return issued;
    await audit(tx, actor, [contactEvent(contact!.id, "portal_given", { clientId: input.clientId, name, email, locale: input.locale }, "create")]);
    return { ok: true, contactId: contact!.id, pending: issued.pending };
  });
  if (!out.ok) return out;
  if (!(await deliver(deps, out.pending))) return { ok: false, error: "send_failed" };
  return { ok: true, contactId: out.contactId };
}

/** Emails a contact a new link; earlier links stop working. */
export async function sendPortalLink(deps: ApprovalDeps, actor: Actor, contactId: string): Promise<PortalResult> {
  if (!mayManagePortal(actor)) return { ok: false, error: "not_allowed" };
  const now = nowOf(deps);
  const out = await deps.withAgency(actor.agencyId, async (tx): Promise<PortalResult<{ pending: Pending }>> => {
    const [contact] = await tx.select().from(s.portalContacts).where(and(eq(s.portalContacts.id, contactId), isNull(s.portalContacts.revokedAt))).for("update");
    if (!contact) return { ok: false, error: "not_found" };
    const [last] = await tx.select().from(s.portalLinks).where(eq(s.portalLinks.contactId, contactId)).orderBy(desc(s.portalLinks.createdAt)).limit(1);
    if (last && now.getTime() - last.createdAt.getTime() < PORTAL_SEND_WAIT_SECONDS * 1000) return { ok: false, error: "too_soon" };
    const issued = await issueAndQueue(tx, deps, contact, now);
    if (!issued.ok) return issued;
    await audit(tx, actor, [contactEvent(contactId, "portal_link_sent")]);
    return issued;
  });
  if (!out.ok) return out;
  return (await deliver(deps, out.pending)) ? { ok: true } : { ok: false, error: "send_failed" };
}

/** Takes the portal away from a contact: every link stops working at once. */
export async function revokePortalContact(deps: ApprovalDeps, actor: Actor, contactId: string): Promise<PortalResult> {
  if (!mayManagePortal(actor)) return { ok: false, error: "not_allowed" };
  const now = nowOf(deps);
  return deps.withAgency(actor.agencyId, async (tx) => {
    const [contact] = await tx.update(s.portalContacts).set({ revokedAt: now, revokedByLabel: actor.label }).where(and(eq(s.portalContacts.id, contactId), isNull(s.portalContacts.revokedAt))).returning();
    if (!contact) return { ok: false as const, error: "not_found" as const };
    await tx.update(s.portalLinks).set({ revokedAt: now }).where(and(eq(s.portalLinks.contactId, contactId), isNull(s.portalLinks.revokedAt)));
    await audit(tx, actor, [contactEvent(contactId, "portal_revoked")]);
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------------------------
// The agency's side: requests for workers (on Job orders)
// ---------------------------------------------------------------------------------------------

export interface StaffRequestView {
  id: string;
  clientId: string;
  clientName: string;
  contactName: string;
  contactEmail: string;
  position: string;
  worksiteId: string | null;
  worksiteName: string | null;
  worksiteNote: string | null;
  startsOn: string;
  endsOn: string | null;
  shiftStartMinute: number;
  shiftEndMinute: number;
  headcount: number;
  notes: string | null;
  createdAt: Date;
  /** The client's worksites, to choose from when turning the request into a job order. */
  worksites: { id: string; name: string }[];
}

/** Requests for workers waiting on the agency, oldest first (they are a queue). */
export async function pendingStaffRequests(tx: Tx): Promise<StaffRequestView[]> {
  const rows = await tx
    .select({ r: s.staffRequests, clientName: s.clients.name, contactName: s.portalContacts.name, contactEmail: s.portalContacts.email, worksiteName: s.worksites.name })
    .from(s.staffRequests)
    .innerJoin(s.clients, eq(s.clients.id, s.staffRequests.clientId))
    .innerJoin(s.portalContacts, eq(s.portalContacts.id, s.staffRequests.contactId))
    .leftJoin(s.worksites, eq(s.worksites.id, s.staffRequests.worksiteId))
    .where(eq(s.staffRequests.status, "pending"))
    .orderBy(s.staffRequests.createdAt);
  const clientIds = [...new Set(rows.map((x) => x.r.clientId))];
  const sites = clientIds.length > 0 ? await tx.select({ id: s.worksites.id, name: s.worksites.name, clientId: s.worksites.clientId }).from(s.worksites).where(inArray(s.worksites.clientId, clientIds)) : [];
  return rows.map(({ r, clientName, contactName, contactEmail, worksiteName }) => ({
    id: r.id,
    clientId: r.clientId,
    clientName,
    contactName,
    contactEmail,
    position: r.position,
    worksiteId: r.worksiteId,
    worksiteName,
    worksiteNote: r.worksiteNote,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    shiftStartMinute: r.shiftStartMinute,
    shiftEndMinute: r.shiftEndMinute,
    headcount: r.headcount,
    notes: r.notes,
    createdAt: r.createdAt,
    worksites: sites.filter((x) => x.clientId === r.clientId).map(({ id, name }) => ({ id, name })),
  }));
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const shiftText = (start: number, end: number) => `${hhmm(start)}–${hhmm(end)}`;

/** Turns a client's request into a job order at the chosen worksite (TempWorks: approve an order request). */
export async function acceptStaffRequest(tx: Tx, actor: Actor, requestId: string, worksiteId: string): Promise<PortalResult<{ jobOrderId: string }>> {
  if (!mayDecideRequests(actor)) return { ok: false, error: "not_allowed" };
  const [r] = await tx.select().from(s.staffRequests).where(and(eq(s.staffRequests.id, requestId), eq(s.staffRequests.status, "pending"))).for("update");
  if (!r) return { ok: false, error: "not_found" };
  const made = await createJobOrder(tx, actor, {
    clientId: r.clientId,
    worksiteId,
    position: r.position.slice(0, 120),
    socCode: null,
    shift: shiftText(r.shiftStartMinute, r.shiftEndMinute),
    headcount: r.headcount,
    payMinCents: null,
    payMaxCents: null,
    prevailingWage: false,
  });
  if (!made.ok) return made.error === "invalid" ? { ok: false, error: "invalid", fields: made.fields } : { ok: false, error: made.error === "not_allowed" ? "not_allowed" : "not_found" };
  await tx.update(s.staffRequests).set({ status: "accepted", jobOrderId: made.id, decidedAt: new Date(), decidedByLabel: actor.label }).where(eq(s.staffRequests.id, requestId));
  await audit(tx, actor, [{ action: "update", entityType: "staff_request", entityId: requestId, after: { event: "staff_request_accepted", jobOrderId: made.id } }]);
  return { ok: true, jobOrderId: made.id };
}

/** Declines a client's request, with the reason the client is given (TempWorks: reject needs a comment). */
export async function declineStaffRequest(tx: Tx, actor: Actor, requestId: string, rawReason: string): Promise<PortalResult> {
  if (!mayDecideRequests(actor)) return { ok: false, error: "not_allowed" };
  const reason = clean(rawReason);
  if (reason.length < 1 || reason.length > NOTES_MAX) return { ok: false, error: "invalid", fields: ["reason"] };
  const done = await tx
    .update(s.staffRequests)
    .set({ status: "declined", declineReason: reason, decidedAt: new Date(), decidedByLabel: actor.label })
    .where(and(eq(s.staffRequests.id, requestId), eq(s.staffRequests.status, "pending")))
    .returning({ id: s.staffRequests.id });
  if (done.length === 0) return { ok: false, error: "not_found" };
  await audit(tx, actor, [{ action: "update", entityType: "staff_request", entityId: requestId, after: { event: "staff_request_declined" }, reason }]);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// The client's side: the link
// ---------------------------------------------------------------------------------------------

export interface PortalAgency {
  name: string;
  phone: string | null;
  email: string | null;
  timeZone: string;
}

export interface PortalSession {
  agencyId: string;
  clientId: string;
  clientName: string;
  contact: { id: string; name: string; email: string; locale: s.ApprovalLocale };
  agency: PortalAgency;
  expiresAt: Date;
  today: string;
}

export type PortalState =
  | { state: "invalid" }
  | { state: "revoked"; agency: PortalAgency }
  | { state: "expired"; agency: PortalAgency; canRenew: boolean }
  | ({ state: "active" } & PortalSession);

async function resolve(deps: ApprovalDeps, token: string): Promise<{ linkId: string; agencyId: string } | null> {
  const hash = hashPortalToken(token);
  if (!hash) return null;
  const rows = await deps.db.execute<{ link_id: string; agency_id: string }>(sql`select link_id, agency_id from portal_link_lookup(${hash})`);
  const row = rows[0];
  return row ? { linkId: row.link_id, agencyId: row.agency_id } : null;
}

async function linkAndContact(tx: Tx, linkId: string) {
  const [link] = await tx.select().from(s.portalLinks).where(eq(s.portalLinks.id, linkId));
  if (!link) return null;
  const [contact] = await tx.select().from(s.portalContacts).where(eq(s.portalContacts.id, link.contactId));
  return contact ? { link, contact } : null;
}

const linkState = (link: s.PortalLinkRow, contact: s.PortalContactRow, now: Date): "active" | "expired" | "revoked" =>
  link.revokedAt !== null || contact.revokedAt !== null ? "revoked" : link.expiresAt.getTime() <= now.getTime() ? "expired" : "active";

/**
 * What a portal page may show for a link. Opening only reads, except that it notes the contact's
 * latest visit (the agency's "Last visit") and the link's first opening, which may be a mail system.
 */
export async function openPortal(deps: ApprovalDeps, token: string): Promise<PortalState> {
  const found = await resolve(deps, token);
  if (!found) return { state: "invalid" };
  const now = nowOf(deps);
  return deps.withAgency(found.agencyId, async (tx) => {
    const lc = await linkAndContact(tx, found.linkId);
    if (!lc) return { state: "invalid" as const };
    const [a] = await tx.select().from(s.agencies);
    const agency: PortalAgency = { name: a!.name, phone: a!.phone, email: a!.email, timeZone: await agencyZone(tx, now) };
    const state = linkState(lc.link, lc.contact, now);
    if (state === "revoked") return { state: "revoked" as const, agency };
    if (state === "expired") return { state: "expired" as const, agency, canRenew: now.getTime() - lc.link.expiresAt.getTime() <= PORTAL_RENEWAL_MAX_DAYS_AFTER_EXPIRY * DAY_MS };
    if (lc.link.firstOpenedAt === null) {
      const first = await tx.update(s.portalLinks).set({ firstOpenedAt: now }).where(and(eq(s.portalLinks.id, lc.link.id), isNull(s.portalLinks.firstOpenedAt))).returning({ id: s.portalLinks.id });
      if (first.length > 0) await auditBy(tx, { agencyId: found.agencyId, userId: null, label: "Portal link opened (may be an automatic link check)" }, [contactEvent(lc.contact.id, "portal_link_opened", { linkId: lc.link.id })]);
    }
    // At most one "last visit" write a minute, so moving between pages does not write every time.
    if (!lc.contact.lastVisitAt || now.getTime() - lc.contact.lastVisitAt.getTime() > 60_000) await tx.update(s.portalContacts).set({ lastVisitAt: now }).where(eq(s.portalContacts.id, lc.contact.id));
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, lc.contact.clientId));
    return {
      state: "active" as const,
      agencyId: found.agencyId,
      clientId: lc.contact.clientId,
      clientName: client!.name,
      contact: { id: lc.contact.id, name: lc.contact.name, email: lc.contact.email, locale: lc.contact.locale },
      agency,
      expiresAt: lc.link.expiresAt,
      today: await agencyToday(tx),
    };
  });
}

/** Runs a reading or an action for an active link, inside the agency's fence. */
async function withPortal<T>(deps: ApprovalDeps, token: string, fn: (tx: Tx, p: { agencyId: string; clientId: string; contact: s.PortalContactRow; link: s.PortalLinkRow }, now: Date) => Promise<T | { ok: false; error: PortalError }>): Promise<T | { ok: false; error: PortalError }> {
  const found = await resolve(deps, token);
  if (!found) return { ok: false, error: "link_invalid" };
  const now = nowOf(deps);
  return deps.withAgency(found.agencyId, async (tx) => {
    const lc = await linkAndContact(tx, found.linkId);
    if (!lc) return { ok: false as const, error: "link_invalid" as const };
    const state = linkState(lc.link, lc.contact, now);
    if (state === "revoked") return { ok: false as const, error: "link_revoked" as const };
    if (state === "expired") return { ok: false as const, error: "link_expired" as const };
    return fn(tx, { agencyId: found.agencyId, clientId: lc.contact.clientId, contact: lc.contact, link: lc.link }, now);
  });
}

const contactLabel = (c: { name: string; email: string }) => `${c.name} <${c.email}> (client portal)`;
const byContact = (agencyId: string, c: { name: string; email: string }) => ({ agencyId, userId: null, label: contactLabel(c) });

// ---------- what the pages show ----------

export interface PortalInvoice {
  id: string;
  number: string;
  issuedOn: string;
  dueOn: string;
  poNumber: string | null;
  totalCents: number;
  balanceCents: number;
  /** open: something is owed and not yet due; overdue: owed and past due; paid. */
  state: "open" | "overdue" | "paid";
  hasCsv: boolean;
}

/** The client's issued invoices with what each still asks for, newest first. */
async function invoicesOf(tx: Tx, clientId: string, today: string): Promise<PortalInvoice[]> {
  const rows = await invoiceBalances(tx, { clientIds: [clientId] });
  return rows
    .filter((r) => r.invoice.status !== "draft")
    .map((r) => {
      const state: PortalInvoice["state"] = r.balanceCents <= 0 ? "paid" : bucketOf(r.invoice.dueOn, today) === "current" ? "open" : "overdue";
      return { id: r.invoice.id, number: r.invoice.number, issuedOn: r.invoice.issuedOn, dueOn: r.invoice.dueOn, poNumber: r.invoice.poNumber, totalCents: r.invoice.totalCents, balanceCents: Math.max(0, r.balanceCents), state, hasCsv: r.invoice.csvStorageKey !== null };
    })
    .sort((a, b) => (a.issuedOn < b.issuedOn ? 1 : a.issuedOn > b.issuedOn ? -1 : a.number < b.number ? 1 : -1));
}

export interface PortalHoursRequest {
  id: string;
  startsOn: string;
  endsOn: string;
  approverName: string;
  waitingShifts: number;
  waitingMinutes: number;
  /** The contact is the approver this request was sent to, so they can open it from here. */
  mine: boolean;
}

async function hoursOf(tx: Tx, clientId: string, contactEmail: string): Promise<PortalHoursRequest[]> {
  const open = await tx
    .select({ r: s.approvalRequests, startsOn: s.payPeriods.startsOn, endsOn: s.payPeriods.endsOn })
    .from(s.approvalRequests)
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.approvalRequests.payPeriodId))
    .where(and(eq(s.approvalRequests.clientId, clientId), eq(s.approvalRequests.status, "open")))
    .orderBy(desc(s.payPeriods.startsOn));
  const out: PortalHoursRequest[] = [];
  for (const { r, startsOn, endsOn } of open) {
    const waiting = (await clientShifts(tx, clientId, r.payPeriodId)).filter((x) => x.state === "waiting").map(approvedShift);
    out.push({ id: r.id, startsOn, endsOn, approverName: r.approverName, waitingShifts: waiting.length, waitingMinutes: waiting.reduce((sum, x) => sum + x.minutes, 0), mine: r.approverEmail.toLowerCase() === contactEmail.toLowerCase() });
  }
  return out;
}

export interface PortalPayment {
  id: string;
  receivedOn: string;
  method: s.PaymentMethod;
  reference: string | null;
  amountCents: number;
  appliedCents: number;
  lines: { invoiceId: string; number: string; issuedOn: string; totalCents: number; appliedCents: number }[];
}

async function paymentsOf(tx: Tx, clientId: string): Promise<PortalPayment[]> {
  const payments = await tx.select().from(s.payments).where(and(eq(s.payments.clientId, clientId), isNull(s.payments.voidedAt))).orderBy(desc(s.payments.receivedOn), desc(s.payments.createdAt));
  if (payments.length === 0) return [];
  const matches = await tx
    .select({ paymentId: s.paymentMatches.paymentId, invoiceId: s.invoices.id, number: s.invoices.number, issuedOn: s.invoices.issuedOn, totalCents: s.invoices.totalCents, amountCents: s.paymentMatches.amountCents })
    .from(s.paymentMatches)
    .innerJoin(s.invoices, eq(s.invoices.id, s.paymentMatches.invoiceId))
    .where(inArray(s.paymentMatches.paymentId, payments.map((p) => p.id)));
  return payments.map((p) => {
    const lines = matches.filter((m) => m.paymentId === p.id).map((m) => ({ invoiceId: m.invoiceId, number: m.number, issuedOn: m.issuedOn, totalCents: m.totalCents, appliedCents: m.amountCents }));
    return { id: p.id, receivedOn: p.receivedOn, method: p.method, reference: p.reference, amountCents: p.amountCents, appliedCents: lines.reduce((sum, l) => sum + l.appliedCents, 0), lines };
  });
}

export interface PortalDocument {
  id: string;
  kind: "registration" | "proof";
  /** For a registration: its state; for a proof: the date it was made for. */
  jurisdiction: string | null;
  number: string | null;
  label: string;
  effectiveOn: string;
}

/** The agency's registration certificates on file, and the proofs of registration made for this client. */
async function documentsOf(tx: Tx, clientId: string): Promise<PortalDocument[]> {
  const regs = await tx
    .select({ r: s.agencyRegistrations, doc: s.complianceDocuments })
    .from(s.agencyRegistrations)
    .innerJoin(s.complianceDocuments, eq(s.complianceDocuments.id, s.agencyRegistrations.documentId))
    .orderBy(desc(s.agencyRegistrations.expiresOn));
  const proofs = await tx
    .select({ doc: s.complianceDocuments })
    .from(s.obligations)
    .innerJoin(s.obligationDocuments, and(eq(s.obligationDocuments.obligationId, s.obligations.id), isNull(s.obligationDocuments.unlinkedAt)))
    .innerJoin(s.complianceDocuments, eq(s.complianceDocuments.id, s.obligationDocuments.documentId))
    .where(and(eq(s.obligations.clientId, clientId), inArray(s.obligations.kind, ["il_client_proof", "il_client_proof_contract"]), eq(s.complianceDocuments.source, "generated")))
    .orderBy(desc(s.complianceDocuments.effectiveOn));
  // The latest certificate per state and branch (a renewal adds a row).
  const seen = new Set<string>();
  const latest = regs.filter(({ r }) => {
    const k = `${r.jurisdiction}|${r.branchId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [
    ...latest.map(({ r, doc }) => ({ id: doc.id, kind: "registration" as const, jurisdiction: r.jurisdiction, number: r.number, label: doc.filename, effectiveOn: doc.effectiveOn })),
    ...[...new Map(proofs.map(({ doc }) => [doc.id, doc])).values()].map((doc) => ({ id: doc.id, kind: "proof" as const, jurisdiction: "IL", number: null, label: doc.filename, effectiveOn: doc.effectiveOn })),
  ];
}

export interface StaffRequestSummary {
  id: string;
  position: string;
  startsOn: string;
  headcount: number;
  status: s.StaffRequestStatus;
  declineReason: string | null;
  createdAt: Date;
}

async function requestsOf(tx: Tx, clientId: string): Promise<StaffRequestSummary[]> {
  const rows = await tx.select().from(s.staffRequests).where(eq(s.staffRequests.clientId, clientId)).orderBy(desc(s.staffRequests.createdAt));
  return rows.map((r) => ({ id: r.id, position: r.position, startsOn: r.startsOn, headcount: r.headcount, status: r.status, declineReason: r.declineReason, createdAt: r.createdAt }));
}

export interface PortalOverview {
  owedCents: number;
  overdueCents: number;
  nextDue: { number: string; dueOn: string; balanceCents: number } | null;
  openInvoices: PortalInvoice[];
  waitingHours: number;
  pendingRequests: number;
}

export type PortalRead<T> = T | { ok: false; error: PortalError };
export const portalFailed = (v: unknown): v is { ok: false; error: PortalError } => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

export async function portalOverview(deps: ApprovalDeps, token: string, today: string): Promise<PortalRead<PortalOverview>> {
  return withPortal(deps, token, async (tx, p) => {
    const invoices = await invoicesOf(tx, p.clientId, today);
    const open = invoices.filter((i) => i.state !== "paid");
    const next = [...open].sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))[0] ?? null;
    const hours = await hoursOf(tx, p.clientId, p.contact.email);
    const requests = await requestsOf(tx, p.clientId);
    return {
      owedCents: open.reduce((sum, i) => sum + i.balanceCents, 0),
      overdueCents: open.filter((i) => i.state === "overdue").reduce((sum, i) => sum + i.balanceCents, 0),
      nextDue: next ? { number: next.number, dueOn: next.dueOn, balanceCents: next.balanceCents } : null,
      openInvoices: open.slice(0, 5),
      waitingHours: hours.reduce((sum, h) => sum + h.waitingShifts, 0),
      pendingRequests: requests.filter((r) => r.status === "pending").length,
    };
  });
}

export const portalInvoices = (deps: ApprovalDeps, token: string, today: string) => withPortal(deps, token, (tx, p) => invoicesOf(tx, p.clientId, today));
export const portalPayments = (deps: ApprovalDeps, token: string) => withPortal(deps, token, (tx, p) => paymentsOf(tx, p.clientId));
export const portalHours = (deps: ApprovalDeps, token: string) => withPortal(deps, token, (tx, p) => hoursOf(tx, p.clientId, p.contact.email));
export const portalDocuments = (deps: ApprovalDeps, token: string) => withPortal(deps, token, (tx, p) => documentsOf(tx, p.clientId));
export const portalRequests = (deps: ApprovalDeps, token: string) =>
  withPortal(deps, token, async (tx, p) => ({ requests: await requestsOf(tx, p.clientId), worksites: await tx.select({ id: s.worksites.id, name: s.worksites.name }).from(s.worksites).where(eq(s.worksites.clientId, p.clientId)) }));

// ---------- files ----------

export type PortalFile = { kind: "invoice_pdf" | "invoice_csv"; storageKey: string; filename: string } | { kind: "document"; storageKey: string; filename: string; mediaType: string } | { kind: "payment"; payment: PortalPayment; clientName: string; agency: PortalAgency };

/** A file the link may download: only the client's own invoices, its payments and the documents listed for it. */
export async function portalFile(deps: ApprovalDeps, token: string, what: { invoiceId?: string; file?: "pdf" | "csv"; documentId?: string; paymentId?: string }): Promise<PortalFile | null> {
  const out = await withPortal(deps, token, async (tx, p, now): Promise<PortalFile | { ok: false; error: PortalError }> => {
    const download = (entity: string, id: string, kind: string) => auditBy(tx, byContact(p.agencyId, p.contact), [{ action: "export", entityType: entity, entityId: id, after: { event: "portal_download", kind } }]);
    if (what.invoiceId) {
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.id, what.invoiceId), eq(s.invoices.clientId, p.clientId), ne(s.invoices.status, "draft"), ne(s.invoices.status, "void")));
      const key = what.file === "csv" ? inv?.csvStorageKey : inv?.pdfStorageKey;
      if (!inv || !key) return { ok: false, error: "not_found" };
      await download("invoice", inv.id, what.file ?? "pdf");
      return { kind: what.file === "csv" ? "invoice_csv" : "invoice_pdf", storageKey: key, filename: `invoice-${inv.number}.${what.file === "csv" ? "csv" : "pdf"}` };
    }
    if (what.documentId) {
      const doc = (await documentsOf(tx, p.clientId)).find((d) => d.id === what.documentId);
      if (!doc) return { ok: false, error: "not_found" };
      const [row] = await tx.select().from(s.complianceDocuments).where(eq(s.complianceDocuments.id, doc.id));
      await download("compliance_document", doc.id, doc.kind);
      return { kind: "document", storageKey: row!.storageKey, filename: row!.filename, mediaType: row!.mediaType };
    }
    if (what.paymentId) {
      const payment = (await paymentsOf(tx, p.clientId)).find((x) => x.id === what.paymentId);
      if (!payment) return { ok: false, error: "not_found" };
      const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, p.clientId));
      const [a] = await tx.select().from(s.agencies);
      await download("payment", payment.id, "remittance");
      return { kind: "payment", payment, clientName: client!.name, agency: { name: a!.name, phone: a!.phone, email: a!.email, timeZone: await agencyZone(tx, now) } };
    }
    return { ok: false, error: "not_found" };
  });
  return portalFailed(out) ? null : out;
}

// ---------- the client's actions ----------

export interface StaffRequestInput {
  position: string;
  worksiteId: string | null;
  worksiteNote: string;
  startsOn: string;
  endsOn: string | null;
  shiftStartMinute: number;
  shiftEndMinute: number;
  headcount: number;
  notes: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string) => ISO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const minute = (n: unknown, max: number) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;

/** What is wrong with a request, field by field (none: it can be sent). */
export function staffRequestProblems(input: StaffRequestInput, today: string): string[] {
  const fields: string[] = [];
  if (input.position.trim().length < 1 || input.position.length > 200) fields.push("position");
  if (!input.worksiteId && input.worksiteNote.trim().length < 1) fields.push("worksite");
  if (input.worksiteNote.length > 300) fields.push("worksite");
  if (!validDate(input.startsOn) || input.startsOn < today) fields.push("startsOn");
  if (input.endsOn !== null && (!validDate(input.endsOn) || input.endsOn < input.startsOn)) fields.push("endsOn");
  if (!minute(input.shiftStartMinute, 1439) || !minute(input.shiftEndMinute, 1440) || input.shiftStartMinute === input.shiftEndMinute || input.shiftEndMinute === 0) fields.push("shift");
  if (!Number.isInteger(input.headcount) || input.headcount < 1 || input.headcount > 500) fields.push("headcount");
  if (input.notes.length > NOTES_MAX) fields.push("notes");
  return [...new Set(fields)];
}

/** A client asks for workers: a draft for the agency, which it turns into a job order or declines. */
export async function submitStaffRequest(deps: ApprovalDeps, token: string, input: StaffRequestInput): Promise<PortalResult<{ requestId: string }>> {
  return withPortal(deps, token, async (tx, p) => {
    const today = await agencyToday(tx);
    const fields = staffRequestProblems(input, today);
    if (input.worksiteId) {
      const [site] = await tx.select({ clientId: s.worksites.clientId }).from(s.worksites).where(eq(s.worksites.id, input.worksiteId));
      if (!site || site.clientId !== p.clientId) fields.push("worksite");
    }
    if (fields.length > 0) return { ok: false as const, error: "invalid" as const, fields: [...new Set(fields)] };
    // A link cannot flood the agency: at most this many requests wait from one contact at a time.
    const [waiting] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.staffRequests).where(and(eq(s.staffRequests.contactId, p.contact.id), eq(s.staffRequests.status, "pending")));
    if ((waiting?.n ?? 0) >= PENDING_REQUESTS_MAX) return { ok: false as const, error: "too_soon" as const };
    const [row] = await tx
      .insert(s.staffRequests)
      .values({
        agencyId: p.agencyId,
        clientId: p.clientId,
        contactId: p.contact.id,
        position: clean(input.position),
        worksiteId: input.worksiteId,
        worksiteNote: input.worksiteId ? null : clean(input.worksiteNote),
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        shiftStartMinute: input.shiftStartMinute,
        shiftEndMinute: input.shiftEndMinute,
        headcount: input.headcount,
        notes: clean(input.notes) || null,
      })
      .returning({ id: s.staffRequests.id });
    // Slice r's notifications pick this event up; the audit event is the record either way.
    await auditBy(tx, byContact(p.agencyId, p.contact), [{ action: "create", entityType: "staff_request", entityId: row!.id, after: { event: "staff_request_received", clientId: p.clientId, position: clean(input.position), headcount: input.headcount, startsOn: input.startsOn } }]);
    await onStaffRequest(tx, { agencyId: p.agencyId, requestId: row!.id, clientId: p.clientId });
    return { ok: true as const, requestId: row!.id };
  });
}

/** Where the agency's notifications (slice r) attach: a typed hook, a no-op until they exist. */
export type StaffRequestHook = (tx: Tx, event: { agencyId: string; requestId: string; clientId: string }) => Promise<void>;
let staffRequestHook: StaffRequestHook | null = null;
export function onStaffRequestReceived(hook: StaffRequestHook | null): void {
  staffRequestHook = hook;
}
async function onStaffRequest(tx: Tx, event: { agencyId: string; requestId: string; clientId: string }) {
  if (staffRequestHook) await staffRequestHook(tx, event);
}

/**
 * Opens an approval request from the portal: only for the approver it was sent to (the portal
 * contact with the same email), and only while it waits. A fresh approval link, as "Email me a new
 * link" makes, without the email; the page then opens it.
 */
export async function reviewHoursLink(deps: ApprovalDeps, token: string, requestId: string): Promise<PortalResult<{ approvalToken: string; locale: s.ApprovalLocale }>> {
  return withPortal(deps, token, async (tx, p, now) => {
    const [r] = await tx.select().from(s.approvalRequests).where(and(eq(s.approvalRequests.id, requestId), eq(s.approvalRequests.clientId, p.clientId), eq(s.approvalRequests.status, "open")));
    if (!r) return { ok: false as const, error: "not_found" as const };
    if (r.approverEmail.toLowerCase() !== p.contact.email.toLowerCase()) return { ok: false as const, error: "not_yours" as const };
    const days = await linkDays(tx, now);
    if (days === null) return { ok: false as const, error: "settings_missing" as const };
    const { token: approvalToken, hash } = newApprovalToken();
    const [link] = await tx.insert(s.approvalLinks).values({ agencyId: p.agencyId, requestId: r.id, tokenHash: hash, purpose: "renewal", expiresAt: new Date(now.getTime() + days * DAY_MS), createdAt: now }).returning({ id: s.approvalLinks.id });
    await auditBy(tx, byContact(p.agencyId, p.contact), [{ action: "update", entityType: "approval_request", entityId: r.id, after: { event: "opened_from_portal", linkId: link!.id } }]);
    return { ok: true as const, approvalToken, locale: r.locale };
  });
}

/** "Email me a new link" from an expired portal link: only to the address on file, rarely. */
export async function requestNewPortalLink(deps: ApprovalDeps, token: string): Promise<PortalResult> {
  const found = await resolve(deps, token);
  if (!found) return { ok: false, error: "link_invalid" };
  const now = nowOf(deps);
  const out = await deps.withAgency(found.agencyId, async (tx): Promise<PortalResult<{ pending: Pending }>> => {
    const lc = await linkAndContact(tx, found.linkId);
    if (!lc) return { ok: false, error: "link_invalid" };
    const state = linkState(lc.link, lc.contact, now);
    if (state === "revoked") return { ok: false, error: "link_revoked" };
    if (state === "active") return { ok: false, error: "link_active" };
    if (now.getTime() - lc.link.expiresAt.getTime() > PORTAL_RENEWAL_MAX_DAYS_AFTER_EXPIRY * DAY_MS) return { ok: false, error: "link_too_old" };
    const [locked] = await tx.select().from(s.portalLinks).where(eq(s.portalLinks.id, lc.link.id)).for("update");
    if (locked!.renewalRequestedAt && now.getTime() - locked!.renewalRequestedAt.getTime() < PORTAL_RENEWAL_WAIT_MINUTES * 60_000) return { ok: false, error: "too_soon" };
    const [recent] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.portalLinks)
      .where(and(eq(s.portalLinks.contactId, lc.contact.id), gt(s.portalLinks.createdAt, new Date(now.getTime() - DAY_MS))));
    if ((recent?.n ?? 0) > PORTAL_RENEWALS_PER_DAY) return { ok: false, error: "too_soon" };
    await tx.update(s.portalLinks).set({ renewalRequestedAt: now }).where(eq(s.portalLinks.id, lc.link.id));
    const issued = await issueAndQueue(tx, deps, lc.contact, now);
    if (!issued.ok) return issued;
    await auditBy(tx, byContact(found.agencyId, lc.contact), [contactEvent(lc.contact.id, "portal_link_renewed")]);
    return issued;
  });
  if (!out.ok) return out;
  return (await deliver(deps, out.pending)) ? { ok: true } : { ok: false, error: "send_failed" };
}
