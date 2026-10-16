# Pattern: Sign in with SSO (`/sign-in/sso`)

Status: adopted — decision 0033 (2026-10-16)
Reference product and screen: Notion — single sign-on (the person types their email; with one
configuration for it they "go directly to that identity provider"; with none they sign in the usual
way); Linear — "Continue with SAML SSO" on the login page; Stripe — service-provider-initiated
sign-in from its own sign-in page
Source URL: https://www.notion.so/help/saml-sso-configuration
Source URL: https://linear.app/docs/saml-and-access-control
Source URL: https://docs.stripe.com/get-started/account/sso
Researched: 2026-10-16. Confidence: high for "type the work email, then the provider"; the page's
layout is shown in screenshots, not described.

## Purpose in Shiftbook
For a member of an agency whose Owner turned single sign-on on (Settings › Single sign-on): their
agency's own identity provider signs them in. The authenticator code or its setup follows as after a
password (SPEC §2).

## Hierarchy
1. **H1** "Sign in with SSO", centred; one muted line under it: type your work email and you are sent
   to your agency's sign-in.
2. **Form:** **Work email** field (email keyboard, autocomplete "username"; carried over from the
   sign-in page); **Continue** (primary, full width).
3. A message in place when SSO is not set up for that email, with the other ways in: **Sign in
   another way** (back to sign in) and **Email me a sign-in code**.
4. **Back to sign in** link at the foot.

## Interactions
- Enter submits. Continue → the agency's identity provider (the browser leaves for it), then back to
  Shiftbook signed in, or to the sign-in page with a notice saying why not.

## States
- No SSO for the email (unknown email, no member, SSO off): one answer for all of them.
- Continuing: the button shows it is working.
- Refused after the provider (the identity belongs to no member of that agency, its email is not
  verified, the member is suspended): back on the sign-in page with the notice.

## Never copy
Notion's, Linear's or Stripe's wording, icons, colors or logos.

Deviations allowed: none
