# Slice (v) — the client portal (SPEC §27 item 8; decision 0041)

Status: built (2026-10-17)

## Plain summary
A person at a client gets a link by email to their own portal: what they owe and what's overdue,
every invoice (download the PDF with its timesheet backup), every payment with the invoices it paid
and a remittance to download, the hours waiting for their approval, the agency's registration
documents, and a short form to ask for workers. The agency gives and removes access on the client's
page; requests for workers appear above the job orders list, where one click turns a request into a
job order (or declines it with a reason the client sees). Nothing takes payments.

## Built
- Storage `drizzle/0051_client_portal.sql`: portal contacts, links (only the token's SHA-256), staff
  requests; row-level security; one SECURITY DEFINER lookup, as approval links.
- Service `src/server/portal/` (token, emails, service, request cache); file route
  `/api/portal/[token]/[kind]/[id]`; remittance PDF `src/pdf/remittance.tsx`.
- Screens: portal shell and six sections under `(portal)/portal/[token]`; Portal access on the client
  page; Requested by clients on Job orders; pattern files for each.

## Checks
Typecheck, lint, unit (1324), integration (portal + tenant isolation + approvals + catalog + demo
reset: 79), e2e `tests/e2e/client-portal.spec.ts` in English and Spanish.
