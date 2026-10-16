/** A client's invoice choices (slice g, decisions G2, G3, G9): shared by the database and the screens. */
export const INVOICE_TEMPLATES = ["standard", "per_worker_detail", "po_header"] as const;
export type InvoiceTemplate = (typeof INVOICE_TEMPLATES)[number];
export const SEPARATE_BY = ["po", "worksite"] as const;
export type SeparateBy = (typeof SEPARATE_BY)[number];
export const VMS_FORMATS = ["fieldglass_time_sheet_invoice"] as const;
export type VmsFormat = (typeof VMS_FORMATS)[number];
/** How a client is billed for overtime (the `ot_billing_rule` enum). */
export const OT_BILLING_RULES = ["multiplier", "straight_time", "not_billable", "own_sites_only"] as const;
