# Pattern: "A passkey was added" email

Status: adopted — decision 0032 (2026-10-16), after the second-opinion security review
Reference product and screen: GitHub — the security notice it emails when a passkey (or another
sign-in method) is added to an account: which method was added, when, and what to do if it was not
you (review the account's security settings, remove it, change the password); Shiftbook's own
sign-in emails (`sign-in-links.md`) for the frame
Source URL: https://docs.github.com/en/authentication/authenticating-with-a-passkey/managing-your-passkeys
Source URL: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials
Researched: 2026-10-16. Confidence: medium — GitHub documents the settings it points to, not the
notice's text; the order below is the one Shiftbook's sign-in emails already use.

## Purpose in Shiftbook
Someone who briefly held a person's signed-in browser could otherwise leave a passkey behind and come
back with it. Every new passkey is announced to the person's own email address, so one they did not
add does not go unnoticed. Plain text with a simple HTML copy; no images, no tracking, nothing loaded
from other sites, and no sign-in link (only the account page's address).

## Hierarchy
1. Sender: "{agency} via Shiftbook"; replies go to the agency's email address.
2. Subject: a passkey was added to their Shiftbook account.
3. Greeting with their name.
4. One line: the passkey's name, the agency the account is for, and when it was added (date and
   time in the agency's time zone).
5. If they added it, there is nothing to do.
6. If they did not: open Your account, remove the passkey, change the password, and tell the
   agency's Owner.
7. The link to Your account (the account page, not a sign-in link).
8. Footer: sent by Shiftbook on behalf of the agency.

## States
- Language: the person's own language (English or Spanish), whatever page they added it from.
- Demo mode: delivered to the demo mailbox, like every demo email (nothing leaves the app).
- Kept: the copy Shiftbook keeps of every email (it holds no link that signs anyone in).

## Never copy
GitHub's wording, icons, colors or logos.

Deviations allowed: none
