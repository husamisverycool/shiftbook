# Pattern: Single sign-on (`/settings/sso`)

Status: adopted — decision 0033 (2026-10-16)
Reference product and screen: Notion — Settings › Identity: a workspace owner toggles "Enable SAML
SSO", copies the address Notion shows into the identity provider, gives the provider's details, then
saves; owners can still sign in another way if the provider fails; Linear — Settings ›
Administration › Security, "Authentication methods" (Configure SAML; enter Linear's details in the
identity provider; owners can always use other methods to prevent lockouts); Stripe — single sign-on
as an extra way in or the only one, and configuration checks that must pass
Source URL: https://www.notion.so/help/saml-sso-configuration
Source URL: https://linear.app/docs/saml-and-access-control
Source URL: https://linear.app/docs/login-methods
Source URL: https://docs.stripe.com/get-started/account/sso
Researched: 2026-10-16. Confidence: high for where it lives (the agency's security settings, owner
only), the address to copy and the provider's details; the form's spacing is not documented.

## Purpose in Shiftbook
The Owner lets the agency's people sign in through the agency's own identity provider (OpenID
Connect: Okta, Entra ID, Google Workspace and most others), as one more way in. Everyone keeps their
other ways in (Linear and Notion keep owners able to sign in when the provider fails).

## Hierarchy
1. **Page header:** "Settings" above, H1 "Single sign-on"; one line: the agency's people can sign in
   through the agency's own identity provider, in addition to their other ways in.
2. **Status** row (Notion's toggle): **Single sign-on** switch, On / Off, with one line under it
   (on: members use "SSO" on the sign-in page with their work email; off: nobody can use it).
   Turning it on needs the issuer, client ID and secret saved first.
3. **For your identity provider** (Notion's ACS URL; Linear's details to enter in the IdP): the
   **Sign-in redirect address** to register with the provider, read-only with **Copy**.
4. **Provider details** form (Notion's identity provider details):
   1. **Issuer address** (an https address; its discovery document is read when saved).
   2. **Client ID**.
   3. **Client secret**: when one is saved, "Set — ends in ····abcd" and a **Replace** field left
      empty keeps it; never shown again once saved.
   4. **Save** (primary).
5. A muted line at the foot: who changed it last, and when.

## Interactions
- Every change first asks the Owner to confirm it's them when they have not given their password or
  a code in the last 15 minutes (`_components/confirm-access.md`).
- Save → the discovery document is checked (Stripe's configuration checks); a toast says it was
  saved. The switch saves at once.
- Copy → the address is copied; a toast says so.

## States
- Not the Owner: the page shows the status only, and a line that only the Owner changes it.
- The issuer cannot be reached or is not an OpenID Connect provider: a message under Issuer.
- Missing client ID or secret when turning it on: a message under the field.
- Demo: the switch and the form work against the demo's stand-in provider; another issuer cannot be
  saved (the demo makes no outside call).
- Saving: the button shows it is working.

## Never copy
Notion's, Linear's or Stripe's wording, icons, colors or logos.

Deviations allowed: none
