# Pattern: Website pricing (tabulado.com/pricing)

Status: adopted — slice aa, seventh design (2026-10-20). In Linear's type, sizes and colours (decision
0048); the floating tab bar of the sixth design is gone (it covered the content).
Reference product and screen: Linear's pricing (dark page, centred heading, a neutral plan card on the
raised panel colour, light pill, plain section headings, the pre-footer), Ramp's pricing (the email field
inside the card; grouped checklists; the compare table with its sticky header and dotted labels that
explain themselves), Check's "not included", Vercel's two-column questions. Tabulado has one plan, so the
compare table compares who does each job, not plans.
Source URL: https://linear.app/pricing
Source URL: https://ramp.com/pricing
Source URL: https://vercel.com/security
Source URL: https://www.checkhq.com
Researched: 2026-10-20. Confidence: high.

## Hierarchy
1. Centred opening: "Pricing" in 15px grey; the h1 "One plan. Everything in it." (64px); one 20px grey
   sentence.
2. The plan card (#0f1011, 8% white hairline, 12px radius): the plan's name (20px, weight 510) with its fit
   line under it in 13px grey; the monthly price from Stripe (64px) or "Shown before you subscribe"; the
   free days; the work-email field and the light "Start free" pill inside the card; "Try the demo"; the
   Stripe footnote under a hairline in 12px grey.
3. Everything included: 48px heading, its second sentence grey (Linear's statement style); a ruled sheet
   of the seven groups (13px group names, white checks, 15px grey lines) and, as its last cell, "Not
   included" with dashes (Check).
4. Who does what (Ramp's compare table): 48px heading; columns Tabulado, your payroll provider, your bank
   in a header that sticks under the bar; groups The week, Billing, Records; each row's label underlined
   with dots and explained on hover or focus; a white check for Tabulado, a dark check for the others, or
   a dash.
5. Questions (Vercel): the heading at the left, the accordion at the right.
6. Pre-footer (Linear); the footer.

## Interactions
- Row labels are focusable and show their explanation.
- Questions open one or several at a time, the plus turning to a cross.

## States
- No live price: "Shown before you subscribe" in its place.
- No demo address: the demo links are hidden or point home.

Deviations allowed: none
