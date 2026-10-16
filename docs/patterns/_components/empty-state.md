# Pattern: Empty states (shared component)

Status: adopted — decision 0029 (2026-10-16, revised after the owner's review)
Reference product and screen: Linear empty list views; Stripe Apps empty state guidance
Source URL: https://www.saasui.design/pattern/empty-state/linear
Source URL: https://docs.stripe.com/stripe-apps/patterns/empty-state
Researched: 2026-10-15 and 2026-10-16. Confidence: medium (Linear's empty states are documented by a
third-party gallery only).

## Hierarchy
1. The page header, tabs and filters stay in place.
2. In the content area, centered: a small muted icon; one short line saying what is missing; a
   second line saying what to do when the reference's wording needs it (Stripe: "the title states
   what's missing", the description short); the one action when there is something to do (Linear's
   inline create; Stripe's action matching the title).
3. Filters that hide everything: says so, and offers Clear filters — never "create" (Stripe).

## Never
A box or dashed border around the page's empty state; a tinted circle behind the icon;
illustrations; any reference's wording.

Deviations allowed: none
