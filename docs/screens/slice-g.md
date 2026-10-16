# Slice (g) screens and documents compared with their pattern files

Captured 2026-10-16 in demo mode (English, 1440×900, full page; Spanish copies start with `es-`).
Documents are rendered from the PDFs the run made (`doc-…`). ✓ = matches the pattern file.

The week behind them: Prairie Line's time clock (Marcus Bell, Anita Patel) and a photographed
sign-in sheet of its second shift (Robert Jones, Kateryna Bondarenko); Anita's placement carries
PO-77001, everyone else the client's PO-48213; Prairie Line separates invoices by PO and sends
hours detail and timesheet pictures. The English run uses the per-worker detail template, the
Spanish run the PO header template.

## Invoices list — `docs/patterns/invoices.md` (Stripe invoices list; Bullhorn "# Selected"; Avionté Invoice Merge)
Screens: `slice-g/g01-invoices-list.png`, `g02-invoices-selected.png`, `g04-invoices-filtered-none.png`,
`g05-invoices-empty.png`, `g16-invoice-row-menu.png`, `es-g01`, `es-g02`.
- ✓ H1 "Invoices"; status chips All · Issued · Paid · Void with counts, and a client chooser, both
  kept in the address.
- ✓ One row per document, newest first: checkbox, amount, status badge, number (with its kind for a
  supplemental invoice or credit note), client, pay period, issued, due, and a ⋯ menu with Download
  PDF, Download CSV and, for a Fieldglass client, Download VMS file (`g16`). The row opens the
  invoice.
- ✓ Checked rows show the selection bar: the count, **Make statement**, Clear (`g02`). Rows of two
  clients disable Make statement and say a statement takes one client's invoices.
- ✓ Empty: invoices are made with each week's files, with a link to Convert timesheets (`g05`);
  filtered to nothing: "No invoices match" with Clear filters (`g04`).
- ✓ G then I opens the list (the browser test uses it); `?` lists it with the other shortcuts.
- Not captured: two clients selected (the demo week bills one client); the browser and integration
  tests cover the refusal.

## Invoice page — `docs/patterns/invoices/[id].md` (Stripe invoice details; TempWorks timecards; Fieldglass "Related")
Screens: `slice-g/g06-invoice-page.png`, `g07-invoice-page-before-lines-kept.png`, `es-g06`.
- ✓ Back to Invoices (keeps the list's filters); kind and number as H1, the status badge, the
  client linking to its page; Download PDF (primary) and a ⋯ menu with Download CSV and Download VMS
  file.
- ✓ Summary row: amount due (credited for a credit note), issued, due, pay period, PO, worksite
  when the invoice is one worksite's, template.
- ✓ Line items as the PDF shows them (per-worker groups with subtotals for that template), with
  subtotal and total.
- ✓ Backup: hours detail included or not, and each timesheet whose pictures follow the invoice,
  with each page included opening its picture as sent.
- ✓ Related documents: the invoice this one corrects, or the corrections of it, and the week's files.
- ✓ An invoice made before its lines were kept says they are in its PDF (`g07`).

## Clients list — `docs/patterns/clients.md` (Stripe customers list)
Screens: `slice-g/g08-clients-list.png`, `es-g08`.
- ✓ H1 "Clients"; by name: name (opens the client), code, invoice template, separate invoices by,
  payment terms, VMS upload. G then L opens it.

## Client page and invoice settings — `docs/patterns/clients/[id].md` (Stripe Details → Edit; Bullhorn One Invoice Terms versions; Avionté Billing Preferences)
Screens: `slice-g/g09-client-page.png`, `g10-client-settings-dialog.png`,
`g11-client-settings-refused.png`, `g17-client-page-with-invoices.png`, `es-g09`, `es-g10`.
- ✓ "Clients" above, H1 the name and code.
- ✓ Invoice settings with Edit at the right, in four groups: Invoice (template, separate by, PO
  required, client PO), Backup (hours detail, pictures), Delivery (VMS file), Billing (terms,
  overtime billing, premiums, guarantees); "In effect from …" and the versions with their dates.
- ✓ Edit opens a dialog with the same fields and "Applies from" (Bullhorn: a new version, not an
  edit), starting at the first day not yet invoiced. A value that breaks a rule shows the rule under
  its field and nothing is saved (`g11`).
- ✓ The client's invoices, as rows of the invoices list (`g17`).
- Not captured: the read-only line for roles other than Owner and Billing (the demo signs in as the
  Owner until slice k adds sign-in); the integration tests cover the refusal.

## Assignments side panel — `docs/patterns/assignments.md` (updated: Bullhorn placement PO)
Screens: `slice-g/g12-assignment-po.png`, `es-g12`.
- ✓ The placement's PO under the assignment's fields; empty shows the client's PO as the hint; it
  saves when the field is left or Enter is pressed and says "Saved.".
- Difference: no refusal is shown in the screenshots — the field's 64-character limit and the
  trimming of spaces leave no PO a person can type that the rule refuses.

## Exceptions — `docs/patterns/convert.md` step 3 (updated: the client's invoice settings as a fix)
Screens: `slice-g/g14-exceptions-po-missing.png`.
- ✓ "Hours without the PO the client requires" names the client and the workers, with **Open
  {client}'s invoice settings**. A VMS upload refusal does the same and also offers to skip the
  workers it names.

## Files — `docs/patterns/convert.md` step 5
Screens: `slice-g/g15-files-step.png`, `es-g15`.
- ✓ The week's invoices listed one per part (PLM-20261005-1, -2).

## Invoice PDF — `docs/patterns/_documents/invoice.md` (Templates; Backup pages)
Documents: `slice-g/doc-invoice-1-en-p1.png` (per-worker detail), `doc-invoice-1-en-p2.png` (hours
detail), `doc-invoice-1-en-p3.png` (timesheet picture), `doc-invoice-1-es-p1.png` (PO header),
`doc-invoice-1-es-p2.png`, `doc-invoice-1-es-p3.png`.
- ✓ The invoice hierarchy unchanged; per-worker detail groups each worker's lines under their name
  with a subtotal; PO header prints the PO at the top of every page.
- ✓ Hours detail: per worker and week, date, in, out, break and hours, the week's total, then the
  approval line ("Approved by … on … at …", or "Reviewed by {agency}").
- ✓ Each timesheet page on its own page, the redacted copy, with no caption beyond the footer and
  "Page X of Y" counting every page.

## Statement — `docs/patterns/_documents/statement.md` (Avionté Invoice Merge; TempWorks; QuickBooks statements)
Documents: `slice-g/doc-statement-p1.png` … `p3`.
- ✓ First page: "Statement", the date, agency and client, the invoices oldest first with number,
  pay period, issued, due and amount, their total, and the line that each is paid on its own number;
  then each invoice's pages as issued.
