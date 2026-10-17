/**
 * Which invoices a run will create, checked before anyone clicks "Create files": per client billed,
 * the client's invoice settings in effect on the period's last day (template, separate invoices by
 * PO and/or worksite, PO required, terms), an invoice number not used before, and a total that fits
 * the database. The run turns problems into blockers; the files service creates exactly these.
 *
 * Slice g (decisions G3–G5): a client's hours are split into one invoice per PO and/or worksite
 * when its settings say so (TempWorks "Create Separate Invoices"; combinations multiply). One
 * invoice keeps the number `{code}-{YYYYMMDD}`; several are `{code}-{YYYYMMDD}-{n}`, ordered by PO
 * then worksite name. A line's PO is its assignment's, or else the client's (Bullhorn placement PO;
 * "same as billing contact"). A client that requires a PO cannot be invoiced for a line without one.
 */
import { formatCents, type EarningType, type Fraction } from "@shiftbook/rules";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { creditNoteRoom } from "../collections/schedule";
import { settlement, type DiffLine } from "../run/differences";
import { dated, message, say, type Said } from "../said";

const INT4_MAX = 2_147_483_647;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const effective = (date: string, from: string, to: string | null) => from <= date && (to === null || date <= to);

/** A billed line (a run's bill line, or a correction's difference) as invoices are planned from it. */
export interface PlanLine {
  clientId: string;
  workerId: string;
  assignmentId: string | null;
  workweekStart: string;
  type: EarningType;
  minutes: number;
  rate: Fraction;
  amountCents: number;
  ruleId?: string | null;
  /** A correction's difference: what it was and is now, and how many stored lines each adds up. */
  was?: { minutes: number } | null;
  now?: { minutes: number } | null;
  wasLines?: number;
  nowLines?: number;
  /** The time entries the line's hours came from (the backup pages and the VMS file read them). */
  entryIds?: string[];
}

/** A planned invoice's line: the PO it is billed under and the worksite of its assignment. */
export type PlannedLine = PlanLine & { po: string | null; worksite: { id: string; name: string } | null };

/**
 * A correction's documents, and the invoices whose differences are real but net to zero (hours moved
 * at one rate between days; no document, said on the files step).
 */
export interface CorrectionDocuments {
  plans: InvoicePlan[];
  problems: InvoiceProblem[];
  quiet: { clientId: string; clientName: string; number: string | null }[];
}

/** A stored bill line as a planned line. */
export const planLineOf = (l: typeof s.billLines.$inferSelect): PlanLine => ({
  clientId: l.clientId,
  workerId: l.workerId,
  assignmentId: l.assignmentId,
  workweekStart: l.workweekStart,
  type: l.type,
  minutes: l.minutes,
  rate: { num: l.rateNum, den: l.rateDen },
  amountCents: l.amountCents,
  ruleId: l.ruleId,
  entryIds: l.timeEntryIds,
});

/** A correction's bill differences as planned lines (each billed difference names its client). */
export function billDifferences(bill: DiffLine[]): PlanLine[] {
  return bill.map((d) => {
    if (!d.clientId) throw new Error(`A bill difference for worker ${d.workerId} names no client.`);
    return { ...d, clientId: d.clientId, ruleId: d.ruleId ?? null, entryIds: d.timeEntryIds };
  });
}

export interface InvoicePlan {
  clientId: string;
  client: typeof s.clients.$inferSelect;
  profile: typeof s.clientBillingProfiles.$inferSelect;
  number: string;
  /** A credit note's is negative. */
  totalCents: number;
  /** Slice e: a correction's documents name the invoice they correct. */
  kind: s.InvoiceKind;
  original: { id: string; number: string } | null;
  /** Slice g: the part of the client's hours it covers ("" when not separated), and what that part is. */
  splitKey: string;
  /** The PO printed in the header: the part's PO, or the one PO all its lines share. */
  poNumber: string | null;
  /** Several POs share this invoice: each line names its PO (TempWorks "PO number as a line item"). */
  poOnLines: boolean;
  worksite: { id: string; name: string } | null;
  lines: PlannedLine[];
}

/** A problem the run shows as a blocker; a missing PO names its client so the fix can open it. */
export interface InvoiceProblem {
  code: "invoice_problem" | "po_missing";
  clientId?: string;
  clientName?: string;
  workerIds?: string[];
  /** The invoice number the problem is about, when it is one number. */
  number?: string;
  message: string;
  /** The message as keys for the reader's language (decision 0030). */
  said?: Said;
}

interface Place {
  poNumber: string | null;
  worksiteId: string;
  worksiteName: string;
}

/** Where each assignment's hours are billed: its PO and its job order's worksite. */
async function places(tx: Tx, lines: PlanLine[]): Promise<Map<string, Place>> {
  const ids = [...new Set(lines.map((l) => l.assignmentId).filter((x): x is string => x !== null))];
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: s.assignments.id, poNumber: s.assignments.poNumber, worksiteId: s.worksites.id, worksiteName: s.worksites.name })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .where(inArray(s.assignments.id, ids));
  return new Map(rows.map((r) => [r.id, { poNumber: r.poNumber, worksiteId: r.worksiteId, worksiteName: r.worksiteName }]));
}

/** A line's PO and the part of the client's invoices it belongs to. */
export function partOf(profile: Pick<typeof s.clientBillingProfiles.$inferSelect, "separateBy" | "poNumber">, place: Place | undefined): { key: string; po: string | null; worksite: { id: string; name: string } | null } {
  const po = place?.poNumber ?? profile.poNumber ?? null;
  const worksite = place ? { id: place.worksiteId, name: place.worksiteName } : null;
  const parts: string[] = [];
  if (profile.separateBy.includes("po")) parts.push(`po=${po ?? ""}`);
  if (profile.separateBy.includes("worksite")) parts.push(`worksite=${worksite?.id ?? ""}`);
  return { key: parts.join("|"), po, worksite };
}

/** The header PO, and whether lines must name theirs, for a set of lines' POs. */
function poOf(pos: (string | null)[]): { poNumber: string | null; poOnLines: boolean } {
  const distinct = [...new Set(pos)];
  return distinct.length === 1 ? { poNumber: distinct[0]!, poOnLines: false } : { poNumber: null, poOnLines: distinct.some((p) => p !== null) };
}

async function profilesOn(tx: Tx, clientIds: string[], date: string) {
  const clients = clientIds.length > 0 ? await tx.select().from(s.clients).where(inArray(s.clients.id, clientIds)) : [];
  const profiles = clientIds.length > 0 ? await tx.select().from(s.clientBillingProfiles).where(inArray(s.clientBillingProfiles.clientId, clientIds)) : [];
  return { clients, inEffect: (clientId: string) => profiles.filter((p) => p.clientId === clientId && effective(date, p.effectiveFrom, p.effectiveTo)) };
}

/** A client that requires a PO cannot be invoiced for hours without one (decision G5). */
async function poMissing(tx: Tx, client: typeof s.clients.$inferSelect, lines: { workerId: string; po: string | null }[]): Promise<InvoiceProblem | null> {
  const ids = [...new Set(lines.filter((l) => l.po === null).map((l) => l.workerId))].sort(cmp);
  if (ids.length === 0) return null;
  const people = await tx.select().from(s.workers).where(inArray(s.workers.id, ids));
  const names = people.map((w) => `${w.firstName} ${w.lastName}`).sort(cmp);
  return {
    code: "po_missing",
    clientId: client.id,
    clientName: client.name,
    workerIds: ids,
    ...message([say("poMissing", { client: client.name, names: names.join(", ") })]),
  };
}

export async function planInvoices(tx: Tx, period: { startsOn: string; endsOn: string }, bill: PlanLine[]): Promise<{ plans: InvoicePlan[]; problems: InvoiceProblem[] }> {
  const clientIds = [...new Set(bill.map((l) => l.clientId))].sort(cmp);
  if (clientIds.length === 0) return { plans: [], problems: [] };
  const { clients, inEffect } = await profilesOn(tx, clientIds, period.endsOn);
  const placed = await places(tx, bill);
  const plans: InvoicePlan[] = [];
  const problems: InvoiceProblem[] = [];
  for (const clientId of clientIds) {
    const client = clients.find((c) => c.id === clientId)!;
    const profile = inEffect(clientId);
    if (profile.length !== 1) {
      const on = { client: client.name, date: dated(period.endsOn) };
      problems.push({ code: "invoice_problem", clientId, clientName: client.name, ...message([profile.length === 0 ? say("invoiceNoProfile", on) : say("invoiceSeveralProfiles", { ...on, count: String(profile.length) })]) });
      continue;
    }
    const p = profile[0]!;
    const mine = bill.filter((l) => l.clientId === clientId).map((l) => ({ line: l, ...partOf(p, l.assignmentId ? placed.get(l.assignmentId) : undefined) }));
    if (p.poRequired) {
      const missing = await poMissing(tx, client, mine.map((m) => ({ workerId: m.line.workerId, po: m.po })));
      if (missing) {
        problems.push(missing);
        continue;
      }
    }
    const parts = new Map<string, typeof mine>();
    for (const m of mine) parts.set(m.key, [...(parts.get(m.key) ?? []), m]);
    // Ordered by PO, then worksite name (and the key, so the order is the same on every machine).
    const ordered = [...parts.entries()].sort(([ka, a], [kb, b]) => {
      const pa = p.separateBy.includes("po") ? (a[0]!.po ?? "") : "";
      const pb = p.separateBy.includes("po") ? (b[0]!.po ?? "") : "";
      const wa = p.separateBy.includes("worksite") ? (a[0]!.worksite?.name ?? "") : "";
      const wb = p.separateBy.includes("worksite") ? (b[0]!.worksite?.name ?? "") : "";
      return cmp(pa, pb) || cmp(wa, wb) || cmp(ka, kb);
    });
    const base = `${client.code}-${period.startsOn.replaceAll("-", "")}`;
    ordered.forEach(([key, part], i) => {
      const totalCents = part.reduce((sum, m) => sum + m.line.amountCents, 0);
      const number = ordered.length === 1 ? base : `${base}-${i + 1}`;
      if (totalCents < 0 || totalCents > INT4_MAX) {
        problems.push({ code: "invoice_problem", clientId, clientName: client.name, ...message([say("invoiceTooLarge", { client: client.name })]) });
        return;
      }
      plans.push({
        clientId,
        client,
        profile: p,
        number,
        totalCents,
        kind: "invoice",
        original: null,
        splitKey: key,
        ...poOf(part.map((m) => m.po)),
        worksite: p.separateBy.includes("worksite") ? part[0]!.worksite : null,
        lines: part.map((m) => ({ ...m.line, po: m.po, worksite: m.worksite })),
      });
    });
  }
  problems.push(...(await numbersTaken(tx, plans)));
  return { plans: plans.filter((p) => !problems.some((x) => x.number === p.number)), problems };
}

async function numbersTaken(tx: Tx, plans: InvoicePlan[]): Promise<InvoiceProblem[]> {
  const numbers = plans.map((p) => p.number);
  const taken = numbers.length > 0 ? await tx.select({ number: s.invoices.number }).from(s.invoices).where(inArray(s.invoices.number, numbers)) : [];
  const problems: InvoiceProblem[] = [];
  for (const p of plans) {
    if (taken.some((t) => t.number === p.number)) problems.push({ code: "invoice_problem", clientId: p.clientId, clientName: p.client.name, number: p.number, ...message([say("invoiceNumberTaken", { client: p.client.name, number: p.number })]) });
    else if (plans.filter((x) => x.number === p.number).length > 1) {
      problems.push({ code: "invoice_problem", clientId: p.clientId, clientName: p.client.name, number: p.number, ...message([say("invoiceNumberTwice", { client: p.client.name, code: p.client.code, number: p.number })]) });
    }
  }
  return problems;
}

type BillDifference = { clientId?: string; amountCents: number; minutes?: number; type?: EarningType; rate?: Fraction; workweekStart?: string; wasLines?: number; nowLines?: number };

/**
 * The net billed difference of some lines, and whether anything changed beyond the cent that
 * rounding each line once leaves when hours move at one rate (the same rule as pay: run/differences.ts).
 */
function netOf(mine: BillDifference[]): { netCents: number; real: boolean } {
  const full = mine.filter((d) => d.type !== undefined && d.rate !== undefined && d.minutes !== undefined && d.workweekStart !== undefined);
  const s0 = settlement(full.map((d) => ({ type: d.type!, rate: d.rate!, minutes: d.minutes!, amountCents: d.amountCents, workweekStart: d.workweekStart!, wasLines: d.wasLines ?? 1, nowLines: d.nowLines ?? 1 })));
  return { netCents: mine.reduce((sum, d) => sum + d.amountCents, 0), real: full.length < mine.length || s0.fileLines.length > 0 || !s0.additionsOnly };
}

/** Per client, the net billed difference and whether it is more than rounding. */
export function clientNets(differences: BillDifference[]): Map<string, { netCents: number; real: boolean }> {
  const out = new Map<string, { netCents: number; real: boolean }>();
  for (const clientId of [...new Set(differences.map((d) => d.clientId).filter((x): x is string => Boolean(x)))].sort(cmp)) out.set(clientId, netOf(differences.filter((d) => d.clientId === clientId)));
  return out;
}

/**
 * A correction's documents (decision E11), per invoice its differences belong to: a supplemental
 * invoice for more billed, numbered `{original}-S{n}` (Bullhorn rebill), or a credit note for less,
 * `{original}-CN-{nn}` (Stripe), each naming the invoice it corrects. A difference belongs to the
 * invoice that billed its assignment and week (as issued, whatever the settings say now); a new one
 * to the part the client's settings put it in. Hours never invoiced get an ordinary invoice (more
 * billed only). A part whose differences net to zero, or only to rounding, gets no document.
 */
export async function planCorrectionInvoices(
  tx: Tx,
  period: { id: string; startsOn: string; endsOn: string },
  differences: PlanLine[],
): Promise<CorrectionDocuments> {
  const clientIds = [...new Set(differences.map((d) => d.clientId))].sort(cmp);
  if (clientIds.length === 0) return { plans: [], problems: [], quiet: [] };
  const runIds = (await tx.select({ id: s.payRuns.id }).from(s.payRuns).where(eq(s.payRuns.payPeriodId, period.id))).map((r) => r.id);
  // Every document this period issued: invoices, and the supplementals and credit notes made since.
  const all = runIds.length > 0 ? await tx.select().from(s.invoices).where(inArray(s.invoices.payRunId, runIds)) : [];
  const issued = all.filter((i) => i.kind === "invoice").sort((a, b) => cmp(a.number, b.number));
  // Where to look for the lines that billed hours: invoices first, then the documents correcting them.
  const searched = [...issued, ...all.filter((i) => i.kind !== "invoice").sort((a, b) => cmp(a.number, b.number))];
  const rootOf = (i: (typeof all)[number]) => (i.kind === "invoice" ? i : issued.find((x) => x.id === i.originalInvoiceId));
  const { clients, inEffect } = await profilesOn(tx, clientIds, period.endsOn);
  const placed = await places(tx, differences);
  const plans: InvoicePlan[] = [];
  const problems: InvoiceProblem[] = [];
  const quiet: CorrectionDocuments["quiet"] = [];
  for (const clientId of clientIds) {
    const client = clients.find((c) => c.id === clientId)!;
    const profile = inEffect(clientId);
    if (profile.length !== 1) {
      const on = { client: client.name, date: dated(period.endsOn) };
      problems.push({ code: "invoice_problem", clientId, clientName: client.name, ...message([profile.length === 0 ? say("correctionNoProfile", on) : say("correctionSeveralProfiles", { ...on, count: String(profile.length) })]) });
      continue;
    }
    const p = profile[0]!;
    const originals = issued.filter((i) => i.clientId === clientId);
    const mine = searched.filter((i) => i.clientId === clientId);
    type Original = (typeof originals)[number];
    /**
     * The invoice that billed a difference's assignment and week, as issued (a supplemental's hours
     * belong to the invoice it adds to), with the PO they were billed under, whatever the placement
     * says now.
     */
    const billedOn = (d: PlanLine): { original: Original; po: string | null | undefined } | null => {
      for (const doc of mine) {
        const line = doc.document?.lines.find((l) => l.assignmentId === d.assignmentId && l.workweekStart === d.workweekStart);
        const root = line ? rootOf(doc) : undefined;
        if (line && root) return { original: root, po: line.poNumber };
      }
      // Invoices made before slice g kept no lines: a client's single invoice billed everything, under
      // its PO, or (several) the placement's or the client's.
      if (originals.length === 1 && !originals[0]!.document) return { original: originals[0]!, po: originals[0]!.poNumber ?? undefined };
      return null;
    };
    const groups = new Map<string, { original: Original | undefined; key: string; lines: { line: PlanLine; po: string | null; worksite: { id: string; name: string } | null }[] }>();
    for (const d of differences.filter((x) => x.clientId === clientId)) {
      const part = partOf(p, d.assignmentId ? placed.get(d.assignmentId) : undefined);
      // Hours never billed: the invoice of the part the client's settings put them in, if one was issued.
      const billed = billedOn(d) ?? ((o) => (o ? { original: o, po: part.po } : null))(originals.find((i) => i.splitKey === part.key && i.document));
      const groupKey = billed ? `invoice:${billed.original.id}` : `part:${part.key}`;
      const g = groups.get(groupKey) ?? { original: billed?.original, key: billed ? billed.original.splitKey : part.key, lines: [] };
      g.lines.push({ line: d, po: billed && billed.po !== undefined ? billed.po : part.po, worksite: part.worksite });
      groups.set(groupKey, g);
    }
    const fresh: { g: (typeof groups extends Map<string, infer G> ? G : never); common: Omit<InvoicePlan, "number" | "kind" | "original"> }[] = [];
    for (const g of [...groups.values()].sort((a, b) => cmp(a.original?.number ?? `~${a.key}`, b.original?.number ?? `~${b.key}`))) {
      const net = netOf(g.lines.map((x) => x.line));
      if (!net.real) continue;
      if (net.netCents === 0) {
        quiet.push({ clientId, clientName: client.name, number: g.original?.number ?? null });
        continue;
      }
      if (Math.abs(net.netCents) > INT4_MAX) {
        problems.push({ code: "invoice_problem", clientId, clientName: client.name, ...message([say("correctionTooLarge", { client: client.name })]) });
        continue;
      }
      // More billed must carry a PO when the client requires one (decision G5), as a regular run would.
      if (p.poRequired && net.netCents > 0) {
        const missing = await poMissing(tx, client, g.lines.map((x) => ({ workerId: x.line.workerId, po: x.po })));
        if (missing) {
          problems.push(missing);
          continue;
        }
      }
      const po = poOf(g.lines.map((x) => x.po));
      const common = { clientId, client, profile: p, totalCents: net.netCents, splitKey: g.key, ...po, worksite: p.separateBy.includes("worksite") ? (g.lines[0]!.worksite ?? null) : null, lines: g.lines.map((x) => ({ ...x.line, po: x.po, worksite: x.worksite })) };
      if (!g.original) {
        if (net.netCents < 0) {
          problems.push({ code: "invoice_problem", clientId, clientName: client.name, ...message([say("creditNeverInvoiced", { client: client.name, amount: formatCents(-net.netCents) })]) });
          continue;
        }
        fresh.push({ g, common });
        continue;
      }
      const kind: s.InvoiceKind = net.netCents > 0 ? "supplemental" : "credit_note";
      // A credit never takes the original past what it may still be credited: its total less every
      // credit note against it (by hand too) and its write-offs (the money review's A2).
      if (kind === "credit_note") {
        const credits = await tx.select({ totalCents: s.invoices.totalCents }).from(s.invoices).where(and(eq(s.invoices.originalInvoiceId, g.original.id), eq(s.invoices.kind, "credit_note"), ne(s.invoices.status, "void")));
        const offs = await tx.select({ amountCents: s.writeOffs.amountCents }).from(s.writeOffs).where(eq(s.writeOffs.invoiceId, g.original.id));
        const room = creditNoteRoom(g.original.totalCents, credits.map((c) => c.totalCents), offs.map((o) => o.amountCents));
        if (-net.netCents > room) {
          problems.push({ code: "invoice_problem", clientId, clientName: client.name, ...message([say("correctionCreditTooLarge", { client: client.name, amount: formatCents(-net.netCents), number: g.original.number, room: formatCents(room) })]) });
          continue;
        }
      }
      const earlier = all.filter((i) => i.originalInvoiceId === g.original!.id && i.kind === kind).length;
      const n = earlier + 1;
      const number = kind === "supplemental" ? `${g.original.number}-S${n}` : `${g.original.number}-CN-${String(n).padStart(2, "0")}`;
      plans.push({ ...common, number, kind, original: { id: g.original.id, number: g.original.number } });
    }
    // Hours this period never invoiced: new invoices, numbered as a run numbers them (decision G3):
    // alone and first, the base number; otherwise the next numbers after the client's invoices, in
    // PO then worksite order.
    const base = `${client.code}-${period.startsOn.replaceAll("-", "")}`;
    fresh.sort((a, b) => cmp(a.common.poNumber ?? "", b.common.poNumber ?? "") || cmp(a.common.worksite?.name ?? "", b.common.worksite?.name ?? "") || cmp(a.g.key, b.g.key));
    fresh.forEach(({ common }, i) => {
      const number = originals.length === 0 && fresh.length === 1 ? base : `${base}-${originals.length + i + 1}`;
      plans.push({ ...common, number, kind: "invoice", original: null });
    });
  }
  problems.push(...(await numbersTaken(tx, plans)));
  plans.sort((a, b) => cmp(a.number, b.number));
  return { plans: plans.filter((p) => !problems.some((x) => x.number === p.number)), problems, quiet };
}

/** What the files will say besides money (names, addresses, PO, terms, numbers, payroll ids). */
export async function fileTextInputs(tx: Tx, agencyId: string, payPeriodId: string, plans: InvoicePlan[], workerIds: string[], assignmentIds: string[]) {
  const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
  const people = workerIds.length > 0 ? await tx.select().from(s.workers).where(inArray(s.workers.id, workerIds)) : [];
  // The position, worksite and PO are printed on invoice lines.
  const placed =
    assignmentIds.length > 0
      ? await tx
          .select({ id: s.assignments.id, position: s.jobOrders.position, worksite: s.worksites.name, po: s.assignments.poNumber })
          .from(s.assignments)
          .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
          .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
          .where(inArray(s.assignments.id, assignmentIds))
      : [];
  // What the backup pages and the VMS file are made of (time sheet ids, statuses, the pictures' pages
  // and who else is on them, the client's approvals), so a change after approval is caught too.
  const entryIds = [...new Set(plans.flatMap((p) => p.lines.flatMap((l) => l.entryIds ?? [])))].sort(cmp);
  const pagesOf = (fields: s.EntryFields) => [...new Set(Object.values(fields).map((f) => f?.page ?? null))].sort();
  const backed = entryIds.length > 0 ? await tx.select().from(s.timeEntries).where(inArray(s.timeEntries.id, entryIds)) : [];
  const docIds = [...new Set(backed.map((e) => e.sourceDocumentId).filter((x): x is string => x !== null))].sort(cmp);
  const onPictures = docIds.length > 0 ? await tx.select().from(s.timeEntries).where(inArray(s.timeEntries.sourceDocumentId, docIds)) : [];
  const clientIds = [...new Set(plans.map((p) => p.clientId))];
  const decisions =
    clientIds.length > 0
      ? await tx
          .select({ id: s.approvalDecisions.id })
          .from(s.approvalDecisions)
          .innerJoin(s.approvalRequests, eq(s.approvalRequests.id, s.approvalDecisions.requestId))
          .where(and(inArray(s.approvalRequests.clientId, clientIds), eq(s.approvalRequests.payPeriodId, payPeriodId)))
      : [];
  return {
    backup: {
      entries: backed.map((e) => [e.id, e.status, e.paidStatus, e.vmsRefs, e.sourceDocumentId, pagesOf(e.fields)]).sort((a, b) => cmp(String(a[0]), String(b[0]))),
      pictures: onPictures.map((e) => [e.id, e.sourceDocumentId, e.assignmentId, pagesOf(e.fields)]).sort((a, b) => cmp(String(a[0]), String(b[0]))),
      approvals: decisions.map((d) => d.id).sort(cmp),
    },
    agency: agency ? [agency.name, agency.addressLines, agency.phone, agency.email] : null,
    invoices: plans.map((p) => [
      p.number,
      p.splitKey,
      p.poNumber,
      p.client.name,
      p.client.addressLines,
      p.client.billingEmail,
      p.profile.id,
      p.profile.poNumber,
      p.profile.paymentTermsDays,
      p.profile.invoiceTemplate,
      p.profile.backupDetail,
      p.profile.backupImages,
      p.profile.vmsFormat,
    ]),
    workers: people.map((w) => [w.id, w.firstName, w.lastName, w.payrollIds]).sort((a, b) => cmp(String(a[0]), String(b[0]))),
    assignments: placed.map((a) => [a.id, a.position, a.worksite, a.po]).sort((a, b) => cmp(String(a[0]), String(b[0]))),
  };
}
