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
Source URL: https://support.freshbooks.com/hc/en-us/articles/217181797-What-are-clients
Source URL: https://support.gusto.com/article/106622257100000/edit-company-details-for-admins
Researched: 2026-10-16 (`docs/research/invoices-slice-g.md` §5.3). Confidence: high for the
sections and the dated versions; the page layout follows Stripe's documented Details → Edit flow.

## Purpose in Tabulado
A client's invoice settings (SPEC §4 ClientBillingProfile), dated so a change applies from a date,
and the client's invoices.

## Hierarchy
1. **Header:** "Clients" above, H1 the client's name and code.
2. **Invoice settings** section (Stripe Details; Avionté sections), with **Edit** at its right:
   - Invoice: template; separate invoices by (PO, worksite); PO required; client PO.
   - Backup: line detail; timesheet pictures.
   - Delivery: VMS upload file; consolidated statement (SPEC §12: each invoice of a week is emailed
     with a statement of all that week's invoices for the client — QuickBooks statements; completeness
     audit G1).
   - Billing: payment terms (days); overtime billing; bill premiums; bill guarantees.
   - "In effect from {date}" and the earlier versions as a list (Bullhorn Invoice Term versions):
     each with its dates.
3. **What the client owes** (slice h; FreshBooks client profile: outstanding split into overdue
   and not yet due, credit available): total owed, overdue, not yet due, credit (payments not yet
   applied), and days to pay (Xero contact: the average days from issue to paid, with how many
   invoices it counts); **Record payment**.
4. **Invoices** (Stripe customer page): this client's invoices, newest first, the same rows as the
   invoices list, linking to each.
5. **Portal access** (slice v; Linear's members list: people as rows, name over email, initials
   tile, a muted line at the right, a "…" menu; Stripe's customer portal login link): one muted line
   on what the portal holds; each person with their last visit and how long their link works; the
   menu: Send new link, Remove access (with a confirmation, Linear's "Remove member"); **Give
   access** at the heading's right opens a dialog — name, email, language of emails — that sends the
   link. In the demo, each person's latest email as delivered, with its working link.
   Source URL: https://linear.app/docs/members-roles
   Source URL: https://docs.stripe.com/customer-management

## Client details and worksites (completeness audit G1, `docs/research/agency-setup-g1.md`)
- **Actions** menu at the header's right (Stripe's customer page): **Edit information** opens a dialog
  (name, code, billing email, billing address) whose button is **Update client**; **Archive client** /
  **Restore client** (Stripe's Delete customer, kept as archive), refused with a line saying why while
  workers are still placed there. An archived client says so beside its name.
- **Worksites** module on the left, under what the client owes (Gusto's company locations): each
  site a row — name, address, city and state, its county and city or town as the Census names them —
  with a "…" menu: **Edit worksite**, **Archive worksite** (Gusto's Deactivate this location).
  **Add worksite** at the heading's right opens a dialog (Gusto's Add location): name, street, city,
  state, ZIP, then the county chosen from the state's Census list and the city or town searched in
  the Census list of that county, or "Outside any city or town". A worksite where hours were already
  worked keeps its state, county and place (Gusto: "If the employee used to work at that address, the
  address cannot be edited"): the dialog says so and those fields are read only; a move is a new
  worksite. No worksites: one muted row with **Add worksite**.
- Who: the Owner, coordinators and Billing; anyone else sees it read only.

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

## Look (decision 0029, from the products' own screenshots)
Laid out as `_components/record-page.md`: "Clients" above the name and code, and under them one muted line of the bill-to its invoices carry (address · billing email), as Stripe's detail page puts a one-line description under a customer's name ("Pro plan customer since March 2022.", https://docs.stripe.com/stripe-apps/components/detailpage). What the client owes (plain figures) and the client's invoices are modules on the left; the invoice settings, with Edit, are the details column on the right (Stripe customer details: "Details" with Edit), each group's fields as label over value, then the versions.

## Loading and errors (slice o)
- Loading: the page's outline in the record shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

## Worker app clock-in (slice t)
Under the invoice settings on the right, one more module: **Worker app clock-in** with a line saying
what it means and a select — Off, On, On with location — saved when changed (Linear's settings rows,
`_components/settings.md`). Who may change it: the Owner, coordinators and recruiters.

## Colour (decision 0046)

The client's 40px square avatar before the title (`_components/avatar.md`).

Deviations allowed: none
