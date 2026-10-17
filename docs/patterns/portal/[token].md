# Pattern: Client portal — Overview (`/portal/[token]`)

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: Stripe — customer portal overview (cards for what the customer has,
each with its own action); Avionté client portal Home (counters with View links); Stripe Home's
figures (`_components/key-figures.md`)
Source URL: https://docs.stripe.com/customer-management
Source URL: https://avionteclassicsupport.zendesk.com/hc/en-us/articles/360045869733-Customer-Portal-Overview
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §1.2, §4). Confidence: medium.

## Hierarchy
1. **Title** "Overview".
2. **Figures** (plain type, never boxed, as `_components/key-figures.md`): Balance due; Overdue (in
   the critical tone when above zero); Next due — "{amount} on invoice {number}, due {date}", or
   "Nothing due".
3. **Open invoices** (Stripe's card list applied to invoices): up to five rows — number, due date,
   balance and status badge — each opening the invoice; "View all" at the heading's right.
4. **Counters with View links** (Avionté Home): shifts waiting for approval → Hours to approve;
   requests waiting on the agency → Request workers.

## Interactions
- A row opens that invoice in the Invoices section's side panel.
- "View" links go to their section.

## States
- No invoices open: "No open invoices." under the heading (Stripe History's empty line).

## Loading and errors (slice o)
- Loading: the dashboard outline (`_components/loading.md`).
- A failure: the frame stays, "Try again" (`_components/error.md`).

Deviations allowed: none
