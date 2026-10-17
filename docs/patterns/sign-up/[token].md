# Pattern: Set your password (`/sign-up/[token]`)

Status: adopted — decision 0036 (2026-10-17)
Reference product and screen: Stripe — the account's email is verified from the link Stripe sends, then
the account is used; GitHub — an invitation page (the new password twice, then two-factor before access
when it is required) as Granite's invite page already reproduces it (`invite/[token].md`); GitHub —
"Enable two-factor authentication" before the organization opens (`sign-in/setup.md`)
Source URL: https://docs.stripe.com/get-started/account
Source URL: https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization
Source URL: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization
Researched: 2026-10-17. Confidence: high for the steps (verify the email by its link, choose the
password, two-factor before access); the layout is Granite's invite page's.

## Purpose in Granite
The page the sign-up email links to: the person proves the mailbox is theirs, chooses a password, and
goes on to set up the authenticator every Owner needs (SPEC §2). Only then does the app open.

## Hierarchy
Inside the sign-in frame (`_layouts/auth.md`), as the invite page:
1. **H1** "Set your password".
2. One line: the agency being created and that they will be its Owner; one muted line: the email they
   will sign in with.
3. **Form** (the shared new-password fields): **Password** (autocomplete "new-password"; the rule under
   it), **Confirm password**, **Create agency** (primary, full width).
4. One muted line under the form: an authenticator app is set up next (Owners need a code at each
   sign-in).
5. After it: the authenticator setup page (`sign-in/setup.md`), then Home.

## Interactions
- Enter submits.
- Create agency → the agency, its Owner and its billing row are made; the authenticator setup opens.

## States
- The link is expired (24 hours), already used, replaced by a newer one, or wrong: "This link no
  longer works" — start again; **Create your agency** (primary) and **Go to sign in** (outlined).
- The email signed up meanwhile elsewhere (an invite was accepted): the message says to sign in instead.
- The passwords differ, or the password breaks the rule: a message under the field.
- Demo: the same "no longer works" state (the demo makes no agencies).
- Submitting: the button shows it is working.

## Never copy
Stripe's or GitHub's wording, icons, colors or logos.

Deviations allowed: none
