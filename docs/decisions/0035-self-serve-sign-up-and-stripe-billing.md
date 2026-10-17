# 0035 — Agencies sign themselves up and pay monthly through Stripe (plain fetch, no Stripe package)

Status: accepted
Date: 2026-10-17

## Context
The owner wants agencies to be able to buy Granite. Until now every agency was made by
`scripts/create-agency.ts` and nobody paid. SPEC §2 requires an authenticator for Owners; SPEC §18 says
the demo makes no outside calls; CLAUDE.md says money is integer cents and keys never go in the code.
Stripe's documentation (docs.stripe.com/webhooks, /payments/checkout/free-trials, /customer-management,
/api/subscriptions/object, /upgrades, read 2026-10-17) says: verify the `Stripe-Signature` header over
the raw body with HMAC-SHA256 and a constant-time comparison, with a tolerance (its libraries use five
minutes); events can arrive twice and in any order, and `created` must not be used to order them —
track event ids and read the object back from the API; send the customer to Stripe's hosted Checkout
and Customer Portal rather than building card forms.

## Decision
1. **Plain `fetch`, no `stripe` package.** Granite needs four calls (create a customer, a Checkout
   Session, a Customer Portal session; read a subscription) and one webhook check. They are
   form-encoded HTTPS requests; the signature check is twenty lines of `node:crypto` with its own unit
   tests. This is the same choice as email (decision 0012: Resend over plain `fetch`): no new dependency
   and its update cadence (the package moves with every API release), one small transport that tests
   replace, and nothing in the demo can reach Stripe because the demo never builds it. The cost — no
   typed objects — is met by reading only the handful of fields we use, defensively.
2. **API version pinned**: every request sends `Stripe-Version: 2026-08-26.dahlia` (a released version,
   not the newest, so its changes have settled). Events are read only for their id, type and the ids
   they name; the subscription itself is read back with the pinned version, so the webhook endpoint's
   own version setting does not matter. The current period's end is read from the subscription's item
   (where versions since 2025-03-31 keep it), falling back to the subscription.
3. **Sign-up** (`src/server/auth/signup.ts`, decision 0025's machinery): work email, your name, agency
   name → a one-time link (`sbau_` token, only its SHA-256 kept, 24 hours, once; a newer request for the
   same email replaces the older) → "Set your password" (the same password rule) → the agency, its
   Owner (active, with that password) and its billing row are made in one transaction → a half session
   whose next step is the authenticator setup every Owner needs (the existing `/sign-in/setup`).
   - **No enumeration**: the page always answers "check your email"; an email that already signs in
     to Granite gets a note saying so (with the sign-in and reset links), its agency's log records the
     attempt, and no agency is made.
   - **Throttles** (the sign-in throttle's table, keys of their own): 3 requests an hour per email,
     10 an hour per visitor address; the answer is the same plain "wait" whatever the email.
   - **The agency row**: the app's database role still cannot insert agencies (decision 0001). A
     SECURITY DEFINER function, `signup_create_agency(token_hash)`, spends an unused, unexpired sign-up
     link and makes its agency, and nothing else; the rest is written by the app role under the new
     agency's fence. `scripts/create-agency.ts` and sign-up share the first-Owner and billing-row code.
   - The demo makes no agencies: its sign-up page says so and points to "Continue as".
4. **Billing state** (`agency_subscriptions`, one row per agency, the agency fence): Stripe customer and
   subscription ids, the status Stripe reports, the period end, when it ends if canceled, the price in
   integer cents, and the agency's own free days (`trial_ends_at`). The webhook has no session: it finds
   the agency through `billing_agency_of_customer(customer_id)` (SECURITY DEFINER, ids only — only
   customers Granite created and stored map to an agency) and then writes under that agency's fence.
   Handled event ids are kept in `billing_events`; a repeat is answered 200 and ignored; a failure
   rolls back so Stripe retries.
5. **Free days**: a new agency gets `STRIPE_TRIAL_DAYS` free days (none when unset). Checkout during
   them carries their end as the subscription's trial end (when at least 48 hours away, Stripe's
   minimum), so the first charge comes when they end; there is one trial per agency. Agencies made
   before this decision get 30 free days from the day the migration runs, so nobody is stopped without
   warning.
6. **Access rule** (`src/server/billing/access.ts`, pure): a demo agency, a subscription Stripe calls
   `active` or `trialing`, or the agency's own free days → changes allowed; anything else → changes
   paused. Paused: sign-in, every page, every download and export, the activity log and an Owner's
   audited SSN look-up still work; every action that changes the agency's records is refused
   (`actorAllowedTo` sends the person to Home, whose banner explains and points the Owner to Billing),
   and the screens hide those actions as they do for the accountant (the abilities table). Billing
   itself, the person's own account and sign-in settings are never paused. Nothing is deleted. A
   client's approval link keeps working (the client is not the agency's customer of Granite).
7. **Demo**: no Stripe calls at all; the billing page reads "Active (demo)" and its buttons explain that
   nothing is charged; the webhook route answers 404.

## Alternatives considered
- **The `stripe` npm package**: typed objects and `constructEvent`, but a large dependency that changes
  with every API release, for four calls; its signature check is the same HMAC we test ourselves.
- **Creating the agency at the first step** (and emailing an invite link): an unverified email could
  hold an address (one email, one person) and fill the database with agencies nobody owns.
- **Inserting agencies as the app role**: undoes decision 0001's guard; the definer function keeps the
  only way in tied to a verified link.
- **Granting access from the event payload in arrival order**: Stripe says not to rely on order;
  reading the subscription back is order-proof.
- **Blocking reading or sign-in when unpaid**: the owner's rule is that data is never held hostage;
  Linear and Vercel keep data readable and restrict changes.

## Consequences
- The owner sets four settings (`docs/hosting-settings.md`): `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` and, optionally, `STRIPE_TRIAL_DAYS`; registers the webhook
  address in Stripe; and turns on the Customer Portal in Stripe's settings.
- A delayed webhook is covered on return from Checkout: the billing page reads the session back
  (checking it belongs to this agency's customer) and records the subscription at once.
- Watch: two Checkout tabs could make two subscriptions; the billing row keeps the better one (active
  over past due over canceled) and the Owner can cancel the other in Stripe's portal.
