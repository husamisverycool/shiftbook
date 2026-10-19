# Pattern: Payments (`/payments`) and Record payment

Status: adopted — slice (h) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: QuickBooks Online — Receive payment (customer, payment date, method,
reference no., amount received; the customer's outstanding invoices with a checkbox and a payment
amount each; "amount to apply" and "amount to credit"; save) and the sales transactions list (a
list of payments with their status and a row action); Zoho Books — payments received (amount and
unused amount); TempWorks — Quick Pay (fields entered in order with Tab)
Source URL: https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/record-invoice-payments-quickbooks-online/L4ZadDW7F_US_en_US
Source URL: https://quickbooks.intuit.com/learn-support/en-ca/help-article/journal-posting/view-sales-transactions/L2Do6c0jS_CA_en_CA
Source URL: https://www.zoho.com/us/books/help/payments-received/basic-functions.html
Source URL: https://kb.tempworks.com/help/how-to-quick-pay-invoices
Source URL: https://docs.stripe.com/invoicing/apply-payments
Researched: 2026-10-16 (`docs/research/receivables-slice-h.md` §2). Confidence: high.

## Purpose in Tabulado
Every payment received from a client, and recording one by hand (decision H2).

## Hierarchy
1. **View header:** H1 "Payments"; at the right **Record payment** (primary).
2. **Filter chips** (in the address): All · With credit (unused amount) · Voided; a client chooser.
3. **Table**, newest first: date, client, method, reference, amount, applied, unused (Zoho),
   status (applied, credit, voided), from (typed in, or the bank line); a ⋯ menu with Apply credit
   and Void.

## Record payment (dialog; QuickBooks Online Receive payment)
1. Client; payment date; method (check, ACH, wire, card, other); reference (check or transfer
   number); amount received; memo.
2. The client's open invoices, oldest due first: checkbox, number, due, balance, payment (editable).
   Ticking an invoice fills its payment with what is left of the amount, oldest first (QuickBooks
   Online mobile applies to the oldest first); amounts can be changed.
3. Footer: amount to apply and amount left as credit (QuickBooks Online "Amount to Credit").
4. Save. Opened from an invoice, its client and the invoice come ticked.

## Interactions
- **Apply credit** opens the same invoice list for the payment's unused amount.
- **Void** asks for a reason; the invoices it paid open again (Stripe "unapply").
- Tab moves through the fields in order (TempWorks Quick Pay).
- Keyboard: G then Y opens the page.

## States
- **No payments yet:** empty state with Record payment and a link to the bank import.
- A payment that would pay more than an invoice's balance, or apply more than was received, is
  refused with the reason under the field.
- Read only for roles other than Owner and Billing (a line says who can record payments).

## Never copy
Intuit's, Zoho's, TempWorks' or Stripe's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
Stripe's list: title with Record payment on the right, the filter buttons, the table full width with the amount bold, the status as a tinted badge and dates short ("Oct 16, 2026") (https://docs.stripe.com/invoicing/dashboard). A long reference is cut to the room the other columns leave, the whole of it on hover. With no payments yet, the filters stay in place over the empty state (`_components/empty-state.md`).

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
