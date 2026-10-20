# Pattern: Website pricing (tabulado.com/pricing)

Status: adopted — slice aa, sixth design (2026-10-20; `.claude/plans/website-v6.md`).
Reference product and screen: Ramp's pricing (the plan card with its fit label on the top edge, the email
field inside the card, grouped checklists, the compare table with its sticky header and dotted labels that
explain themselves), Stripe's pricing (the floating pill bar of the page's parts), Check's "not included",
Vercel's two-column questions, and the home page's close (Linear). Drawn in the site's one dark system.
Tabulado has one plan, so the compare table compares who does each job, not plans.
Source URL: https://ramp.com/pricing
Source URL: https://stripe.com/pricing
Source URL: https://vercel.com/security
Source URL: https://www.checkhq.com
Researched: 2026-10-20 (research report on nav, hero, footer, pricing and security pages). Confidence: high.

## Hierarchy
1. Centred opening on ink with one soft glow: eyebrow pill, the h1 "One plan. Everything in it.", one
   sentence.
2. Stripe's pill bar, held under the header while scrolling: Plan · Included · Who does what · Questions,
   the part on screen lit.
3. Ramp's plan card (dark, accent ring): a tab on its top edge ("Every agency, any number of workers");
   the plan's name, the monthly price from Stripe (or "Shown before you subscribe"), the free days; the
   work-email field and "Start free" inside the card; "Try the demo"; the Stripe footnote under a hairline.
4. Everything included: two-tone heading; a ruled sheet of the seven groups (mono group names, checks)
   and, as its last cell, "Not included" with dashes (Check).
5. Who does what (Ramp's compare table): two-tone heading; columns Tabulado, your payroll provider, your
   bank in a header that sticks under the bar; groups The week · Billing · Records in mono; each row's
   label underlined with dots and explained on hover or focus; a filled check (accent for Tabulado) or a
   dash in each cell.
6. Questions (Vercel): the heading at the left, the accordion at the right.
7. The home page's close; the footer.

## Interactions
- The pill bar's links scroll to their part. Row labels are focusable and show their explanation.
- Questions open one or several at a time, the plus turning to a cross.

## States
- No live price: "Shown before you subscribe" in its place.
- No demo address: the demo links are hidden or point home.

Deviations allowed: none
