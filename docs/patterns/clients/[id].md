# Pattern: Client page with invoice settings (`/clients/[id]`)

Status: adopted — slice (g) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe Dashboard — customer details (a "Details" section with Edit
that opens an "Update customer" dialog; the customer's invoice settings apply to all its future
invoices; the customer's invoices listed on its page); Bullhorn One — Invoice Terms (template,
split by, PO required, file types for invoicing, payment terms) kept as dated versions ("create a
new version instead of editing"); Avionté — Billing Preferences sections (invoice settings, then
delivery, then billing and scheduling) with an audit of changes
Source URL: https://docs.stripe.com/invoicing/customer
Source URL: https://docs.stripe.com/invoicing/customize
Source URL: https://docs.stripe.com/invoicing/invoice-rendering-template
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/AddInvoiceTerms.htm
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/understandingInvoiceTerms.htm
Source URL: https://support.avionte.com/hc/en-us/articles/56451748020243-BOLD-Front-Office-Billing-Preferences
Researched: 2026-10-16 (`docs/research/invoices-slice-g.md` §5.3). Confidence: high for the
sections and the dated versions; the page layout follows Stripe's documented Details → Edit flow.

## Purpose in Shiftbook
A client's invoice settings (SPEC §4 ClientBillingProfile), dated so a change applies from a date,
and the client's invoices.

## Hierarchy
1. **Header:** "Clients" above, H1 the client's name and code.
2. **Invoice settings** section (Stripe Details; Avionté sections), with **Edit** at its right:
   - Invoice: template; separate invoices by (PO, worksite); PO required; client PO.
   - Backup: line detail; timesheet pictures.
   - Delivery: VMS upload file.
   - Billing: payment terms (days); overtime billing; bill premiums; bill guarantees.
   - "In effect from {date}" and the earlier versions as a list (Bullhorn Invoice Term versions):
     each with its dates.
3. **Invoices** (Stripe customer page): this client's invoices, newest first, the same rows as the
   invoices list, linking to each.

## Interactions
- **Edit** opens a dialog (Stripe "Update customer") with the same fields and an "Applies from"
  date (Bullhorn: a new version, not an edit); saving starts a new version from that date (the one
  before it ends the day before); a version starting the same day is replaced.
- Fields that break a rule show it under the field; nothing is saved.
- Only the Owner and Billing change invoice settings; anyone else sees them read only.

## States
- **No settings in effect today** (none yet): the section says so, and Edit starts the first version.
- **Read only:** a line says who can change invoice settings.

## Never copy
Stripe's, Bullhorn's or Avionté's wording, icons, colors or logos.

Deviations allowed: none
