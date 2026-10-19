# Pattern: Client portal shell (`src/app/[locale]/(portal)/portal/[token]/layout.tsx`)

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: Stripe — customer portal (a left column with the business's name and
the portal's sections, Overview / Wallet / History, the signed-in customer's email under it; the
section's page on the right); TempWorks WebCenter and Avionté client portal (the extra sections a
staffing client gets: Invoices, Payments, Orders, Timecards); Stripe hosted invoice page (the
business's contact details at the foot)
Source URL: https://docs.stripe.com/customer-management
Source URL: https://billing.stripe.com/customer-portal-demo
Source URL: https://kb.tempworks.com/help/customer-portal-invoices
Source URL: https://avionteclassicsupport.zendesk.com/hc/en-us/articles/360045869733-Customer-Portal-Overview
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §1, §3, §4). Confidence: medium
(Stripe's live demo was loaded; TempWorks and Avionté from their help centres).

## Hierarchy
1. **Demo banner** (root frame, demo mode only) — unchanged.
2. **Left column** (Stripe portal), on the page's muted tone:
   - the agency's name, then "For {client}";
   - the sections as a list, the current one highlighted: Overview, Invoices, Payments, Hours to
     approve, Documents, Request workers (Stripe's three, plus the staffing client's from
     TempWorks/Avionté);
   - at the foot: the contact's name and email (Stripe shows the customer's email), "This link works
     until {date}", and the language switch.
3. **Right:** the section's page, one column at a readable width, its title as the page's h1.
4. **Footer** under the page: the agency's contact details and that the portal is provided by the
   agency through Tabulado (Stripe hosted invoice page).
5. **Phones:** the left column becomes a bar on top with the agency's name and the sections as a
   horizontally scrolling row (Stripe's responsive portal; exact behaviour unverified).

## Interactions
- Each section is its own address under the link; the browser's back and forward work.
- The language switch keeps the same section and link.
- No link leads into the agency's own app.

## States
- **The link does not work, was turned off, or expired:** no column; the portal frame
  (`_layouts/portal.md`) with one notice — expired offers "Email me a new link" (decision 0013's
  rule: to the address on file, rarely) unless it expired more than 30 days ago.
- Loading: the section's outline (`_components/loading.md`).

## Never copy
Stripe's, TempWorks's or Avionté's wording, icons, colors or logos.

Deviations allowed: none
