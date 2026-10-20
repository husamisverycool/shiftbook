# Pattern: Website pricing (tabulado.com/pricing)

Status: adopted — slice aa (2026-10-20)
Reference product and screen: Resend's pricing title (a plain title and one line), Linear's and Attio's
plan card ("Everything in …" list, a specific button label), Mercury's and Resend's few-card pages that
still read as complete, Gusto's and Warp's pricing FAQs (contract, hidden fees, changing headcount,
support), Mercury's numbered footnotes.
Source URL: https://resend.com/pricing
Source URL: https://linear.app/pricing
Source URL: https://attio.com/pricing
Source URL: https://mercury.com/pricing
Source URL: https://gusto.com/product/pricing
Source URL: https://www.warp.co/pricing
Researched: 2026-10-20 (`docs/research/website-slice-aa.md`). Confidence: medium.

## Hierarchy
1. Title and one line (Resend).
2. One plan card (Linear, Attio): the plan's name; the price per month as Stripe holds it (or, when it
   cannot be read, no figure and the free days); the free days; "Start free" (filled) and "Try the demo"
   (outline, when set); the full included list in groups of three to six (Gusto's groups: reading
   timesheets, wage rules, payroll files and invoices, getting paid, compliance and onboarding, workers
   and scheduling, security).
3. What is not included (Check's split): moving money, running payroll and filing taxes, funding.
4. Frequently asked questions (Gusto, Warp, Mercury): an accordion; one open at a time is not required.
5. Footnotes (Mercury).

## Interactions
- The accordion: each question is a button with `aria-expanded`; the answer opens with Primer's state
  change motion; Enter and Space toggle; Tab moves between questions.

## States
- Price unknown (no Stripe in this deployment): the card says the free days and "Start free" only.

Deviations allowed: none
