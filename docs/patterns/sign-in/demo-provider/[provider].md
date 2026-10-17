# Pattern: The demo's stand-in sign-in provider (`/sign-in/demo-provider/[provider]`)

Status: adopted — decision 0033 (2026-10-16); demo mode only (any other mode: not found)
Reference product and screen: OpenID Connect Core 1.0 §3.1.2.4 (the authorization server
authenticates the person and, when it must, asks which account and whether to consent, then sends
the browser back with a code); Linear — the demo people as full-width buttons, one under another
(decision K3, `sign-in.md`)
Source URL: https://openid.net/specs/openid-connect-core-1_0.html
Source URL: https://linear.app/docs/login-methods
Researched: 2026-10-16. Confidence: high for the step's job (choose an account, go back with a code);
the page is Granite's own, and deliberately looks nothing like Google's or Microsoft's.

## Purpose in Granite
The demo makes no outside call, so "Continue with Google", "Continue with Microsoft" and SSO go
through this stand-in: the same client code, the same callback, a provider played by Granite
itself. It must never be mistaken for the real provider's page.

## Hierarchy
1. **H1** "Demo sign-in: <Google | Microsoft | your agency's SSO>", centred.
2. One line saying plainly that this page stands in for that provider in the demo, nothing leaves
   Granite, and no password is asked.
3. **Choose an account** — the list of accounts as full-width outlined buttons, one under another:
   each demo person's email with their name; last, an address that belongs to no member ("Someone who
   is not a member"), to see the refusal.
4. **Cancel** — back to Granite's sign-in page without signing in (the provider's "access denied").

## Interactions
- Choosing an account → back to Granite with a code, which Granite exchanges and checks as with
  the real provider.
- Cancel → the sign-in page with a notice that the provider did not sign them in.

## States
- The request is not one Granite made (wrong client, wrong return address, expired): a message and
  **Back to sign in**.
- Choosing: the buttons show it is working and cannot be pressed twice.

## Never copy
Google's or Microsoft's wording, layout, colors, logos or account pickers; Linear's wording.

Deviations allowed: none
