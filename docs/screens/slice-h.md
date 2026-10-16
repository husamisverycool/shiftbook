# Slice (h) screens compared with their pattern files

Captured 2026-10-16 in demo mode (English, 1440×900; Spanish copies start with `es-`). ✓ = matches
the pattern file.

The data behind them: Prairie Line's week run with Anita Patel's placement on its own PO, so the
client has two invoices (PLM-20261005-1, $1,298.50; PLM-20261005-2, $636.00). For the pictures only,
the two invoices were dated earlier in the database (issued 50 and 80 days ago) so the aging shows
more than one column; Pacific Crest's $500.00 check was recorded with nothing open, so it is all
credit. The bank file is the demo's sample, made from those open invoices.

## Receivables — `docs/patterns/receivables.md` (FreshBooks Accounts Aging; QuickBooks Online A/R aging; TempWorks Short Pay Invoices)
Screens: `slice-h/h01-receivables-empty.png`, `h05-receivables-aging.png`, `h15-receivables-short.png`,
`es-h05`, `es-h15`.
- ✓ H1 "Receivables"; at the right the As of date (today by default; a later date is not offered)
  and Export CSV.
- ✓ Tabs Aging · Short pays with the count, kept in the address.
- ✓ The summary line (owed, overdue, credit, as of); one row per client with anything open: client
  (opens its page), Current, 1–30, 31–60, 61–90, 91+, Total, days to pay; a totals row. Pacific
  Crest's credit shows in Current as −$500.00, so the totals tie.
- ✓ Clicking an amount lists the invoices behind it under the row: number (opens the invoice),
  issued, due, days late, total, balance (`h05`, the Total of Prairie Line).
- ✓ Short pays: client, invoice, paid, balance, reason (or "No reason yet"), last reminder; the row
  opens the invoice (`h15`).
- ✓ Nothing owed: the empty state with the date and a link to Invoices (`h01`).
- ✓ G then R opens the page (the browser test uses it). Export CSV is checked by the browser test.

## Payments — `docs/patterns/payments.md` (QuickBooks Online Receive payment and sales transactions; Zoho Books unused amount; Stripe unapply)
Screens: `slice-h/h02-payments-empty.png`, `h04-record-payment-dialog.png`, `h22-payments.png`,
`h23-apply-credit-dialog.png`, `h24-void-dialog.png`, `es-h04`, `es-h22`, `es-h23`, `es-h24`.
- ✓ H1 "Payments" and Record payment (primary); chips All · With unused credit · Voided with counts
  and a client chooser, in the address.
- ✓ Newest first: date, client, method, reference, amount, applied, unused, status, from (typed in
  or the bank file, the bank line's text on hover), ⋯ with Apply credit (when there is credit) and
  Void.
- ✓ Record payment: client, date, method, reference, amount received, memo; the client's open
  invoices oldest due first with a checkbox and an editable payment; amount to apply and amount
  left as credit; Save (`h04`). Opened from an invoice, the client and the invoice come ticked (the
  browser test records a check that way).
- ✓ Apply credit: the same list for the unused amount (`h23`: Pacific Crest has nothing open, and
  the dialog says so). Void asks for a reason and says what it reopens (`h24`).
- ✓ Empty: Record payment and Import bank file (`h02`). G then Y opens the page.

## Bank — `docs/patterns/bank.md` (QuickBooks Online For review / Posted / Excluded; Stripe's order; Business Central confidence)
Screens: `slice-h/h03-bank-empty.png`, `h10-bank-review.png`, `h11-bank-find-match.png`,
`h12-bank-exclude.png`, `h13-bank-posted.png`, `h14-bank-excluded.png`, and the `es-` copies.
- ✓ H1 "Bank" and Import bank file; tabs For review · Posted · Excluded with counts, in the address.
- ✓ For review: date, description, amount, the suggestion (client and invoices with what each
  takes), the confidence badge and the reason in one line; Post (primary), Find match, Exclude
  (`h10`). The deposit naming PLM-20261005-2 and paying it exactly is High; the remittance naming
  the client is Medium and says what is left short; the transfer has no suggestion.
- ✓ Find match opens Record payment for the deposit, its date and amount fixed, the suggestion
  ticked (`h11`).
- ✓ Exclude asks why (`h12`); Posted lists the payment each line became with Undo (`h13`);
  Excluded lists why with Include (`h14`). The withdrawal was not chosen at import, so it is not
  listed; one chosen at import is listed under Excluded as a withdrawal (integration test).
- ✓ Nothing imported: empty state with Import bank file (`h03`); nothing to review: "Every deposit
  is posted or excluded." G then B opens the page.

## Bank file import — `docs/patterns/bank/import.md` (QuickBooks Online Upload from file; Zoho Books Import Statement)
Screens: `slice-h/h06-bank-import-upload.png`, `h07-bank-import-map.png`,
`h08-bank-import-map-problems.png`, `h09-bank-import-choose.png`, `es-h06`, `es-h07`, `es-h09`.
- ✓ "Bank" above, H1 "Import bank file", the three steps in order with the current one marked.
- ✓ Upload: drop zone or Choose file, the limits, and in demo mode the sample bank file (`h06`).
- ✓ Map columns: the header row (or none); date, description, reference, the three ways amounts are
  given, the column(s) for the one chosen, the date format; how Shiftbook reads the first lines
  (`h07`). The mapping is guessed from the header and the last one used is offered first.
- ✓ A choice that cannot be read says which lines fail and why, and Next waits (`h08`).
- ✓ Choose lines: deposits ticked, the withdrawal unticked and marked, lines already imported
  unticked and marked; Import with the count (`h09`); it ends on Bank, For review.

## Invoice page, Payments — `docs/patterns/invoices/[id].md` §5 (Stripe payment history; QuickBooks Online reminder; TempWorks write-off)
Screens: `slice-h/h16-invoice-payments.png`, `h17-short-reason-dialog.png`, `h18-reminder-dialog.png`,
`h19-write-off-dialog.png`, `h20-invoice-paid.png`, and the `es-` copies.
- ✓ Balance due; each payment (date, method, reference, amount, linking to Payments), each credit
  note and each write-off; Record payment, Write off balance and Prepare reminder while a balance is
  open (`h16`).
- ✓ Paid short: the reason (Record reason / Change reason) (`h17`).
- ✓ Prepare reminder: the stage from the days late, the language, To (the billing email), subject and
  message from the template and editable; Copy and Open in email app; Shiftbook sends nothing and
  says so (`h18`). The day it was prepared shows under the payments.
- ✓ Write off: amount (the balance), reason, note (`h19`); the invoice then reads Paid in full and
  offers no reminder (`h20`).

## Client page — `docs/patterns/clients/[id].md` §3 (FreshBooks client profile; Xero days to pay)
Screens: `slice-h/h21-client-owes.png`, `es-h21`.
- ✓ What the client owes: total owed, overdue, not yet due, credit available, days to pay with how
  many invoices it counts and how it was worked out; See payments; Record payment.

## App frame — `docs/patterns/_layouts/app.md`
Screen: `slice-h/h25-shortcuts.png`.
- ✓ Receivables, Payments and Bank in the sidebar; G then R, Y, B in the shortcuts list.

## Differences found and what was done
- The Payments list first carried an extra column with the invoices each payment paid; no
  documented reference shows that in a payments list, so it was removed (the invoice page lists its
  payments, and Bank → Posted shows what each deposit paid).
- The Short pays tab first carried a due date column the pattern does not list; removed.
- Not captured: the read-only view for other roles (the services refuse them: integration tests); a bank file
  without a header row (unit tests).
