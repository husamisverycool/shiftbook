/**
 * Creates a run's files (SPEC §12, §13): the payroll file for the agency's payroll system and one
 * invoice PDF per client billed. Everything happens under the period's lock: the run is recomputed,
 * must have no blocker, and must match the totals the person reviewed (fingerprint); a run with any
 * blocker gets no files. Each file is stored with its SHA-256 and audited; afterwards the run is
 * exported, the paid entries are locked, and the period can no longer change (period-lock.ts).
 *
 * A correction (slice e, decisions E8–E11) makes only its differences: a payroll file with the
 * additions of the workers it settles (none when nothing is added), and per client a supplemental
 * invoice or a credit note naming the original. Earlier versions' files never change.
 */
import { createHash } from "node:crypto";
import { addDays, formatCents, formatRate, type EarningType } from "@shiftbook/rules";
import { renderToBuffer } from "@react-pdf/renderer";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import en from "../../../messages/en.json";
import { renderExport } from "../../exports/registry";
import { InvoiceDocument, type InvoiceData } from "../../pdf/invoice";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { correctionPlanFor, decisionText, fileWorkers as correctionFileWorkers } from "../run/corrections";
import { lockCatalog, openPeriod } from "../run/period-lock";
import { computeRun, regularRates, type RunIssue } from "../run/service";
import { planCorrectionInvoices, planInvoices } from "./invoice-plan";
import { payrollFixture } from "./payroll-fixture";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";

export class RunNotReadyError extends Error {
  constructor(readonly blockers: RunIssue[]) {
    super(`The run has ${blockers.length} blocking problem${blockers.length === 1 ? "" : "s"}; no files are created until they are resolved.`);
    this.name = "RunNotReadyError";
  }
}

/** The Owner has not approved the run, or its approval no longer matches it (slice e, decision E1). */
export class RunNotApprovedError extends Error {
  constructor() {
    super("The run is not approved as it stands. Review the totals and approve them before creating the files.");
    this.name = "RunNotApprovedError";
  }
}

/** The totals changed between being shown and "Create files": the person must review them again. */
export class TotalsChangedError extends Error {
  constructor() {
    super("The totals changed since they were shown. Review them again before creating the files.");
    this.name = "TotalsChangedError";
  }
}

export interface RunFiles {
  runId: string;
  /** None when a correction adds nothing to anyone's pay. */
  payroll: { exportId: string; filename: string; storageKey: string; sha256: string; controlTotals: s.ControlTotals; notes: string[] } | null;
  invoices: { invoiceId: string; clientId: string; clientName: string; number: string; kind: s.InvoiceKind; originalNumber: string | null; totalCents: number; storageKey: string; sha256: string }[];
}

const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "MW_TRUEUP", "REPORTING_PAY", "HOL", "HOL_NOT_WORKED", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE", "BONUS", "BONUS_OT"];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** 2400 → "40:00"; 37 → "0:37"; −120 → "-2:00" (a plain hyphen: the PDF's standard font has no minus sign). */
const hoursMinutes = (minutes: number) => `${minutes < 0 ? "-" : ""}${Math.trunc(Math.abs(minutes) / 60)}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
const longDate = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

export async function createRunFiles(
  tx: Tx,
  actor: Actor,
  store: DocumentStore,
  payPeriodId: string,
  opts: { today: string; expectedFingerprint?: string },
): Promise<RunFiles> {
  await openPeriod(tx, payPeriodId);
  // Rates and assignments cannot change while this period is paid with them.
  await lockCatalog(tx, actor.agencyId, "shared");
  const computed = await computeRun(tx, actor, payPeriodId);
  if (computed.status === "blocked") throw new RunNotReadyError(computed.blockers);
  if (opts.expectedFingerprint !== undefined && opts.expectedFingerprint !== computed.fingerprint) throw new TotalsChangedError();
  const [run] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  // Files only from what the Owner approved, unchanged since (computing again voids a stale approval).
  if (computed.status !== "approved" || run!.approval?.fingerprint !== computed.fingerprint) throw new RunNotApprovedError();
  const correction = run!.kind === "correction" ? await correctionPlanFor(tx, run!) : null;
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, actor.agencyId));
  const pay = await tx.select().from(s.payLines).where(eq(s.payLines.payRunId, run!.id));
  const bill = await tx.select().from(s.billLines).where(eq(s.billLines.payRunId, run!.id));
  const workerRows = await tx.select().from(s.workers);
  const workersById = new Map(workerRows.map((w) => [w.id, w]));

  // Payroll file: the run's lines; for a correction, the additions of the workers it settles.
  const nameOf = (id: string) => {
    const w = workersById.get(id);
    return w ? `${w.firstName} ${w.lastName}` : id;
  };
  const fileLines = correction
    ? correctionFileWorkers(correction).flatMap((w) => w.fileLines.map((l) => ({ workerId: w.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: l.rate, parts: l.parts })))
    : pay.map((l) => ({ workerId: l.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: { num: l.rateNum, den: l.rateDen } }));
  let payroll: RunFiles["payroll"] = null;
  if (fileLines.length > 0) {
    const fixture = {
      ...(await payrollFixture(tx, period!, fileLines)),
      ...(correction
        ? { correction: { version: run!.version, baseVersion: correction.baseVersion }, referenceRates: regularRates(pay.map((l) => ({ workerId: l.workerId, type: l.type, rate: { num: l.rateNum, den: l.rateDen } }))) }
        : {}),
    };
    const file = renderExport(fixture);
    const fileGross = fileLines.reduce((sum, l) => sum + l.amountCents, 0);
    if (file.controlTotals.grossCents !== fileGross) throw new Error(`Payroll file gross ${file.controlTotals.grossCents} does not equal the run's ${fileGross}.`);
    // The payroll clerk also needs the differences settled outside the file (decision E9).
    const decided = (correction?.workers ?? []).flatMap((w) => w.decisions.map((d) => `${nameOf(w.workerId)}: ${decisionText(d)} — "${d.note}" (${d.decidedByLabel}). Not in this file.`));
    // A cent rounding left over when hours moved at one rate is not paid or taken back: said here.
    const leftovers = (correction?.workers ?? [])
      .filter((w) => w.leftoverCents !== 0)
      .map((w) => `${nameOf(w.workerId)}: ${formatCents(Math.abs(w.leftoverCents))} ${w.leftoverCents > 0 ? "more" : "less"} from rounding each line once when hours moved between days or assignments at one rate; not in this file.`);
    const notes = [...file.notes, ...decided, ...leftovers];
    const payrollKey = `${actor.agencyId}/runs/${run!.id}/${file.filename}`;
    await store.put(payrollKey, file.bytes);
    const payrollSha = sha(file.bytes);
    const [exportRow] = await tx
      .insert(s.exports)
      .values({ agencyId: actor.agencyId, payRunId: run!.id, format: fixture.format, mappingVersion: fixture.mappingVersion, filename: file.filename, sha256: payrollSha, controlTotals: file.controlTotals, notes, storageKey: payrollKey })
      .returning();
    await audit(tx, actor, [{ action: "export", entityType: "export", entityId: exportRow!.id, after: { filename: file.filename, sha256: payrollSha, controlTotals: file.controlTotals } }]);
    payroll = { exportId: exportRow!.id, filename: file.filename, storageKey: payrollKey, sha256: payrollSha, controlTotals: file.controlTotals, notes };
  }

  // One invoice per client billed.
  const assignmentRows = await tx
    .select({ id: s.assignments.id, position: s.jobOrders.position, worksite: s.worksites.name })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId));
  const assignmentsById = new Map(assignmentRows.map((a) => [a.id, a]));
  const invoicesOut: RunFiles["invoices"] = [];
  const t = en.invoice;
  // Exactly the invoices the run checked (the run would have been blocked by any problem).
  const plan = correction
    ? await planCorrectionInvoices(tx, period!, correction.bill)
    : await planInvoices(tx, period!, bill.map((l) => ({ clientId: l.clientId, amountCents: l.amountCents })));
  if (plan.problems.length > 0) throw new Error(`Invoice problems: ${plan.problems.join(" ")}`);
  // A run's bill lines; a correction's differences (with what each was and is now).
  type Row = { workerId: string; assignmentId: string | null; workweekStart: string; type: EarningType; ruleId: string | null; minutes: number; rate: { num: number; den: number }; amountCents: number; was: { minutes: number } | null; now: { minutes: number } | null };
  const rowsOf = (clientId: string): Row[] =>
    correction
      ? correction.bill.filter((d) => d.clientId === clientId).map((d) => ({ workerId: d.workerId, assignmentId: d.assignmentId, workweekStart: d.workweekStart, type: d.type, ruleId: d.ruleId ?? null, minutes: d.minutes, rate: d.rate, amountCents: d.amountCents, was: d.was, now: d.now }))
      : bill.filter((l) => l.clientId === clientId).map((l) => ({ workerId: l.workerId, assignmentId: l.assignmentId, workweekStart: l.workweekStart, type: l.type, ruleId: l.ruleId, minutes: l.minutes, rate: { num: l.rateNum, den: l.rateDen }, amountCents: l.amountCents, was: null, now: null }));
  for (const { clientId, client: c, profile, number, totalCents: planned, kind, original } of plan.plans) {
    const client = c;
    const lines = rowsOf(clientId)
      .map((l) => ({ l, w: workersById.get(l.workerId)!, a: l.assignmentId ? assignmentsById.get(l.assignmentId) : undefined }))
      .sort((x, y) => cmp(x.w.lastName, y.w.lastName) || cmp(x.w.firstName, y.w.firstName) || cmp(x.l.workweekStart, y.l.workweekStart) || TYPE_ORDER.indexOf(x.l.type) - TYPE_ORDER.indexOf(y.l.type));
    const totalCents = lines.reduce((sum, x) => sum + x.l.amountCents, 0);
    if (totalCents !== planned) throw new Error(`Invoice ${number} total ${totalCents} does not equal the planned ${planned}.`);
    // A credit note is not due: it reduces what the original asks for (Stripe credit notes).
    const credit = kind === "credit_note";
    const dueOn = credit ? opts.today : addDays(opts.today, profile.paymentTermsDays);
    const periodText = `${longDate(period!.startsOn)} – ${longDate(period!.endsOn)}`;
    const worksites = [...new Set(lines.map((x) => x.a?.worksite).filter((x): x is string => Boolean(x)))];
    const data: InvoiceData = {
      labels: {
        title: kind === "supplemental" ? t.supplementalTitle : credit ? t.creditNoteTitle : t.title,
        number: credit ? t.creditNoteNumber : t.number,
        issued: t.issued,
        due: t.due,
        billTo: t.billTo,
        description: t.description,
        hours: t.hours,
        rate: t.rate,
        amount: t.amount,
        subtotal: t.subtotal,
        total: t.total,
        amountDueLabel: credit ? t.totalCredited : t.amountDueLabel,
        page: (page, pages) => fill(t.page, { page: String(page), pages: String(pages) }),
      },
      number,
      issuedOn: longDate(opts.today),
      dueOn: credit ? null : longDate(dueOn),
      fields: [
        ...(original ? [{ label: credit ? t.credits : t.addsTo, value: original.number }] : []),
        ...(profile.poNumber ? [{ label: t.po, value: profile.poNumber }] : []),
        { label: t.period, value: periodText },
        ...(worksites.length > 0 ? [{ label: t.worksite, value: worksites.join("; ") }] : []),
      ],
      from: { name: agency!.name, lines: [...agency!.addressLines, agency!.phone ?? "", agency!.email ?? ""].filter(Boolean) },
      billTo: { name: client.name, lines: [...client.addressLines, client.billingEmail ?? ""].filter(Boolean) },
      amountDueLine: credit ? fill(t.creditedLine, { amount: formatCents(-totalCents), number: original!.number }) : fill(t.amountDue, { amount: formatCents(totalCents), date: longDate(dueOn) }),
      lines: lines.map(({ l, w, a }) => ({
        description: `${w.firstName} ${w.lastName}${a ? ` — ${a.position}` : ""}`,
        detail: [
          `${t.earning[l.type]}${l.ruleId === "bill_overtime_not_billable" ? ` (${t.notBillable})` : ""}`,
          fill(t.weekOf, { date: longDate(l.workweekStart) }),
          ...(l.was && l.now ? [fill(t.wasNow, { was: hoursMinutes(l.was.minutes), now: hoursMinutes(l.now.minutes) })] : []),
        ].join(" · "),
        hours: hoursMinutes(l.minutes),
        rate: formatRate(l.rate),
        amount: formatCents(l.amountCents),
      })),
      subtotal: formatCents(totalCents),
      total: formatCents(totalCents),
      amountDue: formatCents(credit ? -totalCents : totalCents),
      footer: t.footer,
    };
    const pdf = new Uint8Array(await renderToBuffer(createElement(InvoiceDocument, { data }) as unknown as ReactElement<DocumentProps>));
    const pdfKey = `${actor.agencyId}/runs/${run!.id}/invoice-${number}.pdf`;
    await store.put(pdfKey, pdf);
    const pdfSha = sha(pdf);
    const [inv] = await tx
      .insert(s.invoices)
      .values({ agencyId: actor.agencyId, clientId, payRunId: run!.id, number, issuedOn: opts.today, dueOn, status: "issued", subtotalCents: totalCents, totalCents, pdfStorageKey: pdfKey, kind, originalInvoiceId: original?.id ?? null })
      .returning();
    await audit(tx, actor, [{ action: "export", entityType: "invoice", entityId: inv!.id, after: { number, kind, original: original?.number ?? null, totalCents, sha256: pdfSha, lines: lines.length } }]);
    invoicesOut.push({ invoiceId: inv!.id, clientId, clientName: client.name, number, kind, originalNumber: original?.number ?? null, totalCents, storageKey: pdfKey, sha256: pdfSha });
  }

  // The paid entries are locked: they can never be paid again. The status they had is kept, so a
  // correction can open them again as they were (decision E13).
  const paidEntryIds = [...new Set(pay.flatMap((l) => l.timeEntryIds))];
  if (paidEntryIds.length > 0) {
    await tx
      .update(s.timeEntries)
      .set({ paidStatus: sql`${s.timeEntries.status}`, status: "locked", updatedAt: new Date() })
      .where(inArray(s.timeEntries.id, paidEntryIds));
  }
  await tx.update(s.payRuns).set({ status: "exported", updatedAt: new Date() }).where(eq(s.payRuns.id, run!.id));
  await audit(tx, actor, [{ action: "update", entityType: "pay_run", entityId: run!.id, before: { status: "ready" }, after: { status: "exported" }, reason: "files created" }]);
  return { runId: run!.id, payroll, invoices: invoicesOut };
}
