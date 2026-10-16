/**
 * What one planned invoice is made of (slice g, decisions G2, G4, G6–G9): the PDF's text in the
 * client's template, the backup pages (hours detail with the client's approval, then the redacted
 * timesheet pictures), the lines as issued, the invoice CSV and, for a client on SAP Fieldglass, the
 * supplier upload file. The run's dry run and "Create files" both build documents through here, so a
 * file the run accepted is the file that is made.
 *
 * Patterns: docs/patterns/_documents/invoice.md (Templates; Backup pages).
 */
import { addDays, formatCents, formatRate, type EarningType } from "@shiftbook/rules";
import { and, eq, inArray } from "drizzle-orm";
import en from "../../../messages/en.json";
import { fieldglassUpload, invoiceCsv, type InvoiceFileInput, type InvoiceFileLine } from "../../exports/invoice-files";
import type { InvoiceData, InvoiceDetail, InvoiceImage, InvoiceLine } from "../../pdf/invoice";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { settingOn } from "../settings";
import type { DocumentStore } from "../storage";
import type { InvoicePlan, PlannedLine } from "./invoice-plan";

const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "MW_TRUEUP", "REPORTING_PAY", "HOL", "HOL_NOT_WORKED", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE", "BONUS", "BONUS_OT"];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const t = en.invoice;
export const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
/** 2400 → "40:00"; 37 → "0:37"; −120 → "-2:00" (a plain hyphen: the PDF's standard font has no minus sign). */
export const hoursMinutes = (minutes: number) => `${minutes < 0 ? "-" : ""}${Math.trunc(Math.abs(minutes) / 60)}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
export const longDate = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const dayDate = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
/** Minutes after midnight → "7:00 AM"; past midnight says so (an out time can exceed 1440). */
function clock(minute: number | null): string {
  if (minute === null) return "—";
  const d = new Date(Date.UTC(2000, 0, 1, Math.trunc(minute / 60) % 24, minute % 60));
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
  return minute >= 1440 ? fill(t.nextDay, { time }) : time;
}
function when(at: Date, timeZone: string): { date: string; time: string } {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  return {
    date: new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: zone }).format(at),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: zone }).format(at),
  };
}

export interface DocumentContext {
  agency: typeof s.agencies.$inferSelect;
  period: { id: string; startsOn: string; endsOn: string };
  today: string;
  workersById: Map<string, typeof s.workers.$inferSelect>;
}

export interface InvoiceDocuments {
  data: InvoiceData;
  dueOn: string;
  issued: s.IssuedInvoice;
  csv: Uint8Array;
  /** The VMS upload, for an original invoice of a client set to one. */
  vms: { format: s.VmsFormat; bytes: Uint8Array } | null;
}

type Entry = typeof s.timeEntries.$inferSelect;
type Workers = Pick<DocumentContext, "workersById">;

/** Lines in invoice order: worker last name, first name, week, then earning type (Avionté sort by employee). */
function ordered(ctx: Workers, lines: PlannedLine[]): PlannedLine[] {
  const w = (id: string) => ctx.workersById.get(id);
  return [...lines].sort(
    (x, y) =>
      cmp(w(x.workerId)?.lastName ?? "", w(y.workerId)?.lastName ?? "") ||
      cmp(w(x.workerId)?.firstName ?? "", w(y.workerId)?.firstName ?? "") ||
      cmp(x.workerId, y.workerId) ||
      cmp(x.workweekStart, y.workweekStart) ||
      TYPE_ORDER.indexOf(x.type) - TYPE_ORDER.indexOf(y.type) ||
      cmp(x.assignmentId ?? "", y.assignmentId ?? ""),
  );
}

const nameOf = (ctx: Workers, workerId: string) => {
  const w = ctx.workersById.get(workerId);
  return w ? `${w.firstName} ${w.lastName}` : workerId;
};

/** The entry's status as the client last left it (a paid entry keeps the status it had). */
const clientApproved = (e: Entry) => e.status === "client_approved" || (e.status === "locked" && e.paidStatus === "client_approved");

/** Per entry, the approval line the detail pages print (Bullhorn `[APPROVE_LOG]`, decision G7). */
async function approvalLines(tx: Tx, ctx: DocumentContext, clientId: string, entries: Entry[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const reviewed = fill(t.reviewedBy, { agency: ctx.agency.name });
  for (const e of entries) out.set(e.id, reviewed);
  const approved = entries.filter(clientApproved);
  if (approved.length === 0) return out;
  const requests = await tx.select().from(s.approvalRequests).where(and(eq(s.approvalRequests.clientId, clientId), eq(s.approvalRequests.payPeriodId, ctx.period.id)));
  const decisions = requests.length > 0 ? await tx.select().from(s.approvalDecisions).where(inArray(s.approvalDecisions.requestId, requests.map((r) => r.id))) : [];
  // The latest decision about each shift is the one that counts.
  decisions.sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime() || cmp(b.id, a.id));
  const zone = await settingOn<unknown>(tx, "time_zone", ctx.today);
  for (const e of approved) {
    const d = decisions.find((x) => x.approved.some((a) => a.entryId === e.id) || x.disputed.some((a) => a.entryId === e.id));
    if (!d) continue;
    const at = when(d.decidedAt, typeof zone === "string" ? zone : "UTC");
    const values = { name: d.typedName, email: d.approverEmail, date: at.date, time: at.time, agency: ctx.agency.name };
    // A disputed shift counts as approved when the agency accepted the client's own times.
    out.set(e.id, fill(d.approved.some((a) => a.entryId === e.id) ? t.approvedBy : t.proposedBy, values));
  }
  return out;
}

/** The hours detail pages: per worker and week, each day's times, the total and the approval. */
async function detailOf(tx: Tx, ctx: DocumentContext, plan: InvoicePlan, lines: PlannedLine[], entries: Map<string, Entry>): Promise<InvoiceDetail> {
  const weeks: { workerId: string; week: string; ids: string[] }[] = [];
  for (const l of lines) {
    const w = weeks.find((x) => x.workerId === l.workerId && x.week === l.workweekStart) ?? weeks[weeks.push({ workerId: l.workerId, week: l.workweekStart, ids: [] }) - 1]!;
    for (const id of l.entryIds ?? []) if (!w.ids.includes(id)) w.ids.push(id);
  }
  const all = weeks.flatMap((w) => w.ids.map((id) => entries.get(id)).filter((e): e is Entry => e !== undefined));
  const approvals = await approvalLines(tx, ctx, plan.clientId, all);
  return {
    title: plan.kind === "invoice" ? t.detailTitle : t.detailTitleCorrected,
    columns: { date: t.detailDate, in: t.detailIn, out: t.detailOut, break: t.detailBreak, hours: t.hours },
    weeks: weeks
      .map((w) => {
        const days = w.ids
          .map((id) => entries.get(id))
          .filter((e): e is Entry => e !== undefined)
          .sort((a, b) => cmp(a.workDate ?? "", b.workDate ?? "") || (a.inMinute ?? 0) - (b.inMinute ?? 0) || cmp(a.id, b.id));
        return {
          heading: fill(t.detailWeek, { worker: nameOf(ctx, w.workerId), date: longDate(w.week) }),
          rows: days.map((e) => ({ date: e.workDate ? dayDate(e.workDate) : "—", in: clock(e.inMinute), out: clock(e.outMinute), break: e.breakMinutes === null ? "—" : hoursMinutes(e.breakMinutes), hours: hoursMinutes(e.minutes ?? 0) })),
          totalLabel: t.weekTotal,
          total: hoursMinutes(days.reduce((sum, e) => sum + (e.minutes ?? 0), 0)),
          approvals: [...new Set(days.map((e) => approvals.get(e.id)!))],
        };
      })
      .filter((w) => w.rows.length > 0),
  };
}

/** The pages of a timesheet an entry was read from (all pages when the reading kept none). */
const pagesOf = (e: Entry, pageCount: number): number[] => {
  const read = [...new Set(Object.values(e.fields).map((f) => f?.page).filter((p): p is number => typeof p === "number"))];
  return read.length > 0 ? read : Array.from({ length: pageCount }, (_, i) => i + 1);
};

/**
 * The timesheet pictures (decision G6): each page an invoice line's hours were read from, once, in
 * line order then date, as the redacted copy. A page that also shows a line not billed to this client
 * (another client's, or one with no placement) is left out: it could show someone else's worker.
 */
async function imagesOf(tx: Tx, store: DocumentStore, plan: InvoicePlan, lines: PlannedLine[], entries: Map<string, Entry>): Promise<{ images: InvoiceImage[]; used: s.IssuedInvoice["backup"]["images"] }> {
  const order: Entry[] = [];
  for (const l of lines) {
    const mine = (l.entryIds ?? []).map((id) => entries.get(id)).filter((e): e is Entry => e !== undefined && e.sourceDocumentId !== null);
    for (const e of mine.sort((a, b) => cmp(a.workDate ?? "", b.workDate ?? ""))) if (!order.includes(e)) order.push(e);
  }
  const docIds = [...new Set(order.map((e) => e.sourceDocumentId!))];
  if (docIds.length === 0) return { images: [], used: [] };
  const docs = await tx.select().from(s.sourceDocuments).where(inArray(s.sourceDocuments.id, docIds));
  const pictures = docs.filter((d) => d.kind === "image" || d.kind === "pdf");
  if (pictures.length === 0) return { images: [], used: [] };
  const pages = await tx.select().from(s.documentPages).where(inArray(s.documentPages.documentId, pictures.map((d) => d.id)));
  // Every entry read from these pictures, with the client its assignment bills.
  const onPictures = await tx
    .select({ entry: s.timeEntries, clientId: s.jobOrders.clientId })
    .from(s.timeEntries)
    .leftJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
    .leftJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .where(inArray(s.timeEntries.sourceDocumentId, pictures.map((d) => d.id)));
  const shared = new Set<string>();
  for (const { entry, clientId } of onPictures) {
    const doc = pictures.find((d) => d.id === entry.sourceDocumentId)!;
    // Only pages whose every line is this client's: a line with no placement may be anyone's.
    if (clientId !== plan.clientId) for (const p of pagesOf(entry, doc.pageCount ?? 0)) shared.add(`${doc.id}#${p}`);
  }
  const images: InvoiceImage[] = [];
  const used: s.IssuedInvoice["backup"]["images"] = [];
  const done = new Set<string>();
  for (const e of order) {
    const doc = pictures.find((d) => d.id === e.sourceDocumentId);
    if (!doc) continue;
    for (const p of pagesOf(e, doc.pageCount ?? 0).sort((a, b) => a - b)) {
      const key = `${doc.id}#${p}`;
      const page = pages.find((x) => x.documentId === doc.id && x.pageNumber === p);
      if (done.has(key) || shared.has(key) || !page) continue;
      done.add(key);
      images.push({ data: Buffer.from(await store.get(page.redactedStorageKey)), format: "jpg" });
      const u = used.find((x) => x.documentId === doc.id);
      if (u) u.pages.push(p);
      else used.push({ documentId: doc.id, filename: doc.filename, pages: [p] });
    }
  }
  return { images, used };
}

/**
 * The Fieldglass time sheet each line's hours came from, and the worker's id there (decision G9).
 * Every entry of the line must carry its time sheet id: an entry typed in by hand has none, and the
 * line is refused rather than billed on a time sheet that does not hold its hours. A line that is
 * not worked hours (a holiday not worked, a guarantee) is billed on the worker's one time sheet for
 * that placement and week, when there is exactly one.
 */
function sheetsOf(lines: PlannedLine[], entries: Map<string, Entry>): { timeSheetIds: string[]; vmsWorkerId: string | null }[] {
  const own = lines.map((l) => {
    const mine = (l.entryIds ?? []).map((id) => entries.get(id)).filter((e): e is Entry => e !== undefined);
    const complete = mine.length > 0 && mine.every((e) => (e.vmsRefs.timeSheetIds ?? []).length > 0);
    return {
      worked: mine.length > 0,
      timeSheetIds: complete ? [...new Set(mine.flatMap((e) => e.vmsRefs.timeSheetIds ?? []))].sort(cmp) : [],
      vmsWorkerId: mine.map((e) => e.vmsRefs.workerId).find((x): x is string => typeof x === "string") ?? null,
    };
  });
  return lines.map((l, i) => {
    if (own[i]!.worked) return { timeSheetIds: own[i]!.timeSheetIds, vmsWorkerId: own[i]!.vmsWorkerId };
    const siblings = lines.map((x, j) => ({ x, o: own[j]! })).filter(({ x, o }) => o.worked && x.workerId === l.workerId && x.assignmentId === l.assignmentId && x.workweekStart === l.workweekStart);
    const ids = [...new Set(siblings.flatMap(({ o }) => o.timeSheetIds))];
    const one = siblings.length > 0 && siblings.every(({ o }) => o.timeSheetIds.length === 1) && ids.length === 1;
    return { timeSheetIds: one ? ids : [], vmsWorkerId: siblings.map(({ o }) => o.vmsWorkerId).find((x): x is string => x !== null) ?? null };
  });
}

/** The time entries the plans' lines came from. */
export async function planEntries(tx: Tx, plans: InvoicePlan[]): Promise<Map<string, Entry>> {
  const ids = [...new Set(plans.flatMap((p) => p.lines.flatMap((l) => l.entryIds ?? [])))];
  const rows = ids.length > 0 ? await tx.select().from(s.timeEntries).where(inArray(s.timeEntries.id, ids)) : [];
  return new Map(rows.map((e) => [e.id, e]));
}

/** The VMS file's input for a plan (also what the run's dry run checks, before there is an issue date). */
export function vmsInput(plan: InvoicePlan, ctx: Workers & Pick<DocumentContext, "period"> & { today?: string }, entries: Map<string, Entry>): InvoiceFileInput {
  return {
    number: plan.number,
    issuedOn: ctx.today ?? "",
    period: ctx.period,
    lines: ((lines) => ((sheets) => lines.map((l, i) => ({ ...fileLine(ctx, l), ...sheets[i]! })))(sheetsOf(lines, entries)))(ordered(ctx, plan.lines)),
  };
}

/** Whether the client's VMS file is made for this document (originals only: the VMS invoices time sheets once). */
export const makesVms = (plan: InvoicePlan) => plan.profile.vmsFormat !== null && plan.kind === "invoice";

function fileLine(ctx: Workers, l: PlannedLine): InvoiceFileLine {
  return { workerId: l.workerId, workerName: nameOf(ctx, l.workerId), worksite: l.worksite?.name ?? null, poNumber: l.po, workweekStart: l.workweekStart, type: l.type, minutes: l.minutes, rate: l.rate, amountCents: l.amountCents };
}

export async function invoiceDocuments(
  tx: Tx,
  store: DocumentStore,
  ctx: DocumentContext,
  plan: InvoicePlan,
  positions: Map<string, string>,
  entries: Map<string, Entry>,
): Promise<InvoiceDocuments> {
  const { client, profile, number, kind, original } = plan;
  const lines = ordered(ctx, plan.lines);
  const totalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  if (totalCents !== plan.totalCents) throw new Error(`Invoice ${number} total ${totalCents} does not equal the planned ${plan.totalCents}.`);
  // A credit note is not due: it reduces what the original asks for (Stripe credit notes).
  const credit = kind === "credit_note";
  const dueOn = credit ? ctx.today : addDays(ctx.today, profile.paymentTermsDays);
  const worksites = plan.worksite ? [plan.worksite.name] : [...new Set(lines.map((l) => l.worksite?.name).filter((x): x is string => Boolean(x)))].sort(cmp);
  const invoiceLine = (l: PlannedLine, withName: boolean): InvoiceLine => {
    const position = l.assignmentId ? positions.get(l.assignmentId) : undefined;
    return {
      description: withName ? `${nameOf(ctx, l.workerId)}${position ? ` — ${position}` : ""}` : (position ?? nameOf(ctx, l.workerId)),
      detail: [
        `${t.earning[l.type]}${l.ruleId === "bill_overtime_not_billable" ? ` (${t.notBillable})` : ""}`,
        fill(t.weekOf, { date: longDate(l.workweekStart) }),
        ...(plan.poOnLines ? [l.po ? fill(t.poLine, { po: l.po }) : t.noPo] : []),
        ...(l.was && l.now ? [fill(t.wasNow, { was: hoursMinutes(l.was.minutes), now: hoursMinutes(l.now.minutes) })] : []),
      ].join(" · "),
      hours: hoursMinutes(l.minutes),
      rate: formatRate(l.rate),
      amount: formatCents(l.amountCents),
    };
  };
  // Per-worker detail (Bullhorn One group by candidate): a heading, the worker's lines, a subtotal.
  const groups =
    profile.invoiceTemplate === "per_worker_detail"
      ? [...new Set(lines.map((l) => l.workerId))].map((workerId) => {
          const mine = lines.filter((l) => l.workerId === workerId);
          return { title: nameOf(ctx, workerId), subtotalLabel: t.workerSubtotal, subtotal: formatCents(mine.reduce((sum, l) => sum + l.amountCents, 0)), lines: mine.map((l) => invoiceLine(l, false)) };
        })
      : undefined;
  const detail = profile.backupDetail ? await detailOf(tx, ctx, plan, lines, entries) : null;
  const pictures = profile.backupImages ? await imagesOf(tx, store, plan, lines, entries) : { images: [], used: [] };
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
    issuedOn: longDate(ctx.today),
    dueOn: credit ? null : longDate(dueOn),
    fields: [
      ...(original ? [{ label: credit ? t.credits : t.addsTo, value: original.number }] : []),
      ...(plan.poNumber ? [{ label: t.po, value: plan.poNumber }] : []),
      { label: t.period, value: `${longDate(ctx.period.startsOn)} – ${longDate(ctx.period.endsOn)}` },
      ...(worksites.length > 0 ? [{ label: t.worksite, value: worksites.join("; ") }] : []),
    ],
    from: { name: ctx.agency.name, lines: [...ctx.agency.addressLines, ctx.agency.phone ?? "", ctx.agency.email ?? ""].filter(Boolean) },
    billTo: { name: client.name, lines: [...client.addressLines, client.billingEmail ?? ""].filter(Boolean) },
    amountDueLine: credit ? fill(t.creditedLine, { amount: formatCents(-totalCents), number: original!.number }) : fill(t.amountDue, { amount: formatCents(totalCents), date: longDate(dueOn) }),
    lines: lines.map((l) => invoiceLine(l, true)),
    ...(groups ? { groups } : {}),
    poHeader: profile.invoiceTemplate === "po_header" && plan.poNumber ? fill(t.poHeader, { po: plan.poNumber }) : null,
    subtotal: formatCents(totalCents),
    total: formatCents(totalCents),
    amountDue: formatCents(credit ? -totalCents : totalCents),
    footer: t.footer,
    detail,
    images: pictures.images,
  };
  const fileInput: InvoiceFileInput = { number, issuedOn: ctx.today, period: ctx.period, lines: lines.map((l) => fileLine(ctx, l)) };
  const { labels, images, ...printed } = data;
  const issued: s.IssuedInvoice = {
    pdf: { ...printed, labels: { ...labels, page: t.page }, images: images?.length ?? 0 },
    lines: lines.map((l) => ({
      workerId: l.workerId,
      workerName: nameOf(ctx, l.workerId),
      assignmentId: l.assignmentId,
      poNumber: l.po,
      worksite: l.worksite?.name ?? null,
      workweekStart: l.workweekStart,
      type: l.type,
      minutes: l.minutes,
      rate: l.rate,
      amountCents: l.amountCents,
    })),
    backup: { detail: detail !== null, images: pictures.used },
  };
  return {
    data,
    dueOn,
    issued,
    csv: invoiceCsv(fileInput),
    vms: makesVms(plan) ? { format: profile.vmsFormat!, bytes: fieldglassUpload(vmsInput(plan, ctx, entries)) } : null,
  };
}

/** The stored PDF text back as the PDF's data (a statement prints each invoice from it). */
export function printedInvoice(issued: s.IssuedInvoice): InvoiceData {
  const pdf = issued.pdf as unknown as Omit<InvoiceData, "labels"> & { labels: Omit<InvoiceData["labels"], "page"> & { page: string } };
  return { ...pdf, labels: { ...pdf.labels, page: (page, pages) => fill(pdf.labels.page, { page: String(page), pages: String(pages) }) }, detail: null, images: [] };
}

