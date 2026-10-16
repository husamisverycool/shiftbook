# Slice (g) — Invoices with backup and client templates

Status: GO under the owner's "just keep going … I don't need to approve anything for you"
(2026-10-16). Choices the research left open are listed under "Decisions made for the owner"; the
owner can reverse any of them.
Contract: SPEC.md §4 (ClientBillingProfile, Invoice), §5 (money), §11 (files from the approved run),
§12 (invoices), §24 step 7 (invoice PDFs with backup). Research with sources:
`docs/research/invoices-slice-g.md`.

## Goal (what the owner can do at the end)
Set each client's invoice settings once (template, separate invoices by PO or worksite, PO required,
backup, VMS upload, terms), dated so a change applies from a date. Every week's files then include,
per client, the invoices those settings call for: the chosen template, a backup bundle in the same
PDF (line detail with the client's approval, then the approved timesheet pictures with Social
Security numbers and dates of birth blacked out), a CSV of the lines, and — for a client on SAP
Fieldglass — the supplier invoice-upload file. An invoices list and an invoice page show every
invoice with its documents; several of one client's invoices can be put together in one statement.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. Playwright, English and Spanish: the Owner sets a client to separate invoices by PO with backup,
   runs a week, opens the invoices list, sees two invoices for that client, opens one, downloads its
   PDF (invoice, detail and timesheet pages), its CSV, and makes a statement of two invoices.
   Accessibility checks on every new screen.
3. Screenshots of every new screen, state and document, compared with the pattern files.
4. A second-opinion review of invoice splitting, numbering, totals, CSV and VMS files (money), fixed.
5. Proposed answer keys for the invoice CSV and the Fieldglass file, checked by hand.

## Screens and documents, with references
| Screen / document | Pattern file | Reference |
|---|---|---|
| Invoices list (`/invoices`) | `invoices.md` (new) | Stripe Dashboard invoices list (status chips, columns, row ⋯, export); Bullhorn "# Selected" actions |
| Invoice page (`/invoices/[id]`) | `invoices/[id].md` (new) | Stripe invoice details (header with status and actions, line items, related documents, history); TempWorks "Preview Invoice w/ Timecards"; Fieldglass "Related" tab |
| Clients list (`/clients`) | `clients.md` (new) | Stripe customers list |
| Client page with invoice settings (`/clients/[id]`) | `clients/[id].md` (new) | Stripe customer details (Details → Edit; invoice settings); Bullhorn One Invoice Terms with dated versions; Avionté Billing Preferences sections |
| Invoice PDF templates | `_documents/invoice.md` (updated) | Stripe invoice PDF; Bullhorn One group by candidate; Avionté "Show Daily Hours"; Bullhorn `[APPROVE_LOG]`; Avionté PO at the top of each page |
| Backup pages | `_documents/invoice.md` (updated) | Avionté merged invoice and timecards; Bullhorn One attachment order |
| Statement | `_documents/statement.md` (new) | Avionté Invoice Merge; TempWorks Merge Invoices |
| Sidebar entries | `_layouts/app.md` (updated) | Linear sidebar |

## Steps (tests first)
1. Data: invoice settings on the billing profile (template, separate by, backup, VMS format), a PO
   on each assignment, the documents kept on each invoice; dated changes of a client's settings
   (service, audit, Owner and Billing roles).
2. Invoices from the run: split by PO and worksite, numbering, the PO checks, the three templates,
   the backup bundle, the CSV and the Fieldglass file; corrections find the original by split.
3. Screens: invoices list and page, statement, clients list and page with the settings editor;
   sidebar.
4. Browser tests, accessibility, screenshots; second-opinion review; fixes.

## Decisions made for the owner (2026-10-16, under "keep going"; any can be reversed)
- G1 **"Consolidated statement" is a statement, not a new bill** (research §2.2 meaning B, Avionté
  Invoice Merge, TempWorks Merge Invoices): chosen invoices of one client put together in one PDF —
  a first page listing each invoice (number, period, issued, due, amount) and the total, then each
  invoice as it was issued. Payments stay on each invoice (SPEC §14 ages each invoice).
- G2 **Templates:** Standard (as today: one line per worker, earning type and rate); Per-worker
  detail (the lines grouped by worker with a subtotal each, Bullhorn One group by candidate); PO
  header (the PO number at the top of every page, Avionté). The template is a client setting.
- G3 **Separate invoices by** PO and/or worksite (TempWorks checkboxes; combinations multiply). One
  invoice keeps today's number `{code}-{YYYYMMDD}`; several are `{code}-{YYYYMMDD}-{n}`, ordered by
  PO then worksite name.
- G4 **PO:** each assignment may carry its client's PO (Bullhorn placement PO); without one it uses
  the client's PO (Bullhorn "same as billing contact"). An invoice with one PO shows it in its
  header; with several (not split by PO) each line names its PO (TempWorks option 2).
- G5 **PO required and missing blocks the run** (SPEC §11 blocking checks; Bullhorn One blocks a
  missing billing profile). PO budgets, end dates and warnings are not in this slice.
- G6 **Backup in the same PDF** (Avionté merge): the invoice, then line detail pages (per worker and
  week: each day's in, out, break and hours, and who approved), then each timesheet picture on its
  own page in invoice line order (Bullhorn One). Two client settings: line detail on/off, pictures
  on/off. Pictures are always the redacted copies (SSN and date of birth blacked out — CLAUDE.md;
  Cal. Civ. Code §1798.85). Pages carry no caption beyond the page number (no reference labels them).
- G7 **Approval on the detail pages** (Bullhorn `[APPROVE_LOG]`): "Approved by {name} ({email}) on
  {date} at {time}" from the client's approval; hours the client did not approve say "Reviewed by
  {agency}".
- G8 **Invoice CSV** for every invoice (Beeline default invoice fields that Shiftbook has: invoice
  number, invoice date, period, worker, worksite, PO, week ending, earning type, hours, rate,
  amount), kept with the invoice.
- G9 **VMS upload: SAP Fieldglass "Time Sheet Invoice Upload"** for clients set to it (the only
  supplier upload with public columns). Shiftbook keeps each Fieldglass time sheet's id from the
  approved time sheet download; one row per time sheet: invoice code, time sheet id, the worker's
  Fieldglass id as the Job Seeker ID (open question), paid amount 0.00, total billing amount. Coupa
  and Ariba use the customer's own template: out of this slice; the invoice CSV covers other cases.
- G10 **Sidebar:** Invoices (G then I) and Clients (G then L), after Client approvals.

## Open questions (do not block; for the owner when convenient)
- Is the Fieldglass download's "Worker ID" the Job Seeker ID the upload asks for?
- Do clients want the timesheet pictures in a second PDF instead of the same one?
- Should PO budgets and end dates warn before they run out (TempWorks warning amount and date)?

## Out of this slice
Payments, aging and reminders (h); emailing invoices (the files are downloaded; slice h adds
reminders); Coupa and Ariba uploads; custom invoice layouts.

## Progress (2026-10-16)
- Steps 1–3 built, tests first: dated invoice settings and the placement PO; invoices split by PO
  and worksite with their numbering and PO checks; the three templates; hours detail with the
  client's approval and the redacted timesheet pictures; the invoice CSV and the SAP Fieldglass
  upload; the invoices list and page, statements, the clients list and page; the run's fixes.
- Proposed answer keys for the invoice CSV and the Fieldglass file, checked by hand; the owner
  approved all answer keys ("approve all goldens") and they are in `tests/goldens/`.
- Second-opinion review: 10 findings, all fixed with tests (decision 0017).
- Browser tests in English and Spanish with accessibility checks; screenshots compared in
  `docs/screens/slice-g.md`.
