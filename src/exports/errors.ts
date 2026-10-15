export type ExportErrorCode =
  | "unsupported_earning_type"
  | "missing_payroll_id"
  | "duplicate_payroll_id"
  | "invalid_pay_line"
  | "several_pay_rates"
  | "does_not_reconcile"
  | "unknown_format";

/** An export that cannot be produced correctly is refused, never written partially (SPEC §13). */
export class ExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}
