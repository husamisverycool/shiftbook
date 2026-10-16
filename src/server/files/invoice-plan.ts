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
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { settlement, type DiffLine } from "../run/differences";

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
  workerIds?: string[];
  /** The invoice number the problem is about, when it is one number. */
  number?: string;
  message: string;
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
    workerIds: ids,
    message: `${client.name} requires a PO on every invoice, but the hours of ${names.join(", ")} have none (no PO on their assignment, and none for the client).`,
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
      problems.push({ code: "invoice_problem", clientId, message: `${client.name}: ${profile.length === 0 ? "no billing profile is" : `${profile.length} billing profiles are`} in effect on ${period.endsOn}, the invoice date basis, so its PO and payment terms are unknown.` });
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
        problems.push({ code: "invoice_problem", clientId, message: `${client.name}: the invoice total is too large to store; check the bill rates.` });
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
    if (taken.some((t) => t.number === p.number)) problems.push({ code: "invoice_problem", clientId: p.clientId, number: p.number, message: `${p.client.name}: invoice number ${p.number} was already issued.` });
    else if (plans.filter((x) => x.number === p.number).length > 1) problems.push({ code: "invoice_problem", clientId: p.clientId, number: p.number, message: `${p.client.name}: another client billed in this run has the same client code (${p.client.code}), so two invoices would be numbered ${p.number}.` });
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
): Promise<{ plans: InvoicePlan[]; problems: InvoiceProblem[] }> {
  const clientIds = [...new Set(differences.map((d) => d.clientId))].sort(cmp);
  if (clientIds.length === 0) return { plans: [], problems: [] };
  const runIds = (await tx.select({ id: s.payRuns.id }).from(s.payRuns).where(eq(s.payRuns.payPeriodId, period.id))).map((r) => r.id);
  const issued = (runIds.length > 0 ? await tx.select().from(s.invoices).where(inArray(s.invoices.payRunId, runIds)) : []).filter((i) => i.kind === "invoice").sort((a, b) => cmp(a.number, b.number));
  const { clients, inEffect } = await profilesOn(tx, clientIds, period.endsOn);
  const placed = await places(tx, differences);
  const plans: InvoicePlan[] = [];
  const problems: InvoiceProblem[] = [];
  for (const clientId of clientIds) {
    const client = clients.find((c) => c.id === clientId)!;
    const profile = inEffect(clientId);
    if (profile.length !== 1) {
      problems.push({ code: "invoice_problem", clientId, message: `${client.name}: ${profile.length === 0 ? "no billing profile is" : `${profile.length} billing profiles are`} in effect on ${period.endsOn}, so the correction's payment terms are unknown.` });
      continue;
    }
    const p = profile[0]!;
    const originals = issued.filter((i) => i.clientId === clientId);
    // Each difference to the invoice that billed its assignment and week, else to its part now.
    const billedOn = (d: PlanLine) =>
      originals.find((i) => i.document?.lines.some((l) => l.assignmentId === d.assignmentId && l.workweekStart === d.workweekStart)) ??
      // Invoices made before slice g kept no lines: a client's single invoice billed everything.
      (originals.length === 1 && !originals[0]!.document ? originals[0] : undefined);
    const groups = new Map<string, { original: (typeof originals)[number] | undefined; key: string; lines: { line: PlanLine; po: string | null; worksite: { id: string; name: string } | null }[] }>();
    for (const d of differences.filter((x) => x.clientId === clientId)) {
      const part = partOf(p, d.assignmentId ? placed.get(d.assignmentId) : undefined);
      const original = billedOn(d) ?? originals.find((i) => i.splitKey === part.key && i.document);
      const groupKey = original ? `invoice:${original.id}` : `part:${part.key}`;
      const g = groups.get(groupKey) ?? { original, key: original ? original.splitKey : part.key, lines: [] };
      g.lines.push({ line: d, po: original ? (original.poNumber ?? part.po) : part.po, worksite: part.worksite });
      groups.set(groupKey, g);
    }
    for (const g of [...groups.values()].sort((a, b) => cmp(a.original?.number ?? `~${a.key}`, b.original?.number ?? `~${b.key}`))) {
      const net = netOf(g.lines.map((x) => x.line));
      if (!net.real || net.netCents === 0) continue;
      if (Math.abs(net.netCents) > INT4_MAX) {
        problems.push({ code: "invoice_problem", clientId, message: `${client.name}: the correction's total is too large to store; check the bill rates.` });
        continue;
      }
      const po = poOf(g.lines.map((x) => x.po));
      const common = { clientId, client, profile: p, totalCents: net.netCents, splitKey: g.key, ...po, worksite: p.separateBy.includes("worksite") ? (g.lines[0]!.worksite ?? null) : null, lines: g.lines.map((x) => ({ ...x.line, po: x.po, worksite: x.worksite })) };
      if (!g.original) {
        if (net.netCents < 0) {
          problems.push({ code: "invoice_problem", clientId, message: `${client.name}: ${formatCents(-net.netCents)} less would be credited on hours this period never invoiced; check the bill rates.` });
          continue;
        }
        if (p.poRequired) {
          const missing = await poMissing(tx, client, g.lines.map((x) => ({ workerId: x.line.workerId, po: x.po })));
          if (missing) {
            problems.push(missing);
            continue;
          }
        }
        // The next number after the client's invoices for this period.
        const base = `${client.code}-${period.startsOn.replaceAll("-", "")}`;
        const used = originals.length + plans.filter((x) => x.clientId === clientId && x.kind === "invoice").length;
        plans.push({ ...common, number: used === 0 ? base : `${base}-${used + 1}`, kind: "invoice", original: null });
        continue;
      }
      const kind: s.InvoiceKind = net.netCents > 0 ? "supplemental" : "credit_note";
      const earlier = await tx.select({ id: s.invoices.id }).from(s.invoices).where(and(eq(s.invoices.originalInvoiceId, g.original.id), eq(s.invoices.kind, kind)));
      const n = earlier.length + 1;
      const number = kind === "supplemental" ? `${g.original.number}-S${n}` : `${g.original.number}-CN-${String(n).padStart(2, "0")}`;
      plans.push({ ...common, number, kind, original: { id: g.original.id, number: g.original.number } });
    }
  }
  problems.push(...(await numbersTaken(tx, plans)));
  plans.sort((a, b) => cmp(a.number, b.number));
  return { plans: plans.filter((p) => !problems.some((x) => x.number === p.number)), problems };
}

/** What the files will say besides money (names, addresses, PO, terms, numbers, payroll ids). */
export async function fileTextInputs(tx: Tx, agencyId: string, plans: InvoicePlan[], workerIds: string[], assignmentIds: string[]) {
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
  return {
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
