-- Client portal security review (slice v): an approval link opened from the portal records the
-- portal contact that made it, so taking the portal away (or replacing the portal link) ends it too.
ALTER TABLE "approval_links" ADD COLUMN "portal_contact_id" uuid REFERENCES "portal_contacts"("id");
--> statement-breakpoint
CREATE INDEX "approval_links_portal_contact" ON "approval_links" ("agency_id", "portal_contact_id") WHERE "portal_contact_id" IS NOT NULL;
