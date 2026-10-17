# Pattern: Sign-up emails (verify the address; the address already has an account)

Status: adopted — decision 0036 (2026-10-17)
Reference product and screen: Stripe — creating an account sends an email to verify the address, whose
link must be opened before the account is used; GitHub — the password reset email (one link, used in
time; ignore it if it was not you), as Granite's sign-in link emails already follow it
(`sign-in-links.md`)
Source URL: https://docs.stripe.com/get-started/account
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Researched: 2026-10-17. Confidence: medium — neither publishes the email's text; the order follows the
other sign-in link emails.

## Purpose in Granite
The two emails the sign-up page sends (decision 0036): the link that finishes creating the agency, or —
when the address already signs in to Granite — a note saying so, with the ways back in. The page says
the same thing either way, so only the inbox's owner learns which it was.

Nothing the requester typed (their name, the agency's name) goes into either email: the address is not
proved yet, so the email must not carry a stranger's words to it (the "Set your password" page shows
them once the link is opened).

## Hierarchy (finish creating the agency)
1. Sender: "Granite" (there is no agency yet to send on behalf of); no reply-to.
2. Subject: finish creating your agency on Granite.
3. Greeting (no name).
4. One line: someone asked to create an agency on Granite with this address; if it was them, set the
   password to finish.
5. The link to set the password and finish.
6. The link works once, for 24 hours; the Owner sets up an authenticator app next.
7. If it was not them, they can ignore it: nothing is created.
8. Footer: sent by Granite.

## Hierarchy (the address already has an account)
1. Sender as above.
2. Subject: you already have a Granite account.
3. Greeting (no name).
4. One line: someone tried to create an agency on Granite with this address, which already signs in
   to Granite; no agency was created.
5. The link to sign in, and the link to reset the password if it is forgotten; someone invited and not
   yet joined uses the link in the invite email.
6. If it was not them, nothing changed; they can ignore it.
7. Footer: sent by Granite.

## States
- Language: the language of the page the sign-up was asked from (English or Spanish).
- Granite keeps no copy of either email's text (there is no agency yet to keep it under); the sign-up
  request's row records when it was sent.

## Never copy
Stripe's or GitHub's wording, icons, colors or logos.

Deviations allowed: none
