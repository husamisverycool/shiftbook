# Slice (m) — agencies sign themselves up and pay monthly (decision 0036)

Status: built (2026-10-17), waiting for the owner's Stripe settings

## Plain summary
Today every agency is made by a command and nobody pays. After this slice:

- **Anyone can create an agency** from the sign-in page ("New to Granite? Create an agency"): they type
  their work email, their name and the agency's name; Granite emails them a link; the link opens
  "Set your password"; then, as every Owner must, they set up an authenticator app; then the agency
  exists with them as its Owner — exactly what the command makes. The page answers the same whether or
  not the email already has an account (someone who already has one is emailed a note instead), and
  too many tries from one place or for one email are slowed down. The demo makes no agencies: its
  sign-up page says the demo uses its own made-up agency and points to "Continue as".
- **Each agency pays a monthly subscription through Stripe.** Settings › Billing (the Owner's page)
  shows whether the agency is on its free trial, subscribed, behind on a payment, or canceled, and when
  the next charge is. "Start subscription" opens Stripe's own checkout page; "Manage billing" opens
  Stripe's own page for the card, invoices and canceling. Granite never sees a card number.
- **When an agency stops paying** (after its free days), nothing is deleted and everyone can still sign
  in, read everything and download files; changes are paused, Home says so, and the Owner is pointed to
  Billing. The demo never talks to Stripe: its billing page shows "Active (demo)".

## Steps (tests first in each)
1. Record and plan: `docs/decisions/0036-self-serve-sign-up-and-stripe-billing.md` (plain fetch, no
   Stripe package; the API version pinned), pattern files for the new pages (references captured as
   screenshots outside the repo).
2. Storage: `drizzle/0043_signup_and_billing.sql` — `signup_requests` (sign-in mode only),
   `agency_subscriptions` (per agency, row-level security like the other tenant tables, in
   `TENANT_TABLES`), `billing_events` (Stripe event ids already handled), and two narrow
   SECURITY DEFINER functions: a verified sign-up link creates its agency; a Stripe customer id finds
   its agency. Existing agencies get 30 free days from the day this runs.
3. Pure pieces with unit tests: Stripe's webhook signature check; the access rule (who may change
   things); the billing page's plan state; Stripe's form encoding; abilities while changes are paused.
4. Sign-up service (`src/server/auth/signup.ts`) reusing the sign-in service's links, throttle table,
   password rule, first-Owner logic (shared with `scripts/create-agency.ts`) and the authenticator setup;
   integration tests: happy path, no enumeration, throttles, single use and expiry.
5. Billing service (`src/server/billing/`): Checkout, Customer Portal, the webhook (signature over the
   raw body, idempotent, the subscription read back from Stripe), the access rule wired into
   `actorAllowedTo` and the screens' abilities; integration tests for each.
6. Screens: sign-up, set your password, Settings › Billing, the Home banner, the agency menu's Billing,
   the sign-in page's link; every string in English and Spanish (usted).
7. e2e (demo mode): the sign-up page and the billing page in both languages with axe; the accountant's
   not-for-your-role state. Screens compared with their references; `docs/hosting-settings.md` explains
   the four Stripe settings step by step.

## Done when
Typecheck, lint, unit, integration, goldens (55) and the new e2e specs (plus sign-in and acceptance)
pass; screenshots checked against the pattern files.

## Result (2026-10-17)
Typecheck and lint clean; unit 1287 passed; goldens 55 passed; integration 427 of 428 (the one failure,
reference-data's Illinois citation saying "Shiftbook's", is on the base commit and untouched here; the
new sign-up 10 and billing 17 pass); e2e: the new sign-up/billing spec (9), sign-in (4) and acceptance
(4) pass, 18 with the setup. Screens checked in both languages in demo and live mode against Stripe's
register form, Linear's signup email step, Linear's settings panels and Polaris's banner.

Left for the owner: the four Stripe settings and the webhook address (docs/hosting-settings.md);
agencies made before this get 30 free days from the day it is installed.
