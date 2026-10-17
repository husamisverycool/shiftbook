# Pattern: Client portal — Payments (`/portal/[token]/payments`)

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: Avionté client portal — Payments (one row per payment; "+" expands it
to the invoices it settled); remittance-advice norms (payer, amount, date, method, reference, then
per invoice: number, date, gross, amount applied); Stripe tables
Source URL: https://avionteclassicsupport.zendesk.com/hc/en-us/articles/360045869733-Customer-Portal-Overview
Source URL: https://www.corpay.com/resources/blog/remittance-advice
Source URL: https://www.highradius.com/resources/Blog/what-is-remittance-advice-how-do-you-use-them/
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §4, §6). Confidence: medium.

## Hierarchy
1. **Title** "Payments".
2. **Table**: an expand button, Date, Method, Reference, Amount (bold), Applied, and a "Download
   remittance" text action at the row's end.
3. **Expanded row** (Avionté "+"): the invoices the payment settled — Invoice, Invoice date, Invoice
   total, Applied — and, when part is not yet applied, one muted line saying how much.
4. **Remittance** (PDF, `_documents/remittance.md`): what the client keeps or sends with a payment.

## Interactions
- The expand button toggles the row's invoices (aria-expanded), with the state-change motion.

## States
- None yet: "No payments recorded yet" and one line saying payments appear once the agency records
  them.

## Loading and errors (slice o)
- Loading: the list outline. A failure: the frame stays, "Try again".

Deviations allowed: none
