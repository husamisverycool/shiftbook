# Pattern: Invoices list (`/invoices`)

Status: adopted — slice (g) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe Dashboard — Invoices page (status chips or tabs that filter
the list, a status badge per row, an export, a ⋯ menu per row with "Download PDF", the row opens
the invoice); Bullhorn Back Office — Receivables (check rows, then "# Selected" actions such as
saving several invoices as one PDF)
Source URL: https://docs.stripe.com/invoicing/dashboard/manage-invoices
Source URL: https://docs.stripe.com/invoicing/overview
Source URL: https://docs.stripe.com/dashboard/basics
Source URL: https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/savingInvoices.htm
Source URL: https://support.avionte.com/hc/en-us/articles/55996101711379-Invoice-Merge
Researched: 2026-10-16 (`docs/research/invoices-slice-g.md` §5.1). Confidence: high for the
mechanics; Stripe's exact default columns are not documented, so the columns are the ones Stripe's
docs name (amount, status, number, customer, due date) plus the pay period.

## Purpose in Shiftbook
Every invoice, supplemental invoice and credit note the weekly runs made, newest first, with their
documents; and the way to put several of one client's invoices into one statement (decision G1).

## Hierarchy
1. **View header:** H1 "Invoices".
2. **Filter chips** (Stripe "tabs or chips"; in the address): status (All · Issued · Paid · Void)
   and a client chooser.
3. **Table**, newest first, one row per document: a checkbox, amount, status badge (Stripe), number
   with its kind for a supplemental invoice or credit note, client, pay period, issued, due; a ⋯
   menu at the right (Stripe row menu: Download PDF; Shiftbook adds Download CSV and, when the
   client is on Fieldglass, Download VMS file).
4. **Selection bar** when rows are checked (Bullhorn "# Selected"): the count and **Make
   statement** (Avionté Invoice Merge: invoices of one client), and Clear.

## Interactions
- Clicking a row opens the invoice page (Stripe).
- Checking invoices of more than one client disables Make statement and says it takes one client's
  invoices (Avionté merges one customer's invoices).
- Make statement downloads the statement PDF (`_documents/statement.md`).
- Keyboard: `?` lists shortcuts (Stripe documents `?`); G then I opens the list (app frame).

## States
- **No invoices yet:** an empty state saying invoices are made with each week's files, with a link
  to Convert timesheets (`_components/empty-state.md`).
- **Filtered to nothing:** "No invoices match" with a clear-filters action.

## Never copy
Stripe's, Bullhorn's or Avionté's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
The title, then the statuses (All, Issued, Paid, Void) as underline tabs with their counts, as Stripe's invoices list shows them (https://docs.stripe.com/invoicing/dashboard); the client filter beside them, on the tabs' hairline; the table full width with small-capital headers, the amount bold, the status as a tinted badge beside it, and dates short ("Oct 16, 2026"), as that screenshot writes them. With no invoices yet, the tabs and the filter stay in place over the empty state (`_components/empty-state.md`).

Deviations allowed: none
