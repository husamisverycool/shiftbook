# Pattern: Clients list (`/clients`)

Status: adopted — slice (g) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe Dashboard — Customers page (the list of customers; clicking a
name opens the customer's page)
Source URL: https://docs.stripe.com/invoicing/customer
Source URL: https://docs.stripe.com/billing/customer
Researched: 2026-10-16. Confidence: high for the list-to-page interaction; Stripe documents no
columns, so the row shows the customer's name and its billing essentials.

## Purpose in Granite
The agency's clients, to open one and set how it is invoiced (decision G2–G9).

## Hierarchy
1. **View header:** H1 "Clients".
2. **Table**, by name: name (opens the client page), code, invoice template, separate invoices by,
   payment terms, VMS.

## Interactions
- Clicking a name opens the client page (Stripe).
- Keyboard: G then L opens the list (app frame).

## States
- **No clients:** empty state saying clients come with job orders, with a link to Job orders
  (`_components/empty-state.md`).

## Never copy
Stripe's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
The title and the table as Stripe's lists show them: full width, small-capital headers, hairline rows, no box (https://docs.stripe.com/invoicing/dashboard).

Deviations allowed: none
