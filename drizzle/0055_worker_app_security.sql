-- Worker app after its security review (slice t): a change of a worker's mobile number texts the old
-- number (the change signs the worker out of the app everywhere).
ALTER TABLE "sms_messages" DROP CONSTRAINT "sms_messages_kind";
--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_kind" CHECK (kind IN ('sign_in_code', 'onboarding_invite', 'phone_changed'));
