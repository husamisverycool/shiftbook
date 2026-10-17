/**
 * Which notices the agency's state calls for (slice r; docs/patterns/notifications.md, Linear's Inbox).
 * Pure: the service gathers the facts, this decides the notices, and each notice names its event
 * (`dedupeKey`), so however often the sweep runs a person gets one notice per event.
 */
import type { NotificationKind } from "../db/schema";
import { can, type Ability, type Role } from "../permissions";

export interface NotificationFacts {
  /** A client approver's decision on a period's hours. */
  decisions: { id: string; requestId: string; clientName: string; periodStart: string; periodEnd: string; disputed: number }[];
  /** A weekly run stopped by its blocking checks. */
  blockedRuns: { id: string; payPeriodId: string; periodStart: string; periodEnd: string; blockers: number }[];
  /** An open compliance duty; `remindOn` is the duty's own reminder day (its rule's lead time). */
  obligations: { id: string; kind: string; dueOn: string; remindOn: string | null }[];
  /** An invoice past its due date with money still owed. */
  overdueInvoices: { id: string; number: string; clientName: string; dueOn: string; balanceCents: number }[];
  /** A promise to pay whose date passed with money still owed. */
  brokenPromises: { id: string; invoiceId: string; number: string; clientName: string; promisedOn: string; balanceCents: number }[];
}

export interface Notice {
  kind: NotificationKind;
  dedupeKey: string;
  href: string;
  params: Record<string, string | number>;
  /** Who receives it: the people whose role has this ability (permissions table, decision 0026). */
  ability: Ability;
}

export function noticesFrom(f: NotificationFacts, today: string): Notice[] {
  const out: Notice[] = [];
  for (const d of f.decisions) {
    out.push({
      kind: d.disputed > 0 ? "approval_disputed" : "approval_returned",
      dedupeKey: `decision:${d.id}`,
      href: `/approvals/${d.requestId}`,
      params: { client: d.clientName, start: d.periodStart, end: d.periodEnd, disputed: d.disputed },
      ability: "hours",
    });
  }
  for (const r of f.blockedRuns) {
    out.push({ kind: "run_blocked", dedupeKey: `run:${r.id}:blocked`, href: `/convert?period=${r.payPeriodId}&step=exceptions`, params: { start: r.periodStart, end: r.periodEnd, blockers: r.blockers }, ability: "run" });
  }
  for (const o of f.obligations) {
    const params = { kind: o.kind, dueOn: o.dueOn };
    if (o.dueOn < today) out.push({ kind: "obligation_overdue", dedupeKey: `obligation:${o.id}:overdue`, href: `/compliance/${o.id}`, params, ability: "compliance" });
    else if (o.remindOn !== null && o.remindOn <= today) out.push({ kind: "obligation_due_soon", dedupeKey: `obligation:${o.id}:soon`, href: `/compliance/${o.id}`, params, ability: "compliance" });
  }
  for (const i of f.overdueInvoices) {
    out.push({ kind: "invoice_overdue", dedupeKey: `invoice:${i.id}:overdue`, href: `/invoices/${i.id}`, params: { number: i.number, client: i.clientName, dueOn: i.dueOn, balanceCents: i.balanceCents }, ability: "cash" });
  }
  for (const p of f.brokenPromises) {
    out.push({ kind: "promise_broken", dedupeKey: `promise:${p.id}:broken`, href: `/invoices/${p.invoiceId}`, params: { number: p.number, client: p.clientName, promisedOn: p.promisedOn, balanceCents: p.balanceCents }, ability: "cash" });
  }
  return out;
}

/** The active people whose role acts on it. The accountant changes nothing, so is told nothing. */
export function recipientsOf(ability: Ability, people: { id: string; role: Role; status: string }[]): string[] {
  return people.filter((p) => p.status === "active" && can(p, ability)).map((p) => p.id);
}
