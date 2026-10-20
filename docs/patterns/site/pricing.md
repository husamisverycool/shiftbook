# Pattern: Website pricing (tabulado.com/pricing)

Status: adopted — slice aa, second design (2026-10-20)
Reference product and screen: Ramp's and Mercury's pricing pages (a dark opening band with a centred
heading; the plan card rising out of it onto the light page), Linear's grouped "what's included" list,
Check's "not included", Mercury's label-left questions and its centred close.
Source URL: https://ramp.com/pricing
Source URL: https://mercury.com/pricing
Source URL: https://linear.app/pricing
Source URL: https://www.checkhq.com
Researched: 2026-10-20 (`docs/research/website-visual-slice-aa.md`). Confidence: medium.

## Hierarchy
1. Dark band: a small uppercase label, the h1 "One plan. Everything in it.", one sentence.
2. The plan card overlapping the band's foot: at the left the plan name, the monthly price (from Stripe,
   when set), the free days, "Start free" and "Try the demo" pills and the Stripe footnote; at the right
   seven groups of included items with checks.
3. Not included: heading and one line at the left, three items between hairlines at the right.
4. Questions: heading at the left, the accordion at the right.
5. Dark close: centred heading and the two pills; then the footer.

## Interactions
- Questions open one or several at a time, with the plus turning to a cross.

## States
- No live price: the price line is not shown; everything else stays.
- No demo address: the demo pills are hidden.

Deviations allowed: none
