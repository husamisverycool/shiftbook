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
import { formatCents } from "@shiftbook/rules";
import { renderToBuffer } from "@react-pdf/renderer";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { renderExport } from "../../exports/registry";
import { InvoiceDocument } from "../../pdf/invoice";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { correctionPlanFor, decisionText, fileWorkers as correctionFileWorkers } from "../run/corrections";
import { lockCatalog, lockPayrollSettings, lockReceivables, openPeriod } from "../run/period-lock";
import { computeRun, regularRates, type RunIssue } from "../run/service";
import { invoiceDocuments, planEntries } from "./invoice-documents";
import { billDifferences, planCorrectionInvoices, planInvoices, planLineOf } from "./invoice-plan";
import { payrollFixture } from "./payroll-fixture";
import { settleStatuses } from "../receivables/balances";
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

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

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
  // Nor the payroll file settings: the file is made with the ones the Owner approved (slice f).
  await lockPayrollSettings(tx, actor.agencyId, "shared");
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
    ? correctionFileWorkers(correction).flatMap((w) => w.weekLines.map((l) => ({ workerId: w.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: l.rate, parts: l.parts, workweekStart: l.workweekStart })))
    : pay.map((l) => ({ workerId: l.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: { num: l.rateNum, den: l.rateDen }, workweekStart: l.workweekStart }));
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

  // The invoices the client's settings call for (slice g), each with its CSV and VMS file.
  const assignmentRows = await tx.select({ id: s.assignments.id, position: s.jobOrders.position }).from(s.assignments).innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId));
  const positions = new Map(assignmentRows.map((a) => [a.id, a.position]));
  const invoicesOut: RunFiles["invoices"] = [];
  // Exactly the invoices the run checked (the run would have been blocked by any problem).
  const plan = correction ? await planCorrectionInvoices(tx, period!, billDifferences(correction.bill)) : await planInvoices(tx, period!, bill.map(planLineOf));
  if (plan.problems.length > 0) throw new Error(`Invoice problems: ${plan.problems.map((p) => p.message).join(" ")}`);
  const entries = await planEntries(tx, plan.plans);
  // A credit note changes what its original still owes: no payment is applied while it is issued
  // (review finding 8; the payment path takes only this lock, so there is no lock cycle).
  if (plan.plans.some((p) => p.kind === "credit_note")) await lockReceivables(tx, agency!.id);
  const ctx = { agency: agency!, period: period!, today: opts.today, workersById };
  for (const p of plan.plans) {
    const { clientId, client, number, kind, original } = p;
    const docs = await invoiceDocuments(tx, store, ctx, p, positions, entries);
    const pdf = new Uint8Array(await renderToBuffer(createElement(InvoiceDocument, { data: docs.data }) as unknown as ReactElement<DocumentProps>));
    const prefix = `${actor.agencyId}/runs/${run!.id}`;
    const pdfKey = `${prefix}/invoice-${number}.pdf`;
    const csvKey = `${prefix}/invoice-${number}.csv`;
    const vmsKey = docs.vms ? `${prefix}/fieldglass-${number}.csv` : null;
    await store.put(pdfKey, pdf);
    await store.put(csvKey, docs.csv);
    if (docs.vms && vmsKey) await store.put(vmsKey, docs.vms.bytes);
    const pdfSha = sha(pdf);
    const [inv] = await tx
      .insert(s.invoices)
      .values({
        agencyId: actor.agencyId,
        clientId,
        payRunId: run!.id,
        number,
        issuedOn: opts.today,
        dueOn: docs.dueOn,
        status: "issued",
        subtotalCents: p.totalCents,
        totalCents: p.totalCents,
        pdfStorageKey: pdfKey,
        kind,
        originalInvoiceId: original?.id ?? null,
        splitKey: p.splitKey,
        template: p.profile.invoiceTemplate,
        poNumber: p.poNumber,
        worksiteId: p.worksite?.id ?? null,
        document: docs.issued,
        csvStorageKey: csvKey,
        vmsStorageKey: vmsKey,
      })
      .returning();
    await audit(tx, actor, [
      {
        action: "export",
        entityType: "invoice",
        entityId: inv!.id,
        after: { number, kind, original: original?.number ?? null, totalCents: p.totalCents, sha256: pdfSha, lines: p.lines.length, csvSha256: sha(docs.csv), ...(docs.vms ? { vms: docs.vms.format, vmsSha256: sha(docs.vms.bytes) } : {}), backup: { detail: docs.issued.backup.detail, pictures: docs.issued.backup.images.reduce((n, x) => n + x.pages.length, 0) } },
      },
    ]);
    invoicesOut.push({ invoiceId: inv!.id, clientId, clientName: client.name, number, kind, originalNumber: original?.number ?? null, totalCents: p.totalCents, storageKey: pdfKey, sha256: pdfSha });
  }

  // A credit note lowers what its original asks for: the original is paid once nothing is left (slice h).
  await settleStatuses(tx, plan.plans.filter((p) => p.kind === "credit_note" && p.original).map((p) => p.original!.id));

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
