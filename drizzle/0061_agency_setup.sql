-- An agency sets up its own business (completeness audit; SPEC §4 Client, Worksite, Branch, Agency):
-- clients and branches can be archived (never deleted: runs, invoices and margin name them), and a run
-- that passed its checks tells the Owner it waits for approval (notification "run_ready").
ALTER TABLE "clients" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "worksites" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
-- A client's code is how files and invoices name it: one per agency.
CREATE UNIQUE INDEX IF NOT EXISTS "clients_agency_code" ON "clients" ("agency_id", lower("code"));
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind";
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind" CHECK (kind IN ('approval_returned', 'approval_disputed', 'run_blocked', 'obligation_due_soon', 'obligation_overdue', 'invoice_overdue', 'promise_broken', 'shift_confirmed', 'staff_requested', 'worker_message', 'run_ready'));
--> statement-breakpoint
ALTER TABLE "notification_settings" DROP CONSTRAINT "notification_settings_kind";
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_kind" CHECK (kind IN ('approval_returned', 'approval_disputed', 'run_blocked', 'obligation_due_soon', 'obligation_overdue', 'invoice_overdue', 'promise_broken', 'shift_confirmed', 'staff_requested', 'worker_message', 'run_ready'));
