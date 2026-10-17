# Pattern: Remittance advice PDF (`src/pdf/remittance.tsx`)

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: remittance-advice norms (Corpay, HighRadius, Stampli): payer name,
payment amount, date, method and reference, then one line per invoice — number, date, gross amount,
amount applied; the payee named at the top; the app's invoice PDF frame (`_documents/invoice.md`,
Stripe invoice PDF) for the header and type
Source URL: https://www.corpay.com/resources/blog/remittance-advice
Source URL: https://www.highradius.com/resources/Blog/what-is-remittance-advice-how-do-you-use-them/
Source URL: https://www.stampli.com/resources/remittance-advice-best-practices/
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §6). Confidence: medium (vendor
guidance, not a product's screen).

## Hierarchy
1. **Header:** "Remittance advice", the agency (payee) with its contact details on the left; on the
   right: payment date, method, reference.
2. **From:** the client (payer).
3. **Table:** Invoice, Invoice date, Invoice total, Applied — every invoice the payment settled.
4. **Totals:** payment amount; applied; not yet applied (when above zero).
5. **Foot:** "Recorded by {agency}" and the page number.

## Interactions
None: a document.

## States
- A payment applied to nothing yet: the table says so in one row.

Deviations allowed: none
