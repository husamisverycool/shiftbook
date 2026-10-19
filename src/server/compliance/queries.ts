/**
 * What the compliance screens show (slice j; docs/patterns/compliance.md, compliance/[id].md,
 * compliance/calendar.md, settings/compliance.md). The duties are worked out again before they are
 * shown (decision J3), so the list is never behind the data.
 */
import { citationCodeOf } from "./explain-keys";
import { toDayNumber } from "@shiftbook/rules";
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { Actor } from "../session";
import type { ComplianceRule } from "./generate";
import { ACA_SETTINGS_KEY, acaLimitsOn, acaSettingsOn } from "./aca-data";
import { ratesForDuty, weeksToTrueUp } from "./equal-pay-rates";
import { EQUAL_PAY_KINDS } from "./kinds";
import { keepsNoFiles, MA_CONTACT_KEY, MA_STATEMENT_KEY } from "./service";
import { displayStatus, STATUS_ORDER, type DisplayStatus } from "./status";
import { complianceRules, OPEN_DAYS_KEY, syncIfFree, syncObligations } from "./sync";

export const AREAS = ["registrations", "clients", "placements", "workers", "equal_pay", "workers_comp", "aca"] as const;
export type Area = (typeof AREAS)[number];
export const JURISDICTIONS = ["IL", "MA", "NJ", "US"] as const;

export interface ComplianceFilters {
  area: Area | null;
  /** Statuses shown; empty: the open ones (overdue, due soon, upcoming). */
  statuses: DisplayStatus[];
  jurisdiction: string | null;
  /** "me", "none", or anyone. */
  owner: "me" | "none" | null;
  q: string;
}

export const OPEN_STATUSES: DisplayStatus[] = ["overdue", "due_soon", "upcoming"];

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface ComplianceItem {
  id: string;
  kind: string;
  area: Area;
  jurisdiction: string;
  subjectKind: string;
  /** Who or what it is about, in plain words. */
  subject: string;
  occurrence: string;
  dueOn: string;
  /** Days from today to the due date (negative: late). */
  dueInDays: number;
  remindOn: string | null;
  status: DisplayStatus;
  ownerUserId: string | null;
  ownerName: string | null;
  mayAct: boolean;
  links: { clientId: string | null; workerId: string | null; assignmentId: string | null; registrationId: string | null; policyId: string | null };
}

/** Names behind the subjects. */
async function names(tx: Tx) {
  const [agency, clients, workers, branches, registrations, policies, assignments, users] = await Promise.all([
    tx.select({ name: s.agencies.name }).from(s.agencies).limit(1),
    tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients),
    tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers),
    tx.select({ id: s.branches.id, name: s.branches.name }).from(s.branches),
    tx.select({ id: s.agencyRegistrations.id, number: s.agencyRegistrations.number, branchId: s.agencyRegistrations.branchId, jurisdiction: s.agencyRegistrations.jurisdiction }).from(s.agencyRegistrations),
    tx.select({ id: s.wcPolicies.id, carrier: s.wcPolicies.carrier, policyNumber: s.wcPolicies.policyNumber }).from(s.wcPolicies),
    tx.select({ id: s.assignments.id, position: s.jobOrders.position, clientId: s.jobOrders.clientId }).from(s.assignments).innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId)),
    tx.select({ id: s.users.id, name: s.users.name, role: s.users.role }).from(s.users),
  ]);
  const map = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const c = map(clients);
  const w = map(workers);
  const b = map(branches);
  const r = map(registrations);
  const p = map(policies);
  const a = map(assignments);
  const u = map(users);
  const workerName = (id: string | null) => (id ? `${w.get(id)?.firstName ?? ""} ${w.get(id)?.lastName ?? ""}`.trim() : "");
  const clientName = (id: string | null) => (id ? (c.get(id)?.name ?? "") : "");
  return {
    agencyName: agency[0]?.name ?? "",
    users,
    userName: (id: string | null) => (id ? (u.get(id)?.name ?? null) : null),
    workerName,
    clientName,
    branchName: (id: string | null) => (id ? (b.get(id)?.name ?? null) : null),
    registration: (id: string | null) => (id ? (r.get(id) ?? null) : null),
    policy: (id: string | null) => (id ? (p.get(id) ?? null) : null),
    assignment: (id: string | null) => (id ? (a.get(id) ?? null) : null),
    subject(o: typeof s.obligations.$inferSelect): string {
      switch (o.subjectKind) {
        case "registration": {
          const g = o.registrationId ? r.get(o.registrationId) : undefined;
          const office = g?.branchId ? (b.get(g.branchId)?.name ?? "") : (agency[0]?.name ?? "");
          return g ? `${office} · ${g.number}` : office;
        }
        case "policy": {
          const x = o.policyId ? p.get(o.policyId) : undefined;
          return x ? `${x.carrier} · ${x.policyNumber}` : "";
        }
        case "client":
          return clientName(o.clientId);
        case "assignment": {
          const x = o.assignmentId ? a.get(o.assignmentId) : undefined;
          return [workerName(o.workerId), x?.position, clientName(o.clientId)].filter(Boolean).join(" · ");
        }
        case "worker":
          return workerName(o.workerId);
        default:
          return [workerName(o.workerId), clientName(o.clientId)].filter(Boolean).join(" · ");
      }
    },
  };
}

function itemOf(o: typeof s.obligations.$inferSelect, rules: ComplianceRule[], n: Awaited<ReturnType<typeof names>>, actor: Actor, today: string): ComplianceItem {
  const rule = rules.find((r) => r.code === o.kind);
  const mayAct = actor.role === "owner" || (actor.role !== "accountant" && (rule?.roles ?? []).includes(actor.role));
  return {
    id: o.id,
    kind: o.kind,
    area: (rule?.area ?? "equal_pay") as Area,
    jurisdiction: o.jurisdiction,
    subjectKind: o.subjectKind,
    subject: n.subject(o),
    occurrence: o.occurrence,
    dueOn: o.dueOn,
    dueInDays: toDayNumber(o.dueOn) - toDayNumber(today),
    remindOn: o.remindOn,
    status: displayStatus(o, today),
    ownerUserId: o.ownerUserId,
    ownerName: n.userName(o.ownerUserId),
    mayAct,
    links: { clientId: o.clientId, workerId: o.workerId, assignmentId: o.assignmentId, registrationId: o.registrationId, policyId: o.policyId },
  };
}

const byUrgency = (a: ComplianceItem, b: ComplianceItem) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || cmp(a.dueOn, b.dueOn) || cmp(a.subject, b.subject) || cmp(a.kind, b.kind) || cmp(a.id, b.id);

/** Every duty, worked out again first, with the filters' counts. */
export async function complianceItems(tx: Tx, actor: Actor, today: string): Promise<{ items: ComplianceItem[]; users: { id: string; name: string; role: string }[] }> {
  await syncObligations(tx, actor.agencyId, today);
  const [rows, rules, n] = await Promise.all([tx.select().from(s.obligations), complianceRules(tx), names(tx)]);
  return { items: rows.map((o) => itemOf(o, rules, n, actor, today)).sort(byUrgency), users: n.users.sort((a, b) => cmp(a.name, b.name)) };
}

export function filterItems(items: ComplianceItem[], f: ComplianceFilters, actor: Actor): ComplianceItem[] {
  const statuses = f.statuses.length > 0 ? f.statuses : OPEN_STATUSES;
  const q = f.q.trim().toLowerCase();
  return items.filter(
    (i) =>
      (f.area === null || i.area === f.area) &&
      statuses.includes(i.status) &&
      (f.jurisdiction === null || i.jurisdiction === f.jurisdiction) &&
      (f.owner === null || (f.owner === "me" ? i.ownerUserId === actor.userId : i.ownerUserId === null)) &&
      (q === "" || i.subject.toLowerCase().includes(q) || i.kind.toLowerCase().includes(q)),
  );
}

/** Open duties per area (the side list's counts). */
export const areaCounts = (items: ComplianceItem[]) => Object.fromEntries(AREAS.map((a) => [a, items.filter((i) => i.area === a && OPEN_STATUSES.includes(i.status)).length])) as Record<Area, number>;

/**
 * Overdue and due soon, for the sidebar's badge: worked out again first (a new placement's duty, a date
 * that came into range), unless someone is changing the duties right now.
 */
export async function urgentCount(tx: Tx, agencyId: string, today: string): Promise<number> {
  await syncIfFree(tx, agencyId, today);
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.obligations)
    .where(and(eq(s.obligations.status, "open"), or(lt(s.obligations.dueOn, today), lte(sql`coalesce(${s.obligations.remindOn}, ${s.obligations.dueOn})`, today))));
  return row?.n ?? 0;
}

export async function obligationDetail(tx: Tx, actor: Actor, id: string, today: string) {
  await syncObligations(tx, actor.agencyId, today);
  const [o] = await tx.select().from(s.obligations).where(eq(s.obligations.id, id));
  if (!o) return null;
  const [rules, n] = await Promise.all([complianceRules(tx), names(tx)]);
  const item = itemOf(o, rules, n, actor, today);
  const rule = rules.filter((r) => r.code === o.kind).sort((a, b) => cmp(b.effectiveFrom, a.effectiveFrom)).find((r) => r.effectiveFrom <= o.dueOn) ?? rules.find((r) => r.code === o.kind) ?? null;
  const links = await tx
    .select({ link: s.obligationDocuments, doc: s.complianceDocuments })
    .from(s.obligationDocuments)
    .innerJoin(s.complianceDocuments, eq(s.complianceDocuments.id, s.obligationDocuments.documentId))
    .where(eq(s.obligationDocuments.obligationId, id))
    .orderBy(desc(s.obligationDocuments.linkedAt));
  const notes = await tx.select().from(s.obligationNotes).where(eq(s.obligationNotes.obligationId, id)).orderBy(desc(s.obligationNotes.createdAt));
  const history = await tx
    .select({ at: s.auditEvents.occurredAt, by: s.auditEvents.actorLabel, action: s.auditEvents.action, before: s.auditEvents.before, after: s.auditEvents.after, reason: s.auditEvents.reason })
    .from(s.auditEvents)
    .where(and(eq(s.auditEvents.entityType, "obligation"), eq(s.auditEvents.entityId, id)))
    .orderBy(desc(s.auditEvents.occurredAt), desc(s.auditEvents.id));
  const doc = (x: (typeof links)[number]) => ({ id: x.doc.id, filename: x.doc.filename, effectiveOn: x.doc.effectiveOn, source: x.doc.source, sizeBytes: x.doc.sizeBytes, addedBy: x.link.linkedByLabel, addedAt: x.link.linkedAt, unlinkedAt: x.link.unlinkedAt, unlinkedBy: x.link.unlinkedByLabel });
  const worker = o.workerId ? (await tx.select().from(s.workers).where(eq(s.workers.id, o.workerId)))[0] : undefined;
  const assignment = o.assignmentId ? (await tx.select({ id: s.assignments.id, jobOrderId: s.assignments.jobOrderId, startDate: s.assignments.startDate }).from(s.assignments).where(eq(s.assignments.id, o.assignmentId)))[0] : undefined;
  // The Massachusetts job order's details and what else it needs (slice j step 2).
  // The placement notices' details and what else each needs: the Massachusetts job order (slice j step
  // 2) and New Jersey's form MW-23, which asks no Department contact or statement.
  const notice =
    (o.kind === "ma_job_order" || o.kind === "nj_assignment_notice") && assignment
      ? await (async () => {
          const [job] = await tx.select({ noticeDetails: s.jobOrders.noticeDetails }).from(s.jobOrders).where(eq(s.jobOrders.id, assignment.jobOrderId));
          const settings = await tx.select().from(s.agencySettings).where(and(inArray(s.agencySettings.key, [MA_CONTACT_KEY, MA_STATEMENT_KEY]), isNull(s.agencySettings.effectiveTo)));
          const [agency] = await tx.select({ phone: s.agencies.phone }).from(s.agencies).limit(1);
          const nj = o.kind === "nj_assignment_notice";
          return {
            form: nj ? ("nj" as const) : ("ma" as const),
            details: job?.noticeDetails ?? null,
            hasContact: nj || settings.some((x) => x.key === MA_CONTACT_KEY),
            hasStatement: nj || settings.some((x) => x.key === MA_STATEMENT_KEY),
            hasAgencyPhone: Boolean(agency?.phone),
          };
        })()
      : null;
  // The Illinois proof page shows the registration in force on the day the client checks.
  const proof = ["il_client_proof", "il_client_proof_contract"].includes(o.kind)
    ? await (async () => {
        const on = o.dueOn > today ? o.dueOn : today;
        const regs = await tx.select().from(s.agencyRegistrations).where(eq(s.agencyRegistrations.jurisdiction, "IL"));
        return { on, hasRegistration: regs.some((g) => (g.issuedOn === null || g.issuedOn <= on) && g.expiresOn >= on) };
      })()
    : null;
  return {
    item,
    rule: rule ? { citation: rule.citation, citationCode: citationCodeOf(rule.code, rule.citation), sourceUrl: rule.sourceUrl, anchor: rule.anchor, offsetDays: rule.offsetDays, businessDays: rule.businessDays, remindDays: rule.remindDays, fixedDates: rule.fixedDates } : null,
    facts: o.facts,
    message: o.message,
    explain: o.explain,
    statusNote: o.statusNote,
    noteKey: o.noteKey,
    doneAt: o.doneAt,
    doneByLabel: o.doneByLabel,
    closedBySystem: o.closedBySystem,
    crossedOn: o.crossedOn,
    files: links.filter((x) => x.link.unlinkedAt === null).map(doc),
    pastFiles: links.filter((x) => x.link.unlinkedAt !== null).map(doc),
    notes: notes.map((x) => ({ id: x.id, body: x.body, at: x.createdAt, by: x.createdByLabel })),
    history: history.map((h) => ({ at: h.at, by: h.by, action: h.action, before: h.before as Record<string, unknown> | null, after: h.after as Record<string, unknown> | null, reason: h.reason })),
    users: n.users.sort((a, b) => cmp(a.name, b.name)),
    names: { client: n.clientName(o.clientId) || null, worker: n.workerName(o.workerId) || null, jobOrderId: assignment?.jobOrderId ?? null },
    i9: worker ? { workerId: worker.id, hireDate: worker.hireDate, section1On: worker.i9Section1On, section2On: worker.i9Section2On, workAuthExpiresOn: worker.workAuthExpiresOn } : null,
    // What the data closed, the data keeps closed: reopening it would not last.
    mayReopen: actor.role === "owner" && o.status !== "open" && !o.closedBySystem,
    notice,
    proof,
    /** The Illinois equal-pay rates for the crossing's worker at its client (slice j, J6). */
    equalPay: (EQUAL_PAY_KINDS as readonly string[]).includes(o.kind) && o.workerId && o.clientId ? { rates: await ratesForDuty(tx, o.workerId, o.clientId), trueUps: await weeksToTrueUp(tx, o.workerId, o.clientId) } : null,
    /** Form I-9 copies are never kept here (dates only). */
    keepsNoFiles: keepsNoFiles(o.kind),
    /** Duties Tabulado can make a document for. */
    makes: ["il_client_proof", "il_client_proof_contract", "ma_job_order", "nj_assignment_notice", "wc_audit"].includes(o.kind),
  };
}
export type ObligationDetail = NonNullable<Awaited<ReturnType<typeof obligationDetail>>>;

/** A compliance document the obligation (or settings) holds, for download. */
export async function complianceDocument(tx: Tx, id: string) {
  const [d] = await tx.select().from(s.complianceDocuments).where(eq(s.complianceDocuments.id, id));
  return d ?? null;
}

/** The facts on the settings page: registrations, policies, the Massachusetts statement. */
export async function complianceSettings(tx: Tx, actor: Actor, today: string) {
  await syncObligations(tx, actor.agencyId, today);
  const [registrations, policies, branches, docs, renewals, statement] = await Promise.all([
    tx.select().from(s.agencyRegistrations),
    tx.select().from(s.wcPolicies),
    tx.select({ id: s.branches.id, name: s.branches.name }).from(s.branches),
    tx.select({ id: s.complianceDocuments.id, filename: s.complianceDocuments.filename, createdAt: s.complianceDocuments.createdAt, createdByLabel: s.complianceDocuments.createdByLabel }).from(s.complianceDocuments),
    tx
      .select()
      .from(s.obligations)
      .where(inArray(s.obligations.kind, ["il_registration_renewal", "ma_registration_renewal", "nj_certification_renewal", "wc_policy_renewal", "wc_audit"])),
    tx.select().from(s.agencySettings).where(and(inArray(s.agencySettings.key, [MA_STATEMENT_KEY, MA_CONTACT_KEY, OPEN_DAYS_KEY]), isNull(s.agencySettings.effectiveTo))),
  ]);
  const docName = (id: string | null) => (id ? (docs.find((d) => d.id === id)?.filename ?? null) : null);
  const renewal = (where: (o: (typeof renewals)[number]) => boolean) => {
    const o = renewals.find(where);
    return o ? { id: o.id, status: displayStatus(o, today), dueOn: o.dueOn } : null;
  };
  const newest = <T extends { createdAt: Date; createdByLabel: string }>(rows: T[]) => {
    const r = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return r ? { at: r.createdAt, by: r.createdByLabel } : null;
  };
  const statementId = (statement.find((x) => x.key === MA_STATEMENT_KEY)?.value as { documentId?: string } | undefined)?.documentId ?? null;
  const contact = statement.find((x) => x.key === MA_CONTACT_KEY)?.value;
  const openDays = statement.find((x) => x.key === OPEN_DAYS_KEY);
  // Who set the open days: the audit event of the setting's last change.
  const [openDaysEvent] = openDays
    ? await tx
        .select({ at: s.auditEvents.occurredAt, by: s.auditEvents.actorLabel })
        .from(s.auditEvents)
        .where(and(eq(s.auditEvents.entityType, "agency_setting"), sql`${s.auditEvents.after}->>'key' = ${OPEN_DAYS_KEY}`))
        .orderBy(desc(s.auditEvents.occurredAt))
        .limit(1)
    : [];
  const openDaysChanged = openDaysEvent ? { at: openDaysEvent.at, by: openDaysEvent.by } : null;
  // The ACA look-back's settings in force and the limits they are checked against, with who set them.
  const [aca, acaLimits] = await Promise.all([acaSettingsOn(tx, today), acaLimitsOn(tx, today)]);
  const [acaEvent] = aca
    ? await tx
        .select({ at: s.auditEvents.occurredAt, by: s.auditEvents.actorLabel })
        .from(s.auditEvents)
        .where(and(eq(s.auditEvents.entityType, "agency_setting"), sql`${s.auditEvents.after}->>'key' = ${ACA_SETTINGS_KEY}`))
        .orderBy(desc(s.auditEvents.occurredAt))
        .limit(1)
    : [];
  const statementDoc = statementId ? docs.find((d) => d.id === statementId) : undefined;
  return {
    registrations: registrations
      .sort((a, b) => cmp(a.jurisdiction, b.jurisdiction) || cmp(a.branchId ?? "", b.branchId ?? "") || cmp(b.expiresOn, a.expiresOn))
      .map((g) => ({
        id: g.id,
        jurisdiction: g.jurisdiction,
        branchId: g.branchId,
        branchName: g.branchId ? (branches.find((b) => b.id === g.branchId)?.name ?? null) : null,
        number: g.number,
        issuedOn: g.issuedOn,
        expiresOn: g.expiresOn,
        documentId: g.documentId,
        documentName: docName(g.documentId),
        replaced: registrations.some((o) => o.jurisdiction === g.jurisdiction && o.branchId === g.branchId && o.expiresOn > g.expiresOn),
        renewal: renewal((o) => o.registrationId === g.id),
      })),
    policies: policies
      .sort((a, b) => cmp(b.startsOn, a.startsOn))
      .map((p) => ({ ...p, documentName: docName(p.documentId), renewal: renewal((o) => o.policyId === p.id && o.kind === "wc_policy_renewal"), audit: renewal((o) => o.policyId === p.id && o.kind === "wc_audit") })),
    branches: branches.sort((a, b) => cmp(a.name, b.name)),
    statement: statementDoc ? { id: statementDoc.id, filename: statementDoc.filename, at: statementDoc.createdAt, by: statementDoc.createdByLabel } : null,
    contact: typeof contact === "string" ? contact : null,
    openDays: Array.isArray(openDays?.value) ? (openDays.value as number[]) : [1, 2, 3, 4, 5],
    aca: { settings: aca?.settings ?? null, from: aca?.from ?? null, limits: acaLimits },
    changed: { registrations: newest(registrations), policies: newest(policies), openDays: openDaysChanged, aca: acaEvent ? { at: acaEvent.at, by: acaEvent.by } : null },
  };
}
export type ComplianceSettings = Awaited<ReturnType<typeof complianceSettings>>;
