-- Tenant isolation (SPEC §21): every tenant table is fenced to the agency in the transaction-local
-- setting app.agency_id. With no setting, the app role sees nothing. FORCE makes the policies apply
-- to the table owner too; only roles with BYPASSRLS (shiftbook_owner: migrations, seeds) skip them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','users','agency_settings','clients','worksites','client_billing_profiles','workers',
    'nicknames','job_orders','rate_cards','assignments','pay_periods','mapping_profiles',
    'source_documents','document_pages','extraction_passes','time_entries','pay_runs','pay_lines',
    'bill_lines','invoices','exports','audit_events','jobs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid) WITH CHECK (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agencies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON agencies
  USING (id = nullif(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
-- Append-only audit log (SPEC §19): no UPDATE or DELETE, for anyone, ever.
CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% rejected)', TG_OP;
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
--> statement-breakpoint
-- The app role: read/write tenant data, read-only rule data, insert-only audit.
GRANT USAGE ON SCHEMA public TO shiftbook_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO shiftbook_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO shiftbook_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM shiftbook_app;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON overtime_rules, jurisdiction_rules FROM shiftbook_app;
--> statement-breakpoint
REVOKE INSERT, DELETE, TRUNCATE ON agencies FROM shiftbook_app;
