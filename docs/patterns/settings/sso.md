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
Source URL: https://linear.app/docs/scim
Source URL: https://linear.app/docs/api-and-webhooks
Researched: 2026-10-16; laid out on 2026-10-17 as Linear's SAML settings from its own screenshots
(linear.app/docs/scim, /saml-and-access-control; `_components/settings.md`). Confidence: high for where
it lives (the agency's security settings, owner only), the address to copy, the provider's details and
the layout.

## Purpose in Granite
The Owner lets the agency's people sign in through the agency's own identity provider (OpenID
Connect: Okta, Entra ID, Google Workspace and most others), as one more way in. Everyone keeps their
other ways in (Linear and Notion keep owners able to sign in when the provider fails).

## Hierarchy
Laid out as Linear's settings (`_components/settings.md`; Linear's SAML panel: the switch at the right
of its row, the setup's label over a full-width field and the action at the bottom right).
1. **Page header:** "Settings" above, H1 "Single sign-on"; one muted line: the agency's people can sign
   in through the agency's own identity provider, in addition to their other ways in (and the demo line).
2. **Status** panel, one row (Notion's toggle; Linear's switch at a row's right): **Single sign-on**
   over its state (on: members use "SSO" on the sign-in page with their work email; off: nobody can use
   it), the switch at the right. Turning it on needs the issuer, client ID and secret saved first.
3. **For your identity provider** section (Notion's ACS URL; Linear's details to enter in the IdP): a
   panel with the **Sign-in redirect address** to register with the provider, read-only, **Copy** beside
   it, the hint under it.
4. **Provider details** section (Notion's identity provider details), a panel:
   1. **Issuer address** (an https address; its discovery document is read when saved).
   2. **Client ID**.
   3. **Client secret** (at least 16 characters): when one is saved, "Set — ends in ····abcd" and a
      **Replace** field left empty keeps it; never shown again once saved.
   4. The panel's foot: who changed it last, and when, at the left; **Save** (primary) at the right.

## Interactions
- Every change first asks the Owner to confirm it's them when they have not given their password or
  a code in the last 15 minutes (`_components/confirm-access.md`).
- Save → the discovery document is checked (Stripe's configuration checks); a toast says it was
  saved. The switch saves at once.
- Copy → the address is copied; a toast says so.

## States
- Not the Owner: the page holds only the header and the "not for your role" state the other
  settings pages use (margin settings), saying only the Owner manages single sign-on; the agency menu
  does not list it for them.
- The issuer cannot be reached or is not an OpenID Connect provider: a message under Issuer.
- The issuer is an IP address, resolves to a private or internal address, or names its endpoints on
  another host: a message under Issuer (decision 0033, review M2).
- Missing client ID or secret when turning it on: a message under the field.
- Demo: the switch and the form work against the demo's stand-in provider; another issuer cannot be
  saved (the demo makes no outside call).
- Saving: the button shows it is working.

## Look (checked against Linear's screenshots, 2026-10-17)
As `_components/settings.md`. Remaining difference: Linear puts the SAML switch at the right of the
section heading; Granite puts it in a row of its own, as Linear's "Enable member API keys" panel.

## Never copy
Notion's, Linear's or Stripe's wording, icons, colors or logos.

Deviations allowed: none
