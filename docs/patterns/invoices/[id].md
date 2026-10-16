# Pattern: Invoice page (`/invoices/[id]`)

Status: adopted — slice (g) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe Dashboard — Invoice details (a header with the number, the
status badge and the actions that apply, the amount and dates, the line items, a history section
with related invoices and credit notes); TempWorks — "Preview Invoice w/ Timecards" (the timecard
images that go with the invoice); SAP Fieldglass — the invoice's "Related" tab (the time sheets and
documents behind it); Bullhorn One — credit invoices link to the original
Source URL: https://docs.stripe.com/invoicing/dashboard/manage-invoices
Source URL: https://docs.stripe.com/invoicing/invoice-edits?testing-method=without-code
Source URL: https://docs.stripe.com/invoicing/dashboard/credit-notes
Source URL: https://kb.tempworks.com/help/timecard-linker
Source URL: https://assets.cdn.sap.com/agreements/supplier-portal/fieldglass-supplier-enablement/supplier-quick-reference-guide-invoices-and-reporting-english-global.pdf
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/creditVSCreditReinstate.htm
Source URL: https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/send-invoice-reminders-automatically-manually/L84cQjpxo_US_en_US
Source URL: https://support.freshbooks.com/hc/en-us/articles/360044800411-How-Do-I-Manage-My-Emails-and-Templates-
Source URL: https://kb.tempworks.com/help/how-to-write-off-a-small-invoice-balance
Researched: 2026-10-16 (`docs/research/invoices-slice-g.md` §5.2). Confidence: high for the
sections and actions; the exact placement on Stripe's page is not documented.

## Purpose in Shiftbook
One invoice (or supplemental invoice, or credit note) with everything sent with it: its PDF with the
backup, its CSV, the Fieldglass upload file, the timesheets behind it and the documents related to
it. Invoices are made only by the weekly run; this page changes nothing in them (SPEC §11).

## Hierarchy
1. **Header** (Stripe): "Invoice" (or the document's kind) and the number; the status badge; the
   client's name linking to the client page; at the right the actions: **Download PDF** (primary)
   and a ⋯ menu with Download CSV and, for a Fieldglass client, Download VMS file.
2. **Summary row:** amount due (credited, for a credit note), issued, due, pay period, PO, template.
3. **Line items** (Stripe): the table the PDF shows — description with its detail line, hours,
   rate, amount — with the subtotal and total under it.
4. **Backup** (TempWorks preview with timecards; Fieldglass "Related"): what the PDF carries after
   the invoice — line detail on or off, and the timesheets whose pictures are included (file name,
   then each page included), each page opening its picture as it was sent (TempWorks previews the
   timecard images with the invoice; the period's converter is closed once its files exist).
5. **Payments** (slice h; Stripe invoice payment history; QuickBooks Online Receive payment from the
   invoice): the balance due; each payment applied (date, method, reference, amount, linking to
   Payments), each credit note and each write-off; **Record payment** (the dialog of
   `payments.md`, this invoice ticked); when a payment left a balance, the short pay's reason
   (record or change it) and **Write off balance** (amount, reason; TempWorks small-balance
   write-off); **Prepare reminder** for an open balance (below). When credit notes took off more
   than was still owed, the client's credit instead of a balance, with **Apply credit** to the
   client's other open invoices (Stripe: a credit note on a paid invoice credits the customer's
   balance, applied to its next invoice); each credit applied in or out is listed with the invoice
   it came from or went to (decision 0019).
6. **Related documents** (Stripe history; Bullhorn credit links): the invoice this one corrects, or
   the supplemental invoices and credit notes that correct it, each linking to its page; and the
   week's run (link to the Files step).

## Interactions
- Download PDF / CSV / VMS file download the stored files (made with the run; never regenerated).
- **Prepare reminder** (QuickBooks Online manual reminder; FreshBooks template variables): a dialog
  with the stage chosen from the days overdue (before due, overdue, final at 30 or more days), the
  language (English, Spanish), the subject and message filled from the template and editable, the
  client's billing email; **Copy** and **Open in email app** (a mailto link). Shiftbook sends
  nothing; the day is recorded and shown as "Reminder prepared on …".
- Payments, write-offs and reminders: Owner and Billing; others see them read only.
- Back to Invoices keeps the list's filters (the address).

## States
- **An invoice made before line detail was kept** (before slice g): the summary and the PDF only,
  with a line saying the line items are in the PDF.
- **No backup:** the section says the client's settings send no backup.

## Never copy
Stripe's, TempWorks', SAP's or Bullhorn's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
Laid out as `_components/record-page.md`: "Invoices" above the title (keeping the list's filters); the title with its status; the amount and client as the facts line; the ⋯ menu then **Download PDF** on the right. Line items, Backup, Payments and Related documents are modules on the left; the summary row's facts (amount due, issued, due, pay period, PO, worksite, template, client) are the details column on the right.

Deviations allowed: none
