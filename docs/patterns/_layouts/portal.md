# Pattern: Client portal frame (`src/app/[locale]/(portal)/layout.tsx`)

Status: adopted — slice (d) plan (2026-10-16)
Reference product and screen: Stripe — hosted invoice page (a page a business's customer opens from
an email without an account: the business's name at the top, the business's contact details for
help, no navigation of the business's own app); Stripe — customer portal (the same frame for the
customer's self-service pages)
Source URL: https://docs.stripe.com/invoicing/hosted-invoice-page.md
Source URL: https://docs.stripe.com/customer-management.md
Source URL: https://docs.stripe.com/customer-management/activate-no-code-customer-portal.md
Researched: 2026-10-16. Confidence: medium for the parts listed; Stripe's exact layout is shown in
screenshots, not described in text.

## Purpose in Granite
The frame for pages a client opens from an email (the approval page, SPEC §10). The client is not an
agency user: no sidebar, no agency navigation, nothing beyond the one page.

## Hierarchy
1. **Demo banner** (root frame, demo mode only) — unchanged.
2. **Header:** the agency's name (Stripe shows the business's name and branding; Granite has no
   agency logos yet), and the language switch (SPEC §20).
3. **Page content**, centred, one column, readable width.
4. **Footer:** the agency's contact details (phone, email) — Stripe's expired-link page sends the
   customer to the business's contact details — and that the page is provided by the agency through
   Granite.

## Interactions
- Language switch keeps the same link and changes only the language.
- No other links lead into the agency's app.

## States
- When the link is not valid, the frame shows no agency name or contact details (the page cannot
  know which agency it is).

## Never copy
Stripe's wording, icons, colors or logos.

Deviations allowed: none
