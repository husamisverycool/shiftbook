# Pattern: Set up the authenticator before the app opens (`/sign-in/setup`)

Status: adopted — slice (k) plan, decision K1 (2026-10-16, under the owner's "just keep going")
Reference product and screen: GitHub — "Enable two-factor authentication" (one page, three numbered
parts: scan the QR code, or "setup key" to see the secret as text; verify the code from the app;
save your recovery codes — Download, Print, Copy — then "I have saved my recovery codes"); GitHub —
an organization that requires two-factor authentication (members without it cannot reach the
organization until they turn it on)
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication-recovery-methods
Source URL: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization
Researched: 2026-10-16. Confidence: high for the three parts, the setup key, the recovery code
actions and the requirement.

## Purpose in Granite
SPEC §2 requires the code for the Owner and Coordinators. A person in those roles who has no
authenticator yet (just invited, or given the role) sets one up here before the app opens.

## Hierarchy
1. **H1** "Set up your authenticator".
2. One line: the role needs a code from an authenticator app at each sign-in; the app is any
   authenticator app on a phone or computer.
3. The shared setup steps (the same component as the account page's — see `settings/account.md`,
   "Authenticator setup"):
   1. **1. Scan the QR code** — the QR code; under it **Setup key** reveals the secret as text in
      groups of four, for typing by hand.
   2. **2. Type the code from the app** — a six-digit field and **Verify**.
   3. **3. Save your recovery codes** (shown after the code is verified) — ten one-time codes in a
      grid; **Download**, **Print**, **Copy**; then **I have saved my recovery codes** (primary),
      which opens the app.
4. **Sign out** (a link under the steps) for someone who wants to stop here.

## Interactions
- Verify → part 3 appears; the authenticator is on from this moment.
- I have saved my recovery codes → the page they were going to (or Convert timesheets).

## States
- Wrong code: a message in place; the QR code stays.
- The page reloaded before part 3: a new QR code (the unconfirmed one is replaced).

## Never copy
GitHub's wording, icons, colors or logos.

Deviations allowed: none
