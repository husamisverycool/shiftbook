-- Joining the slices (SPEC §27): two more notice kinds — a client's request for workers (slice v) and a
-- worker's message (slice t) — and the text that tells a worker their schedule is published (slice u).
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind";
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind" CHECK (kind IN ('approval_returned', 'approval_disputed', 'run_blocked', 'obligation_due_soon', 'obligation_overdue', 'invoice_overdue', 'promise_broken', 'shift_confirmed', 'staff_requested', 'worker_message'));
--> statement-breakpoint
ALTER TABLE "notification_settings" DROP CONSTRAINT "notification_settings_kind";
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_kind" CHECK (kind IN ('approval_returned', 'approval_disputed', 'run_blocked', 'obligation_due_soon', 'obligation_overdue', 'invoice_overdue', 'promise_broken', 'shift_confirmed', 'staff_requested', 'worker_message'));
--> statement-breakpoint
ALTER TABLE "sms_messages" DROP CONSTRAINT "sms_messages_kind";
--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_kind" CHECK (kind IN ('sign_in_code', 'onboarding_invite', 'phone_changed', 'schedule'));
