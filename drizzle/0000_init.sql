CREATE TYPE "public"."assignment_status" AS ENUM('active', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('image', 'pdf', 'timeclock_csv', 'timeclock_xlsx', 'vms_export', 'manual');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('received', 'reading', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."earning_type" AS ENUM('REG', 'OT', 'DT', 'HOL', 'DIFF', 'MEAL_PREMIUM', 'REST_PREMIUM', 'MIN_GUARANTEE');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ot_billing_rule" AS ENUM('multiplier', 'straight_time', 'not_billable');--> statement-breakpoint
CREATE TYPE "public"."overtime_kind" AS ENUM('weekly', 'daily', 'daily_double', 'seventh_day');--> statement-breakpoint
CREATE TYPE "public"."pay_run_status" AS ENUM('draft', 'validating', 'blocked', 'ready', 'exported', 'closed');--> statement-breakpoint
CREATE TYPE "public"."received_via" AS ENUM('upload', 'email', 'manual');--> statement-breakpoint
CREATE TYPE "public"."time_entry_status" AS ENUM('extracted', 'needs_review', 'reviewed', 'client_approved', 'disputed', 'locked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'coordinator', 'billing', 'accountant');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phone" text,
	"email" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"job_order_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "assignment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"pay_run_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"assignment_id" uuid,
	"time_entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"workweek_start" date NOT NULL,
	"type" "earning_type" NOT NULL,
	"minutes" integer NOT NULL,
	"rate_num" integer NOT NULL,
	"rate_den" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"rule_id" text NOT NULL,
	"explain" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_billing_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"invoice_template" text DEFAULT 'standard' NOT NULL,
	"po_required" boolean DEFAULT false NOT NULL,
	"po_number" text,
	"consolidate" boolean DEFAULT false NOT NULL,
	"vms_name" text,
	"overtime_billing_rule" "ot_billing_rule" DEFAULT 'multiplier' NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"billing_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"storage_key" text NOT NULL,
	"redacted_storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"redactions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"pay_run_id" uuid NOT NULL,
	"format" text NOT NULL,
	"mapping_version" text NOT NULL,
	"filename" text NOT NULL,
	"sha256" text NOT NULL,
	"control_totals" jsonb NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"pass" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"request_hash" text NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"pay_run_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"pdf_storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	"position" text NOT NULL,
	"soc_code" text,
	"shift" text,
	"headcount" integer DEFAULT 1 NOT NULL,
	"pay_min_cents" integer,
	"pay_max_cents" integer,
	"prevailing_wage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdiction_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"rule_code" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"citation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapping_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nicknames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"given_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"rule_code" text NOT NULL,
	"kind" "overtime_kind" NOT NULL,
	"threshold_minutes" integer NOT NULL,
	"multiplier_num" integer NOT NULL,
	"multiplier_den" integer NOT NULL,
	"earning_type" "earning_type" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"citation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"pay_run_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"assignment_id" uuid,
	"time_entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"workweek_start" date NOT NULL,
	"type" "earning_type" NOT NULL,
	"minutes" integer NOT NULL,
	"rate_num" integer NOT NULL,
	"rate_den" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"rule_id" text NOT NULL,
	"explain" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"pay_period_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "pay_run_status" DEFAULT 'draft' NOT NULL,
	"rules_version" text NOT NULL,
	"blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"job_order_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"pay_rate_cents" integer NOT NULL,
	"bill_rate_cents" integer NOT NULL,
	"ot_multiplier_num" integer NOT NULL,
	"ot_multiplier_den" integer NOT NULL,
	"dt_multiplier_num" integer NOT NULL,
	"dt_multiplier_den" integer NOT NULL,
	"wc_class_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"pay_period_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"received_via" "received_via" DEFAULT 'upload' NOT NULL,
	"storage_key" text NOT NULL,
	"status" "document_status" DEFAULT 'received' NOT NULL,
	"error" text,
	"page_count" integer,
	"client_id" uuid,
	"mapping_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"pay_period_id" uuid NOT NULL,
	"source_document_id" uuid,
	"row_index" integer DEFAULT 0 NOT NULL,
	"worker_name_raw" text NOT NULL,
	"worker_id" uuid,
	"assignment_id" uuid,
	"work_date" date,
	"in_minute" integer,
	"out_minute" integer,
	"break_minutes" integer,
	"minutes" integer,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" "confidence_level" DEFAULT 'low' NOT NULL,
	"status" time_entry_status DEFAULT 'extracted' NOT NULL,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"preferred_locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"payroll_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"wc_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worksites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"county" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_settings" ADD CONSTRAINT "agency_settings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_job_order_id_job_orders_id_fk" FOREIGN KEY ("job_order_id") REFERENCES "public"."job_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD CONSTRAINT "client_billing_profiles_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing_profiles" ADD CONSTRAINT "client_billing_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_source_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_passes" ADD CONSTRAINT "extraction_passes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_passes" ADD CONSTRAINT "extraction_passes_document_id_source_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_worksite_id_worksites_id_fk" FOREIGN KEY ("worksite_id") REFERENCES "public"."worksites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_profiles" ADD CONSTRAINT "mapping_profiles_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nicknames" ADD CONSTRAINT "nicknames_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_lines" ADD CONSTRAINT "pay_lines_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_lines" ADD CONSTRAINT "pay_lines_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_lines" ADD CONSTRAINT "pay_lines_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_lines" ADD CONSTRAINT "pay_lines_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_pay_period_id_pay_periods_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_job_order_id_job_orders_id_fk" FOREIGN KEY ("job_order_id") REFERENCES "public"."job_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_pay_period_id_pay_periods_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_mapping_profile_id_mapping_profiles_id_fk" FOREIGN KEY ("mapping_profile_id") REFERENCES "public"."mapping_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_pay_period_id_pay_periods_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_settings_key" ON "agency_settings" USING btree ("agency_id","key","effective_from");--> statement-breakpoint
CREATE INDEX "assignments_worker" ON "assignments" USING btree ("agency_id","worker_id");--> statement-breakpoint
CREATE INDEX "audit_entity" ON "audit_events" USING btree ("agency_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "billing_profiles_client" ON "client_billing_profiles" USING btree ("agency_id","client_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "document_pages_unique" ON "document_pages" USING btree ("document_id","page_number");--> statement-breakpoint
CREATE UNIQUE INDEX "nicknames_unique" ON "nicknames" USING btree ("agency_id","nickname","given_name");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_periods_unique" ON "pay_periods" USING btree ("agency_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_runs_version" ON "pay_runs" USING btree ("agency_id","pay_period_id","version");--> statement-breakpoint
CREATE INDEX "rate_cards_job_order" ON "rate_cards" USING btree ("agency_id","job_order_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_hash" ON "source_documents" USING btree ("agency_id","pay_period_id","sha256");--> statement-breakpoint
CREATE INDEX "time_entries_period" ON "time_entries" USING btree ("agency_id","pay_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_agency_email" ON "users" USING btree ("agency_id","email");