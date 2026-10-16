/**
 * What the activity log shows of an audit event (slice k step 3, decision 0028). Pure: the screens
 * and the export read the same shape.
 */

/** What happened: the audit action, with a look at the SSN or a worker's file, and an SSN change, told apart. */
export const ACTIVITY_EVENTS = ["create", "update", "delete", "approve", "export", "import", "reset", "sign_in", "sign_out", "sign_in_failed", "refuse", "ssn_viewed", "file_opened", "ssn_changed", "passkey_added", "passkey_removed"] as const;
export type ActivityEventKind = (typeof ACTIVITY_EVENTS)[number];

/** The kinds of record the log names (the filter offers these; anything else reads as "Other"). */
export const RECORD_TYPES = [
  "aca_monthly_hours",
  "activity_log",
  "agency",
  "agency_registration",
  "agency_setting",
  "approval_request",
  "assignment",
  "bank_import",
  "bank_line",
  "billing_profile",
  "burden_tax_rate",
  "client",
  "compliance_document",
  "correction_decision",
  "credit_application",
  "equal_pay_rate",
  "export",
  "hours_opening_balance",
  "invoice",
  "job_order",
  "obligation",
  "obligation_note",
  "pay_run",
  "payment",
  "placement_import",
  "rate_card",
  "reminder",
  "short_pay",
  "source_document",
  "time_entry",
  "user",
  "wc_policy",
  "wc_rate",
  "worker",
  "write_off",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export interface ActivityEvent {
  id: number;
  /** When, as an ISO timestamp. */
  at: string;
  /** Who, as the log recorded them ("Shiftbook" for what it works out itself). */
  actor: string;
  action: string;
  event: ActivityEventKind | string;
  entityType: string;
  entityId: string;
  /** The record's name now (looked up when shown), its page when it has one, its dates and its kind (a duty's). */
  record: { name: string | null; href: string | null; period?: { from: string; to: string }; kind?: string; gone?: boolean };
  reason: string | null;
  before: unknown;
  after: unknown;
}

/** The event a row stands for. */
export function eventOf(action: string, after: unknown): string {
  const a = (after ?? {}) as Record<string, unknown>;
  if (action === "reveal") return typeof a.filename === "string" ? "file_opened" : "ssn_viewed";
  if (action === "update" && a.ssn === "changed") return "ssn_changed";
  return action;
}
