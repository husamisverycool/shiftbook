# Pattern: Billing (`/settings/billing`)

Status: adopted — decision 0036 (2026-10-17)
Reference product and screen: Linear — Settings › Administration › Billing (workspace admins see the
plan information and change it, update the payment information, see past invoices, and are shown when a
charge failed or is past due; canceling takes effect at the end of the period and "nothing will be
deleted"); Vercel — the team's Settings › Billing (the plan, the billing cycle, the payment method; a
trial ends by adding a payment method there; an overdue account keeps its data but cannot create or
change things until it pays); Stripe — the Customer Portal (Stripe's own hosted page where the customer
updates the card, sees and pays invoices and cancels, reached from a "Manage billing" button in the
product) and Checkout (Stripe's hosted page that starts the subscription)
Source URL: https://linear.app/docs/billing-and-plans
Source URL: https://vercel.com/docs/plans/pro-plan/billing
Source URL: https://vercel.com/docs/plans/pro-plan/trials
Source URL: https://docs.stripe.com/customer-management
Source URL: https://docs.stripe.com/customer-management/integrate-customer-portal
Source URL: https://docs.stripe.com/payments/checkout/free-trials
Researched: 2026-10-17 from the documentation (Linear's and Vercel's billing pages are behind sign-in
and their docs publish no screenshot of them); laid out with the settings component measured from
Linear's own settings screenshots (`_components/settings.md`). Confidence: high for what the page shows
and does; the exact arrangement follows Granite's Linear settings panels.

## Purpose in Granite
The agency's subscription to Granite (decision 0036): where the Owner sees whether the agency is in its
free days, subscribed, behind on a payment or canceled, when the next charge comes, and goes to Stripe
to start, pay, change or cancel. Granite never shows a card form.

## Hierarchy
Laid out as Linear's settings (`_components/settings.md`).
1. **Page header:** "Settings" above, H1 "Billing"; one muted line: payments, cards and invoices are
   handled on Stripe's secure pages (and, in the demo, that nothing is charged).
2. **Notice** (only when there is one), above the first section: back from Stripe's checkout — the
   subscription is being set up (it shows here in a moment) or the checkout was left without paying.
3. **Plan** section (Linear's plan information), a panel of rows:
   1. **Granite monthly** over the plan's state in words, its status badge at the right (Linear and
      Stripe show the status as a chip): Free trial (until a date) · Trial (Stripe's; first charge on a
      date) · Active · Past due (the last payment failed; Stripe retries) · Canceled · Ends on a date
      (canceled at the period's end) · No subscription · Active (demo).
   2. **Next charge** over the amount and the date (Vercel's billing cycle; Linear's "charged on a
      monthly basis"), or "None" with why (canceled, no subscription, the demo).
   3. The panel's foot: a muted note at the left (card details, invoices and canceling are on Stripe's
      pages); the actions at the right — **Manage billing** (outlined; once Stripe knows the agency) and
      **Start subscription** (primary; when there is no active, trial or past-due subscription).
4. **If the subscription stops** section (Linear: "Nothing will be deleted"; Vercel's overdue
   restrictions), one panel row: nothing is deleted; everyone can still sign in, read everything and
   download files; changes are paused until the subscription is active again.

## Interactions
- Start subscription → Stripe's Checkout in the same tab (in the agency's language), for the monthly
  price; during the free days the first charge is set for their end. Back here after paying or leaving.
- Manage billing → Stripe's Customer Portal in the same tab; its "return" link comes back here.
- Both are the Owner's; neither asks to confirm it's them (Stripe's pages ask for what they need).

## States
- Not the Owner: the page holds only the header and the "not for your role" state the other settings
  pages use, saying only the Owner manages billing; the agency menu does not list it for them.
- Demo: "Active (demo)", next charge "None — nothing is charged in the demo"; both buttons stay and say,
  when pressed, that the demo never charges and never opens Stripe.
- Payments not set up on this server (no Stripe settings): the buttons say payments are not available
  right now; nothing is charged.
- Stripe cannot be reached: a message says so; try again.
- Working: the pressed button shows it is opening Stripe and cannot be pressed twice.

## Never copy
Linear's, Vercel's or Stripe's wording, icons, colors or logos.

Deviations allowed: none
