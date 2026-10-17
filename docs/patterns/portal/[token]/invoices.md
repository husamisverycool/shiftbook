# Pattern: Client portal — Invoices (`/portal/[token]/invoices`)

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: TempWorks WebCenter — Invoices (quick filters Unpaid / Paid, a row
opens a side panel with previous and next arrows, Print/Download); Avionté client portal — Invoices
(columns: invoice #, invoice date, due date, amount, balance, PO #); Stripe hosted invoice page
(download the invoice PDF; the page says how to pay); Stripe tables (`_components/table.md`)
Source URL: https://kb.tempworks.com/help/customer-portal-invoices
Source URL: https://avionteclassicsupport.zendesk.com/hc/en-us/articles/360045869733-Customer-Portal-Overview
Source URL: https://docs.stripe.com/invoicing/hosted-invoice-page
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §1.3, §3, §4). Confidence: medium.

## Hierarchy
1. **Title** "Invoices", then the quick filters as a segmented control: Unpaid (the default), Paid,
   All (TempWorks), each with its count.
2. **Table** (Avionté's columns, Stripe's table look): Invoice, Issued, Due, PO, Amount, Balance
   (bold), Status badge (Open, Overdue, Paid — `_components/status.md`), and a "…" menu at the end:
   Download PDF, Download lines (CSV).
3. **Side panel** (TempWorks invoice detail), when a row is opened: the number and status, "{n} of
   {total}" with previous and next arrows and a close button; issued, due, PO, amount, balance as
   label over value; Download PDF (the PDF carries the approved timesheets as backup); one line on
   how to pay — this portal takes no payments (Stripe hosted invoice page says how).

## Interactions
- Click a row, or focus it and press Enter, to open the side panel; Escape closes it; the arrows (and
  the up/down keys while it is open) move through the filtered list (TempWorks).
- The filter is part of the address, so a link and the back button keep it.

## States
- Empty per filter: "No unpaid invoices" / "No paid invoices yet" / "No invoices yet", and one line
  saying invoices appear when the agency issues them (Stripe History's empty state).

## Loading and errors (slice o)
- Loading: the list outline (`_components/loading.md`).
- A failure: the frame stays, "Try again" (`_components/error.md`).

Deviations allowed: none
