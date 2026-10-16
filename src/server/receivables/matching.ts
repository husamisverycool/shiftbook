/**
 * Suggested matches for a bank deposit (SPEC §14 "suggested matches by amount, reference and client
 * that the user confirms"; slice h decision H6). Pure and deterministic, in Stripe's documented
 * order of reconciliation:
 *   1. an invoice number (or a PO) written on the deposit → those invoices;
 *   2. otherwise a group of one to five of one client's open invoices that add up exactly to it
 *      (the fewest invoices, then the oldest);
 *   3. otherwise the client named on the deposit, its oldest invoices first.
 * Confidence follows Business Central's rules — the client named, a reference matched, one
 * candidate — and nothing below Medium is suggested (QuickBooks Online hides low confidence).
 * Every suggestion says why. A person confirms it; nothing here records a payment.
 */
import { formatCents } from "@shiftbook/rules";
import { daysFrom } from "./aging";

export interface OpenInvoice {
  id: string;
  number: string;
  clientId: string;
  poNumber: string | null;
  issuedOn: string;
  dueOn: string;
  balanceCents: number;
}

export interface MatchClient {
  id: string;
  name: string;
}

export interface Deposit {
  postedOn: string;
  description: string;
  reference: string | null;
  amountCents: number;
}

export interface Suggestion {
  clientId: string;
  applications: { invoiceId: string; amountCents: number }[];
  /** Left as the client's credit (paid more than the invoices). */
  creditCents: number;
  /** Left unpaid on the last invoice (a short payment). */
  shortCents: number;
  confidence: "high" | "medium";
  explain: string;
}

/** The window for a match on amount alone: invoices issued from 90 days before to 20 days after (QuickBooks Online). */
export interface MatchWindow {
  daysBefore: number;
  daysAfter: number;
}

const word = (text: string) => new RegExp(`(^|[^a-z0-9-])${text.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9-])`);
/** A client's name without "(demo)", "Inc." and the like, lowercased; matched only past 4 characters (Business Central). */
const nameKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company)\b\.?/g, " ")
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const byAge = (a: OpenInvoice, b: OpenInvoice) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.number < b.number ? -1 : 1);

/** Applies an amount to invoices in the given order: what each takes, what is left either way. */
function fill(invoices: OpenInvoice[], amountCents: number) {
  let left = amountCents;
  const applications: Suggestion["applications"] = [];
  for (const i of invoices) {
    if (left <= 0) break;
    const take = Math.min(left, i.balanceCents);
    applications.push({ invoiceId: i.id, amountCents: take });
    left -= take;
  }
  const applied = applications.reduce((s, a) => s + a.amountCents, 0);
  const owed = invoices.slice(0, applications.length).reduce((s, i) => s + i.balanceCents, 0);
  return { applications, creditCents: left, shortCents: owed - applied };
}

/**
 * Groups of one to five invoices whose balances add up exactly to the amount, of the fewest invoices
 * that can (oldest first). The search goes by size — every single invoice before any pair — so many
 * small invoices never hide one that matches alone (review finding 1); each size's search is bounded.
 */
function exactGroups(invoices: OpenInvoice[], amountCents: number): OpenInvoice[][] {
  const sorted = invoices.filter((i) => i.balanceCents <= amountCents).sort(byAge);
  for (let size = 1; size <= 5; size++) {
    const found: OpenInvoice[][] = [];
    let steps = 0;
    const walk = (from: number, chosen: OpenInvoice[], sum: number) => {
      if (++steps > 20_000 || found.length > 20) return;
      if (chosen.length === size) {
        if (sum === amountCents) found.push(chosen);
        return;
      }
      for (let i = from; i < sorted.length; i++) {
        const next = sum + sorted[i]!.balanceCents;
        if (next <= amountCents) walk(i + 1, [...chosen, sorted[i]!], next);
      }
    };
    walk(0, [], 0);
    if (found.length > 0) return found.sort((a, b) => byAge(a[0]!, b[0]!));
  }
  return [];
}

const list = (invoices: OpenInvoice[]) => invoices.map((i) => i.number).join(", ");

export function suggestMatch(deposit: Deposit, open: OpenInvoice[], clients: MatchClient[], window: MatchWindow): Suggestion | null {
  if (deposit.amountCents <= 0) return null;
  const text = ` ${deposit.description} ${deposit.reference ?? ""} `.toLowerCase();
  const payable = open.filter((i) => i.balanceCents > 0);
  // The name as whole words: "Mart Staffing" is not inside "WALMART STAFFING".
  const named = clients.filter((c) => nameKey(c.name).length > 4 && word(nameKey(c.name)).test(text));
  const client = named.length === 1 ? named[0]! : null;
  const amount = formatCents(deposit.amountCents);

  // 1. A reference: invoice numbers written on the deposit (all one client's), or a PO.
  const byNumber = payable.filter((i) => word(i.number).test(text));
  const referenced = byNumber.length > 0 ? byNumber : payable.filter((i) => i.poNumber !== null && i.poNumber.length > 4 && word(i.poNumber).test(text));
  const refClients = [...new Set(referenced.map((i) => i.clientId))];
  if (referenced.length > 0 && refClients.length === 1 && (!client || client.id === refClients[0])) {
    const invoices = [...referenced].sort(byAge);
    const owed = invoices.reduce((s, i) => s + i.balanceCents, 0);
    const what = byNumber.length > 0 ? `invoice number${invoices.length > 1 ? "s" : ""} ${list(invoices)} on the deposit` : `PO ${invoices[0]!.poNumber} on the deposit (invoice${invoices.length > 1 ? "s" : ""} ${list(invoices)})`;
    const r = fill(invoices, deposit.amountCents);
    const exact = owed === deposit.amountCents;
    return {
      clientId: refClients[0]!,
      ...r,
      confidence: exact && byNumber.length > 0 ? "high" : "medium",
      explain: exact
        ? `${what}; ${amount} equals what ${invoices.length > 1 ? "they" : "it"} owe${invoices.length > 1 ? "" : "s"}.`
        : owed > deposit.amountCents
          ? `${what}; ${amount} is ${formatCents(owed - deposit.amountCents)} less than the ${formatCents(owed)} owed: applied oldest first, the rest left short.`
          : `${what}; ${amount} is ${formatCents(deposit.amountCents - owed)} more than the ${formatCents(owed)} owed: the rest left as the client's credit.`,
    };
  }

  // 2. An exact sum of one to five of one client's open invoices (amount alone: within the window).
  const inWindow = (i: OpenInvoice) => {
    const d = daysFrom(i.issuedOn, deposit.postedOn);
    return d <= window.daysBefore && d >= -window.daysAfter;
  };
  const candidates = (client ? [client.id] : [...new Set(payable.map((i) => i.clientId))]).map((id) => ({
    clientId: id,
    groups: exactGroups(
      payable.filter((i) => i.clientId === id && (client !== null || inWindow(i))),
      deposit.amountCents,
    ),
  }));
  const withGroups = candidates.filter((c) => c.groups.length > 0);
  if (withGroups.length === 1) {
    const { clientId, groups } = withGroups[0]!;
    const best = groups[0]!;
    const unique = groups.filter((g) => g.length === best.length).length === 1;
    const confidence = client && unique ? "high" : client || unique ? "medium" : null;
    if (confidence) {
      return {
        clientId,
        applications: best.map((i) => ({ invoiceId: i.id, amountCents: i.balanceCents })),
        creditCents: 0,
        shortCents: 0,
        confidence,
        explain: `${amount} equals what invoice${best.length > 1 ? "s" : ""} ${list(best)} owe${best.length > 1 ? "" : "s"}${client ? `; the client is named on the deposit` : `; the only client with invoices adding up to it`}${unique ? "" : " (the oldest of several that add up to it)"}.`,
      };
    }
  }

  // 3. The client named on the deposit: its oldest invoices first.
  if (client) {
    const invoices = payable.filter((i) => i.clientId === client.id).sort(byAge);
    if (invoices.length === 0) return null;
    const r = fill(invoices, deposit.amountCents);
    return {
      clientId: client.id,
      ...r,
      confidence: "medium",
      explain: `The client is named on the deposit; no invoice number on it, and no group of its invoices adds up to ${amount}: applied to the oldest first (${list(invoices.slice(0, r.applications.length))})${r.shortCents > 0 ? `, ${formatCents(r.shortCents)} left short` : ""}${r.creditCents > 0 ? `, ${formatCents(r.creditCents)} left as credit` : ""}.`,
    };
  }
  return null;
}
