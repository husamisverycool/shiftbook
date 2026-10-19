# Pattern: Clients list (`/clients`)

Status: adopted — slice (g) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe Dashboard — Customers page (the list of customers; clicking a
name opens the customer's page)
Source URL: https://docs.stripe.com/invoicing/customer
Source URL: https://docs.stripe.com/billing/customer
Source URL: https://support.gusto.com/article/106622257100000/edit-company-details-for-admins
Researched: 2026-10-16. Confidence: high for the list-to-page interaction; Stripe documents no
columns, so the row shows the customer's name and its billing essentials.

## Purpose in Tabulado
The agency's clients, to open one and set how it is invoiced (decision G2–G9).

## Hierarchy
1. **View header:** H1 "Clients", **Add client** at the right (Stripe: "Add customer").
2. **Table**, by name: name (opens the client page), code, invoice template, separate invoices by,
   payment terms, VMS.

## Interactions
- Clicking a name opens the client page (Stripe).
- **Add client** (or **N**, Stripe's key) opens a dialog: name, code, billing email, billing address
  (up to four lines), payment terms in days; **Add client** in the dialog adds it with its first
  invoice settings and opens its page, where its worksites are added (completeness audit G1,
  `docs/research/agency-setup-g1.md`). Shown to the Owner, coordinators and Billing.
- Archived clients are hidden; **Show archived** in the view header lists them, marked Archived.
- Keyboard: G then L opens the list (app frame).

## States
- **No clients:** empty state saying what is missing and the one action, **Add client**
  (`_components/empty-state.md`).

## Never copy
Stripe's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
The title and the table as Stripe's lists show them: full width, small-capital headers, hairline rows, no box (https://docs.stripe.com/invoicing/dashboard).

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

## Colour (decision 0046)

Each client's square avatar before its name (`_components/avatar.md`).

Deviations allowed: none
