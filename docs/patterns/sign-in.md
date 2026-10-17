# Pattern: Sign in (`/sign-in`)

Status: adopted — slice (k); revised by decision 0031 (2026-10-16); the passkey tile by decision 0032
Reference product and screen: GitHub — sign-in (email and password, then a separate two-factor step;
"Forgot password?" leads to the password reset page); Linear — login page (each way to sign in is a
full-width "Continue with …" button, one under another)
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/accessing-github-using-two-factor-authentication
Source URL: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/recovering-your-account-if-you-lose-your-2fa-credentials
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Source URL: https://linear.app/docs/login-methods
Source URL: https://www.notion.so/help/saml-sso-configuration
Source URL: https://developers.google.com/identity/branding-guidelines
Source URL: https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps
Source URL: https://docs.github.com/en/authentication/authenticating-with-a-passkey/signing-in-with-a-passkey
Researched: 2026-10-16 (`docs/research/roster-audit-language-slice-k.md` §3). Confidence: high for
the steps (password first, then the code; reset by email); the page's exact layout is shown in
screenshots, not described in text.

## Purpose in Shiftbook
Where everyone signs in (SPEC §2): email and password; then, for a person with an authenticator or
whose role needs one, the code page. In demo mode the page also lists the demo people, so the demo
opens with no password (decision K3).

## Hierarchy
1. **H1** "Sign in to Shiftbook", centred; in demo mode one muted line under it saying what the demo
   is (Notion's two-line heading).
2. **Notice** (only when there is one): signed out; the session ended (timed out or signed out
   elsewhere); the password was changed; the link used has expired; another way in was refused
   (decision 0033): the provider did not sign them in; no member uses that account; the provider did
   not confirm the email (connect it from Your account first); the member is suspended; too many
   tries.
3. **Form** (GitHub sign-in):
   1. **Email** field (email keyboard, autocomplete "username").
   2. **Password** field (autocomplete "current-password"), with **Forgot password?** beside its
      label, linking to `/sign-in/reset` (GitHub: the password reset page).
   3. **Sign in** button (primary, full width).
   4. Under the button, a refusal in place when there is one (see States).
4. **Demo only — the demo people, before the form** (Linear: the main way in first, one filled
   full-width button, the other ways outlined under it): "Continue as Demo Owner" filled; Lena
   (coordinator), Rosa (billing) and Morgan (accountant) outlined; each with the person's initials
   on the left and the role on the right; one muted line under them (no password, no code). Then a
   rule with "or" (GitHub, Stripe, Notion) and the form, whose Sign in is outlined in demo mode
   (the demo people are the main way in). The demo has no phones, so these skip the code (decision
   K3). Outside demo mode the form is the page and Sign in is filled.
5. **Email me a sign-in code** (Linear's "Continue with Email"; decision 0033): a quiet link under the
   form, to `/sign-in/email` (`sign-in/email.md`).
6. **The other ways in** (decision 0031, Notion's tiles): a rule with "or continue with", then a
   two-column grid of tiles, each the way's mark over its name: **Google** and **Microsoft** (each
   provider's own mark, as its branding rules require; shown once its keys are set, always in the
   demo through the demo's stand-in), **Passkey** (decision 0032), **SSO** (to `/sign-in/sso`).

## Interactions
- Enter in either field submits. Focus starts in Email, except in demo mode (the demo people come
  first).
- Sign in → the code page when the person has an authenticator; the authenticator setup page when
  their role needs one and they have none; otherwise the page they were going to (or Convert
  timesheets).
- Continue as → straight into the app as that demo person.
- Forgot password? → the reset page, with the email already typed carried over.
- Google or Microsoft → the provider (in the demo, the demo's stand-in,
  `sign-in/demo-provider/[provider].md`) → back here signed in, then the code or the authenticator
  setup exactly as after a password; or back on this page with a notice saying why not.
- SSO → `/sign-in/sso`; Email me a sign-in code → `/sign-in/email`; both carry the page they were
  going to.
- **Passkey** tile (GitHub's "Sign in with a passkey": the browser or the device then asks for a
  passkey on this device or a nearby one, unlocked with a fingerprint, face or PIN) → no email is
  asked; once the device answers, straight into the app where sign-in goes (the page they were going
  to, in the page's language), with no code: the device's own check counts as both steps (GitHub: a
  passkey signs in "without having to enter your password, perform two-factor authentication").

## States
- Wrong email or password: one message for both (never says which), the password field cleared, the
  email kept.
- Too many tries: ten wrong passwords for an email from one place in 15 minutes make it wait 15
  minutes (an unknown email alike, so the page tells nothing about who has an account); 100 in a day
  lock the password for an hour. The message says to wait and offers the password reset.
- Busy: too many sign-ins at once — try again in a moment.
- Submitting: the button shows it is working and cannot be pressed twice.
- Already signed in: the page opens the app instead.
- Passkey: while the device is asked, the tile cannot be pressed again; the person closes the prompt —
  nothing is said; refused (unknown, removed, someone suspended, a copied device) — one message under
  the tiles, the same for every reason; too many refused tries from one place — wait 15 minutes (a
  passkey that works always signs in); a browser without passkeys, or passkeys not set up on this
  server — sign in another way.

## Never copy
GitHub's, Linear's or Notion's wording, icons, colors or logos.

Deviations allowed: none
