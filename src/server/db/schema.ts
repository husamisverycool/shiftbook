/**
 * Shiftbook database schema (SPEC §4). Slice (a) subset: every table the converter needs, with the
 * columns it needs; later slices add columns. Rules:
 * - Every tenant table has `agency_id`; row-level security (migration `rls`) fences the app role
 *   to the agency in `app.agency_id`.
 * - Money is integer cents, time is integer minutes, multipliers are integer fractions.
 * - Rates, thresholds and multipliers live in effective-dated rows, never in code.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const agencyId = () => uuid("agency_id").notNull().references(() => agencies.id);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: "string" });
// Census FIPS codes (see packages/rules/src/places.ts): local wage rules match on these, never names.
const countyFips = () => text("county_fips");
const placeFips = () => text("place_fips");
const placeCodeChecks = (name: string, t: { countyFips: unknown; placeFips: unknown }) => [
  check(`${name}_county_fips_format`, sql`${t.countyFips} ~ '^[0-9]{5}$'`),
  check(`${name}_place_fips_format`, sql`${t.placeFips} ~ '^[0-9]{7}$'`),
];

// ---------- enums ----------
export const userRole = pgEnum("user_role", ["owner", "coordinator", "billing", "accountant"]);
export const otBillingRule = pgEnum("ot_billing_rule", ["multiplier", "straight_time", "not_billable", "own_sites_only"]);
export const assignmentStatus = pgEnum("assignment_status", ["active", "ended", "cancelled"]);
export const documentKind = pgEnum("document_kind", [
  "image",
  "pdf",
  "timeclock_csv",
  "timeclock_xlsx",
  "vms_export",
  "manual",
]);
export const receivedVia = pgEnum("received_via", ["upload", "email", "manual"]);
// "archived": set aside by a person with a reason (Dext archive), e.g. a duplicate or unreadable file.
export const documentStatus = pgEnum("document_status", ["received", "reading", "read", "failed", "archived"]);
export const timeEntryStatus = pgEnum("time_entry_status", [
  "extracted",
  "needs_review",
  "reviewed",
  "client_approved",
  "disputed",
  "locked",
  // Rippling timesheet "reject" (docs/patterns/review.md): kept for the record, never paid or billed.
  "rejected",
]);
export const confidenceLevel = pgEnum("confidence_level", ["high", "medium", "low"]);
export const payRunStatus = pgEnum("pay_run_status", [
  "draft",
  "validating",
  "blocked",
  "ready",
  "approved",
  "exported",
  "closed",
]);
export const earningType = pgEnum("earning_type", [
  "REG",
  "OT",
  "DT",
  "MW_TRUEUP",
  "REPORTING_PAY",
  "HOL",
  "HOL_NOT_WORKED",
  "DIFF",
  "MEAL_PREMIUM",
  "REST_PREMIUM",
  "MIN_GUARANTEE",
  "BONUS",
  "BONUS_OT",
]);
export const overtimeKind = pgEnum("overtime_kind", ["weekly", "daily", "daily_double", "seventh_day"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "issued", "paid", "void"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);

// ---------- tenancy ----------
export const agencies = pgTable("agencies", {
  id: id(),
  name: text("name").notNull(),
  addressLines: jsonb("address_lines").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  phone: text("phone"),
  email: text("email"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const branches = pgTable("branches", {
  id: id(),
  agencyId: agencyId(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    agencyId: agencyId(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: userRole("role").notNull(),
    preferredLocale: text("preferred_locale").notNull().default("en"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_agency_email").on(t.agencyId, t.email)],
);

// Effective-dated agency settings: workweek start, rounding mode, earning-code maps, thresholds.
export const agencySettings = pgTable(
  "agency_settings",
  {
    id: id(),
    agencyId: agencyId(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    effectiveFrom: isoDate("effective_from").notNull(),
    effectiveTo: isoDate("effective_to"),
    createdAt: createdAt(),
  },
  (t) => [index("agency_settings_key").on(t.agencyId, t.key, t.effectiveFrom)],
);

// ---------- clients ----------
export const clients = pgTable("clients", {
  id: id(),
  agencyId: agencyId(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  addressLines: jsonb("address_lines").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  billingEmail: text("billing_email"),
  /** The client must approve its shifts before the run can be approved (slice e; drizzle/0023). */
  approvalRequired: boolean("approval_required").notNull().default(false),
  createdAt: createdAt(),
});

export const worksites = pgTable(
  "worksites",
  {
    id: id(),
    agencyId: agencyId(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    name: text("name").notNull(),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    county: text("county").notNull(),
    state: text("state").notNull(), // two-letter USPS code; drives jurisdiction
    postalCode: text("postal_code").notNull(),
    // The address's county and incorporated place as Census codes. A worksite without them is held
    // by the pay engine (local ordinances cannot be checked). "Outside any city or town" is recorded
    // explicitly, never inferred from a blank place code.
    countyFips: countyFips(),
    placeFips: placeFips(),
    outsideAnyPlace: boolean("outside_any_place").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    ...placeCodeChecks("worksites", t),
    check("worksites_place_or_outside", sql`NOT (${t.outsideAnyPlace} AND ${t.placeFips} IS NOT NULL)`),
  ],
);

export { INVOICE_TEMPLATES, SEPARATE_BY, VMS_FORMATS, type InvoiceTemplate, type SeparateBy, type VmsFormat } from "../../lib/invoice-options";
import type { InvoiceTemplate, SeparateBy, VmsFormat } from "../../lib/invoice-options";

export const clientBillingProfiles = pgTable(
  "client_billing_profiles",
  {
    id: id(),
    agencyId: agencyId(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    invoiceTemplate: text("invoice_template").$type<InvoiceTemplate>().notNull().default("standard"),
    poRequired: boolean("po_required").notNull().default(false),
    poNumber: text("po_number"),
    consolidate: boolean("consolidate").notNull().default(false),
    vmsName: text("vms_name"),
    overtimeBillingRule: otBillingRule("overtime_billing_rule").notNull().default("multiplier"),
    /** Bill confirmed meal and rest premiums at the bill rate (drizzle/0020). */
    billPremiums: boolean("bill_premiums").notNull().default(false),
    /** Bill minimum pay for a short day at the bill rate (drizzle/0020). */
    billGuarantees: boolean("bill_guarantees").notNull().default(false),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    /** Slice g (drizzle/0025): separate invoices by PO and/or worksite (decision G3). */
    separateBy: text("separate_by").array().$type<SeparateBy[]>().notNull().default(sql`'{}'::text[]`),
    /** The backup in the invoice PDF (decision G6): line detail pages; timesheet pictures. */
    backupDetail: boolean("backup_detail").notNull().default(false),
    backupImages: boolean("backup_images").notNull().default(false),
    /** The VMS invoice-upload file made with each invoice (decision G9). */
    vmsFormat: text("vms_format").$type<VmsFormat>(),
    effectiveFrom: isoDate("effective_from").notNull(),
    effectiveTo: isoDate("effective_to"),
    createdAt: createdAt(),
  },
  (t) => [index("billing_profiles_client").on(t.agencyId, t.clientId, t.effectiveFrom)],
);

// ---------- workers ----------
export type PayrollIds = Partial<Record<"gusto" | "qbd" | "qbo" | "adp_wfn" | "adp_run" | "spreadsheet", { id: string; title?: string }>>;

export const workers = pgTable("workers", {
  id: id(),
  agencyId: agencyId(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  payrollIds: jsonb("payroll_ids").$type<PayrollIds>().notNull().default(sql`'{}'::jsonb`),
  wcState: text("wc_state"),
  createdAt: createdAt(),
});

// Per-agency nickname map used by roster matching (SPEC §6), e.g. "Bob" → "Robert".
export const nicknames = pgTable(
  "nicknames",
  {
    id: id(),
    agencyId: agencyId(),
    nickname: text("nickname").notNull(),
    givenName: text("given_name").notNull(),
  },
  (t) => [uniqueIndex("nicknames_unique").on(t.agencyId, t.nickname, t.givenName)],
);

// ---------- job orders, rate cards, assignments ----------
export const jobOrders = pgTable("job_orders", {
  id: id(),
  agencyId: agencyId(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  worksiteId: uuid("worksite_id").notNull().references(() => worksites.id),
  position: text("position").notNull(),
  socCode: text("soc_code"),
  shift: text("shift"),
  headcount: integer("headcount").notNull().default(1),
  payMinCents: integer("pay_min_cents"),
  payMaxCents: integer("pay_max_cents"),
  prevailingWage: boolean("prevailing_wage").notNull().default(false),
  /** Illinois day and temporary labor (820 ILCS 175): false for clerical or professional work. */
  dayAndTemporaryLabor: boolean("day_and_temporary_labor").notNull().default(true),
  createdAt: createdAt(),
});

export const rateCards = pgTable(
  "rate_cards",
  {
    id: id(),
    agencyId: agencyId(),
    jobOrderId: uuid("job_order_id").notNull().references(() => jobOrders.id),
    /** Set for a worker's own rates on one assignment; null for the job order's rates. */
    assignmentId: uuid("assignment_id").references(() => assignments.id),
    effectiveFrom: isoDate("effective_from").notNull(),
    effectiveTo: isoDate("effective_to"),
    payRateCents: integer("pay_rate_cents").notNull(), // cents per hour
    billRateCents: integer("bill_rate_cents").notNull(), // cents per hour
    /** When the bill rate was entered as a markup on pay: basis points (4500 = 45%). */
    markupBp: integer("markup_bp"),
    otMultiplierNum: integer("ot_multiplier_num").notNull(),
    otMultiplierDen: integer("ot_multiplier_den").notNull(),
    dtMultiplierNum: integer("dt_multiplier_num").notNull(),
    dtMultiplierDen: integer("dt_multiplier_den").notNull(),
    wcClassCode: text("wc_class_code"),
    createdAt: createdAt(),
  },
  (t) => [
    index("rate_cards_job_order").on(t.agencyId, t.jobOrderId, t.effectiveFrom),
    // One version per start date in each card (the job order's, or one assignment's own).
    uniqueIndex("rate_cards_one_start").on(t.agencyId, t.jobOrderId, sql`coalesce(${t.assignmentId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.effectiveFrom),
  ],
);

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    agencyId: agencyId(),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    jobOrderId: uuid("job_order_id").notNull().references(() => jobOrders.id),
    startDate: isoDate("start_date").notNull(),
    endDate: isoDate("end_date"),
    status: assignmentStatus("status").notNull().default("active"),
    /** Where an imported placement came from (bullhorn, jobadder, spott, other) and its id there. */
    externalSource: text("external_source"),
    externalId: text("external_id"),
    /** The client's PO for this placement; none means the client's own PO (slice g, decision G4). */
    poNumber: text("po_number"),
    createdAt: createdAt(),
  },
  (t) => [
    index("assignments_worker").on(t.agencyId, t.workerId),
    // Importing the same placement again skips it.
    uniqueIndex("assignments_external").on(t.agencyId, t.externalSource, t.externalId).where(sql`${t.externalId} is not null`),
  ],
);

// ---------- periods and documents ----------
export const payPeriods = pgTable(
  "pay_periods",
  {
    id: id(),
    agencyId: agencyId(),
    startsOn: isoDate("starts_on").notNull(),
    endsOn: isoDate("ends_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pay_periods_unique").on(t.agencyId, t.startsOn)],
);

export const mappingProfiles = pgTable("mapping_profiles", {
  id: id(),
  agencyId: agencyId(),
  name: text("name").notNull(),
  source: text("source").notNull(), // e.g. "fieldglass", "timeclock"
  version: integer("version").notNull().default(1),
  definition: jsonb("definition").notNull(),
  createdAt: createdAt(),
});

export const importStatus = pgEnum("import_status", ["draft", "done"]);

/** A placement import (docs/patterns/assignments/import.md): the file (SSN and birth-date columns removed), choices and results. */
export const placementImports = pgTable("placement_imports", {
  id: id(),
  agencyId: agencyId(),
  source: text("source").notNull(), // bullhorn, jobadder, spott, other
  filename: text("filename").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  status: importStatus("status").notNull().default("draft"),
  /** Shiftbook field → file column. */
  mapping: jsonb("mapping").$type<Record<string, string>>().notNull().default({}),
  /** Per field, raw value → decision (matched id, "leave_out", or a new job order's worksite). */
  decisions: jsonb("decisions").$type<Record<string, Record<string, string>>>().notNull().default({}),
  results: jsonb("results").$type<{ row: number; outcome: "imported" | "skipped"; reason: { code: string; value: string } | null }[] | null>(),
  /** Columns removed on receipt: position, heading with SSN- or date-shaped parts hidden, and why. */
  removedColumns: jsonb("removed_columns").$type<{ column: string; heading: string; reason: "heading" | "ssn_values" | "birth_dates" }[]>().notNull().default([]),
  /** Each stored row's own number in the uploaded file (blank rows count). */
  rowNumbers: jsonb("row_numbers").$type<number[]>().notNull().default([]),
  /** The date order the person chose; null reads it from the file. */
  dateOrder: text("date_order").$type<"month_first" | "day_first">(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: id(),
    agencyId: agencyId(),
    payPeriodId: uuid("pay_period_id").notNull().references(() => payPeriods.id),
    kind: documentKind("kind").notNull(),
    filename: text("filename").notNull(),
    mediaType: text("media_type").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    receivedVia: receivedVia("received_via").notNull().default("upload"),
    storageKey: text("storage_key").notNull(),
    status: documentStatus("status").notNull().default("received"),
    error: text("error"),
    pageCount: integer("page_count"),
    clientId: uuid("client_id").references(() => clients.id),
    mappingProfileId: uuid("mapping_profile_id").references(() => mappingProfiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("source_documents_hash").on(t.agencyId, t.payPeriodId, t.sha256)],
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: id(),
    agencyId: agencyId(),
    documentId: uuid("document_id").notNull().references(() => sourceDocuments.id),
    pageNumber: integer("page_number").notNull(),
    storageKey: text("storage_key").notNull(), // normalized page image shown in the review panel
    redactedStorageKey: text("redacted_storage_key").notNull(), // the only image sent to a model
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    redactions: integer("redactions").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("document_pages_unique").on(t.documentId, t.pageNumber)],
);

export const extractionPasses = pgTable("extraction_passes", {
  id: id(),
  agencyId: agencyId(),
  documentId: uuid("document_id").notNull().references(() => sourceDocuments.id),
  pageNumber: integer("page_number").notNull(),
  pass: text("pass").notNull(), // "A" | "B"
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  requestHash: text("request_hash").notNull(),
  output: jsonb("output").notNull(),
  createdAt: createdAt(),
});

// ---------- time ----------
export type Box = { x: number; y: number; w: number; h: number }; // thousandths of page width/height
export type FieldProvenance = {
  value: string | null;
  page: number | null;
  box: Box | null;
  passA: string | null;
  passB: string | null;
  agree: boolean | null;
  handwritten: boolean;
  confidence: "high" | "medium" | "low";
  checks: string[]; // failed check codes for this field
  /** Spreadsheet row and column for structured files (header = row 1). */
  source?: { row: number; column: string };
  /** Changed by a person after reading (the review grid marks it). */
  edited?: boolean;
};
export type EntryFields = Partial<Record<"worker" | "date" | "in" | "out" | "break" | "total", FieldProvenance>>;

export interface VmsRefs {
  timeSheetIds?: string[];
  workerId?: string;
}

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    agencyId: agencyId(),
    payPeriodId: uuid("pay_period_id").notNull().references(() => payPeriods.id),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
    rowIndex: integer("row_index").notNull().default(0),
    workerNameRaw: text("worker_name_raw").notNull(),
    workerId: uuid("worker_id").references(() => workers.id),
    assignmentId: uuid("assignment_id").references(() => assignments.id),
    workDate: isoDate("work_date"),
    inMinute: integer("in_minute"), // minutes after midnight of work_date
    outMinute: integer("out_minute"), // may exceed 1440 for shifts past midnight
    breakMinutes: integer("break_minutes"),
    minutes: integer("minutes"), // worked minutes = out - in - break
    fields: jsonb("fields").$type<EntryFields>().notNull().default(sql`'{}'::jsonb`),
    confidence: confidenceLevel("confidence").notNull().default("low"),
    status: timeEntryStatus("status").notNull().default("extracted"),
    /** The status it had when its run's files locked it, so a correction opens it again as it was (drizzle/0024). */
    paidStatus: timeEntryStatus("paid_status"),
    reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // A person confirmed this entry is not the same work as another entry for the worker that day
    // (cleared whenever the entry changes).
    distinctConfirmed: boolean("distinct_confirmed").notNull().default(false),
    /** Ids a VMS gave these hours (slice g, decision G9): Fieldglass time sheet ids and the worker's id there. */
    vmsRefs: jsonb("vms_refs").$type<VmsRefs>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("time_entries_period").on(t.agencyId, t.payPeriodId)],
);

// ---------- runs, lines, invoices, exports ----------
export type SkippedWorker = { workerId: string; reason: string; by: string; at: string };
export const payRuns = pgTable(
  "pay_runs",
  {
    id: id(),
    agencyId: agencyId(),
    payPeriodId: uuid("pay_period_id").notNull().references(() => payPeriods.id),
    version: integer("version").notNull().default(1),
    status: payRunStatus("status").notNull().default("draft"),
    rulesVersion: text("rules_version").notNull(),
    // Workers left out of this run (Gusto "skip employee"), with who skipped them and why.
    skipped: jsonb("skipped").$type<SkippedWorker[]>().notNull().default(sql`'[]'::jsonb`),
    blockers: jsonb("blockers").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    snapshot: jsonb("snapshot"),
    /** "correction": a later version of a paid period, paying and billing only the differences (slice e). */
    kind: text("kind").$type<"regular" | "correction">().notNull().default("regular"),
    reason: text("reason"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by"),
    approvedByLabel: text("approved_by_label"),
    /** What the Owner approved (drizzle/0023): the fingerprint the files must still match. */
    approval: jsonb("approval").$type<RunApproval>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("pay_runs_version").on(t.agencyId, t.payPeriodId, t.version)],
);

export interface RunApproval {
  fingerprint: string;
  rulesVersion: string;
  /** The warnings shown when approving (acknowledged by approving). */
  warnings: { code: string; message: string }[];
  totals: { workers: number; grossCents: number; billedCents: number; payLines: number; billLines: number };
  /** A correction: the differences approved, against the paid version it corrects (slice e). */
  differences?: { baseVersion: number; payCents: number; billCents: number; workers: number };
}

export const payLines = pgTable("pay_lines", {
  id: id(),
  agencyId: agencyId(),
  payRunId: uuid("pay_run_id").notNull().references(() => payRuns.id),
  workerId: uuid("worker_id").notNull().references(() => workers.id),
  assignmentId: uuid("assignment_id").references(() => assignments.id),
  timeEntryIds: jsonb("time_entry_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  workweekStart: isoDate("workweek_start").notNull(),
  type: earningType("type").notNull(),
  minutes: integer("minutes").notNull(),
  rateNum: integer("rate_num").notNull(), // rate in cents per hour = rate_num / rate_den
  rateDen: integer("rate_den").notNull(),
  amountCents: integer("amount_cents").notNull(),
  ruleId: text("rule_id").notNull(),
  explain: text("explain").notNull(),
});

export const billLines = pgTable("bill_lines", {
  id: id(),
  agencyId: agencyId(),
  payRunId: uuid("pay_run_id").notNull().references(() => payRuns.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  workerId: uuid("worker_id").notNull().references(() => workers.id),
  assignmentId: uuid("assignment_id").references(() => assignments.id),
  timeEntryIds: jsonb("time_entry_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  workweekStart: isoDate("workweek_start").notNull(),
  type: earningType("type").notNull(),
  minutes: integer("minutes").notNull(),
  rateNum: integer("rate_num").notNull(),
  rateDen: integer("rate_den").notNull(),
  amountCents: integer("amount_cents").notNull(),
  ruleId: text("rule_id").notNull(),
  explain: text("explain").notNull(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    agencyId: agencyId(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    payRunId: uuid("pay_run_id").notNull().references(() => payRuns.id),
    number: text("number").notNull(),
    issuedOn: isoDate("issued_on").notNull(),
    dueOn: isoDate("due_on").notNull(),
    status: invoiceStatus("status").notNull().default("draft"),
    subtotalCents: integer("subtotal_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    pdfStorageKey: text("pdf_storage_key"),
    /** A correction's documents (drizzle/0024): a supplemental invoice or a credit note (negative total), naming the original. */
    kind: text("kind").$type<InvoiceKind>().notNull().default("invoice"),
    originalInvoiceId: uuid("original_invoice_id"),
    /** Slice g (drizzle/0025): the part of the client's hours it covers ("" when not separated). */
    splitKey: text("split_key").notNull().default(""),
    template: text("template").$type<InvoiceTemplate>().notNull().default("standard"),
    poNumber: text("po_number"),
    worksiteId: uuid("worksite_id").references(() => worksites.id),
    /** The document as issued: what the invoice page and a statement show. */
    document: jsonb("document").$type<IssuedInvoice>(),
    csvStorageKey: text("csv_storage_key"),
    vmsStorageKey: text("vms_storage_key"),
    createdAt: createdAt(),
  },
  // An invoice number is issued once per agency; a run makes one invoice per client and part.
  (t) => [uniqueIndex("invoices_number").on(t.agencyId, t.number), uniqueIndex("invoices_run_part").on(t.payRunId, t.clientId, t.splitKey)],
);

/** An invoice as issued (slice g): the strings the PDF printed, and the lines with their numbers. */
export interface IssuedInvoice {
  /** The PDF's text, as rendered (labels without the page function). */
  pdf: Record<string, unknown>;
  lines: IssuedLine[];
  /** The timesheet pages whose redacted pictures follow the invoice (page numbers of each document). */
  backup: { detail: boolean; images: { documentId: string; filename: string; pages: number[] }[] };
}
export interface IssuedLine {
  workerId: string;
  workerName: string;
  assignmentId: string | null;
  poNumber: string | null;
  worksite: string | null;
  workweekStart: string;
  type: string;
  minutes: number;
  rate: { num: number; den: number };
  amountCents: number;
}

export type InvoiceKind = "invoice" | "supplemental" | "credit_note";

export type ControlTotals = {
  workers: number;
  minutesByType: Record<string, number>;
  /** Amount lines carried as money, not hours (a bonus), in cents by type. */
  amountsByType?: Record<string, number>;
  grossCents: number;
  /** What the payroll system should compute from the file's hours at the same rates. */
  payrollSystemGrossCents?: number;
  /** payrollSystemGrossCents − grossCents (rounding of hours to the file's precision). */
  payrollSystemDifferenceCents?: number;
};

export const exports = pgTable(
  "exports",
  {
    id: id(),
    agencyId: agencyId(),
    payRunId: uuid("pay_run_id").notNull().references(() => payRuns.id),
    format: text("format").notNull(),
    mappingVersion: text("mapping_version").notNull(),
    filename: text("filename").notNull(),
    sha256: text("sha256").notNull(),
    controlTotals: jsonb("control_totals").$type<ControlTotals>().notNull(),
    // Plain-English notes for the payroll clerk (e.g. hours rounded up to the file's precision).
    notes: jsonb("notes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    storageKey: text("storage_key").notNull(),
    createdAt: createdAt(),
  },
  // One file per run and format: a run is exported once.
  (t) => [uniqueIndex("exports_run_format").on(t.payRunId, t.format)],
);

/** How a worker's differences in a correction were settled when the payroll file cannot carry them (decision E9). */
export const CORRECTION_DECISIONS = ["paid_by_hand", "offset_earlier_overpayment", "repaid_outside_payroll", "consent_to_deduct", "written_off"] as const;
export type CorrectionDecisionKind = (typeof CORRECTION_DECISIONS)[number];

export const correctionDecisions = pgTable(
  "correction_decisions",
  {
    id: id(),
    agencyId: agencyId(),
    payRunId: uuid("pay_run_id").notNull().references(() => payRuns.id),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    decision: text("decision").$type<CorrectionDecisionKind>().notNull(),
    /** What this decision settled, in cents (more pay positive, less pay negative). */
    differenceCents: integer("difference_cents").notNull(),
    note: text("note").notNull(),
    decidedBy: uuid("decided_by"),
    decidedByLabel: text("decided_by_label").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("correction_decisions_run_worker").on(t.agencyId, t.payRunId, t.workerId)],
);

// ---------- audit (append-only; a trigger rejects UPDATE and DELETE) ----------
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agencyId: agencyId(),
    actorUserId: uuid("actor_user_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(), // create | update | approve | export | reveal | reset ...
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity").on(t.agencyId, t.entityType, t.entityId)],
);

// ---------- background jobs ----------
export const jobs = pgTable("jobs", {
  id: id(),
  agencyId: agencyId(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  status: jobStatus("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- global rule data (no agency; read-only to the app) ----------
export const overtimeRules = pgTable("overtime_rules", {
  id: id(),
  jurisdiction: text("jurisdiction").notNull(), // "US" or a two-letter state code
  ruleCode: text("rule_code").notNull(),
  kind: overtimeKind("kind").notNull(),
  thresholdMinutes: integer("threshold_minutes").notNull(),
  multiplierNum: integer("multiplier_num").notNull(),
  multiplierDen: integer("multiplier_den").notNull(),
  earningType: earningType("earning_type").notNull(),
  effectiveFrom: isoDate("effective_from").notNull(),
  effectiveTo: isoDate("effective_to"),
  citation: text("citation").notNull(),
});

// Which rule codes apply in each jurisdiction. A worksite state with no rows is an unknown
// jurisdiction and blocks the run (SPEC §9).
export const jurisdictionRules = pgTable(
  "jurisdiction_rules",
  {
    id: id(),
    jurisdiction: text("jurisdiction").notNull(),
    // Local scope by Census code: both null means statewide; a county or place row applies only there.
    countyFips: countyFips(),
    placeFips: placeFips(),
    scopeName: text("scope_name"),
    ruleCode: text("rule_code").notNull(),
    effectiveFrom: isoDate("effective_from").notNull(),
    effectiveTo: isoDate("effective_to"),
    citation: text("citation").notNull(),
  },
  (t) => placeCodeChecks("jurisdiction_rules", t),
);

// Minimum wage per jurisdiction (federal "US", state, or a county/city inside a state).
export const minimumWageRules = pgTable(
  "minimum_wage_rules",
  {
    id: id(),
    jurisdiction: text("jurisdiction").notNull(),
    countyFips: countyFips(),
    placeFips: placeFips(),
    scopeName: text("scope_name"),
    rateCents: integer("rate_cents").notNull(),
    effectiveFrom: isoDate("effective_from").notNull(),
    effectiveTo: isoDate("effective_to"),
    citation: text("citation").notNull(),
  },
  (t) => placeCodeChecks("minimum_wage_rules", t),
);

/** Dated premium rules paid when a person confirms their trigger (drizzle/0016). */
export const premiumRules = pgTable("premium_rules", {
  id: id(),
  jurisdiction: text("jurisdiction").notNull(),
  ruleCode: text("rule_code").notNull(),
  premiumMinutes: integer("premium_minutes").notNull(),
  perWorkdayMax: integer("per_workday_max").notNull(),
  effectiveFrom: isoDate("effective_from").notNull(),
  effectiveTo: isoDate("effective_to"),
  citation: text("citation").notNull(),
});

export const confirmationKind = pgEnum("confirmation_kind", ["meal_period_missed", "rest_period_missed", "reported_short", "holiday_not_worked"]);

/** Minimum pay for a short day, one dated rule per state (drizzle/0016). */
export const guaranteeRules = pgTable("guarantee_rules", {
  id: id(),
  jurisdiction: text("jurisdiction").notNull(),
  ruleCode: text("rule_code").notNull(),
  dueMinutes: integer("due_minutes"),
  reassignedDueMinutes: integer("reassigned_due_minutes"),
  scheduledFractionNum: integer("scheduled_fraction_num"),
  scheduledFractionDen: integer("scheduled_fraction_den"),
  minMinutes: integer("min_minutes"),
  maxMinutes: integer("max_minutes"),
  minScheduledMinutes: integer("min_scheduled_minutes"),
  basis: text("basis").$type<"regular_rate" | "pay_rate">().notNull(),
  effectiveFrom: isoDate("effective_from").notNull(),
  effectiveTo: isoDate("effective_to"),
  citation: text("citation").notNull(),
});

/** A person's confirmation that a worker missed a meal or rest period on one assignment and day. */
export const premiumConfirmations = pgTable(
  "premium_confirmations",
  {
    id: id(),
    agencyId: agencyId(),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
    workDate: isoDate("work_date").notNull(),
    kind: confirmationKind("kind").notNull(),
    /** reported_short: the minutes scheduled that day. */
    scheduledMinutes: integer("scheduled_minutes"),
    /** reported_short: placed at another client the same shift (Illinois day labor). */
    reassigned: boolean("reassigned").notNull().default(false),
    note: text("note"),
    confirmedBy: uuid("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("premium_confirmations_day").on(t.agencyId, t.workerId, t.workDate)],
);

/**
 * A holiday policy (drizzle/0018): agency data, not law. client null is the agency's default; a
 * client's own policy wins on that client's work. Multipliers are whole-number fractions.
 */
export const holidayPolicies = pgTable(
  "holiday_policies",
  {
    id: id(),
    agencyId: agencyId(),
    clientId: uuid("client_id").references(() => clients.id),
    name: text("name").notNull(),
    holidayDates: isoDate("holiday_dates").array().notNull(),
    workedMultiplierNum: integer("worked_multiplier_num").notNull(),
    workedMultiplierDen: integer("worked_multiplier_den").notNull(),
    notWorkedMinutes: integer("not_worked_minutes").notNull().default(0),
    billWorkedMultiplierNum: integer("bill_worked_multiplier_num"),
    billWorkedMultiplierDen: integer("bill_worked_multiplier_den"),
    billNotWorked: boolean("bill_not_worked").notNull().default(false),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("holiday_policies_client").on(t.agencyId, t.clientId)],
);

export const bonusKind = pgEnum("bonus_kind", ["nondiscretionary", "flat_sum"]);

/** A bonus for one workweek, entered and classified by a person (drizzle/0018). */
export const bonuses = pgTable(
  "bonuses",
  {
    id: id(),
    agencyId: agencyId(),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
    workweekStart: isoDate("workweek_start").notNull(),
    amountCents: integer("amount_cents").notNull(),
    kind: bonusKind("kind").notNull(),
    note: text("note"),
    enteredBy: uuid("entered_by"),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bonuses_week").on(t.agencyId, t.workerId, t.workweekStart)],
);

/** Dated rules about the regular rate itself, such as the premium multiple that stays out of it (drizzle/0021). */
export const regularRateRules = pgTable("regular_rate_rules", {
  id: id(),
  jurisdiction: text("jurisdiction").notNull(),
  ruleCode: text("rule_code").notNull(),
  multiplierNum: integer("multiplier_num").notNull(),
  multiplierDen: integer("multiplier_den").notNull(),
  effectiveFrom: isoDate("effective_from").notNull(),
  effectiveTo: isoDate("effective_to"),
  citation: text("citation").notNull(),
});

/** The Illinois equal-pay counter's numbers as a dated rule row (drizzle/0019). */
export const equalPayRules = pgTable("equal_pay_rules", {
  id: id(),
  jurisdiction: text("jurisdiction").notNull(),
  ruleCode: text("rule_code").notNull(),
  countsFrom: isoDate("counts_from").notNull(),
  warnMinutes: integer("warn_minutes").notNull(),
  windowMonths: integer("window_months").notNull(),
  triggerMinutes: integer("trigger_minutes").notNull(),
  longWindowMonths: integer("long_window_months").notNull(),
  longTriggerMinutes: integer("long_trigger_minutes").notNull(),
  effectiveFrom: isoDate("effective_from").notNull(),
  effectiveTo: isoDate("effective_to"),
  citation: text("citation").notNull(),
});

export const obligationKind = pgEnum("obligation_kind", ["il_equal_pay_720h", "il_equal_pay_4160h"]);

/** What the evidence of an obligation holds (the engine's Obligation, less what has its own column). */
export interface ObligationEvidence {
  ruleCode: string;
  citation: string;
  crossedAtMinute: number | null;
  windowStart: string;
  thresholdMinutes: number;
  minutesAfter: number;
  /** Minutes worked after the crossing in earlier periods (a crossing found in earlier hours). */
  earlierMinutesAfter: number;
  /** The crossing was before this period, so the deadline has already passed. */
  overdue: boolean;
  entryIds: string[];
}

/** Something the agency must do because of the hours worked (SPEC §4; drizzle/0019): one per worker, client and kind. */
export const obligations = pgTable(
  "obligations",
  {
    id: id(),
    agencyId: agencyId(),
    kind: obligationKind("kind").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    payRunId: uuid("pay_run_id").references(() => payRuns.id),
    crossedOn: isoDate("crossed_on").notNull(),
    dueOn: isoDate("due_on").notNull(),
    status: text("status").$type<"open" | "done">().notNull().default("open"),
    evidence: jsonb("evidence").$type<ObligationEvidence>().notNull(),
    message: text("message").notNull(),
    createdAt: createdAt(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: uuid("done_by"),
  },
  (t) => [index("obligations_due").on(t.agencyId, t.status, t.dueOn), unique("obligations_once").on(t.agencyId, t.kind, t.workerId, t.clientId)],
);

// ---------- client approval (SPEC §10; drizzle/0022; decisions 0012, 0013) ----------
export type ApprovalLocale = "en" | "es";

/** One approver at a client asked to approve the client's shifts in one pay period. */
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    agencyId: agencyId(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    payPeriodId: uuid("pay_period_id").notNull().references(() => payPeriods.id),
    approverName: text("approver_name").notNull(),
    approverEmail: text("approver_email").notNull(),
    locale: text("locale").$type<ApprovalLocale>().notNull(),
    agencyLocale: text("agency_locale").$type<ApprovalLocale>().notNull(),
    status: text("status").$type<"open" | "replaced">().notNull().default("open"),
    cycleStartedAt: timestamp("cycle_started_at", { withTimezone: true }).notNull(),
    remindersSent: integer("reminders_sent").notNull().default(0),
    needsSending: boolean("needs_sending").notNull().default(false),
    createdAt: createdAt(),
    createdBy: uuid("created_by"),
    createdByLabel: text("created_by_label").notNull(),
  },
  (t) => [uniqueIndex("approval_requests_one_open").on(t.agencyId, t.clientId, t.payPeriodId).where(sql`status = 'open'`)],
);

/** A link sent by email; only the SHA-256 of its token is kept (decision 0013). */
export const approvalLinks = pgTable(
  "approval_links",
  {
    id: id(),
    agencyId: agencyId(),
    requestId: uuid("request_id").notNull().references(() => approvalRequests.id),
    tokenHash: text("token_hash").notNull().unique("approval_links_token_hash"),
    purpose: text("purpose").$type<"request" | "reminder" | "renewal">().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    renewalRequestedAt: timestamp("renewal_requested_at", { withTimezone: true }),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("approval_links_request").on(t.agencyId, t.requestId)],
);

/** A shift as the client saw it (no rates, no amounts). */
export interface ApprovedShift {
  entryId: string;
  workerId: string;
  workerName: string;
  workDate: string;
  inMinute: number | null;
  outMinute: number | null;
  breakMinutes: number | null;
  minutes: number;
}

/** The approver's decision: evidence, append-only (drizzle/0022). */
export const approvalDecisions = pgTable(
  "approval_decisions",
  {
    id: id(),
    agencyId: agencyId(),
    requestId: uuid("request_id").notNull().references(() => approvalRequests.id),
    linkId: uuid("link_id").notNull().references(() => approvalLinks.id),
    approverEmail: text("approver_email").notNull(),
    typedName: text("typed_name").notNull(),
    attestation: text("attestation").notNull(),
    attestationVersion: text("attestation_version").notNull(),
    locale: text("locale").$type<ApprovalLocale>().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    snapshotSha256: text("snapshot_sha256").notNull(),
    approved: jsonb("approved").$type<ApprovedShift[]>().notNull(),
    disputed: jsonb("disputed").$type<{ entryId: string; disputeId: string; reason: string }[]>().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approval_decisions_request").on(t.agencyId, t.requestId)],
);

export type DisputeStatus = "draft" | "open" | "accepted" | "edited" | "kept";

/** One shift the client questioned; the agency settles it (accept, edit, keep). */
export const clientDisputes = pgTable(
  "client_disputes",
  {
    id: id(),
    agencyId: agencyId(),
    requestId: uuid("request_id").notNull().references(() => approvalRequests.id),
    decisionId: uuid("decision_id").references(() => approvalDecisions.id),
    timeEntryId: uuid("time_entry_id").notNull().references(() => timeEntries.id),
    shift: jsonb("shift").$type<ApprovedShift>().notNull(),
    proposedInMinute: integer("proposed_in_minute"),
    proposedOutMinute: integer("proposed_out_minute"),
    proposedBreakMinutes: integer("proposed_break_minutes"),
    reason: text("reason").notNull(),
    status: text("status").$type<DisputeStatus>().notNull().default("draft"),
    reply: text("reply"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by"),
    resolvedByLabel: text("resolved_by_label"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("client_disputes_one_draft").on(t.agencyId, t.requestId, t.timeEntryId).where(sql`status = 'draft'`),
    uniqueIndex("client_disputes_one_open").on(t.agencyId, t.timeEntryId).where(sql`status = 'open'`),
  ],
);

export type EmailKind = "approval_request" | "approval_reminder" | "approval_renewal" | "approval_confirmation" | "approval_notice";

/** Every email sent, with any approval link hidden (Stripe keeps a log of customer emails). */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: id(),
    agencyId: agencyId(),
    requestId: uuid("request_id").references(() => approvalRequests.id),
    kind: text("kind").$type<EmailKind>().notNull(),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull(),
    textBody: text("text_body").notNull(),
    status: text("status").$type<"sending" | "sent" | "failed">().notNull().default("sending"),
    providerId: text("provider_id"),
    error: text("error"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("email_messages_request").on(t.agencyId, t.requestId, t.createdAt)],
);

/** Demo mode's stand-in inbox: the delivered copy, with its working link (decision 0012). */
export const demoMailbox = pgTable("demo_mailbox", {
  id: id(),
  agencyId: agencyId(),
  emailMessageId: uuid("email_message_id")
    .notNull()
    .references(() => emailMessages.id)
    .unique("demo_mailbox_one"),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  textBody: text("text_body").notNull(),
  htmlBody: text("html_body").notNull(),
  createdAt: createdAt(),
});

export type PayPeriodRow = typeof payPeriods.$inferSelect;
export type ApprovalRequestRow = typeof approvalRequests.$inferSelect;
export type ApprovalLinkRow = typeof approvalLinks.$inferSelect;
export type ClientDisputeRow = typeof clientDisputes.$inferSelect;
export type EmailMessageRow = typeof emailMessages.$inferSelect;

export const TENANT_TABLES = [
  "branches",
  "users",
  "agency_settings",
  "clients",
  "worksites",
  "client_billing_profiles",
  "workers",
  "nicknames",
  "job_orders",
  "rate_cards",
  "assignments",
  "pay_periods",
  "mapping_profiles",
  "placement_imports",
  "premium_confirmations",
  "holiday_policies",
  "bonuses",
  "obligations",
  "source_documents",
  "document_pages",
  "extraction_passes",
  "time_entries",
  "pay_runs",
  "pay_lines",
  "bill_lines",
  "invoices",
  "exports",
  "audit_events",
  "jobs",
  "approval_requests",
  "approval_links",
  "approval_decisions",
  "client_disputes",
  "email_messages",
  "demo_mailbox",
  "correction_decisions",
] as const;
