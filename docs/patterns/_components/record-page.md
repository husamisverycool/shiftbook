# Pattern: Record page (shared layout)

Status: adopted — decision 0029 (2026-10-16, after the owner's "comfortably fill pages … purely by
inspiration")
Reference product and screen: Stripe Dashboard detail pages, as Stripe documents them for its own
detail-page component (header with breadcrumbs, title, description and actions; a primary column and
a secondary column of details; titled modules); Stripe customer details ("Details" with Edit)
Source URL: https://docs.stripe.com/stripe-apps/components/detailpage.md?app-sdk-version=9
Source URL: https://docs.stripe.com/stripe-apps/components/overviewpage.md?app-sdk-version=9
Source URL: https://docs.stripe.com/invoicing/customer
Source URL: https://shopify.dev/docs/api/app-home/latest/patterns/templates/details
Researched: 2026-10-16 (`docs/research/design-gravity-slice-l.md` parts A and C, items 8 and S4).
Confidence: high for the parts and their places; Stripe's own words: "breadcrumbs are ancestors
only"; two columns suit "line items on the left and a summary on the right" and "a main activity
feed and a sidebar of metadata"; Polaris: "Use the primary column for information that defines the
resource. Use the secondary column for supporting information such as status, metadata, and
summaries."

## Hierarchy
1. **Ancestors** above the title, small and muted, each a link; never the page itself, never an
   arrow.
2. **Title row**: the record's name, large and bold; its status badge beside it; the page's
   actions on the right, outlined, the one primary action last.
3. **One muted line** under the title with the record's identifying facts joined by "·".
4. **Two columns** on wide screens: the record's own content on the left (its tabs, line items,
   hours, history); on the right a column of its details — each a small muted label over its
   value. On narrow screens the details follow the content.
5. **Modules**: each a heading with its actions on the right, a hairline under the heading, then
   its content. No box, no shadow; tables and lists run the module's full width with hairlines
   between rows. Figures inside a module are plain type (`key-figures.md`).

## Used by
Invoice, client, job order, worker, compliance duty and client approval pages. A record whose
content needs the full width (a client approval's hours by day) leaves the right column out.

## Never
Back arrows; boxed summary cards; a card around each section; Stripe's wording, icons or colors.

Deviations allowed: none
