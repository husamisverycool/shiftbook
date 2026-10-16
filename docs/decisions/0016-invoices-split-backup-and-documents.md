# 0016 — Invoices split by the client's settings, made once, with their backup and files

Status: accepted
Date: 2026-10-16

## Context
Slices (a) to (f) made one invoice PDF per client per run, from settings that were not dated past
the PO and the terms. SPEC §12 asks for the client's template, the backup (approved timesheets with
the client's approval), a CSV of the lines, the VMS upload where the client uses one, and invoices
separated by PO or worksite; SPEC §4 keeps a billing profile per client. The research
(`docs/research/invoices-slice-g.md`) found that staffing back offices make these choices per
client (Bullhorn Invoice Terms, TempWorks separate-invoice checkboxes, Avionté billing
preferences) and keep the documents as issued. Plan: `.claude/plans/slice-g-invoices.md`, decisions
G1–G10.

## Decision
- **The client's invoice settings are dated versions** of `client_billing_profiles` (template,
  separate by PO and/or worksite, PO required and the client's PO, hours detail, timesheet pictures,
  VMS file, terms, overtime billing). A run uses the version in force on the period's last day. A
  version cannot start in a period already invoiced for the client (a correction of that period
  must split as its invoices did); a new one ends the one before, the same day replaces it, each
  audited. Only the Owner and Billing change them.
- **A placement may carry the client's PO** (`assignments.po_number`); without one, the client's PO.
- **The run plans the invoices** (`invoice-plan.ts`): per client, one invoice per part its settings
  call for (PO, worksite, or both), numbered `{code}-{YYYYMMDD}` alone or `-{n}` in PO then
  worksite order. A client that requires a PO blocks the run for hours without one, naming the
  workers. The dry run also makes the VMS file and turns a refusal into a blocker. The same plan is
  what "Create files" makes.
- **Each invoice is made once, with everything it carries**, by `invoice-documents.ts`: the PDF in
  the client's template, then (per the settings) the hours detail with the client's approval
  (Bullhorn `[APPROVE_LOG]`) and each timesheet page its hours were read from, as the redacted copy;
  the invoice CSV; and, for an original invoice of a client on SAP Fieldglass, the Time Sheet
  Invoice Upload, one row per time sheet. The invoice row keeps the part it covers, its template,
  PO and worksite, the documents' storage keys, and the document as issued (its lines with their
  assignment, PO and week, and the PDF's text).
- **Corrections find the invoice they correct** by the assignment and week its lines billed, as
  issued, whatever the placement's PO says now; hours never invoiced go to a new invoice with the
  next number. An invoice made before this slice (no stored lines) is the client's single invoice.
- **A statement** puts chosen invoices of one client in one PDF (a first page, then each invoice's
  pages from its stored text). It is made on request and not stored; payments stay per invoice.

## Alternatives considered
- **Settings read as they are today** (not dated): a correction would split differently from the
  invoices it corrects, and an invoice could not be explained by the settings in force.
- **Backup in a second PDF** (Bullhorn One attaches files separately): one PDF is what Avionté
  merges and what a client's AP files in one place. Open question for the owner.
- **A statement that re-renders each invoice from today's data**: it would not be the invoice as
  issued. It prints from the stored text instead; an invoice made before this slice cannot be
  included and the screen says so.
- **A page that also shows another client's workers in the pictures** could be included with a
  black box over their lines; the page is left out instead (no reference blacks out other lines),
  and the hours detail still lists every day.

## Consequences
- Invoices, their backup and their files never change after "Create files"; the invoice page and the
  downloads read the stored documents.
- Hours typed in by hand for a client on the Fieldglass upload block the run until they come from a
  time sheet or the client's VMS file is turned off: the upload must name a time sheet per row.
- The Fieldglass upload's Job Seeker ID is taken to be the worker id in the client's time sheet
  download (an open question in the plan).
