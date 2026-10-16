# Pattern: Page header (shared component)

Status: adopted — decision 0029 (2026-10-16, revised after the owner's review)
Reference product and screen: Stripe Dashboard — invoices list header; Stripe app overview page
Source URL: https://docs.stripe.com/invoicing/dashboard
Source URL: https://docs.stripe.com/stripe-apps/patterns/chart-layout
Source URL: https://docs.stripe.com/stripe-apps/components/detailpage.md?app-sdk-version=9
Researched: 2026-10-16 from the screenshots themselves (`docs/research/design-gravity-slice-l.md`
part C). Confidence: high.

## Hierarchy
1. **Breadcrumb** above the title on a detail page — ancestors only (Stripe detail page).
2. **Title row**: the title, large and bold; on a detail page its status badge beside it; the page's
   buttons on the right, outlined, the one primary button last (Stripe: Filter, Export, then
   "Create invoice").
3. **Key facts line** on a detail page only (Stripe detail header): the record's facts joined by "·".
   List and overview pages have none. A read-only notice, when the role cannot change the page, sits
   under the title.
4. **Tabs**: underline tabs under the title, the current one underlined and darker, each its own
   address, optional count (Stripe: All invoices · Draft · Outstanding · Past due · Paid).

## Interactions
- Tabs are links; buttons act on the whole page.

## Never
A grey sentence describing the page; Stripe's colors, icons or wording.

Deviations allowed: none
