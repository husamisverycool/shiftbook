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
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const agencyId = () => uuid("agency_id").notNull().references(() => agencies.id);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: "string" });

// ---------- enums ----------
export const userRole = pgEnum("user_role", ["owner", "coordinator", "billing", "accountant"]);
export const otBillingRule = pgEnum("ot_billing_rule", ["multiplier", "straight_time", "not_billable"]);
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
export const documentStatus = pgEnum("document_status", ["received", "reading", "read", "failed"]);
export const timeEntryStatus = pgEnum("time_entry_status", [
  "extracted",
  "needs_review",
  "reviewed",
  "client_approved",
  "disputed",
  "locked",
]);
export const confidenceLevel = pgEnum("confidence_level", ["high", "medium", "low"]);
export const payRunStatus = pgEnum("pay_run_status", [
  "draft",
  "validating",
  "blocked",
  "ready",
  "exported",
  "closed",
]);
export const earningType = pgEnum("earning_type", [
  "REG",
  "OT",
  "DT",
  "HOL",
  "DIFF",
  "MEAL_PREMIUM",
  "REST_PREMIUM",
  "MIN_GUARANTEE",
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
  createdAt: createdAt(),
});

export const worksites = pgTable("worksites", {
  id: id(),
  agencyId: agencyId(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  county: text("county").notNull(),
  state: text("state").notNull(), // two-letter USPS code; drives jurisdiction
  postalCode: text("postal_code").notNull(),
  createdAt: createdAt(),
});

export const clientBillingProfiles = pgTable(
  "client_billing_profiles",
  {
    id: id(),
    agencyId: agencyId(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    invoiceTemplate: text("invoice_template").notNull().default("standard"),
    poRequired: boolean("po_required").notNull().default(false),
    poNumber: text("po_number"),
    consolidate: boolean("consolidate").notNull().default(false),
    vmsName: text("vms_name"),
    overtimeBillingRule: otBillingRule("overtime_billing_rule").notNull().default("multiplier"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    effectiveFrom: isoDate("effective_from").notNull(),
    effectiveTo: isoDate("effective_to"),
    createdAt: createdAt(),
  },
  (t) => [index("billing_profiles_client").on(t.agencyId, t.clientId, t.effectiveFrom)],
);

// ---------- workers ----------
export type PayrollIds = Partial<Record<"gusto" | "adp_wfn" | "adp_run" | "qbo" | "qbd", { id: string; title?: string }>>;

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
  createdAt: createdAt(),
});

export const rateCards = pgTable(
  "rate_cards",
  {
    id: id(),
    agencyId: agencyId(),
    jobOrderId: uuid("job_order_id").notNull().references(() => jobOrders.id),
    effectiveFrom: isoDate("effective_from").notNull(),
    effectiveTo: isoDate("effective_to"),
    payRateCents: integer("pay_rate_cents").notNull(), // cents per hour
    billRateCents: integer("bill_rate_cents").notNull(), // cents per hour
    otMultiplierNum: integer("ot_multiplier_num").notNull(),
    otMultiplierDen: integer("ot_multiplier_den").notNull(),
    dtMultiplierNum: integer("dt_multiplier_num").notNull(),
    dtMultiplierDen: integer("dt_multiplier_den").notNull(),
    wcClassCode: text("wc_class_code"),
    createdAt: createdAt(),
  },
  (t) => [index("rate_cards_job_order").on(t.agencyId, t.jobOrderId, t.effectiveFrom)],
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
    createdAt: createdAt(),
  },
  (t) => [index("assignments_worker").on(t.agencyId, t.workerId)],
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
};
export type EntryFields = Partial<Record<"worker" | "date" | "in" | "out" | "break" | "total", FieldProvenance>>;

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
    reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("time_entries_period").on(t.agencyId, t.payPeriodId)],
);

// ---------- runs, lines, invoices, exports ----------
export const payRuns = pgTable(
  "pay_runs",
  {
    id: id(),
    agencyId: agencyId(),
    payPeriodId: uuid("pay_period_id").notNull().references(() => payPeriods.id),
    version: integer("version").notNull().default(1),
    status: payRunStatus("status").notNull().default("draft"),
    rulesVersion: text("rules_version").notNull(),
    blockers: jsonb("blockers").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    snapshot: jsonb("snapshot"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("pay_runs_version").on(t.agencyId, t.payPeriodId, t.version)],
);

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

export const invoices = pgTable("invoices", {
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
  createdAt: createdAt(),
});

export type ControlTotals = {
  workers: number;
  minutesByType: Record<string, number>;
  grossCents: number;
};

export const exports = pgTable("exports", {
  id: id(),
  agencyId: agencyId(),
  payRunId: uuid("pay_run_id").notNull().references(() => payRuns.id),
  format: text("format").notNull(),
  mappingVersion: text("mapping_version").notNull(),
  filename: text("filename").notNull(),
  sha256: text("sha256").notNull(),
  controlTotals: jsonb("control_totals").$type<ControlTotals>().notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: createdAt(),
});

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
export const jurisdictionRules = pgTable("jurisdiction_rules", {
  id: id(),
  jurisdiction: text("jurisdiction").notNull(),
  ruleCode: text("rule_code").notNull(),
  effectiveFrom: isoDate("effective_from").notNull(),
  effectiveTo: isoDate("effective_to"),
  citation: text("citation").notNull(),
});

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
] as const;
