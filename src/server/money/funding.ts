/**
 * The invoice-funding packet and its eligibility decision (SPEC §27 item 9; docs/patterns/money/
 * funding.md and money/funding/[id].md). What factors ask for (docs/research/money-flows-slice-w.md
 * §6): the debtor's aging and payment history, concentration (one client's share of all that is owed),
 * disputes, approved timesheets as proof of delivery, and a schedule-of-accounts line. The offer is
 * shown the way Stripe Capital shows one — an amount advanced, a flat fee, the rest held in reserve —
 * with its approved wording discipline ("prequalified", "subject to review"; never "preapproved").
 * Nothing is lent or sent: a packet is recorded as a handoff.
 *
 * Money stays integer cents: the advance is rounded down (never more than the agreed share), the fee
 * rounded half up once, the reserve is the rest. Concentration and dispute rates are basis points,
 * rounded half up. Pure.
 */
import { roundHalfUp } from "@shiftbook/rules";
import { bucketOf, daysFrom, type Bucket } from "../receivables/aging";

export interface FundingRules {
  enabled: boolean;
  /** Share of the open balance advanced, basis points (9000 = 90%). */
  advanceBps: number;
  /** Flat fee on the open balance, basis points (300 = 3%). */
  feeBps: number;
  /** Largest share of all money owed one client may be, basis points (3000 = 30%). */
  maxConcentrationBps: number;
  /** Oldest an invoice may be, days from its issue date (factors fund up to 90 days outstanding). */
  maxAgeDays: number;
  /** Only invoices whose hours the client approved by link. */
  requireClientApproval: boolean;
}

export const DEFAULT_FUNDING: FundingRules = { enabled: false, advanceBps: 9000, feeBps: 300, maxConcentrationBps: 3000, maxAgeDays: 90, requireClientApproval: true };

export interface FundingInvoice {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  issuedOn: string;
  dueOn: string;
  totalCents: number;
  balanceCents: number;
  status: "draft" | "issued" | "paid" | "void";
  kind: "invoice" | "supplemental" | "credit_note";
  poNumber: string | null;
  /** Approved timesheet pictures or line detail travel with it (the factor's proof of delivery). */
  hasBackup: boolean;
}

export interface ApprovalStep {
  approverName: string;
  decidedAt: string;
  approvedShifts: number;
  disputedShifts: number;
}

export interface FundingFacts {
  asOf: string;
  /** What the client owes on all open invoices, and what every client owes. */
  clientOpenCents: number;
  allOpenCents: number;
  /** The client's paid invoices: count and average days to pay (null with none). */
  paidInvoices: number;
  averageDaysToPay: number | null;
  averageDaysLate: number | null;
  /** Shifts the client approved and disputed by link, over all their decisions. */
  approvedShifts: number;
  disputedShifts: number;
  /** Disputes on this invoice's period still waiting on the agency. */
  openDisputes: number;
  /** The shifts this invoice bills, and how many of them the client approved by link. */
  invoiceShifts: number;
  approvedInvoiceShifts: number;
  approvals: ApprovalStep[];
}

export type FundingReason = "disabled" | "not_open" | "credit_note" | "no_balance" | "too_old" | "concentration" | "no_approval" | "open_disputes";

export interface FundingPacket {
  invoice: FundingInvoice;
  ageDays: number;
  bucket: Bucket;
  concentrationBps: number;
  disputeRateBps: number | null;
  approved: boolean;
  facts: FundingFacts;
  eligible: boolean;
  reasons: FundingReason[];
  offer: { balanceCents: number; advanceCents: number; feeCents: number; reserveCents: number; releasedOnPaymentCents: number } | null;
  /** The schedule-of-accounts line (the SEC-filed definition: debtor, invoice number and date, amount). */
  schedule: { debtor: string; invoiceNumber: string; invoiceDate: string; poNumber: string | null; amountCents: number };
}

const bps = (part: number, whole: number) => (whole <= 0 ? 0 : roundHalfUp(part * 10_000, whole));

/** The advance rounds down; the flat fee rounds half up once, as every amount in Tabulado does (at most half a cent). */
export function offerFor(balanceCents: number, rules: Pick<FundingRules, "advanceBps" | "feeBps">) {
  const advanceCents = Number((BigInt(balanceCents) * BigInt(rules.advanceBps)) / 10_000n);
  const feeCents = roundHalfUp(balanceCents * rules.feeBps, 10_000);
  const reserveCents = balanceCents - advanceCents;
  return { balanceCents, advanceCents, feeCents, reserveCents, releasedOnPaymentCents: reserveCents - feeCents };
}

export function fundingPacket(invoice: FundingInvoice, facts: FundingFacts, rules: FundingRules): FundingPacket {
  const ageDays = Math.max(0, daysFrom(invoice.issuedOn, facts.asOf));
  const concentrationBps = bps(facts.clientOpenCents, facts.allOpenCents);
  const shifts = facts.approvedShifts + facts.disputedShifts;
  const disputeRateBps = shifts > 0 ? bps(facts.disputedShifts, shifts) : null;
  // Approved means every shift the invoice bills was approved, not any one of them (money review B6).
  const approved = facts.invoiceShifts > 0 && facts.approvedInvoiceShifts === facts.invoiceShifts;
  const reasons: FundingReason[] = [];
  if (!rules.enabled) reasons.push("disabled");
  if (invoice.kind === "credit_note") reasons.push("credit_note");
  if (invoice.status !== "issued") reasons.push("not_open");
  if (invoice.balanceCents <= 0) reasons.push("no_balance");
  if (ageDays > rules.maxAgeDays) reasons.push("too_old");
  if (concentrationBps > rules.maxConcentrationBps) reasons.push("concentration");
  if (rules.requireClientApproval && !approved) reasons.push("no_approval");
  if (facts.openDisputes > 0) reasons.push("open_disputes");
  const eligible = reasons.length === 0;
  return {
    invoice,
    ageDays,
    bucket: bucketOf(invoice.dueOn, facts.asOf),
    concentrationBps,
    disputeRateBps,
    approved,
    facts,
    eligible,
    reasons,
    offer: eligible ? offerFor(invoice.balanceCents, rules) : null,
    schedule: { debtor: invoice.clientName, invoiceNumber: invoice.number, invoiceDate: invoice.issuedOn, poNumber: invoice.poNumber, amountCents: invoice.balanceCents },
  };
}
