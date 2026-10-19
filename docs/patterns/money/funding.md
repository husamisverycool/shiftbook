# Pattern: Invoice funding (`/money/funding`)

Status: adopted — slice (w) (2026-10-17)
Reference product and screen: what invoice factors ask for (aging buckets, debtor concentration,
disputes, approved timesheets as proof; eCapital, altLINE, Scale Funding, Advance Partners);
Stripe Capital's offer wording ("prequalified", "subject to review"; never "preapproved"); Stripe
Dashboard lists (`_components/table.md`)
Source URL: https://altline.sobanco.com/how-to-fill-out-an-accounts-receivable-aging-schedule/
Source URL: https://www.commercialfund.com/blog/debtor-concentration-impact-on-ar-financing
Source URL: https://www.advancepartners.com/blog/notes-from-a-credit-analyst/
Source URL: https://docs.stripe.com/capital/marketing.md
Researched: 2026-10-17 (`docs/research/money-flows-slice-w.md` §2, §6). Confidence: medium (factor
requirements are vendor pages); high for the wording rules.

## Purpose in Tabulado
Every open invoice with its funding decision under the agency's rules, so the Owner sees which
invoices a funding partner would consider and why the others would not.

## Hierarchy
1. The Money header and tabs (`money.md`), the plain line.
2. **Rules in one line** (advance, flat fee, largest share one client may be, oldest invoice, client
   approval required) with **Change**.
3. **Invoices table**: Invoice (number, linking to its funding page), Client, Issued, Age (days),
   Balance (bold), Share of all owed, Decision — a badge: "Prequalified" (info), "Not eligible"
   (neutral; the first reason as its muted line), "Submitted" (neutral).

## Interactions
- A row opens `/money/funding/[id]`.

## States
- Empty: "No open invoices" with one line — invoices are made with a run's files.
- Off: the decision column reads "Funding is off" and the rules line says so, with **Open settings**.

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again" (`_components/error.md`).

Deviations allowed: none
