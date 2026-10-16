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

Deviations allowed: none
