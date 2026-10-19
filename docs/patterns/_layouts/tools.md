# Pattern: Free tools layout (public, outside sign-in)

Status: adopted — slice q (2026-10-17)
Reference product and screen: Gusto's and Rippling's free calculator pages — the product's mark at
the top left with one way into the product at the right, one reading column, the footer with the
language choice (as Tabulado's sign-in pages, `_layouts/auth.md`)
Source URL: https://gusto.com/resources/calculators/employer-tax-calculator
Source URL: https://www.rippling.com/calculators
Researched: 2026-10-17 (`docs/research/hours-checker-slice-q.md`). Confidence: medium (the sites'
headers are marketing navigation; Tabulado keeps only the mark and one button).

## Hierarchy
1. A plain header: the mark and wordmark at the left (to the tool itself); at the right, "Sign in"
   as a text link and "See the demo" as the one button.
2. One centred page (Polaris's default width, 1024px) on the page's background; words and inputs
   keep a narrower reading measure inside it, the results table takes the page's width so its
   columns never scroll sideways.
3. The footer: the language choice (Notion), muted.

## Interactions
- The mark goes to the tool's own top; "Sign in" goes to the sign-in page; "See the demo" goes to
  sign-in, where the demo people are offered (demo mode) — in a live deployment, the same page.

## States
- No session needed; a signed-in person sees the same page.

Deviations allowed: none
