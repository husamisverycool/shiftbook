# Pattern: Invoice PDF (`src/pdf/templates/invoice.tsx`)

Status: researched — ready for owner review
Reference product and screen: Stripe invoice PDF (primary, observed in public Stripe-generated
invoices); QuickBooks Online invoice print template (secondary, documented)
Source URL: https://docs.stripe.com/invoicing/customize
Source URL: https://docs.stripe.com/invoicing/invoice-rendering-template
Source URL: https://quickbooks.intuit.com/learn-support/en-us/help-article/customize-forms/customize-invoices-estimates-sales-receipts-online/L57kKA6b6_US_en_US
Source URL: https://quickbooks.intuit.com/learn-support/en-global/help-article/sales-receipt-formats/customise-invoices-quickbooks-online/L3n8Z8WVH_ROW_en
Researched: 2026-10-15. Confidence: medium-high for the order of sections (observed in real
Stripe-generated PDFs); low for memo/footer placement. The observed sample PDFs belong to third
parties and are used for layout only; they are not stored or quoted.

## Purpose in Shiftbook
One invoice per client per period (slice a: one invoice for one client), with line detail from the
approved hours. Later slices add the backup bundle and the template variants in SPEC §12.

## Hierarchy
Top to bottom (Stripe, observed):
1. Title: the word for "Invoice" (from `messages/*.json`).
2. Label/value stack: invoice number, date of issue, date due. Custom key-value fields (up to 4)
   in the header (Stripe docs) — Shiftbook: PO number, period, worksite.
3. Address columns: agency (name, address, phone, email) | Bill to | Ship to (only if present).
4. Large amount line: "{amount} due {date}".
5. Memo text block (Stripe docs say the memo appears on the PDF; position observed between the
   amount line and the table, but unconfirmed).
6. Line-items table: Description | Qty | Unit price | Amount (a Tax column only if tax applies).
   A second line under the description carries the service period (Stripe observed).
   Shiftbook: description = worker · position · earning type; Qty = hours shown from integer
   minutes; Unit price = bill rate; Amount = cents rounded once at line level (SPEC §5).
7. Right-aligned totals: Subtotal, (tax lines), Total, **Amount due**.
8. Footer text block (Stripe docs: optional footer, often legal text) and "Page X of Y" at the
   bottom right (Stripe observed).

QuickBooks Online divides the same template into Header (company info, custom fields, tax) ·
Activity table (product/service, description, quantity, rate, service date) · Footer (message,
footer text); Shiftbook's sections map onto those three parts.

## Correction documents (slice e, decision E11)
Source URL: https://docs.stripe.com/invoicing/dashboard/credit-notes
Source URL: https://docs.stripe.com/api/credit_notes/object
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/settingRebillInvoiceNumber.htm
A correction never changes an issued invoice (Stripe: a credit note adjusts an invoice "without
voiding and replacing the original"; Bullhorn: finalized invoices are adjusted, not edited). The
same hierarchy as above, with these differences only:
- **Supplemental invoice** (more billed; Bullhorn rebill: the original number plus a suffix that
  starts with a special character): title "Supplemental invoice"; number `{original}-S{n}`; one more
  custom field naming the invoice it adds to; the lines are the differences (hours and amount with
  their sign; the second line under the description says what it was and what it is now); totals
  and amount due as an invoice.
- **Credit note** (less billed; Stripe: credit note number `…-CN-01`, the invoice it adjusts, date
  of issue, line-level credits, total credited): title "Credit note"; number `{original}-CN-{nn}`; no
  due date; a custom field naming the invoice it credits; the large line says the amount credited to
  that invoice; the last totals row is "Total credited". Amounts below zero carry a minus sign.

## Interactions
None (static document). Page size Letter by default; A4 selectable (Stripe docs).

## States
- Paid variant (Stripe observed): a "receipt" page with date paid, "{amount} paid on {date}", and a
  payment history table — not in slice (a).

## Not known from the references (ask the owner before building)
- Exact position of the agency logo, the custom fields, and the footer.
- Header/footer repetition on multi-page invoices.

## Never copy
Logos, product names, icons, illustrations, wording or colors from Stripe or QuickBooks.

## Templates (slice g, decision G2)
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/invTermsSplitGroupSum.htm
Source URL: https://support.avionte.com/hc/en-us/articles/55996167663251-Customer-Back-Office-Setup-Billing-Setup
Source URL: https://support.avionte.com/hc/en-us/articles/56030564966675--PO-Number-and-PO-Usage
Source URL: https://kb.tempworks.com/help/beyond-how-to-create-purchase-orders
The client's settings choose one; every template keeps the hierarchy above.
- **Standard:** as above; lines sorted by worker last name (Avionté sort by employee; Bullhorn One).
- **Per-worker detail:** the line-items table grouped by worker (Bullhorn One "Group By"
  candidate): a group heading with the worker's name, the worker's lines, and a group subtotal row.
- **PO header:** the PO number repeated at the top of every page (Avionté: "the purchase order
  information will appear at the top of each invoice page"), in addition to the header field.
- **PO on lines:** when one invoice carries hours under several POs (not separated by PO), each
  line's detail names its PO (TempWorks "PO number as a line item").

## Backup pages (slice g, decision G6)
Source URL: https://support.avionte.com/hc/en-us/articles/55996103929747-Attach-Timecards-to-Invoices
Source URL: https://support.avionte.com/hc/en-us/articles/56030458831123-Config-Option-MergeInvoice-AttachmentPDF
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/invoiceAttachmentPriorityOrder.htm
Source URL: https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/usingVariablesBillingContacts.htm
After the invoice's last page, in the same PDF (Avionté merges invoice and timecards):
1. **Line detail** (when the client's settings include it; Avionté "Show Daily Hours"): a heading
   "Hours detail"; per worker and week (worker last name, then week), a table — date, in, out,
   break, hours — and the week's total; under it the approval line (Bullhorn `[APPROVE_LOG]`):
   "Approved by {name} ({email}) on {date} at {time}", or that the agency reviewed the hours.
2. **Timesheet pictures** (when the settings include them): each page of each approved timesheet
   on its own page (Avionté: "each time card image … on its own individual page"), in invoice line
   order (Bullhorn One: line, then date), as the redacted copy; no caption beyond the page number.
3. "Page X of Y" counts every page of the PDF.

Deviations allowed: none
