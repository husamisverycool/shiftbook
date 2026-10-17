# Pattern: Money settings (`/settings/money`)

Status: adopted — slice (w) (2026-10-17)
Reference product and screen: Linear settings (`_components/settings.md`: one centred column,
sections with a heading and muted line, rows in a bordered panel, the form's Save in the panel's
foot); the rules' content from the CFPB advisory opinion (a cap no higher than earned pay; a free
delivery beside any fee) and factors' published terms (advance up to 90–95%, a flat fee, invoices up
to 90 days outstanding, concentration flagged around 20–30%)
Source URL: https://linear.app/docs/account-preferences
Source URL: https://linear.app/docs/saml-and-access-control
Source URL: https://www.federalregister.gov/documents/2025/12/23/2025-23735/truth-in-lending-regulation-z-non-application-to-earned-wage-access-products
Source URL: https://altline.sobanco.com/factoring-for-small-businesses/
Source URL: https://getscalefunding.com/scale-funding-insights/get-cash-to-run-your-business/
Researched: 2026-10-17 (`docs/research/money-flows-slice-w.md` §5, §6). Confidence: high for the
layout (Granite's settings pattern); medium for the factors' typical terms.

## Purpose in Granite
The agency's own rules for wage access and invoice funding, each kept by the date it applies from.

## Hierarchy
Laid out as Linear's settings (`_components/settings.md`).
1. **Page header:** "Settings" above, H1 "Money settings", the plain line (no money moves).
2. **Wage access** section, muted line (repaid by a payroll deduction; never more than earned): a
   panel with rows — On (switch); Share of earned pay (percent); Most per request (dollars, 0 for no
   limit); Faster delivery fee (dollars; the standard delivery is always free); foot with **Save**.
3. **Invoice funding** section, muted line (what a funding partner would consider): rows — On
   (switch); Advance (percent); Flat fee (percent); Largest share one client may be (percent); Oldest
   invoice (days); Client approval by link required (switch); foot with **Save**.

## Interactions
- Each panel saves on its own; a change applies from today (the same day: replaces it) and is in
  the activity log. Problems show under the field.
- Only the Owner changes them; others read them with the controls off.

## Loading and errors (slice o)
- Loading: the page's outline in the settings shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again" (`_components/error.md`).

Deviations allowed: none
