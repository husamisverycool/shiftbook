/**
 * The documents compliance makes (slice j step 2): the Illinois proof of registration
 * (docs/patterns/_documents/il-registration-proof.md), the Massachusetts job order
 * (_documents/ma-job-order.md) and the workers' comp packet (compliance/workers-comp.md,
 * _documents/wc-audit-packet.md). Each is kept as a generated file and linked to its duty. English, as
 * the law's own forms are; no Social Security numbers anywhere.
 */
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { addDays, floorDiv, formatCents, isEffective, mod, roundHalfUp } from "@shiftbook/rules";
import { eq, inArray } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import en from "../../../messages/en.json";
import { IlProofDocument, type IlProofData } from "../../pdf/il-registration-proof";
import es from "../../../messages/es.json";
import { MaJobOrderDocument, type MaJobOrderData } from "../../pdf/ma-job-order";
import { NjAssignmentNoticeDocument, type NjNoticeData } from "../../pdf/nj-assignment-notice";
import { WcPacketDocument, type WcPacketData } from "../../pdf/wc-audit-packet";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { fill, longDate } from "../files/invoice-documents";
import { doneRuns, firstDays, inForce, multipliers, payDates, PAY_DAY_KEY, rateCards } from "../payroll/paid-lines";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";
import { linkDocument, MA_CONTACT_KEY, MA_STATEMENT_KEY, mayActOn, storeComplianceDocument, type ComplianceResult } from "./service";
import { packet, type PacketLine, type PacketOrder } from "./wc-packet";


const d = en.complianceDocuments;
// New Jersey's form is printed in English and Spanish (form MW-23).
const dn = en.complianceDocuments.njNotice;
const dnEs = es.complianceDocuments.njNotice;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const pdf = async (element: unknown) => new Uint8Array(await renderToBuffer(element as ReactElement<DocumentProps>));
const page = (template: string) => (p: number, n: number) => fill(template, { page: String(p), pages: String(n) });
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function duty(tx: Tx, actor: Actor, id: string, kinds: string[]) {
  if (!UUID.test(id)) return { error: "not_found" as const };
  const [o] = await tx.select().from(s.obligations).where(eq(s.obligations.id, id));
  if (!o || !kinds.includes(o.kind)) return { error: "not_found" as const };
  if (!(await mayActOn(tx, actor, o.kind))) return { error: "not_allowed" as const };
  return { o };
}

async function keep(tx: Tx, actor: Actor, store: DocumentStore, obligationId: string, filename: string, bytes: Uint8Array, today: string): Promise<ComplianceResult> {
  const doc = await storeComplianceDocument(tx, actor, store, { filename, bytes, effectiveOn: today }, "generated");
  if (!doc.ok) return doc;
  await linkDocument(tx, actor, obligationId, doc.id);
  return { ok: true };
}

async function agencyBlock(tx: Tx) {
  const [a] = await tx.select().from(s.agencies).limit(1);
  return { name: a?.name ?? "", phone: a?.phone ?? null, lines: [...(a?.addressLines ?? []), a?.phone ?? "", a?.email ?? ""].filter(Boolean) };
}

/** Text typed on several lines, as its non-empty lines. */
const lines = (text: string | null) => (text ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

/** The workers' comp policy in force on a date that covers a state (a policy naming no state covers all). */
async function policyOn(tx: Tx, date: string, state: string) {
  const policies = await tx.select().from(s.wcPolicies);
  return policies.filter((p) => p.startsOn <= date && p.endsOn >= date && (p.states.length === 0 || p.states.includes(state))).sort((a, b) => cmp(b.startsOn, a.startsOn))[0] ?? null;
}

/** The Illinois proof of registration for a client (820 ILCS 175/85(a); 56 Ill. Adm. Code 260.510). */
export async function createProofPage(tx: Tx, actor: Actor, store: DocumentStore, obligationId: string, today: string): Promise<ComplianceResult> {
  const r = await duty(tx, actor, obligationId, ["il_client_proof", "il_client_proof_contract"]);
  if ("error" in r) return { ok: false, error: r.error! };
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, r.o.clientId!));
  if (!client) return { ok: false, error: "not_found" };
  // The registration the client checks on the duty's date (made early) or today (made late).
  const on = r.o.dueOn > today ? r.o.dueOn : today;
  const live = (await tx.select().from(s.agencyRegistrations)).filter((g) => g.jurisdiction === "IL" && (g.issuedOn === null || g.issuedOn <= on) && g.expiresOn >= on);
  if (!live.some((g) => g.branchId === null)) return { ok: false, error: "invalid", field: "registration" };
  const branches = await tx.select().from(s.branches);
  // The newest registration per office.
  const offices = new Map<string, (typeof live)[number]>();
  for (const g of live.sort((a, b) => cmp(a.expiresOn, b.expiresOn))) offices.set(g.branchId ?? "", g);
  const agency = await agencyBlock(tx);
  const policy = await policyOn(tx, on, "IL");
  const data: IlProofData = {
    labels: { ...d.ilProof, page: page(d.page) },
    made: longDate(today),
    agency,
    client: { name: client.name, lines: client.addressLines },
    registrations: [...offices.values()]
      .sort((a, b) => (a.branchId === null ? -1 : b.branchId === null ? 1 : 0))
      .map((g) => ({ office: g.branchId ? (branches.find((b) => b.id === g.branchId)?.name ?? "") : fill(d.ilProof.agencyOffice, { name: agency.name }), number: g.number, issued: g.issuedOn ? longDate(g.issuedOn) : "—", expires: longDate(g.expiresOn) })),
    policy: policy ? { insurer: policy.carrier, number: policy.policyNumber, period: `${longDate(policy.startsOn)} – ${longDate(policy.endsOn)}` } : null,
    noPolicy: fill(d.ilProof.noPolicy, { date: longDate(on) }),
    howToCheck: d.ilProof.howToCheckText,
  };
  const bytes = await pdf(createElement(IlProofDocument, { data }));
  return keep(tx, actor, store, obligationId, `il-proof-of-registration-${client.code}-${today}.pdf`, bytes, today);
}

export interface NoticeDetailsInput {
  employerPhone: unknown;
  startTime: unknown;
  endTime: unknown;
  overtime: unknown;
  requirements: unknown;
  meals: unknown;
  transport: unknown;
  strike: unknown;
  /** New Jersey's form MW-23 questions (the New Jersey duty only). */
  nj?: unknown;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const short = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
/** An answer that may be empty ("No" on form MW-23). */
const optional = (v: unknown, max: number) => typeof v === "string" && v.trim().length <= max;
const NJ_QUESTIONS = ["training", "equipment", "clothing", "protective", "licenses"] as const;

/**
 * The job order's details for its placements' notices — the Massachusetts job order and New Jersey's
 * form MW-23 — kept on the job order and audited. Each duty asks for what its notice needs.
 */
export async function saveNoticeDetails(tx: Tx, actor: Actor, obligationId: string, input: NoticeDetailsInput): Promise<ComplianceResult> {
  const r = await duty(tx, actor, obligationId, ["ma_job_order", "nj_assignment_notice"]);
  if ("error" in r) return { ok: false, error: r.error! };
  const nj = r.o.kind === "nj_assignment_notice";
  if (!short(input.employerPhone, 40)) return { ok: false, error: "invalid", field: "employerPhone" };
  if (typeof input.startTime !== "string" || !TIME.test(input.startTime)) return { ok: false, error: "invalid", field: "startTime" };
  if (typeof input.endTime !== "string" || !TIME.test(input.endTime)) return { ok: false, error: "invalid", field: "endTime" };
  for (const field of ["meals", "transport"] as const) if (!short(input[field], 300)) return { ok: false, error: "invalid", field };
  const [a] = await tx.select({ jobOrderId: s.assignments.jobOrderId }).from(s.assignments).where(eq(s.assignments.id, r.o.assignmentId!));
  if (!a) return { ok: false, error: "not_found" };
  const [job] = await tx.select().from(s.jobOrders).where(eq(s.jobOrders.id, a.jobOrderId));
  const before = job?.noticeDetails ?? null;
  let noticeDetails: s.NoticeDetails;
  if (nj) {
    const q = (input.nj && typeof input.nj === "object" ? input.nj : {}) as Record<string, unknown>;
    if (!short(q.description, 300)) return { ok: false, error: "invalid", field: "description" };
    for (const field of NJ_QUESTIONS) if (!optional(q[field], 300)) return { ok: false, error: "invalid", field };
    const answers = Object.fromEntries(NJ_QUESTIONS.map((f) => [f, (q[f] as string).trim()])) as Omit<s.NjNoticeDetails, "description">;
    // The Massachusetts answers the New Jersey form does not ask stay as they were.
    noticeDetails = {
      employerPhone: (input.employerPhone as string).trim(),
      startTime: input.startTime,
      endTime: input.endTime,
      overtime: before?.overtime ?? "possible",
      requirements: before?.requirements ?? "",
      meals: (input.meals as string).trim(),
      transport: (input.transport as string).trim(),
      strike: before?.strike ?? false,
      nj: { description: (q.description as string).trim(), ...answers },
    };
  } else {
    if (input.overtime !== "yes" && input.overtime !== "no" && input.overtime !== "possible") return { ok: false, error: "invalid", field: "overtime" };
    if (!short(input.requirements, 300)) return { ok: false, error: "invalid", field: "requirements" };
    if (typeof input.strike !== "boolean") return { ok: false, error: "invalid", field: "strike" };
    noticeDetails = {
      employerPhone: (input.employerPhone as string).trim(),
      startTime: input.startTime,
      endTime: input.endTime,
      overtime: input.overtime,
      requirements: (input.requirements as string).trim(),
      meals: (input.meals as string).trim(),
      transport: (input.transport as string).trim(),
      strike: input.strike,
      ...(before?.nj ? { nj: before.nj } : {}),
    };
  }
  await tx.update(s.jobOrders).set({ noticeDetails }).where(eq(s.jobOrders.id, a.jobOrderId));
  await audit(tx, actor, [{ action: "update", entityType: "job_order", entityId: a.jobOrderId, before: { noticeDetails: job?.noticeDetails ?? null }, after: { noticeDetails } }]);
  return { ok: true };
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** The Massachusetts job order for a placement (M.G.L. c. 149 § 159C(b); 454 CMR 24.08). */
export async function createJobOrderNotice(tx: Tx, actor: Actor, store: DocumentStore, obligationId: string, today: string): Promise<ComplianceResult> {
  const r = await duty(tx, actor, obligationId, ["ma_job_order"]);
  if ("error" in r) return { ok: false, error: r.error! };
  const [a] = await tx.select().from(s.assignments).where(eq(s.assignments.id, r.o.assignmentId!));
  if (!a) return { ok: false, error: "not_found" };
  const [job] = await tx.select().from(s.jobOrders).where(eq(s.jobOrders.id, a.jobOrderId));
  // Details saved before the employer's phone was asked for are incomplete.
  if (!job?.noticeDetails?.employerPhone) return { ok: false, error: "invalid", field: "details" };
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, job.clientId));
  const [site] = await tx.select().from(s.worksites).where(eq(s.worksites.id, job.worksiteId));
  const [worker] = await tx.select().from(s.workers).where(eq(s.workers.id, a.workerId));
  const contactRows = await tx.select().from(s.agencySettings).where(inArray(s.agencySettings.key, [MA_CONTACT_KEY, MA_STATEMENT_KEY, PAY_DAY_KEY, "workweek_starts_on"]));
  const setting = (key: string) => inForce(contactRows.filter((x) => x.key === key), today)?.value;
  const contact = setting(MA_CONTACT_KEY);
  if (typeof contact !== "string" || contact.trim() === "") return { ok: false, error: "invalid", field: "department" };
  const statementId = (setting(MA_STATEMENT_KEY) as { documentId?: string } | undefined)?.documentId ?? null;
  const card = (await rateCards(tx))(a.id, job.id, a.startDate, a.startDate);
  const policy = await policyOn(tx, a.startDate, "MA");
  const agency = await agencyBlock(tx);
  if (!agency.phone) return { ok: false, error: "invalid", field: "agency_phone" };
  const n = job.noticeDetails;
  // Pay day: the first pay period's last day + the pay day, each as in force when that period ends.
  const fromFacts = (r.o.facts as Record<string, unknown>).firstPeriodEnd;
  const periodEnd = typeof fromFacts === "string" ? fromFacts : a.startDate;
  const weekStart = inForce(contactRows.filter((x) => x.key === "workweek_starts_on"), periodEnd)?.value;
  const startsOn = typeof weekStart === "number" ? weekStart : 1;
  const payDayAfter = inForce(contactRows.filter((x) => x.key === PAY_DAY_KEY), periodEnd)?.value;
  const days = typeof payDayAfter === "number" ? payDayAfter : 0;
  const lastDay = mod(startsOn + 6, 7);
  const payDay = days === 0 ? fill(d.maJobOrder.payDaySameDay, { weekday: WEEKDAYS[lastDay]! }) : fill(d.maJobOrder.payDayText, { weekday: WEEKDAYS[mod(lastDay + days, 7)]!, days: String(days) });
  const rate = card ? `${formatCents(card.payRateCents)} an hour` : "—";
  // The overtime rate shown to the worker: the pay rate × Massachusetts' weekly overtime multiplier
  // (overtime_rules; the rate card's multipliers are for billing), rounded half up to the cent.
  const ot = (await multipliers(tx))("weekly_overtime", "MA", a.startDate);
  const overtimeRate = card && ot ? formatCents(roundHalfUp(card.payRateCents * ot.num, ot.den)) : "—";
  const data: MaJobOrderData = {
    labels: { ...d.maJobOrder, page: page(d.page) },
    worker: worker ? `${worker.firstName} ${worker.lastName}` : "",
    starts: longDate(a.startDate),
    made: longDate(today),
    agency: [agency.name, ...agency.lines],
    insurer: policy ? [policy.carrier, ...lines(policy.carrierContact), fill(d.maJobOrder.policyLine, { number: policy.policyNumber })] : [d.maJobOrder.noPolicy],
    client: [client?.name ?? "", site ? `${site.addressLine}, ${site.city}, ${site.state} ${site.postalCode}` : "", n.employerPhone].filter(Boolean),
    department: lines(contact),
    position: job.position,
    soc: job.socCode ?? "—",
    requirements: n.requirements,
    rate,
    payDay,
    overtime: n.overtime === "no" ? d.maJobOrder.overtimeNo : fill(n.overtime === "yes" ? d.maJobOrder.overtimeYes : d.maJobOrder.overtimePossible, { rate: overtimeRate }),
    times: `${clock(n.startTime)} – ${clock(n.endTime)}`,
    duration: a.endDate ? fill(d.maJobOrder.until, { date: longDate(a.endDate) }) : d.maJobOrder.noEnd,
    meals: n.meals,
    transport: n.transport,
    strike: n.strike ? d.maJobOrder.strikeYes : d.maJobOrder.strikeNo,
    statement: statementId ? d.maJobOrder.statementAttached : d.maJobOrder.statementMissing,
  };
  const bytes = await pdf(createElement(MaJobOrderDocument, { data }));
  const name = worker ? `${worker.lastName}-${worker.firstName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-") : a.id;
  const result = await keep(tx, actor, store, obligationId, `ma-job-order-${name}-${a.startDate}.pdf`, bytes, today);
  // The Department's statement goes with it (kept as the same duty's evidence).
  if (result.ok && statementId) await linkDocument(tx, actor, obligationId, statementId);
  return result;
}

/**
 * New Jersey's Temporary Laborer Assignment Notification for a placement: the fields of form MW-23,
 * in English and Spanish as the form prints them (N.J.S.A. 34:8D-3(a); N.J.A.C. 12:72-3.1).
 */
export async function createNjAssignmentNotice(tx: Tx, actor: Actor, store: DocumentStore, obligationId: string, today: string): Promise<ComplianceResult> {
  const r = await duty(tx, actor, obligationId, ["nj_assignment_notice"]);
  if ("error" in r) return { ok: false, error: r.error! };
  const [a] = await tx.select().from(s.assignments).where(eq(s.assignments.id, r.o.assignmentId!));
  if (!a) return { ok: false, error: "not_found" };
  const [job] = await tx.select().from(s.jobOrders).where(eq(s.jobOrders.id, a.jobOrderId));
  const n = job?.noticeDetails;
  if (!job || !n?.employerPhone || !n.nj) return { ok: false, error: "invalid", field: "details" };
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, job.clientId));
  const [site] = await tx.select().from(s.worksites).where(eq(s.worksites.id, job.worksiteId));
  const [worker] = await tx.select().from(s.workers).where(eq(s.workers.id, a.workerId));
  const agency = await agencyBlock(tx);
  if (!agency.phone) return { ok: false, error: "invalid", field: "agency_phone" };
  const card = (await rateCards(tx))(a.id, job.id, a.startDate, a.startDate);
  const ot = (await multipliers(tx))("weekly_overtime", "NJ", a.startDate);
  const policy = await policyOn(tx, a.startDate, "NJ");
  const both = <K extends keyof typeof dn>(k: K) => ({ en: dn[k], es: dnEs[k] });
  const siteLines = site ? [site.name, site.addressLine, `${site.city}, ${site.state} ${site.postalCode}`] : [];
  const clientLines = [client?.name ?? "", ...(client?.addressLines ?? []), n.employerPhone].filter(Boolean);
  // The worksite block says "same as above" only when the client's address is the worksite's.
  const sameSite = site !== undefined && (client?.addressLines ?? []).some((line) => line.includes(site.addressLine));
  const rate = card ? formatCents(card.payRateCents) : "—";
  const overtimeRate = card && ot ? formatCents(roundHalfUp(card.payRateCents * ot.num, ot.den)) : "—";
  const data: NjNoticeData = {
    labels: {
      title: both("title"),
      law: both("law"),
      intro: both("intro"),
      laborer: both("laborer"),
      firm: both("firm"),
      client: both("client"),
      carrier: both("carrier"),
      worksite: both("worksite"),
      sameWorksite: both("sameWorksite"),
      work: both("work"),
      description: both("description"),
      wages: both("wages"),
      schedule: both("schedule"),
      training: both("training"),
      meals: both("meals"),
      equipment: both("equipment"),
      clothing: both("clothing"),
      protective: both("protective"),
      licenses: both("licenses"),
      transport: both("transport"),
      no: both("no"),
      yes: both("yes"),
      sickLeave: both("sickLeave"),
      made: both("made"),
      page: page(d.page),
    },
    laborer: worker ? `${worker.firstName} ${worker.lastName}` : "",
    firm: [agency.name, ...agency.lines],
    client: clientLines,
    carrier: policy ? [policy.carrier, ...lines(policy.carrierContact), fill(dn.policyLine, { number: policy.policyNumber })] : [fill(dn.noPolicy, { date: longDate(a.startDate) })],
    worksite: sameSite ? null : siteLines,
    work: job.socCode ? `${job.position} (SOC ${job.socCode})` : job.position,
    description: n.nj.description,
    wages: fill(dn.wagesText, { rate, overtime: overtimeRate }),
    schedule: fill(dn.scheduleText, { times: `${clock(n.startTime)} – ${clock(n.endTime)}`, duration: a.endDate ? fill(dn.until, { date: longDate(a.endDate) }) : dn.noEnd }),
    training: n.nj.training,
    meals: /^(no|none|n\/a)\.?$/i.test(n.meals) ? "" : n.meals,
    equipment: n.nj.equipment,
    clothing: n.nj.clothing,
    protective: n.nj.protective,
    licenses: n.nj.licenses,
    transport: /^(no|none|n\/a)\.?$/i.test(n.transport) ? "" : n.transport,
    made: longDate(today),
  };
  const bytes = await pdf(createElement(NjAssignmentNoticeDocument, { data }));
  const name = worker ? `${worker.lastName}-${worker.firstName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-") : a.id;
  return keep(tx, actor, store, obligationId, `nj-assignment-notice-${name}-${a.startDate}.pdf`, bytes, today);
}

/** What was paid by state, class and worker for pay dates in a range, with the premiums apart (decision J7). */
export async function wcPacketView(tx: Tx, q: { from: string; to: string; order: PacketOrder }) {
  const { all, latest } = await doneRuns(tx);
  const { payDateFor } = await payDates(tx);
  const runs = latest.filter((r) => {
    const paid = payDateFor(r.endsOn);
    return paid >= q.from && paid <= q.to;
  });
  const runIds = runs.map((r) => r.id);
  const pays = runIds.length > 0 ? await tx.select().from(s.payLines).where(inArray(s.payLines.payRunId, runIds)) : [];
  const [assignments, jobOrders, worksites, workers, wcs, multiplierOf, firstDay, cardOf] = await Promise.all([
    tx.select({ id: s.assignments.id, jobOrderId: s.assignments.jobOrderId }).from(s.assignments),
    tx.select({ id: s.jobOrders.id, worksiteId: s.jobOrders.worksiteId }).from(s.jobOrders),
    tx.select({ id: s.worksites.id, state: s.worksites.state }).from(s.worksites),
    tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName, wcState: s.workers.wcState }).from(s.workers),
    tx.select().from(s.wcRates),
    multipliers(tx),
    firstDays(tx, pays),
    rateCards(tx),
  ]);
  const lines: PacketLine[] = pays.map((p) => {
    const a = assignments.find((x) => x.id === p.assignmentId);
    const job = a ? jobOrders.find((j) => j.id === a.jobOrderId) : undefined;
    const site = job ? (worksites.find((w) => w.id === job.worksiteId)?.state ?? null) : null;
    const w = workers.find((x) => x.id === p.workerId);
    const card = cardOf(p.assignmentId, job?.id ?? null, firstDay(p), p.workweekStart);
    return {
      workerId: p.workerId,
      workerName: w ? `${w.firstName} ${w.lastName}` : "",
      state: w?.wcState ?? site,
      classCode: card?.wcClassCode ?? null,
      type: p.type,
      minutes: p.minutes,
      amountCents: p.amountCents,
      multiplier: p.type === "OT" || p.type === "DT" ? multiplierOf(p.ruleId, site, p.workweekStart) : null,
    };
  });
  const result = packet(lines, q.order);
  // Every version's payroll files of those periods: their gross is what the payroll system was told to pay.
  const periods = new Set(runs.map((r) => r.payPeriodId));
  const fileRunIds = all.filter((r) => periods.has(r.payPeriodId)).map((r) => r.id);
  const files = fileRunIds.length > 0 ? await tx.select({ payRunId: s.exports.payRunId, controlTotals: s.exports.controlTotals, createdAt: s.exports.createdAt }).from(s.exports).where(inArray(s.exports.payRunId, fileRunIds)) : [];
  // One file per run (the first made; a run exported in two systems' formats counts once).
  const byRun = new Map<string, number>();
  for (const f of files.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) if (!byRun.has(f.payRunId)) byRun.set(f.payRunId, f.controlTotals.grossCents);
  const filesGrossCents = [...byRun.values()].reduce((t, v) => t + v, 0);
  // What corrections settled outside the files (paid by hand, offset, repaid, deducted, written off):
  // the latest version counts it, the files never carried it.
  const decisions = fileRunIds.length > 0 ? await tx.select({ differenceCents: s.correctionDecisions.differenceCents }).from(s.correctionDecisions).where(inArray(s.correctionDecisions.payRunId, fileRunIds)) : [];
  const settledCents = decisions.reduce((t, x) => t + x.differenceCents, 0);
  const description = (state: string, classCode: string) => wcs.filter((r) => r.state === state && r.classCode === classCode).sort((a, b) => cmp(b.effectiveFrom, a.effectiveFrom))[0]?.description ?? null;
  return {
    ...result,
    classes: result.classes.map((c) => ({ ...c, description: description(c.state, c.classCode) })),
    from: q.from,
    to: q.to,
    order: q.order,
    runs: runs.length,
    files: byRun.size,
    filesGrossCents,
    settledCents,
    decisions: decisions.length,
    differenceCents: result.allPayCents - filesGrossCents - settledCents,
  };
}
export type WcPacketView = Awaited<ReturnType<typeof wcPacketView>>;

/** The default range: the policy in force today (any state), else the year to today. */
export async function packetRange(tx: Tx, today: string): Promise<{ from: string; to: string; policy: { carrier: string; policyNumber: string } | null }> {
  const policies = await tx.select().from(s.wcPolicies);
  const p = policies.filter((x) => isEffective(today, x.startsOn, x.endsOn)).sort((a, b) => cmp(b.startsOn, a.startsOn))[0];
  return p ? { from: p.startsOn, to: p.endsOn, policy: { carrier: p.carrier, policyNumber: p.policyNumber } } : { from: addDays(today, -364), to: today, policy: null };
}

const hours = (minutes: number) => {
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(minutes);
  return `${sign}${floorDiv(m, 60)}:${String(mod(m, 60)).padStart(2, "0")}`;
};

export function packetPdfData(v: WcPacketView, agency: string, insurer: string, today: string): WcPacketData {
  const f = (x: { minutes: number; straightCents: number; otPremiumCents: number; dtPremiumCents: number; otherCents: number; totalCents: number }) => ({ hours: hours(x.minutes), straight: formatCents(x.straightCents), ot: formatCents(x.otPremiumCents), dt: formatCents(x.dtPremiumCents), other: formatCents(x.otherCents), total: formatCents(x.totalCents) });
  return {
    labels: { ...d.wcPacket, page: page(d.page) },
    agency,
    insurer,
    range: `${longDate(v.from)} – ${longDate(v.to)}`,
    made: longDate(today),
    classes: v.classes.map((c) => ({ state: c.state, classCode: c.classCode, description: c.description ?? "", ...f(c) })),
    rows: v.rows.map((r) => ({ state: r.state, classCode: r.classCode, worker: r.workerName, ...f(r) })),
    totals: f(v.totals),
    missing: v.missing.map((m) => ({ worker: m.workerName, state: m.state ?? "—", hours: hours(m.minutes), total: formatCents(m.totalCents) })),
    tieOut: fill(v.differenceCents !== 0 ? d.wcPacket.tieOutDifferent : v.settledCents !== 0 ? d.wcPacket.tieOutSettled : d.wcPacket.tieOutEqual, { files: String(v.files), gross: formatCents(v.filesGrossCents), settled: formatCents(v.settledCents), packet: formatCents(v.allPayCents), difference: formatCents(v.differenceCents) }),
  };
}

export async function packetPdf(tx: Tx, v: WcPacketView, today: string): Promise<Uint8Array> {
  const agency = await agencyBlock(tx);
  const policy = (await tx.select().from(s.wcPolicies)).filter((p) => p.startsOn <= v.to && p.endsOn >= v.from).sort((a, b) => cmp(b.startsOn, a.startsOn))[0];
  return pdf(createElement(WcPacketDocument, { data: packetPdfData(v, agency.name, policy ? `${policy.carrier} · ${policy.policyNumber}` : "—", today) }));
}

/** The packet for an audit duty: its policy's period, kept as the duty's evidence. */
export async function createPacketDocument(tx: Tx, actor: Actor, store: DocumentStore, obligationId: string, today: string): Promise<ComplianceResult> {
  const r = await duty(tx, actor, obligationId, ["wc_audit"]);
  if ("error" in r) return { ok: false, error: r.error! };
  const [policy] = await tx.select().from(s.wcPolicies).where(eq(s.wcPolicies.id, r.o.policyId!));
  if (!policy) return { ok: false, error: "not_found" };
  const v = await wcPacketView(tx, { from: policy.startsOn, to: policy.endsOn, order: "state" });
  const bytes = await packetPdf(tx, v, today);
  return keep(tx, actor, store, obligationId, `workers-comp-packet-${policy.policyNumber.replace(/[^A-Za-z0-9-]+/g, "-")}-${today}.pdf`, bytes, today);
}

/** The packet as CSV, the screen's table (Patriot: PDF or CSV). Amounts in dollars, a cell a spreadsheet would run kept as text. */
export function packetCsv(v: WcPacketView): string {
  const money = (c: number) => (c < 0 ? `-${formatCents(-c).slice(1)}` : formatCents(c).slice(1)).replaceAll(",", "");
  const cell = (x: string) => {
    const safe = /^[=+\-@\t\r]/.test(x) && Number.isNaN(Number(x)) ? `'${x}` : x;
    return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  const head = ["State", "Class", "Worker", "Hours", "Straight time", "Overtime premium", "Double-time premium", "Other pay", "Total pay"];
  const rows = [
    ...v.rows.map((r) => [r.state, r.classCode, r.workerName, hours(r.minutes), money(r.straightCents), money(r.otPremiumCents), money(r.dtPremiumCents), money(r.otherCents), money(r.totalCents)]),
    ...v.missing.map((m) => [m.state ?? "", "", m.workerName, hours(m.minutes), "", "", "", "", money(m.totalCents)]),
  ];
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
