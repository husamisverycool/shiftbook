/**
 * Creates a run's files (SPEC §12, §13): the payroll file for the agency's payroll system and one
 * invoice PDF per client billed. Everything happens under the period's lock: the run is recomputed,
 * must have no blocker, and must match the totals the person reviewed (fingerprint); a run with any
 * blocker gets no files. Each file is stored with its SHA-256 and audited; afterwards the run is
 * exported, the paid entries are locked, and the period can no longer change (period-lock.ts).
 */
import { createHash } from "node:crypto";
import { addDays, formatCents, formatRate, type EarningType } from "@shiftbook/rules";
import { renderToBuffer } from "@react-pdf/renderer";
import { desc, eq, inArray } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import en from "../../../messages/en.json";
import { renderExport } from "../../exports/registry";
import { InvoiceDocument, type InvoiceData } from "../../pdf/invoice";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { openPeriod } from "../run/period-lock";
import { computeRun, type RunIssue } from "../run/service";
import { payrollFixture } from "./payroll-fixture";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";

export class RunNotReadyError extends Error {
  constructor(readonly blockers: RunIssue[]) {
    super(`The run has ${blockers.length} blocking problem${blockers.length === 1 ? "" : "s"}; no files are created until they are resolved.`);
    this.name = "RunNotReadyError";
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
  payroll: { exportId: string; filename: string; storageKey: string; sha256: string; controlTotals: s.ControlTotals; notes: string[] };
  invoices: { invoiceId: string; clientId: string; clientName: string; number: string; totalCents: number; storageKey: string; sha256: string }[];
}

const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "HOL", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE"];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const effective = (date: string, from: string, to: string | null) => from <= date && (to === null || date <= to);
/** 2400 → "40:00"; 37 → "0:37". */
const hoursMinutes = (minutes: number) => `${Math.trunc(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
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
  const computed = await computeRun(tx, actor, payPeriodId);
  if (computed.status !== "ready") throw new RunNotReadyError(computed.blockers);
  if (opts.expectedFingerprint !== undefined && opts.expectedFingerprint !== computed.fingerprint) throw new TotalsChangedError();
  const [run] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, actor.agencyId));
  const pay = await tx.select().from(s.payLines).where(eq(s.payLines.payRunId, run!.id));
  const bill = await tx.select().from(s.billLines).where(eq(s.billLines.payRunId, run!.id));
  const workerRows = await tx.select().from(s.workers);
  const workersById = new Map(workerRows.map((w) => [w.id, w]));

  // Payroll file.
  const fixture = await payrollFixture(
    tx,
    period!,
    pay.map((l) => ({ workerId: l.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: { num: l.rateNum, den: l.rateDen } })),
  );
  const file = renderExport(fixture);
  const runGross = pay.reduce((sum, l) => sum + l.amountCents, 0);
  if (file.controlTotals.grossCents !== runGross) throw new Error(`Payroll file gross ${file.controlTotals.grossCents} does not equal the run's ${runGross}.`);
  const payrollKey = `${actor.agencyId}/runs/${run!.id}/${file.filename}`;
  await store.put(payrollKey, file.bytes);
  const payrollSha = sha(file.bytes);
  const [exportRow] = await tx
    .insert(s.exports)
    .values({ agencyId: actor.agencyId, payRunId: run!.id, format: fixture.format, mappingVersion: fixture.mappingVersion, filename: file.filename, sha256: payrollSha, controlTotals: file.controlTotals, notes: file.notes, storageKey: payrollKey })
    .returning();
  await audit(tx, actor, [{ action: "export", entityType: "export", entityId: exportRow!.id, after: { filename: file.filename, sha256: payrollSha, controlTotals: file.controlTotals } }]);

  // One invoice per client billed.
  const assignmentRows = await tx
    .select({ id: s.assignments.id, position: s.jobOrders.position, worksite: s.worksites.name })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId));
  const assignmentsById = new Map(assignmentRows.map((a) => [a.id, a]));
  const invoicesOut: RunFiles["invoices"] = [];
  const t = en.invoice;
  for (const clientId of [...new Set(bill.map((l) => l.clientId))].sort(cmp)) {
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, clientId));
    const profiles = await tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, clientId));
    const profile = profiles.find((p) => effective(period!.endsOn, p.effectiveFrom, p.effectiveTo));
    if (!profile) throw new Error(`${client!.name} has no billing profile in effect on ${period!.endsOn}.`);
    const lines = bill
      .filter((l) => l.clientId === clientId)
      .map((l) => ({ l, w: workersById.get(l.workerId)!, a: l.assignmentId ? assignmentsById.get(l.assignmentId) : undefined }))
      .sort((x, y) => cmp(x.w.lastName, y.w.lastName) || cmp(x.w.firstName, y.w.firstName) || cmp(x.l.workweekStart, y.l.workweekStart) || TYPE_ORDER.indexOf(x.l.type) - TYPE_ORDER.indexOf(y.l.type));
    const totalCents = lines.reduce((sum, x) => sum + x.l.amountCents, 0);
    const number = `${client!.code}-${period!.startsOn.replaceAll("-", "")}${run!.version > 1 ? `-v${run!.version}` : ""}`;
    const dueOn = addDays(opts.today, profile.paymentTermsDays);
    const periodText = `${longDate(period!.startsOn)} – ${longDate(period!.endsOn)}`;
    const worksites = [...new Set(lines.map((x) => x.a?.worksite).filter((x): x is string => Boolean(x)))];
    const data: InvoiceData = {
      labels: {
        title: t.title,
        number: t.number,
        issued: t.issued,
        due: t.due,
        billTo: t.billTo,
        description: t.description,
        hours: t.hours,
        rate: t.rate,
        amount: t.amount,
        subtotal: t.subtotal,
        total: t.total,
        amountDueLabel: t.amountDueLabel,
        page: (page, pages) => fill(t.page, { page: String(page), pages: String(pages) }),
      },
      number,
      issuedOn: longDate(opts.today),
      dueOn: longDate(dueOn),
      fields: [
        ...(profile.poNumber ? [{ label: t.po, value: profile.poNumber }] : []),
        { label: t.period, value: periodText },
        ...(worksites.length > 0 ? [{ label: t.worksite, value: worksites.join("; ") }] : []),
      ],
      from: { name: agency!.name, lines: [...agency!.addressLines, agency!.phone ?? "", agency!.email ?? ""].filter(Boolean) },
      billTo: { name: client!.name, lines: [...client!.addressLines, client!.billingEmail ?? ""].filter(Boolean) },
      amountDueLine: fill(t.amountDue, { amount: formatCents(totalCents), date: longDate(dueOn) }),
      lines: lines.map(({ l, w, a }) => ({
        description: `${w.firstName} ${w.lastName}${a ? ` — ${a.position}` : ""}`,
        detail: `${t.earning[l.type]}${l.ruleId === "bill_overtime_not_billable" ? ` (${t.notBillable})` : ""} · ${fill(t.weekOf, { date: longDate(l.workweekStart) })}`,
        hours: hoursMinutes(l.minutes),
        rate: formatRate({ num: l.rateNum, den: l.rateDen }),
        amount: formatCents(l.amountCents),
      })),
      subtotal: formatCents(totalCents),
      total: formatCents(totalCents),
      amountDue: formatCents(totalCents),
      footer: t.footer,
    };
    const pdf = new Uint8Array(await renderToBuffer(createElement(InvoiceDocument, { data }) as unknown as ReactElement<DocumentProps>));
    const pdfKey = `${actor.agencyId}/runs/${run!.id}/invoice-${number}.pdf`;
    await store.put(pdfKey, pdf);
    const pdfSha = sha(pdf);
    const [inv] = await tx
      .insert(s.invoices)
      .values({ agencyId: actor.agencyId, clientId, payRunId: run!.id, number, issuedOn: opts.today, dueOn, status: "issued", subtotalCents: totalCents, totalCents, pdfStorageKey: pdfKey })
      .returning();
    await audit(tx, actor, [{ action: "export", entityType: "invoice", entityId: inv!.id, after: { number, totalCents, sha256: pdfSha, lines: lines.length } }]);
    invoicesOut.push({ invoiceId: inv!.id, clientId, clientName: client!.name, number, totalCents, storageKey: pdfKey, sha256: pdfSha });
  }

  // The paid entries are locked: they can never be paid again.
  const paidEntryIds = [...new Set(pay.flatMap((l) => l.timeEntryIds))];
  if (paidEntryIds.length > 0) {
    await tx.update(s.timeEntries).set({ status: "locked", updatedAt: new Date() }).where(inArray(s.timeEntries.id, paidEntryIds));
  }
  await tx.update(s.payRuns).set({ status: "exported", updatedAt: new Date() }).where(eq(s.payRuns.id, run!.id));
  await audit(tx, actor, [{ action: "update", entityType: "pay_run", entityId: run!.id, before: { status: "ready" }, after: { status: "exported" }, reason: "files created" }]);
  return {
    runId: run!.id,
    payroll: { exportId: exportRow!.id, filename: file.filename, storageKey: payrollKey, sha256: payrollSha, controlTotals: file.controlTotals, notes: file.notes },
    invoices: invoicesOut,
  };
}
