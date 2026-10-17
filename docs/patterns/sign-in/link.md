# Pattern: Confirm it's your email before connecting an account (`/sign-in/link`)

Status: adopted — decision 0033, after its security review (H2a, 2026-10-17)
Reference product and screen: GitHub — device verification (a "Device verification" prompt; the code
is sent to the account's email addresses, GitHub shows a hint of the address it was sent to, the code
is typed in the browser; an unexpected code means someone else tried); Slack — single sign-on for
existing members (they get an email that asks them to bind their account to the identity provider
before it signs them in)
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/verifying-new-devices-when-signing-in
Source URL: https://slack.com/help/articles/203772216-SAML-single-sign-on
Researched: 2026-10-17. Confidence: high for "an emailed code, the address hinted, typed in the
browser"; the page's layout is GitHub's in screenshots, not described in text.

## Purpose in Granite
The first time a Google, Microsoft or agency SSO account signs someone in by their email — and that
provider does not itself host the mailbox — Granite proves the mailbox now with a six-digit code
before connecting the account (an outside account made with someone's address must not become their
way in on its own). Afterwards the account signs them in directly; the authenticator code or its
setup still follows as after a password.

## Hierarchy
1. **H1** "Confirm it's your email", centred; one line: to connect the <provider> account, type the
   code sent to <hint, e.g. o***@cedarrow.example.com>; it works once, for 10 minutes.
2. **Code** field (six digits, numeric keyboard, autocomplete "one-time-code"; sent on its own once six
   digits are typed); **Confirm** (primary, full width).
3. A refusal in place when there is one.
4. **Send a new code** (a quiet button; at most once a minute).
5. Demo only: the copy of the email from the demo mailbox, so the code can be read (decision K3).
6. **Back to sign in** at the foot (the waiting connection is dropped).

## Interactions
- Right code → the account is connected (an email tells the person), then the authenticator code
  page, its setup, or the page they were going to.

## States
- Wrong code: the field cleared, a message; five wrong codes end that code; wrong codes count as wrong
  authenticator codes (ten in 15 minutes lock codes for 15 minutes).
- The waiting connection expired (10 minutes) or is gone: back to sign in with a notice.
- The account was connected to someone else meanwhile, or the person connected another account from
  that provider: a message and **Back to sign in**.
- Confirming: the button shows it is working.

## Never copy
GitHub's or Slack's wording, icons, colors or logos.

Deviations allowed: none
