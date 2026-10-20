# Pattern: Sign-up emails (verify the address; the address already has an account)

Status: adopted — decision 0036 (2026-10-17); the confirm email raised in slice ab, onboarding (2026-10-20):
Linear's login email (one button and the code together, "use the code if the link does not work") and
Slack's confirm email (the code set large, "enter it in your open browser window"), in the shared layout
(`layout.md`).
Reference product and screen: Stripe — creating an account sends an email to verify the address, whose
link must be opened before the account is used; GitHub — the password reset email (one link, used in
time; ignore it if it was not you), as Tabulado's sign-in link emails already follow it
(`sign-in-links.md`)
Source URL: https://docs.stripe.com/get-started/account
Source URL: https://demo.react.email/preview/Community/magic-links/linear-login-code
Source URL: https://demo.react.email/preview/Community/magic-links/slack-confirm
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Researched: 2026-10-17. Confidence: medium — neither publishes the email's text; the order follows the
other sign-in link emails.

## Purpose in Tabulado
The two emails the sign-up page sends (decision 0036): the link that finishes creating the agency, or —
when the address already signs in to Tabulado — a note saying so, with the ways back in. The page says
the same thing either way, so only the inbox's owner learns which it was.

Nothing the requester typed (their name, the agency's name) goes into either email: the address is not
proved yet, so the email must not carry a stranger's words to it (the "Set your password" page shows
them once the link is opened).

## Hierarchy (confirm the address)
1. Sender: "Tabulado" (there is no agency yet to send on behalf of); no reply-to.
2. Subject: confirm your email to create your agency — never the code (review L4); preheader: the code
   works for one hour, never share it.
3. Heading: Confirm your email address.
4. One line: enter this code in the Tabulado window you have open; it works on any device.
5. The six-digit code, set large.
6. "Or continue in this browser:" and the one button, Continue sign-up (the link written out under it).
7. The code and the button work once, for one hour; Tabulado never asks for the code by phone, chat or
   email.
8. If it was not them, they can ignore it: nothing is created.
9. Footer: sent by Tabulado because this address was entered to create an agency.

## Hierarchy (the address already has an account)
1. Sender as above.
2. Subject: you already have a Tabulado account.
3. Greeting (no name).
4. One line: someone tried to create an agency on Tabulado with this address, which already signs in
   to Tabulado; no agency was created.
5. The link to sign in, and the link to reset the password if it is forgotten; someone invited and not
   yet joined uses the link in the invite email.
6. If it was not them, nothing changed; they can ignore it.
7. Footer: sent by Tabulado.

## States
- Language: the language of the page the sign-up was asked from (English or Spanish).
- Tabulado keeps no copy of either email's text (there is no agency yet to keep it under); the sign-up
  request's row records when it was sent.

## Never copy
Stripe's or GitHub's wording, icons, colors or logos.

Deviations allowed: none
