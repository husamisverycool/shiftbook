# Pattern: Email me a sign-in code (`/sign-in/email`)

Status: adopted — decision 0033 (2026-10-16)
Reference product and screen: Linear — "Continue with Email" (an email is sent; the code in it is
typed into the "Enter code" field on the login page); Vercel — sign in with email (type the email to
receive a six-digit one-time code, then type the code); Notion — with no single sign-on for the
address, "a code sent to your email"
Source URL: https://linear.app/docs/login-methods
Source URL: https://vercel.com/docs/accounts
Source URL: https://www.notion.so/help/saml-sso-configuration
Researched: 2026-10-16. Confidence: high for the two steps (email, then the code on the same page);
the exact layout is shown in screenshots, not described.

## Purpose in Tabulado
A way in without a password: a six-digit code sent to the member's email (10 minutes, once). It is a
first factor: the authenticator code or its setup follows as after a password (SPEC §2).

## Hierarchy
1. **H1** "Email me a sign-in code", centred; one muted line under it: the code is sent to the email
   they sign in with.
2. **Step 1 — Form:** **Email** field (email keyboard, autocomplete "username"; the email typed on
   the sign-in page carried over); **Send code** (primary, full width).
3. **Step 2 — the same page, the form replaced** (Linear's "Enter code" on the login page):
   1. H1 "Check your email"; one line: if a member uses that email, a six-digit code is on its way;
      it works once, for 10 minutes.
   2. **Code** field (six digits, numeric keyboard, autocomplete "one-time-code"; sent on its own
      once six digits are typed, as the authenticator code page does); **Sign in** (primary).
   3. A refusal in place when there is one.
   4. **Send a new code** (a quiet button; at most once a minute) and **Use a different email**.
   5. Demo only: the copy of the email from the demo mailbox, so the code can be read (decision K3),
      as the password reset page shows its link.
4. **Back to sign in** link at the foot.

## Interactions
- Enter submits each step. Focus starts in the field of the current step.
- Right code → the authenticator code page when the person has an authenticator, its setup when their
  role needs one, otherwise the page they were going to.

## States
- Whatever the address, the same answer (no one learns which emails have an account).
- Wrong code: the field cleared, a message. Five wrong codes end that code ("send a new one").
- Expired or already used: the message says to send a new code.
- Too many tries: the message says to wait 15 minutes (the same throttle as wrong passwords).
- Sending / signing in: the button shows it is working.

## Never copy
Linear's, Vercel's or Notion's wording, icons, colors or logos.

Deviations allowed: none
